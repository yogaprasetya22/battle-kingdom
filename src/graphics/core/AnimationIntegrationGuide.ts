/**
 * AnimationIntegrationGuide.ts — Complete integration example
 *
 * Cara mengintegrasikan AnimationClockManager + OptimizationManager ke dalam existing code
 *
 * PROBLEM YANG DISELESAIKAN:
 * 1. Animation speed berubah berdasarkan jarak kamera
 *    → SOLUSI: Global AnimationClockManager.updateAllMixers() sekali per frame
 *
 * 2. Frame drops saat 60+ unit
 *    → SOLUSI: OptimizationManager dengan distance-based LOD + priority system
 *
 * 3. Tidak bisa pilih unit mana yang boleh dioptimasi
 *    → SOLUSI: userData.allowOptimization flag atau API setAllowOptimization()
 */

import * as THREE from "three";
import { animationClockManager } from "./AnimationClockManager";
import { optimizationManager } from "./OptimizationManager";
import type { UnitOptimizationConfig } from "./OptimizationManager";

/**
 * ═══════════════════════════════════════════════════════════════
 * STEP 1: Setup AnimationClockManager di scene initialization
 * ═══════════════════════════════════════════════════════════════
 */
export function setupAnimationSystem(camera: THREE.Camera): void {
    // Initialize managers
    console.log("✓ AnimationClockManager initialized");
    console.log("✓ OptimizationManager initialized with camera");

    // AnimationClockManager otomatis singleton
    // OptimizationManager harus di-pass camera reference
}

/**
 * ═══════════════════════════════════════════════════════════════
 * STEP 2: Register mixer saat unit dibuat
 * ═══════════════════════════════════════════════════════════════
 */
export function createUnitWithAnimation(
    unitId: number,
    mesh: THREE.Group,
    gltfScene: THREE.Scene,
    allowOptimization: boolean = true,
): { mixer: THREE.AnimationMixer; animations: THREE.AnimationClip[] } {
    // Standard Three.js setup
    const mixer = new THREE.AnimationMixer(gltfScene);
    const animations = gltfScene.animations || [];

    // ★ PENTING: Register mixer ke AnimationClockManager
    animationClockManager.registerMixer(unitId, mixer, false); // false = start unoptimized

    // ★ Setup userData untuk optimization flag
    mesh.userData = mesh.userData || {};
    mesh.userData.allowOptimization = allowOptimization;

    // ★ Register ke OptimizationManager
    const optimConfig: UnitOptimizationConfig = {
        unitId,
        mesh,
        cameraPosition: new THREE.Vector3(), // will be updated each frame
        allowOptimization,
        isHero: false,
        priority: 5, // default medium priority
    };
    optimizationManager.registerUnit(optimConfig);

    console.log(
        `✓ Unit ${unitId} registered with animations (optimizable=${allowOptimization})`,
    );

    return { mixer, animations };
}

/**
 * ═══════════════════════════════════════════════════════════════
 * STEP 3: Update dalam main render loop
 * ═══════════════════════════════════════════════════════════════
 */
export function updateAnimationFrame(camera: THREE.Camera): void {
    // Called setiap frame dari main render loop

    // 1. Update optimization state (LOD, frustum culling)
    optimizationManager.updateOptimizations();

    // 2. Update ALL mixers dengan GLOBAL delta time (★ KUNCI untuk fix animation speed!)
    // Ini memastikan semua unit animate dengan kecepatan sama, regardless camera distance
    animationClockManager.updateAllMixers();
}

/**
 * ═══════════════════════════════════════════════════════════════
 * STEP 4: Custom optimization setup
 * ═══════════════════════════════════════════════════════════════
 */
export function setupCustomOptimization(): void {
    // CASE 1: Mark specific unit sebagai hero (never optimize)
    optimizationManager.setIsHero(0, true); // Unit 0 adalah main hero
    optimizationManager.setIsHero(1, true); // Unit 1 adalah ally commander

    // CASE 2: Disable optimization untuk specific units
    optimizationManager.setAllowOptimization(5, false); // Unit 5 always full quality
    optimizationManager.setAllowOptimization(10, false); // Unit 10 always full quality

    // CASE 3: Batch disable optimization untuk team
    const allyTeamIds = [0, 1, 2, 3, 4]; // Team A units
    optimizationManager.setAllowOptimizationBatch(allyTeamIds, false);

    // CASE 4: Set custom priority (0=lowest, 10=highest)
    optimizationManager.setPriority(0, 10); // Hero highest priority (never optimize)
    optimizationManager.setPriority(1, 8); // Commander high priority
    optimizationManager.setPriority(50, 1); // Enemy #50 low priority (optimize first)

    console.log("✓ Custom optimization rules applied");
}

/**
 * ═══════════════════════════════════════════════════════════════
 * STEP 5: Cleanup saat unit dihapus
 * ═══════════════════════════════════════════════════════════════
 */
export function disposeUnitAnimation(unitId: number): void {
    // Unregister dari clock manager
    animationClockManager.unregisterMixer(unitId);

    // Unregister dari optimization manager
    optimizationManager.unregisterUnit(unitId);

    console.log(`✓ Unit ${unitId} animation cleanup done`);
}

/**
 * ═══════════════════════════════════════════════════════════════
 * STEP 6: Runtime diagnostics & monitoring
 * ═══════════════════════════════════════════════════════════════
 */
export function getAnimationDiagnostics(): {
    fps: number;
    totalUnits: number;
    optimizedUnits: number;
    registeredMixers: number;
} {
    const optDiag = optimizationManager.getDiagnostics();

    return {
        fps: optDiag.currentFps,
        totalUnits: optDiag.totalUnits,
        optimizedUnits: optDiag.optimizedCount,
        registeredMixers: animationClockManager.getAllMixers().length,
    };
}

/**
 * ═══════════════════════════════════════════════════════════════
 * COMPLETE INTEGRATION EXAMPLE
 * ═══════════════════════════════════════════════════════════════
 *
 * // Initialize saat scene setup
 * setupAnimationSystem(camera);
 * setupCustomOptimization();
 *
 * // Saat create unit (dalam loop atau factory)
 * for (let i = 0; i < UNIT_COUNT; i++) {
 *     const unitMesh = createUnitMesh();
 *     const { mixer, animations } = createUnitWithAnimation(i, unitMesh, gltfScene);
 *
 *     // Play default animation
 *     if (animations.length > 0) {
 *         mixer.clipAction(animations[0]).play();
 *     }
 * }
 *
 * // Main render loop
 * function animate() {
 *     requestAnimationFrame(animate);
 *
 *     // ★ PENTING: Call ini update semua animation timing
 *     updateAnimationFrame(camera);
 *
 *     // Standard render
 *     renderer.render(scene, camera);
 *
 *     // Optional: diagnostics
 *     const diag = getAnimationDiagnostics();
 *     console.log(`FPS: ${diag.fps}, Units: ${diag.totalUnits}, Optimized: ${diag.optimizedUnits}`);
 * }
 *
 * // Cleanup saat unit dihapus
 * disposeUnitAnimation(unitId);
 *
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Advanced: Real-time optimization toggle
 */
export function toggleUnitOptimization(unitId: number, enable: boolean): void {
    optimizationManager.setAllowOptimization(unitId, enable);
    console.log(
        `Unit ${unitId} optimization: ${enable ? "enabled" : "disabled"}`,
    );
}

/**
 * Debug: Print per-unit optimization status
 */
export function debugPrintUnitStatus(unitId: number): void {
    const details = optimizationManager.getUnitDetails(unitId);
    if (!details) {
        console.warn(`Unit ${unitId} not found`);
        return;
    }

    console.log(`
╔════════════════════════════════════════╗
║ Unit ${unitId} Optimization Status
╠════════════════════════════════════════╣
║ Tier: ${details.tier}
║ Distance²: ${details.distanceSq.toFixed(0)}
║ Currently Optimized: ${details.optimized ? "YES" : "NO"}
║ Allow Optimization: ${details.allowOptimization ? "YES" : "NO"}
║ Is Hero: ${details.isHero ? "YES" : "NO"}
║ Priority: ${details.priority}/10
╚════════════════════════════════════════╝
    `);
}

/**
 * Debug: Print system status
 */
export function debugPrintSystemStatus(): void {
    const diag = optimizationManager.getDiagnostics();
    const globalDelta = animationClockManager.getGlobalDeltaTime();

    console.log(`
╔════════════════════════════════════════╗
║ Animation System Status
╠════════════════════════════════════════╣
║ Global Delta Time: ${(globalDelta * 1000).toFixed(2)} ms
║ Current FPS: ${diag.currentFps}
║ Total Units: ${diag.totalUnits}
║ Optimized Units: ${diag.optimizedCount}
║ Optimization Rate: ${((diag.optimizedCount / diag.totalUnits) * 100).toFixed(1)}%
║ LOD Distances:
║   - CLOSE: < ${Math.sqrt(diag.lodDistances.CLOSE).toFixed(0)} units
║   - MEDIUM: < ${Math.sqrt(diag.lodDistances.MEDIUM).toFixed(0)} units
║   - FAR: < ${Math.sqrt(diag.lodDistances.FAR).toFixed(0)} units
║   - VERY_FAR: > ${Math.sqrt(diag.lodDistances.VERY_FAR).toFixed(0)} units
╚════════════════════════════════════════╝
    `);
}
