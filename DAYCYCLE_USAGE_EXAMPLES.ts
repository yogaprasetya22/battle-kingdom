/**
 * DAYCYCLE_USAGE_EXAMPLES.ts
 *
 * Contoh implementasi & integrasi DayCycleManager
 * File ini bukan bagian dari production code, hanya referensi
 */

import * as THREE from "three";
import { DayCycleManager } from "./src/graphics/core/DayCycleManager";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 1: Setup Dasar
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function setupDayCycleBasic(
    scene: THREE.Scene,
    sun: THREE.DirectionalLight,
    ambient: THREE.Light,
) {
    // Buat manager dengan siklus 60 detik
    const dayCycleManager = new DayCycleManager(scene, 60);

    // Link ke lights
    dayCycleManager.setDirectionalLight(sun);
    dayCycleManager.setAmbientLight(ambient);

    // Return untuk digunakan di render loop
    return dayCycleManager;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 2: Render Loop Integration
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function setupRenderLoop(
    dayCycleManager: DayCycleManager,
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
) {
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const delta = clock.getDelta();

        // ✓ Update cycle setiap frame
        dayCycleManager.update();

        // Render
        renderer.render(scene, camera);
    }

    animate();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 3: Period Change Detection & Events
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function setupPeriodChangeListener(dayCycleManager: DayCycleManager) {
    let lastPeriod = dayCycleManager.getCurrentPeriod();
    let lastRawProgress = 0;

    return function updatePeriodListener() {
        const currentPeriod = dayCycleManager.getCurrentPeriod();
        const currentProgress = dayCycleManager.getProgress();

        // Detect period change
        if (currentPeriod !== lastPeriod) {
            console.log(`🌍 Periode berubah: ${lastPeriod} → ${currentPeriod}`);
            onPeriodChanged(currentPeriod);
            lastPeriod = currentPeriod;
        }

        // Detect cycle wrap (reset)
        if (currentProgress < lastRawProgress) {
            console.log("🔄 Siklus di-reset");
            onCycleReset();
        }

        lastRawProgress = currentProgress;
    };
}

function onPeriodChanged(period: string) {
    // Trigger special effects, sounds, atau logic
    switch (period) {
        case "Pagi":
            console.log("🌅 Sunrise! Burung mulai berkicau");
            // playSoundTrack("sunrise");
            // updateNPCBehavior("wakeup");
            break;
        case "Siang":
            console.log("☀️ Siang! Cuaca cerah");
            // playSoundTrack("day");
            break;
        case "Sore":
            console.log("🌅 Sunset! Warna oranye di langit");
            // playSoundTrack("sunset");
            break;
        case "Malam":
            console.log("🌙 Malam! Bintang mulai terlihat");
            // playSoundTrack("night");
            // updateNPCBehavior("sleep");
            break;
    }
}

function onCycleReset() {
    console.log("Siklus baru dimulai");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 4: UI Display (Progress Bar, Period Name)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function setupDayCycleUI(dayCycleManager: DayCycleManager) {
    const periodDisplay = document.getElementById("period-display");
    const progressBar = document.getElementById("day-progress");
    const progressText = document.getElementById("day-progress-text");

    return function updateUI() {
        if (periodDisplay) {
            periodDisplay.textContent = dayCycleManager.getCurrentPeriod();
        }

        if (progressBar) {
            const percentage = dayCycleManager.getPeriodProgress() * 100;
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            const percentage = (dayCycleManager.getProgress() * 100).toFixed(1);
            progressText.textContent = `${percentage}%`;
        }
    };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 5: Dynamic Material/Shader Updates
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function setupDynamicMaterialUpdates(
    dayCycleManager: DayCycleManager,
    meshes: THREE.Mesh[],
) {
    return function updateMaterials() {
        // Buat custom tint berdasarkan current light color
        const lightTint = dayCycleManager.lightColor.clone();
        lightTint.multiplyScalar(dayCycleManager.lightIntensity);

        meshes.forEach((mesh) => {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                // Adjust emissive berdasarkan ambient
                mesh.material.emissive.copy(lightTint);
                mesh.material.emissiveIntensity =
                    dayCycleManager.ambientIntensity * 0.3;
            }
        });
    };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 6: Custom Cycle Duration (Testing)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function setupDebugControls(dayCycleManager: DayCycleManager) {
    // Fast cycle untuk testing
    document.getElementById("btn-fast-cycle")?.addEventListener("click", () => {
        dayCycleManager.setCycleDuration(10); // 10 detik per siklus
        console.log("⚡ Fast cycle enabled (10s)");
    });

    // Normal cycle
    document
        .getElementById("btn-normal-cycle")
        ?.addEventListener("click", () => {
            dayCycleManager.setCycleDuration(60); // 60 detik (default)
            console.log("⏱️ Normal cycle (60s)");
        });

    // Reset
    document
        .getElementById("btn-reset-cycle")
        ?.addEventListener("click", () => {
            dayCycleManager.reset();
            console.log("🔄 Cycle reset ke awal");
        });

    // Show stats
    document.getElementById("btn-show-stats")?.addEventListener("click", () => {
        console.table({
            Period: dayCycleManager.getCurrentPeriod(),
            Progress: `${(dayCycleManager.getProgress() * 100).toFixed(1)}%`,
            PeriodProgress: `${(dayCycleManager.getPeriodProgress() * 100).toFixed(1)}%`,
            LightColor: dayCycleManager.lightColor.getHexString(),
            LightIntensity: dayCycleManager.lightIntensity.toFixed(2),
            AmbientIntensity: dayCycleManager.ambientIntensity.toFixed(2),
            FogDensity: dayCycleManager.fogDensity.toFixed(4),
        });
    });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 7: Integration dengan Existing Game Loop
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class GameWithDayCycle {
    private dayCycleManager: DayCycleManager;
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private camera: THREE.Camera;

    constructor(
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        camera: THREE.Camera,
        sun: THREE.DirectionalLight,
        ambient: THREE.Light,
    ) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;

        // Initialize day cycle
        this.dayCycleManager = new DayCycleManager(scene, 60);
        this.dayCycleManager.setDirectionalLight(sun);
        this.dayCycleManager.setAmbientLight(ambient);
    }

    public update(delta: number) {
        // Update day cycle
        this.dayCycleManager.update();

        // Update other systems...
        // this.updatePhysics(delta);
        // this.updateAI(delta);
        // this.updateParticles(delta);
    }

    public render() {
        this.renderer.render(this.scene, this.camera);
    }

    public getCurrentPeriod(): string {
        return this.dayCycleManager.getCurrentPeriod();
    }

    public getProgress(): number {
        return this.dayCycleManager.getProgress();
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 8: Conditional Logic berdasarkan Time Period
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function applyPeriodSpecificLogic(dayCycleManager: DayCycleManager) {
    const period = dayCycleManager.getCurrentPeriod();
    const periodProgress = dayCycleManager.getPeriodProgress();

    // NPC sleep schedule
    if (period === "Malam") {
        updateNPCState("sleep");
    } else if (period === "Pagi" && periodProgress < 0.3) {
        updateNPCState("wakeup");
    } else {
        updateNPCState("active");
    }

    // Dynamic difficulty
    if (period === "Malam") {
        increaseDifficulty(0.3); // 30% harder at night
    } else {
        resetDifficulty();
    }

    // Visibility check untuk stealth mechanics
    const visibility = calculateVisibility(period);
    console.log(`Visibility: ${(visibility * 100).toFixed(0)}%`);
}

function updateNPCState(state: string) {
    // Implementation
}

function increaseDifficulty(amount: number) {
    // Implementation
}

function resetDifficulty() {
    // Implementation
}

function calculateVisibility(period: string): number {
    switch (period) {
        case "Pagi":
        case "Siang":
            return 1.0; // 100% visible
        case "Sore":
            return 0.7; // 70% visible
        case "Malam":
            return 0.3; // 30% visible
        default:
            return 0.5;
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 9: HTML UI Setup untuk Testing
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function createDayCycleDebugUI(): HTMLElement {
    const container = document.createElement("div");
    container.id = "day-cycle-debug";
    container.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #0f0;
        padding: 15px;
        font-family: monospace;
        font-size: 12px;
        z-index: 1000;
        border: 1px solid #0f0;
        border-radius: 4px;
        min-width: 250px;
    `;

    container.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: bold;">🌍 Day Cycle Debug</div>
        
        <div id="period-display" style="margin: 5px 0; font-size: 14px; color: #ff0;">
            Period: --
        </div>
        
        <div style="margin: 5px 0;">
            Progress: <span id="day-progress-text">0%</span>
        </div>
        
        <div style="
            background: #1a1a1a;
            height: 20px;
            margin: 8px 0;
            border: 1px solid #0f0;
            border-radius: 2px;
            overflow: hidden;
        ">
            <div id="day-progress" style="
                height: 100%;
                background: linear-gradient(90deg, #ff6600, #ffff00, #ff6600, #0066ff);
                width: 0%;
                transition: width 0.1s;
            "></div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">
            <button id="btn-fast-cycle" style="padding: 5px; cursor: pointer;">⚡ Fast (10s)</button>
            <button id="btn-normal-cycle" style="padding: 5px; cursor: pointer;">⏱️ Normal (60s)</button>
            <button id="btn-reset-cycle" style="padding: 5px; cursor: pointer;">🔄 Reset</button>
            <button id="btn-show-stats" style="padding: 5px; cursor: pointer;">📊 Stats</button>
        </div>
    `;

    document.body.appendChild(container);
    return container;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTOH 10: Complete Integration Example
 * ═══════════════════════════════════════════════════════════════════════════
 */

export async function initializeWithDayCycle() {
    // Setup scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
    );
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Setup lights
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(-60, 40, 20);
    scene.add(sun);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    // Initialize day cycle
    const dayCycleManager = new DayCycleManager(scene, 60);
    dayCycleManager.setDirectionalLight(sun);
    dayCycleManager.setAmbientLight(ambient);

    // Setup UI
    createDayCycleDebugUI();
    setupDebugControls(dayCycleManager);

    const updateUI = setupDayCycleUI(dayCycleManager);
    const updatePeriodListener = setupPeriodChangeListener(dayCycleManager);

    // Render loop
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);

        const delta = clock.getDelta();

        // Update systems
        dayCycleManager.update();
        updateUI();
        updatePeriodListener();

        renderer.render(scene, camera);
    }

    animate();
}

/**
 * Export untuk testing di browser console:
 *
 * import * as examples from './DAYCYCLE_USAGE_EXAMPLES';
 * examples.initializeWithDayCycle();
 */
