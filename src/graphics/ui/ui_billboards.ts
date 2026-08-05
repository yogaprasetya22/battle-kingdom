import * as THREE from "three";
import { UNIT_COUNT, TEAM_SIZE } from "../../simulation/constants";
import { scene } from "../core/scene";

// ---- 1. HP Bars (Redesigned: thinner, highly visible neon colors, transparent to prevent blocking the battle) ----
const hpBgGeo = new THREE.PlaneGeometry(0.84, 0.12);
const hpFgGeo = new THREE.PlaneGeometry(0.80, 0.08);

const hpBgMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            #ifdef USE_INSTANCING
                vec3 worldPos = vec3(instanceMatrix[3]);
                vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                vec3 vPos = worldPos + camRight * position.x + camUp * position.y;
                gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
            #else
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #endif
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        void main() {
            gl_FragColor = vec4(0.05, 0.05, 0.05, 0.75);
        }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
});

// Custom ShaderMaterial for foreground to support instanced coloring, neon glow, transparency, and dividers
const hpFgMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
            vUv = uv;
            #ifdef USE_INSTANCING
                float sX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
                float sY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
                float sZ = length(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]));
                vColor = vec3(sX, sY, sZ);

                vec3 worldPos = vec3(instanceMatrix[3]);
                vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                vec3 vPos = worldPos + camRight * position.x + camUp * position.y;
                gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
            #else
                vColor = vec3(1.0, 0.0, 100.0); // Fallback
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #endif
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
            float hpRatio = vColor.r;
            float teamId = vColor.g;
            float maxHp = vColor.b;

            // Discard pixels beyond current HP ratio
            if (vUv.x > hpRatio) {
                discard;
            }

            // High-brightness neon colors: Neon green for Team A (allies), Neon hot pink-red for Team B (enemies)
            vec3 baseColor = (teamId < 0.5) ? vec3(0.0, 1.0, 0.45) : vec3(1.0, 0.08, 0.35);

            // Optimized simple linear gradient (no smoothstep)
            vec3 finalColor = baseColor;
            if (vUv.y > 0.6) {
                finalColor = mix(baseColor, vec3(1.0), (vUv.y - 0.6) * 1.25);
            } else {
                finalColor = mix(baseColor * 0.75, baseColor, vUv.y * 1.6);
            }

            // Draw dividers (ticks) every 25,000 HP (optimized modulo check)
            if (maxHp > 25000.0) {
                float tickSpacing = 25000.0 / maxHp;
                float absX = vUv.x * hpRatio;
                float distToTick = mod(absX, tickSpacing);
                
                // Draw sharp ticks, avoiding boundaries
                if (absX < hpRatio - 0.015 && absX > 0.015) {
                    if (distToTick < 0.012 || (tickSpacing - distToTick) < 0.012) {
                        finalColor = vec3(0.0);
                    }
                }
            }

            gl_FragColor = vec4(finalColor, 0.85);
        }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
});

export const hpBarsBg = new THREE.InstancedMesh(hpBgGeo, hpBgMat, UNIT_COUNT);
export const hpBarsFg = new THREE.InstancedMesh(hpFgGeo, hpFgMat, UNIT_COUNT);
hpBarsBg.renderOrder = 998;
hpBarsFg.renderOrder = 999;
hpBarsBg.frustumCulled = false;
hpBarsFg.frustumCulled = false;
scene.add(hpBarsBg);
scene.add(hpBarsFg);

// ---- 2. Cooldown Foot Rings ----
const cdRingGeo = new THREE.RingGeometry(0.35, 0.45, 16);
const cdRingMat = new THREE.MeshBasicMaterial({
    color: 0x00dfff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
});

export const cdRings = new THREE.InstancedMesh(
    cdRingGeo,
    cdRingMat,
    UNIT_COUNT,
);
cdRings.renderOrder = 1;
cdRings.frustumCulled = false;
scene.add(cdRings);

// ---- 3. Immunity Rings ----
const immuneRingGeo = new THREE.RingGeometry(0.55, 0.72, 24);
const immuneRingMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
});

export const immuneRings = new THREE.InstancedMesh(
    immuneRingGeo,
    immuneRingMat,
    UNIT_COUNT,
);
immuneRings.renderOrder = 5;
immuneRings.frustumCulled = false;
scene.add(immuneRings);

export const dummy = new THREE.Object3D();
export const _deadMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
export const _deadNameMatrix = new THREE.Matrix4().makeTranslation(0, -999, 0);

// Hide all instances at origin until they are assigned a real position.
// InstancedMesh defaults every instance to identity matrix (pos 0,0,0 = center
// of arena), which causes ghost labels / bars to appear before battle starts.
{
    for (let _i = 0; _i < UNIT_COUNT; _i++) {
        hpBarsBg.setMatrixAt(_i, _deadNameMatrix);
        hpBarsFg.setMatrixAt(_i, _deadNameMatrix);
        cdRings.setMatrixAt(_i, _deadNameMatrix);
        immuneRings.setMatrixAt(_i, _deadNameMatrix);
    }
    hpBarsBg.instanceMatrix.needsUpdate = true;
    hpBarsFg.instanceMatrix.needsUpdate = true;
    cdRings.instanceMatrix.needsUpdate = true;
    immuneRings.instanceMatrix.needsUpdate = true;
}

export let nameBarsA: THREE.InstancedMesh | null = null;
export let nameBarsB: THREE.InstancedMesh | null = null;
const nameGeo = new THREE.PlaneGeometry(1.0, 0.25); // Aspect ratio 4:1 (tidak peyang)

// Greek mythology names for Team A (Allies)
const GREEK_NAMES = [
    "Ares", "Zeus", "Athena", "Hades", "Poseidon", "Apollo", "Artemis", "Hermes", "Hera", "Demeter",
    "Hephaestus", "Aphrodite", "Hestia", "Dionysus", "Persephone", "Hercules", "Achilles", "Odysseus", "Theseus", "Perseus",
    "Jason", "Bellerophon", "Orpheus", "Cadmus", "Ajax", "Agamemnon", "Menelaus", "Hector", "Paris", "Priam",
    "Aeneas", "Romulus", "Remus", "Julius", "Augustus", "Marcus", "Hadrian", "Trajan", "Nero", "Caligula",
    "Tiberius", "Claudius", "Vespasian", "Titus", "Domitian", "Nerva", "Antoninus", "Commodus", "Severus", "Caracalla"
];

// Norse mythology names for Team B (Enemies)
const NORSE_NAMES = [
    "Thor", "Odin", "Loki", "Freya", "Baldur", "Tyr", "Heimdall", "Frigg", "Sif", "Bragi",
    "Idun", "Vidar", "Vali", "Ullr", "Forseti", "Hermod", "Kvasir", "Mani", "Sol", "Jord",
    "Ran", "Aegir", "Hel", "Fenrir", "Jormungandr", "Ymir", "Surtr", "Thrym", "Gymir", "Gerd",
    "Skadi", "Njord", "Freyr", "Sigyn", "Nanna", "Hermod", "Bor", "Buri", "Bestla", "Bolthorn",
    "Mimir", "Hoenir", "Lodur", "Vili", "Ve", "Gefjon", "Fulla", "Eir", "Gna", "Lofn"
];

// Build a compact fixed-size 1024x512 name sprite sheet:
// Grid of 5 columns x 10 rows = 50 slots. Each cell = 204.8px x 51.2px (Ratio 4:1).
const NAME_ATLAS_COLS = 5;
const NAME_ATLAS_ROWS = 10;

function createNamesTextureAtlas(names: string[], color: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 1024, 512);

    const cellW = 1024 / NAME_ATLAS_COLS; // 204.8px
    const cellH = 512 / NAME_ATLAS_ROWS;  // 51.2px

    ctx.font = `bold ${Math.floor(cellH * 0.65)}px 'Outfit', Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < TEAM_SIZE && i < NAME_ATLAS_COLS * NAME_ATLAS_ROWS; i++) {
        const name = names[i] || `P${i + 1}`;
        const col = i % NAME_ATLAS_COLS;
        const row = Math.floor(i / NAME_ATLAS_COLS);
        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 6;
        ctx.lineJoin = "round";
        ctx.strokeText(name, cx, cy, cellW - 12);
        ctx.fillStyle = color;
        ctx.fillText(name, cx, cy, cellW - 12);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}

export function initNameBars(modelName: string) {
    if (nameBarsA) { nameBarsA.geometry.dispose(); (nameBarsA.material as any).map?.dispose(); scene.remove(nameBarsA); }
    if (nameBarsB) { nameBarsB.geometry.dispose(); (nameBarsB.material as any).map?.dispose(); scene.remove(nameBarsB); }

    const texA = createNamesTextureAtlas(GREEK_NAMES, "#ffea00");
    const texB = createNamesTextureAtlas(NORSE_NAMES, "#00f0ff");

    // ponytail: one shared ShaderMaterial class, two instances with different uniform
    // Vertex shader extracts (col, row) from gl_InstanceID to sample correct sprite cell
    const buildNameMat = (tex: THREE.Texture) => new THREE.ShaderMaterial({
        uniforms: { map: { value: tex } },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                float idx = float(gl_InstanceID);
                float col = mod(idx, ${NAME_ATLAS_COLS.toFixed(1)});
                float row = floor(idx / ${NAME_ATLAS_COLS.toFixed(1)});
                float colSize = 1.0 / ${NAME_ATLAS_COLS.toFixed(1)};
                float rowSize = 1.0 / ${NAME_ATLAS_ROWS.toFixed(1)};
                vUv = vec2(
                    col * colSize + uv.x * colSize,
                    1.0 - ((row + 1.0) * rowSize) + uv.y * rowSize
                );
                #ifdef USE_INSTANCING
                    // Spherical billboard: ambil hanya posisi dari instanceMatrix,
                    // lalu orient quad menggunakan camera right/up — label selalu
                    // menghadap kamera dan tidak "peang" (miring).
                    vec3 worldPos = vec3(instanceMatrix[3]);
                    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                    vec3 vPos = worldPos + camRight * position.x + camUp * position.y;
                    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
                #else
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                #endif
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            varying vec2 vUv;
            void main() {
                vec4 c = texture2D(map, vUv);
                if (c.a < 0.1) discard;
                gl_FragColor = c;
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
    });

    nameBarsA = new THREE.InstancedMesh(nameGeo, buildNameMat(texA), TEAM_SIZE);
    nameBarsA.renderOrder = 1000;
    nameBarsA.frustumCulled = false; // ponytail: we manage visibility via _deadMatrix
    for (let _i = 0; _i < TEAM_SIZE; _i++) nameBarsA.setMatrixAt(_i, _deadNameMatrix);
    nameBarsA.instanceMatrix.needsUpdate = true;
    scene.add(nameBarsA);

    nameBarsB = new THREE.InstancedMesh(nameGeo, buildNameMat(texB), TEAM_SIZE);
    nameBarsB.renderOrder = 1000;
    nameBarsB.frustumCulled = false;
    for (let _i = 0; _i < TEAM_SIZE; _i++) nameBarsB.setMatrixAt(_i, _deadNameMatrix);
    nameBarsB.instanceMatrix.needsUpdate = true;
    scene.add(nameBarsB);
}
