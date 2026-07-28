/**
 * main.ts — Entry point
 * Orchestrates SharedArrayBuffer, Web Worker, Renderer, dan UI.
 *
 * ponytail: no framework, no DI, no event bus. Direct function calls.
 */

import { BUFFER_BYTES } from './simulation/constants';
import { setSharedData, startRenderLoop, changeModel, spawnSkillFX, resetUnitsVisual } from './graphics/core/renderer';

// ---- Shared Buffer (bridge antara main thread & worker) ----
const sharedBuffer = new SharedArrayBuffer(BUFFER_BYTES);
const sharedData   = new Float32Array(sharedBuffer);

// ---- Web Worker ----
const worker = new Worker(new URL('./simulation/battle.worker.ts', import.meta.url), { type: 'module' });

// ---- UI Elements ----
const btnStart   = document.getElementById('btn-start') as HTMLButtonElement;
const btnReset   = document.getElementById('btn-reset') as HTMLButtonElement;
const scoreA     = document.getElementById('score-a') as HTMLSpanElement;
const scoreB     = document.getElementById('score-b') as HTMLSpanElement;
const overlay    = document.getElementById('overlay') as HTMLDivElement;
const overlayMsg = document.getElementById('overlay-msg') as HTMLParagraphElement;
const overlayBtn = document.getElementById('overlay-btn') as HTMLButtonElement;
const workerTicks = document.getElementById('worker-ticks') as HTMLSpanElement;
const selectModel = document.getElementById('select-model') as HTMLSelectElement;
const selectMatchup = document.getElementById('select-matchup') as HTMLSelectElement;

let tickCount = 0;

function enableControls() {
  btnStart.disabled = false;
  btnReset.disabled = false;
  selectModel.disabled = false;
  selectMatchup.disabled = false;
}

function disableControls() {
  btnStart.disabled = true;
  btnReset.disabled = true;
  selectModel.disabled = true;
  selectMatchup.disabled = true;
}

// ---- Worker message handler ----
worker.onmessage = (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'ready') {
    // Worker selesai init/reset
    enableControls();
  }

  if (type === 'score') {
    scoreA.textContent = e.data.aliveA;
    scoreB.textContent = e.data.aliveB;
    tickCount++;
    if (workerTicks) workerTicks.textContent = tickCount.toString();
  }

  if (type === 'end') {
    const winner: 'A' | 'B' = e.data.winner;
    overlayMsg.textContent = winner === 'A'
      ? '🔴 Tim A Menang!'
      : '🔵 Tim B Menang!';
    overlay.style.display = 'flex';
    btnStart.disabled = true;
  }

  if (type === 'skillFX') {
    spawnSkillFX(e.data);
  }
};

// ---- UI handlers ----
btnStart.addEventListener('click', () => {
  disableControls();
  // Biarkan Reset tetap aktif saat pertempuran berjalan
  btnReset.disabled = false;
  worker.postMessage({ type: 'start' });
});

btnReset.addEventListener('click', () => {
  disableControls();
  overlay.style.display = 'none';
  tickCount = 0;
  if (workerTicks) workerTicks.textContent = '0';
  resetUnitsVisual();
  worker.postMessage({ type: 'reset', matchup: selectMatchup.value });
});

overlayBtn.addEventListener('click', () => {
  disableControls();
  overlay.style.display = 'none';
  tickCount = 0;
  if (workerTicks) workerTicks.textContent = '0';
  resetUnitsVisual();
  worker.postMessage({ type: 'reset', matchup: selectMatchup.value });
});

selectModel.addEventListener('change', () => {
  disableControls();
  overlay.style.display = 'none';
  tickCount = 0;
  if (workerTicks) workerTicks.textContent = '0';
  
  // Reset worker state & positions
  worker.postMessage({ type: 'reset', matchup: selectMatchup.value });
  
  // Muat model baru
  changeModel(selectModel.value, () => {
    // Callback sukses
    enableControls();
  }, () => {
    // Callback error (re-enable select so they can choose another one)
    selectModel.disabled = false;
    selectMatchup.disabled = false;
  });
});

selectMatchup.addEventListener('change', () => {
  disableControls();
  overlay.style.display = 'none';
  tickCount = 0;
  if (workerTicks) workerTicks.textContent = '0';
  resetUnitsVisual();
  worker.postMessage({ type: 'reset', matchup: selectMatchup.value });
});

// ---- Init sequence ----
setSharedData(sharedData);
startRenderLoop();

// Kirim buffer ke worker
worker.postMessage({ type: 'init', buffer: sharedBuffer, matchup: selectMatchup.value });

// Load model awal secara dinamis
changeModel('Chef_Hat');
