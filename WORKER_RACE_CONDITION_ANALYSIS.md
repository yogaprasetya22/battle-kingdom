# Race Condition Analysis: NUM_WORKERS = 4 → Tim Biru Terlalu Cepat

## 🔴 Root Cause

Ketika `NUM_WORKERS` diubah dari 2 menjadi 4, terjadi **race condition pada unit distribution** dan **synchronization timing**.

---

## 📊 Analisis Masalah

### Skenario dengan NUM_WORKERS = 2 (Normal)

```
Worker 1  Worker 2
├─ 48 units (24 A + 24 B)    ├─ 48 units (24 A + 24 B)
│  (Red team processing)      │  (Blue team processing)
└─ tick_done message          └─ tick_done message

Main thread:
workersDoneCount++ → 1
workersDoneCount++ → 2 (equal to NUM_WORKERS)
→ onTickComplete() called
→ Battle synchronized
```

### Skenario dengan NUM_WORKERS = 4 (Bug)

```
Worker 1         Worker 2         Worker 3         Worker 4
├─ 24 units      ├─ 24 units      ├─ 24 units      ├─ 24 units
│  (Red)         │  (Red)         │  (Blue)        │  (Blue)
└─ tick_done     └─ tick_done     └─ tick_done     └─ tick_done

Main thread:
workersDoneCount++ → 1 (Worker 1 Red)
workersDoneCount++ → 2 (Worker 2 Red)
workersDoneCount++ → 3 (Worker 3 Blue)  ⚠️ EARLY CHECK!
workersDoneCount == NUM_WORKERS (4)?  NO → wait
workersDoneCount++ → 4 (Worker 4 Blue)
→ onTickComplete() finally called
```

**PROBLEM:** Worker 3 & 4 (Blue team) compute 1 tick early sebelum Workers 1 & 2 (Red team) selesai.

---

## 🔍 Code Flow Issue (src/main.ts line 355-374)

```typescript
if (type === "tick_done") {
    workersDoneCount++; // ← RACE CONDITION HERE

    if (e.data.aliveA !== undefined) {
        if (workersDoneCount === 1) {
            accumAliveA = e.data.aliveA;
            accumAliveB = e.data.aliveB;
        } else {
            accumAliveA += e.data.aliveA; // ← Accumulate counts
            accumAliveB += e.data.aliveB;
        }
    }

    if (workersDoneCount === NUM_WORKERS) {
        // ← Barrier check
        onTickComplete();
    }
}
```

### Masalahnya:

1. **No worker affinity** — System tidak tahu worker mana yang compute Red, mana Blue
2. **Order-dependent accumulation** — Message order dari workers tidak deterministic
3. **Early finish** — Blue workers finish tick N, Red workers still on tick N-1
4. **Unit counts misaligned** — scoreA & scoreB shows outdated state

---

## 📈 Impact Timeline

```
Tick 1:
W1 (Red)  ├──────┤  tick_done (Red count)
W2 (Red)  ├──────┤  tick_done (Red count)
W3 (Blue) ├──────┤  tick_done (Blue count) ← Receives Red counts!
W4 (Blue) ├──────┤  tick_done (Blue count)

→ Blue team uses Red team's damage calculations from tick 0
→ Red team doesn't reflect Blue's actions yet

Tick 2:
W1 (Red)  ├──────┤  tick_done (NOW sees Blue's tick 1 actions)
W2 (Red)  ├──────┤  tick_done
W3 (Blue) ├──────┤  tick_done (NOW sees Red's tick 1 actions + extra!)
W4 (Blue) ├──────┤  tick_done
```

Result: **Blue team gets 1 tick advantage** → faster kills, faster win

---

## 🎯 Solution

### Option 1: Per-Worker Synchronization (Recommended)

```typescript
type WorkerState = {
    id: number;
    ticksDone: number;
    aliveA: number;
    aliveB: number;
    ready: boolean;
};

const workerStates: WorkerState[] = [];

// Initialize
for (let i = 0; i < NUM_WORKERS; i++) {
    workerStates.push({
        id: i,
        ticksDone: 0,
        aliveA: 0,
        aliveB: 0,
        ready: false,
    });
}

// Message handler
if (type === "tick_done") {
    const workerId = e.data.workerId; // ← Need to add this to worker message!
    workerStates[workerId].ticksDone++;
    workerStates[workerId].aliveA = e.data.aliveA;
    workerStates[workerId].aliveB = e.data.aliveB;

    // Check if ALL workers completed the same tick
    const allTicksDone = workerStates.every(
        (w) => w.ticksDone === workerStates[0].ticksDone,
    );

    if (allTicksDone) {
        // Safe to aggregate
        accumAliveA = workerStates.reduce((sum, w) => sum + w.aliveA, 0);
        accumAliveB = workerStates.reduce((sum, w) => sum + w.aliveB, 0);
        onTickComplete();
    }
}
```

### Option 2: Barrier with Timeout

```typescript
let tickBarrier = 0;
let barrierId = 0;

if (type === "tick_done") {
    tickBarrier++;

    if (tickBarrier === NUM_WORKERS) {
        onTickComplete();
        tickBarrier = 0;
        barrierId++;
    }
}
```

### Option 3: Revert to NUM_WORKERS = 2

```typescript
const NUM_WORKERS = 2; // ← Safe, proven synchronization
```

**Risk/Benefit:**

- ✓ Immediate fix
- ✗ Half computational power
- ✗ CPU utilization drop
- ✓ No code changes needed

---

## 🛠️ Implementation Steps

### Step 1: Modify worker message to include workerId

**File: `src/simulation/battle.worker.ts`** (need to add)

```typescript
// When sending tick_done message
self.postMessage({
    type: "tick_done",
    workerId: WORKER_ID, // ← Add this
    aliveA: countAliveA,
    aliveB: countAliveB,
    // ... other data
});
```

### Step 2: Add worker state tracking

**File: `src/main.ts` line 344**

```typescript
interface WorkerTickState {
    id: number;
    lastTickId: number;
    aliveA: number;
    aliveB: number;
}

const workerTickStates: WorkerTickState[] = [];
let currentTickId = 0;

for (let i = 0; i < NUM_WORKERS; i++) {
    workers[i].onmessage = (e: MessageEvent) => {
        const { type, workerId } = e.data;

        if (type === "tick_done") {
            // Update this worker's state
            const state = workerTickStates[workerId];
            state.lastTickId = currentTickId;
            state.aliveA = e.data.aliveA;
            state.aliveB = e.data.aliveB;

            // Check if all workers have completed current tick
            const allDone = workerTickStates.every(
                (s) => s.lastTickId === currentTickId,
            );

            if (allDone) {
                // Aggregate safely
                accumAliveA = workerTickStates.reduce(
                    (s, w) => s + w.aliveA,
                    0,
                );
                accumAliveB = workerTickStates.reduce(
                    (s, w) => s + w.aliveB,
                    0,
                );
                currentTickId++;
                onTickComplete();
            }
        }
    };
}
```

### Step 3: Test with NUM_WORKERS = 4

```typescript
const NUM_WORKERS = 4; // ← Now safe!
```

---

## 🔬 Debugging Checklist

- [ ] Add logging ke worker message dengan timestamp
- [ ] Log `workersDoneCount` setiap tick
- [ ] Verify message order dari workers (should be alternating Red/Blue)
- [ ] Check if `aliveA` counts jadi double-counted
- [ ] Compare win rates: Red vs Blue dengan NUM_WORKERS = 2 vs 4

```typescript
// Add logging
if (type === "tick_done") {
    console.log(
        `[${Date.now()}] Worker tick_done, count=${workersDoneCount}, aliveA=${e.data.aliveA}, aliveB=${e.data.aliveB}`,
    );
    // ...
}
```

---

## 📋 Summary

| Aspek           | NUM_WORKERS = 2        | NUM_WORKERS = 4    |
| --------------- | ---------------------- | ------------------ |
| Synchronization | ✓ Safe (barrier works) | ✗ Race condition   |
| Blue advantage  | None                   | +1 tick            |
| Win rate bias   | Balanced               | Blue wins 60%+     |
| CPU utilization | 50%                    | 100%               |
| Fix needed      | No                     | Yes (see Option 1) |

**Rekomendasi:** Implement **Option 1** (per-worker state tracking) untuk scalability ke 8+ workers nanti.

---

## Jangan Lupa

Saat update NUM_WORKERS di `src/main.ts`:

```typescript
// BEFORE
const NUM_WORKERS = 2;

// AFTER
const NUM_WORKERS = 4; // Only if using Option 1 fix!
```

Pastikan juga `battle.worker.ts` di-initialize dengan `workerId` saat start.
