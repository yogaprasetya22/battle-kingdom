/**
 * FreeFlyCameraController.ts — Free-Fly Spectator Camera (TABS-style)
 *
 * Kontrol:
 *   - Klik kanan          → toggle lock kamera (lock = mouse menggerakkan pandangan)
 *   - W/S                 → maju/mundur (relatif arah pandang)
 *   - A/D                 → kiri/kanan (strafe)
 *   - Space               → terbang naik (world-space Y)
 *   - Shift + Space       → terbang turun (world-space Y)
 *
 * Desain:
 *   - Event listeners hanya mencatat *state* (tombol apa yang tertekan).
 *   - Pergerakan menggunakan sistem akselerasi & drag (gesekan) agar melayang mulus.
 *   - Rotasi menggunakan interpolasi (lerp) pada Yaw/Pitch untuk efek peredaman (damping).
 */

import * as THREE from "three";
import { getTerrainHeight } from "../../simulation/constants";

// ─── Konfigurasi Peredaman (Damping/Smoothing) ───────────────────────────────

const ACCELERATION     = 180;  // Kecepatan akselerasi kamera
const DRAG             = 8.5;  // Gaya gesekan udara (makin tinggi, makin cepat berhenti)
const LOOK_SPEED       = 0.002; // Sensitivitas mouse
const ROTATION_DAMPING = 15;   // Kecepatan peredaman rotasi (makin tinggi, makin responsif)
const PITCH_LIMIT      = Math.PI / 2 - 0.01; // Cegah jungkir balik (~89 derajat)

// ─── State yang dicatat oleh Event Listeners ─────────────────────────────────

/** Tombol yang sedang ditekan */
const keys: Record<string, boolean> = {};

/** Toggle: true = kamera terkunci, mouse menggerakkan pandangan */
let isLocked = false;

/** Akumulasi delta mouse sejak frame terakhir */
let mouseDX = 0;
let mouseDY = 0;

// ─── Sudut Rotasi & Kecepatan (Damping State) ────────────────────────────────

let targetYaw   = 0; // Sudut horizontal tujuan
let targetPitch = 0; // Sudut vertikal tujuan
let currentYaw   = 0; // Sudut horizontal saat ini (di-lerp)
let currentPitch = 0; // Sudut vertikal saat ini (di-lerp)

/** Vektor kecepatan kamera (untuk inersia pergerakan) */
const velocity = new THREE.Vector3();

// ─── Vektor bantu (alokasi sekali, reuse tiap frame) ─────────────────────────

const _forward = new THREE.Vector3();
const _right   = new THREE.Vector3();
const _move    = new THREE.Vector3();

// ─── Event Listeners ─────────────────────────────────────────────────────────

/**
 * Inisialisasi semua event listener. Panggil sekali saat setup.
 */
export function initFlyControls(canvas: HTMLElement): void {
    // Klik kanan → toggle lock/unlock kamera
    canvas.addEventListener("mousedown", (e: MouseEvent) => {
        if (e.button !== 2) return;
        isLocked = !isLocked;
        if (isLocked) {
            canvas.requestPointerLock?.();
        } else {
            document.exitPointerLock?.();
        }
    });

    // Cegah context menu klik kanan di canvas
    canvas.addEventListener("contextmenu", (e: Event) => e.preventDefault());

    // Catat delta mouse — hanya akumulasikan, dikonsumsi di rAF
    window.addEventListener("mousemove", (e: MouseEvent) => {
        if (!isLocked) return;
        mouseDX += e.movementX;
        mouseDY += e.movementY;
    });

    // Pointer lock bisa dilepas paksa oleh browser (mis. tekan Esc) — sinkronkan state
    document.addEventListener("pointerlockchange", () => {
        if (!document.pointerLockElement) {
            isLocked = false;
        }
    });

    // Catat tombol yang ditekan (cegah scroll halaman saat Space ditekan)
    window.addEventListener("keydown", (e: KeyboardEvent) => {
        keys[e.code] = true;
        if (e.code === "Space" && isLocked) e.preventDefault();
    });

    // Catat tombol yang dilepas
    window.addEventListener("keyup", (e: KeyboardEvent) => {
        keys[e.code] = false;
    });
}

/**
 * Sinkronkan yaw/pitch awal dari posisi kamera yang sudah ada.
 */
export function syncAnglesFromCamera(camera: THREE.Camera): void {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    targetYaw = euler.y;
    targetPitch = euler.x;
    currentYaw = euler.y;
    currentPitch = euler.x;
    velocity.set(0, 0, 0);
}

// ─── Logika Pergerakan (dipanggil setiap requestAnimationFrame) ───────────────

/**
 * Update posisi dan rotasi kamera dengan efek damping (lembut/melayang).
 */
export function updateFlyCamera(camera: THREE.Camera, delta: number): void {
    // Batasi delta yang terlalu besar (misalnya jika tab sempat tidak aktif) agar tidak menembus batas scene
    const dt = Math.min(delta, 0.1);

    // ── 1. Update target rotasi dari mouse delta ──────────────────────────

    if (mouseDX !== 0 || mouseDY !== 0) {
        targetYaw   -= mouseDX * LOOK_SPEED;
        targetPitch -= mouseDY * LOOK_SPEED;

        // Batasi target pitch
        targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, targetPitch));

        mouseDX = 0;
        mouseDY = 0;
    }

    // ── 2. Lerp rotasi kamera untuk efek damping lembut ───────────────────

    currentYaw   += (targetYaw - currentYaw) * Math.min(1, ROTATION_DAMPING * dt);
    currentPitch += (targetPitch - currentPitch) * Math.min(1, ROTATION_DAMPING * dt);

    camera.rotation.order = "YXZ";
    camera.rotation.y = currentYaw;
    camera.rotation.x = currentPitch;

    // ── 3. Terapkan Drag/Gesekan ke Kecepatan ──────────────────────────────

    velocity.multiplyScalar(1 - Math.min(1, DRAG * dt));

    // ── 4. Hitung Vektor Input Gerakan ────────────────────────────────────

    _move.set(0, 0, 0);

    // Dapatkan arah pandang kamera saat ini
    _forward.set(0, 0, -1).applyEuler(camera.rotation);
    _right.set(1, 0, 0).applyEuler(camera.rotation);

    if (keys["KeyW"]) _move.addScaledVector(_forward,  1);
    if (keys["KeyS"]) _move.addScaledVector(_forward, -1);
    if (keys["KeyD"]) _move.addScaledVector(_right,   1);
    if (keys["KeyA"]) _move.addScaledVector(_right,  -1);

    // Space = naik | Shift+Space = turun
    if (keys["Space"]) {
        if (keys["ShiftLeft"] || keys["ShiftRight"]) {
            _move.y -= 1;
        } else {
            _move.y += 1;
        }
    }

    // ── 5. Akselerasi & Terapkan Kecepatan ke Kamera ──────────────────────

    if (_move.lengthSq() > 0) {
        _move.normalize();
        velocity.addScaledVector(_move, ACCELERATION * dt);
    }

    camera.position.addScaledVector(velocity, dt);

    // Prevent camera from clipping through the terrain ground
    const terrainHeight = getTerrainHeight(camera.position.x, camera.position.z);
    const minHeight = terrainHeight + 1.0;
    if (camera.position.y < minHeight) {
        camera.position.y = minHeight;
        if (velocity.y < 0) velocity.y = 0;
    }
}
