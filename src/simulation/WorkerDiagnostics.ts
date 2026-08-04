/**
 * WorkerDiagnostics.ts
 *
 * Diagnostics utilities for Option 1 (Per-Worker State Tracking)
 * Tracks worker synchronization state, tick IDs, and unit counts
 * for debugging and verification purposes.
 */

export interface TickDiagnostic {
    globalTickId: number;
    timestamp: number;
    workerStates: {
        workerId: number;
        currentTickId: number;
        aliveA: number;
        aliveB: number;
        aliveOrUnspawnedA: number;
        aliveOrUnspawnedB: number;
        synced: boolean;
    }[];
    allSynced: boolean;
    aggregatedAliveA: number;
    aggregatedAliveB: number;
    aggregatedAliveOrUnspawnedA: number;
    aggregatedAliveOrUnspawnedB: number;
}

export class WorkerDiagnostics {
    private enabled: boolean;
    private history: TickDiagnostic[] = [];
    private maxHistorySize: number = 100;

    constructor(enabled: boolean = false) {
        this.enabled = enabled;
    }

    /**
     * Record a tick completion diagnostic snapshot
     */
    recordTick(
        globalTickId: number,
        workerStates: Map<number, any>,
        numWorkers: number,
        allSynced: boolean,
        aggregatedAliveA: number,
        aggregatedAliveB: number,
        aggregatedAliveOrUnspawnedA: number,
        aggregatedAliveOrUnspawnedB: number,
    ): void {
        if (!this.enabled) return;

        const workerStatesArray = [];
        for (let i = 0; i < numWorkers; i++) {
            const state = workerStates.get(i);
            if (state) {
                workerStatesArray.push({
                    workerId: state.workerId,
                    currentTickId: state.currentTickId,
                    aliveA: state.aliveA,
                    aliveB: state.aliveB,
                    aliveOrUnspawnedA: state.aliveOrUnspawnedA,
                    aliveOrUnspawnedB: state.aliveOrUnspawnedB,
                    synced: state.currentTickId === globalTickId,
                });
            }
        }

        const diagnostic: TickDiagnostic = {
            globalTickId,
            timestamp: performance.now(),
            workerStates: workerStatesArray,
            allSynced,
            aggregatedAliveA,
            aggregatedAliveB,
            aggregatedAliveOrUnspawnedA,
            aggregatedAliveOrUnspawnedB,
        };

        this.history.push(diagnostic);
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }

        // Log to console in development
        if (import.meta.env.DEV) {
            console.log(
                `[Tick ${globalTickId}] AllSynced: ${allSynced}, A: ${aggregatedAliveA}/${aggregatedAliveOrUnspawnedA}, B: ${aggregatedAliveB}/${aggregatedAliveOrUnspawnedB}`,
                workerStatesArray,
            );
        }
    }

    /**
     * Get last N tick diagnostics
     */
    getRecentTicks(count: number = 10): TickDiagnostic[] {
        return this.history.slice(-count);
    }

    /**
     * Detect synchronization issues (workers on different tick IDs)
     */
    detectSyncIssues(): { issueFound: boolean; details: string } {
        if (this.history.length === 0) {
            return { issueFound: false, details: "No history" };
        }

        const recentTicks = this.getRecentTicks(5);
        let unsyncedCount = 0;

        for (const tick of recentTicks) {
            if (!tick.allSynced) {
                unsyncedCount++;
            }
        }

        if (unsyncedCount > 0) {
            return {
                issueFound: true,
                details: `${unsyncedCount}/5 recent ticks had synchronization issues. Workers likely on different tick IDs.`,
            };
        }

        return { issueFound: false, details: "All recent ticks synchronized" };
    }

    /**
     * Verify count consistency (ensure aggregated counts match expected pattern)
     */
    verifyCountConsistency(): { consistent: boolean; details: string } {
        if (this.history.length < 2) {
            return { consistent: true, details: "Insufficient history" };
        }

        const lastTick = this.history[this.history.length - 1];
        const prevTick = this.history[this.history.length - 2];

        // Counts should be decreasing or stable (units die, never spawn new)
        const aliveADecreasing =
            lastTick.aggregatedAliveA <= prevTick.aggregatedAliveA;
        const aliveBDecreasing =
            lastTick.aggregatedAliveB <= prevTick.aggregatedAliveB;

        if (!aliveADecreasing || !aliveBDecreasing) {
            return {
                consistent: false,
                details: `Count inconsistency: A ${prevTick.aggregatedAliveA} -> ${lastTick.aggregatedAliveA}, B ${prevTick.aggregatedAliveB} -> ${lastTick.aggregatedAliveB}`,
            };
        }

        return {
            consistent: true,
            details: `Counts consistent: A ${lastTick.aggregatedAliveA}, B ${lastTick.aggregatedAliveB}`,
        };
    }

    /**
     * Generate summary report
     */
    generateReport(): string {
        const syncIssues = this.detectSyncIssues();
        const countCheck = this.verifyCountConsistency();
        const lastTick = this.history[this.history.length - 1];

        let report = `
=== Worker Diagnostics Report ===
Total ticks recorded: ${this.history.length}
Sync Issues: ${syncIssues.issueFound ? "YES - " + syncIssues.details : "NO - " + syncIssues.details}
Count Consistency: ${countCheck.consistent ? "OK - " + countCheck.details : "FAIL - " + countCheck.details}

Last Tick (${lastTick?.globalTickId}):
  All Synced: ${lastTick?.allSynced}
  Team A: ${lastTick?.aggregatedAliveA}/${lastTick?.aggregatedAliveOrUnspawnedA}
  Team B: ${lastTick?.aggregatedAliveB}/${lastTick?.aggregatedAliveOrUnspawnedB}
  Worker States:
`;

        if (lastTick) {
            for (const workerState of lastTick.workerStates) {
                report += `    Worker ${workerState.workerId}: TickID=${workerState.currentTickId}, A=${workerState.aliveA}, B=${workerState.aliveB}, Synced=${workerState.synced}\n`;
            }
        }

        report += `
=== End Report ===
`;
        return report;
    }

    /**
     * Clear history
     */
    clear(): void {
        this.history = [];
    }

    /**
     * Enable/disable diagnostics
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Get enabled status
     */
    isEnabled(): boolean {
        return this.enabled;
    }
}
