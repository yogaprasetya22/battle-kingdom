/**
 * renderer.ts — Orchestrator: FX dispatch, render loop, world management.
 * Unit lifecycle & animation delegated to UnitRenderer.ts.
 */

import * as THREE from "three";
import { WindEffectManager } from "../effects/WindLines";
import { DayCycleManager } from "./DayCycleManager";
import { getTerrainHeight } from "../../simulation/constants";
import {
    scene,
    camera,
    renderer,
    gltfLoader,
    sun,
    ambient,
} from "./scene";
import { updateFlyCamera } from "./FreeFlyCameraController";
import { soundFX } from "./SoundFX";
import { World } from "../scenery/World";
import {
    setSharedData as setUnitSharedData,
    updateFrame,
} from "./UnitRenderer";
import { perfProfiler } from "./PerformanceProfiler";

import { damageHUDBatcher } from "../effects/DamageHUDBatcher";

export { changeModel, resetUnitsVisual, getUnits } from "./UnitRenderer";
import { updateFX, effectUniforms } from "../effects/FXCore";
import { dispatchSkillFX } from "../effects/FXRouter";

let sharedData: Float32Array | null = null;

// Worker-Bypass: saat hero aktif, updateFlyCamera dinonaktifkan agar
// tidak rebutan kontrol kamera dengan CharacterController.
let _heroActive = false;
export function setHeroActive(active: boolean): void {
    _heroActive = active;
}

export function setSharedData(data: Float32Array) {
    sharedData = data;
    setUnitSharedData(data);
}

export const world = new World(scene, gltfLoader);

const windEffect = new WindEffectManager(scene);
windEffect.start();

// ▸ Day Cycle Manager (4 periode: pagi, siang, sore, malam)
const dayCycleManager = new DayCycleManager(scene, 240); // 240 detik per siklus (1 menit per periode)
dayCycleManager.setDirectionalLight(sun);
dayCycleManager.setAmbientLight(ambient);

export function spawnSkillFX(event: { skill: string; [key: string]: any }) {
    if (event.skill === "damage" || event.skill === "heal" || event.skill === "miss") {
        damageHUDBatcher.spawn(event as any);
        return;
    }

    // Resolve team dynamically only if not already provided by worker (O(100) fallback scan)
    // Most events from CombatSystem already embed team — this loop is skipped in that case.
    if (event.team === undefined && sharedData) {
        const sx = event.fx !== undefined ? event.fx : event.x;
        const sz = event.fz !== undefined ? event.fz : event.z;
        if (sx !== undefined && sz !== undefined) {
            let closestIdx = -1;
            let closestDistSq = Infinity;
            const UNIT_COUNT = 100; // TEAM_SIZE 50 * 2
            const STRIDE = 15;
            for (let i = 0; i < UNIT_COUNT; i++) {
                const base = i * STRIDE;
                if (sharedData[base + 3] > 0) { // IDX_HP = 3
                    const ux = sharedData[base + 0]; // IDX_X = 0
                    const uz = sharedData[base + 2]; // IDX_Z = 2
                    const dx = ux - sx;
                    const dz = uz - sz;
                    const distSq = dx * dx + dz * dz;
                    if (distSq < closestDistSq) {
                        closestDistSq = distSq;
                        closestIdx = i;
                    }
                }
            }
            if (closestIdx !== -1 && closestDistSq < 36.0) { // within 6 units range
                event.team = sharedData[closestIdx * STRIDE + 5]; // IDX_TEAM = 5
            }
        }
    }

    // Play procedural/spatial sound FX based on skill
    switch (event.skill) {
        case "arrowVolley": {
            const groundY = getTerrainHeight(event.x, event.z);
            const sx = event.fx ?? event.x;
            const sy = event.fy ?? groundY;
            const sz = event.fz ?? event.z;
            soundFX.playArrowVolley(sx, sy, sz, camera.position);
            break;
        }
        case "shieldBash":
            soundFX.playShieldBash(event.x, event.y, event.z, camera.position);
            break;
        case "doubleShot":
        case "turretShoot":
            soundFX.playBow(event.fx, event.fy, event.fz, camera.position);
            break;
        case "evasiveLeap":
        case "shadowStep":
            soundFX.playDash(event.fx, event.fy, event.fz, camera.position);
            break;
        case "smokeBomb":
            soundFX.playDash(event.x, event.y, event.z, camera.position);
            break;
        case "fireball":
            soundFX.playFireball(event.fx, event.fy, event.fz, camera.position);
            break;
        case "basicHeal":
        case "rejuvenation":
        case "divineShield":
            soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
            break;
        case "holySanctuary":
            soundFX.playHeal(event.x, event.y, event.z, camera.position);
            break;
        case "highNoon":
            soundFX.playBow(event.fx, event.fy, event.fz, camera.position);
            break;
        case "fanFire":
            soundFX.playArrowVolley(event.x, 0, event.z, camera.position);
            break;
        case "backstab":
        case "poisonBlade":
            soundFX.playSlash(event.fx, event.fy, event.fz, camera.position);
            break;
    }

    // Dispatch particle effects via high-performance router
    dispatchSkillFX(scene, event);
}

// ▸ Render Loop
let animId = 0;
const clock = new THREE.Clock();

let _onBeforeRender: ((timestamp: number, delta: number) => void) | null = null;

export function setBeforeRenderCb(
    cb: ((timestamp: number, delta: number) => void) | null,
) {
    _onBeforeRender = cb;
}

const fpsVal = document.getElementById("fps-val");
const msVal = document.getElementById("ms-val");
const dcVal = document.getElementById("dc-val");
const triVal = document.getElementById("tri-val");
const geoVal = document.getElementById("geo-val");
const texVal = document.getElementById("tex-val");
const progVal = document.getElementById("prog-val");


export function startRenderLoop() {
    // Set Three.js renderer reference for CPU/GPU memory & draw call tracking
    perfProfiler.setRenderer(renderer);

    const loop = (timestamp: number) => {
        // Pass rAF timestamp so profiler measures frame-to-frame interval (real fps),
        // not just CPU work time (which would report ~192fps on a 60Hz display).
        perfProfiler.startFrame(timestamp);
        animId = requestAnimationFrame(loop);

        const delta = clock.getDelta();
        if (_onBeforeRender) _onBeforeRender(timestamp, delta);

        // Update kamera free-fly (gerak + look) — dinonaktifkan saat Hero aktif
        if (!_heroActive) updateFlyCamera(camera, delta);
        world.update(delta, camera.position, camera);
        effectUniforms.uTime.value += delta;

        // Update day cycle every frame (completely optimized, zero overhead)
        dayCycleManager.update();

        updateFX(delta);
        damageHUDBatcher.update(delta);
        windEffect.update(delta);

        // HUD — profiler's rolling average so HUD matches logged data exactly
        if (fpsVal) fpsVal.textContent = perfProfiler.getLiveFps().toString();
        if (msVal) msVal.textContent = perfProfiler.getLastFrameTime().toFixed(1);
        if (dcVal) dcVal.textContent = renderer.info.render.calls.toString();
        if (triVal) triVal.textContent = renderer.info.render.triangles.toString();
        if (geoVal) geoVal.textContent = renderer.info.memory.geometries.toString();
        if (texVal) texVal.textContent = renderer.info.memory.textures.toString();
        if (progVal)
            progVal.textContent = renderer.info.programs
                ? renderer.info.programs.length.toString()
                : "0";

        if (sharedData) updateFrame(sharedData, delta);
        const tStartRender = performance.now();
        renderer.render(scene, camera);
        const tDurationRender = performance.now() - tStartRender;
        perfProfiler.trackSystemTime("render", tDurationRender);

        perfProfiler.endFrame();
    };
    animId = requestAnimationFrame(loop);
}

export function stopRenderLoop() {
    if (animId) cancelAnimationFrame(animId);
}
