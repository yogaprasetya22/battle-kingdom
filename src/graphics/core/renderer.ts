/**
 * renderer.ts — Orchestrator: FX dispatch, render loop, world management.
 * Unit lifecycle & animation delegated to UnitRenderer.ts.
 */

import * as THREE from "three";
import { WindEffectManager } from "../effects/WindLines";
import { getTerrainHeight } from "../../simulation/constants";
import { scene, camera, renderer, controls, gltfLoader } from "./scene";
import { soundFX } from "./SoundFX";
import { World } from "../scenery/World";
import {
    setSharedData as setUnitSharedData,
    updateFrame,
} from "./UnitRenderer";

export { changeModel, resetUnitsVisual } from "./UnitRenderer";

import {
    spawnLightningFX,
    spawnArrowVolleyFX,
    spawnFireballFX,
    spawnDoubleShotFX,
    spawnTauntFX,
    spawnShieldBashFX,
    spawnEvasiveLeapFX,
    spawnFrostNovaBurstFX,
    spawnIronFortitudeAuraFX,
    spawnBasicAttackFX,
    spawnHealFX,
    spawnDivineShieldFX,
    spawnHolySanctuaryFX,
    updateFX,
    canSpawnFX,
    effectUniforms,
} from "../effects/SkillFX";

let sharedData: Float32Array | null = null;

export function setSharedData(data: Float32Array) {
    sharedData = data;
    setUnitSharedData(data);
}

const world = new World(scene, gltfLoader);

const windEffect = new WindEffectManager(scene);
windEffect.start();

export function spawnSkillFX(event: { skill: string; [key: string]: any }) {
    if (!canSpawnFX()) return;
    if (event.skill === "arrowVolley") {
        const groundY = getTerrainHeight(event.x, event.z);
        const sx = event.fx ?? event.x;
        const sy = event.fy ?? groundY;
        const sz = event.fz ?? event.z;
        soundFX.playArrowVolley(sx, sy, sz, camera.position);
        spawnArrowVolleyFX(scene, event.x, event.z, groundY, 3.5, event.team);
    } else if (event.skill === "chainLightning") {
        const pos: THREE.Vector3[] = [];
        const arr: number[] = event.positions;
        for (let i = 0; i + 2 < arr.length; i += 3) {
            pos.push(new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2]));
        }
        spawnLightningFX(scene, pos, event.team);
    } else if (event.skill === "ironFortitude") {
        spawnIronFortitudeAuraFX(scene, event.x, event.y, event.z, event.team);
    } else if (event.skill === "taunt") {
        spawnTauntFX(
            scene,
            event.x,
            event.y,
            event.z,
            event.tx,
            event.ty,
            event.tz,
            event.team,
        );
    } else if (event.skill === "shieldBash") {
        soundFX.playShieldBash(event.x, event.y, event.z, camera.position);
        spawnShieldBashFX(
            scene,
            event.x,
            event.y,
            event.z,
            event.tx,
            event.ty,
            event.tz,
            event.team,
        );
    } else if (event.skill === "doubleShot") {
        soundFX.playBow(event.fx, event.fy, event.fz, camera.position);
        spawnDoubleShotFX(
            scene,
            event.fx,
            event.fy,
            event.fz,
            event.tx,
            event.ty,
            event.tz,
        );
    } else if (event.skill === "evasiveLeap") {
        soundFX.playDash(event.fx, event.fy, event.fz, camera.position);
        const fy =
            event.fy !== undefined
                ? event.fy
                : getTerrainHeight(event.fx, event.fz);
        const ty =
            event.ty !== undefined
                ? event.ty
                : getTerrainHeight(event.tx, event.tz);
        spawnEvasiveLeapFX(
            scene,
            event.fx,
            fy,
            event.fz,
            event.tx,
            ty,
            event.tz,
        );
    } else if (event.skill === "fireball") {
        soundFX.playFireball(event.fx, event.fy, event.fz, camera.position);
        spawnFireballFX(
            scene,
            event.fx,
            event.fy,
            event.fz,
            event.tx,
            event.ty,
            event.tz,
        );
    } else if (event.skill === "frostNova") {
        spawnFrostNovaBurstFX(scene, event.x, event.y, event.z);
    } else if (event.skill === "basicAttack") {
        spawnBasicAttackFX(
            scene,
            event.uType,
            event.fx,
            event.fy,
            event.fz,
            event.tx,
            event.ty,
            event.tz,
        );
    } else if (event.skill === "basicHeal") {
        soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
        spawnHealFX(
            scene,
            new THREE.Vector3(event.fx, event.fy, event.fz),
            new THREE.Vector3(event.tx, event.ty, event.tz),
            false,
        );
    } else if (event.skill === "rejuvenation") {
        soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
        spawnHealFX(
            scene,
            new THREE.Vector3(event.fx, event.fy, event.fz),
            new THREE.Vector3(event.tx, event.ty, event.tz),
            true,
        );
    } else if (event.skill === "divineShield") {
        soundFX.playHeal(event.fx, event.fy, event.fz, camera.position);
        spawnDivineShieldFX(
            scene,
            new THREE.Vector3(event.tx, event.ty, event.tz),
        );
    } else if (event.skill === "holySanctuary") {
        soundFX.playHeal(event.x, event.y, event.z, camera.position);
        spawnHolySanctuaryFX(
            scene,
            new THREE.Vector3(event.x, event.y, event.z),
        );
    }
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

let lastFpsUpdate = 0;
let frameCount = 0;

export function startRenderLoop() {
    const loop = (timestamp: number) => {
        animId = requestAnimationFrame(loop);

        const delta = clock.getDelta();
        if (_onBeforeRender) _onBeforeRender(timestamp, delta);

        controls.update();
        world.update(delta);
        effectUniforms.uTime.value += delta;

        updateFX(delta);
        windEffect.update(delta);

        frameCount++;
        if (timestamp > lastFpsUpdate + 1000) {
            if (fpsVal)
                fpsVal.textContent = Math.round(
                    (frameCount * 1000) / (timestamp - lastFpsUpdate),
                ).toString();
            if (dcVal)
                dcVal.textContent = renderer.info.render.calls.toString();
            if (triVal)
                triVal.textContent = renderer.info.render.triangles.toString();
            if (geoVal)
                geoVal.textContent = renderer.info.memory.geometries.toString();
            if (texVal)
                texVal.textContent = renderer.info.memory.textures.toString();
            if (progVal)
                progVal.textContent = renderer.info.programs
                    ? renderer.info.programs.length.toString()
                    : "0";
            frameCount = 0;
            lastFpsUpdate = timestamp;
        }
        if (msVal) msVal.textContent = (delta * 1000).toFixed(1);

        if (sharedData) updateFrame(sharedData, delta);
        renderer.render(scene, camera);
    };
    animId = requestAnimationFrame(loop);
}

export function stopRenderLoop() {
    if (animId) cancelAnimationFrame(animId);
}
