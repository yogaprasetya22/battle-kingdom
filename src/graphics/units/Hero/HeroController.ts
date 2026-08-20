/**
 * HeroController.ts — Worker-Bypass adapter (ponytail: thin wrapper).
 *
 * CharacterController mengurus sendiri:
 *   - WASD + mouse input
 *   - Fisika + BVH collision
 *   - Animasi skeletal (SkinnedMesh)
 *   - Camera follow spring arm (updateCamera dipanggil dari update())
 *
 * Module ini hanya menambahkan:
 *   - createHero(): factory wiring VFX + SkillsSystem + keyboard
 *   - syncHeroToBuffer(): tulis x,y,z ke SAB tiap frame
 */

import * as THREE from 'three';
import { CharacterController } from '../../../character/character-controller';
import { SkillsSystem } from '../../../character/skills-system';
import { Subemitter2NativeVFX } from '../../../vfx/subemitter2/Native';
import { CartoonBlueGasExplosionNativeVFX } from '../../../vfx/cartoon-blue-gas-explosion/Native';
import { CartoonBlueFlamethrowerNativeVFX } from '../../../vfx/cartoon-blue-flamethrower/Native';
import { CartoonTornadoNativeVFX } from '../../../vfx/tornado/Native';
import { IDX_X, IDX_Y, IDX_Z, STRIDE } from '../../../simulation/constants';

import { ProjectileSystem } from '../../../character/projectile-system';
import { CHARACTER_CONFIG } from '../../../character/character-config';

export { CharacterController, SkillsSystem };

/**
 * createHero — factory sekali panggil dari main.ts.
 * Camera otomatis dikontrol CharacterController (spring arm + mouse look).
 */
export function createHero(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    workers: Worker[],
): { ctrl: CharacterController; skills: SkillsSystem } {
    const ctrl = new CharacterController(scene, camera);

    // Wire ProjectileSystem — panah ditembak saat triggerAttack() dipanggil
    const projectiles = new ProjectileSystem(scene);
    ctrl.setProjectileSystem(projectiles);

    // Native VFX — pure Three.js, zero dependencies, main thread only
    const gasVFX      = new Subemitter2NativeVFX(scene, camera);
    const flameVFX    = new CartoonBlueFlamethrowerNativeVFX(scene, camera);
    const tornadoVFX  = new CartoonTornadoNativeVFX(scene, camera);
    // ponytail: SkillsSystem butuh 3 VFX; gasExplosion pakai SubEmitter2 sebagai visual
    const skills = new SkillsSystem(gasVFX, flameVFX, tornadoVFX);

    // Instansiasi efek ledakan gas biru saat panah mengenai target/tanah
    const hitVFX = new CartoonBlueGasExplosionNativeVFX(scene, camera);
    
    // Handle continuous basic attack (mousedown/mouseup tracking) — ONLY allowed when pointer is locked
    let isShooting = false;
    window.addEventListener('mousedown', (e) => {
        const canvas = document.querySelector('canvas');
        if (e.button === 0 && ctrl.enabled && document.pointerLockElement === canvas) {
            isShooting = true;
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            isShooting = false;
        }
    });

    // Override update loop untuk memicu update pada hitVFX juga
    const originalUpdate = ctrl.update.bind(ctrl);
    ctrl.update = (delta: number) => {
        if (isShooting && ctrl.enabled) {
            ctrl.triggerAttack();
        }
        originalUpdate(delta);
        gasVFX.update(delta);
        flameVFX.update(delta);
        tornadoVFX.update(delta);
        hitVFX.update(delta);
    };

    // Hubungkan hitVFX ke system proyektil
    const originalProjUpdate = projectiles.update.bind(projectiles);
    projectiles.update = (delta: number, environmentMesh: THREE.Mesh | null) => {
        originalProjUpdate(delta, environmentMesh, (pos: THREE.Vector3) => {
            hitVFX.spawn(pos.x, pos.y, pos.z);
        });
    };



    window.addEventListener('keydown', (e) => {
        if (!ctrl.enabled) return;
        skills.handleInput(e.code, ctrl.position, ctrl.getForwardVector(), ctrl);

        // Ambil konfigurasi skill secara dinamis dari CHARACTER_CONFIG
        let skillConf: { damage: number; radius: number } | null = null;
        if (e.code === CHARACTER_CONFIG.skills.gasExplosion.key) {
            skillConf = CHARACTER_CONFIG.skills.gasExplosion;
        } else if (e.code === CHARACTER_CONFIG.skills.flamethrower.key) {
            skillConf = CHARACTER_CONFIG.skills.flamethrower;
        } else if (e.code === CHARACTER_CONFIG.skills.tornado.key) {
            skillConf = CHARACTER_CONFIG.skills.tornado;
        }

        if (skillConf) {
            // Tentukan pusat AoE berdasarkan tipe skill:
            // - gas/tornado: di posisi musuh terdekat (sama dengan VFX spawn)
            // - flamethrower: di depan hero sesuai forwardOffset
            let originX = ctrl.position.x;
            let originZ = ctrl.position.z;
            let targetTeam: number | undefined = undefined;

            const nearestTarget = ctrl.getNearestTarget();
            if (nearestTarget && e.code !== CHARACTER_CONFIG.skills.flamethrower.key) {
                // Gas explosion & Tornado: pusat AoE = posisi target musuh
                const targetPos = new THREE.Vector3();
                nearestTarget.getWorldPosition(targetPos);
                originX = targetPos.x;
                originZ = targetPos.z;
                
                // Ambil tim target secara dinamis dari userData target
                const targetIndexAttr = nearestTarget.userData.unitIndex ?? nearestTarget.name;
                const targetIdx = parseInt(targetIndexAttr);
                if (!isNaN(targetIdx)) {
                    // 0 = TEAM_A, 1 = TEAM_B (asumsi targetIdx < 50 adalah TEAM_A)
                    targetTeam = targetIdx < 50 ? 0 : 1; 
                }
            } else if (e.code === CHARACTER_CONFIG.skills.flamethrower.key) {
                // Flamethrower: AoE di depan hero sesuai forwardOffset config
                const flameConf = CHARACTER_CONFIG.skills.flamethrower;
                const forward = ctrl.getForwardVector();
                originX = ctrl.position.x + forward.x * flameConf.forwardOffset;
                originZ = ctrl.position.z + forward.z * flameConf.forwardOffset;
            }

            for (const w of workers) {
                w.postMessage({
                    type: 'PLAYER_SKILL_CAST',
                    skillId: e.code,
                    originX,
                    originZ,
                    radius: skillConf.radius,
                    damage: skillConf.damage,
                    targetTeam: targetTeam, // Kirim target tim secara dinamis
                    activeDuration: (skillConf as any).activeDuration, // Kirim durasi dinamis jika ada
                    targetIdx: nearestTarget && e.code !== CHARACTER_CONFIG.skills.flamethrower.key 
                        ? parseInt(nearestTarget.userData.unitIndex ?? nearestTarget.name) 
                        : undefined
                });
            }
        }
    });





    return { ctrl, skills };
}

/**
 * syncHeroToBuffer — tulis x,y,z hero ke SharedArrayBuffer setiap frame.
 * Worker AI membacanya untuk targeting. HP dikelola Worker (tidak ditimpa).
 */
export function syncHeroToBuffer(
    ctrl: CharacterController,
    buf: Float32Array,
    heroIdx: number,
): void {
    const base = heroIdx * STRIDE;
    buf[base + IDX_X] = ctrl.position.x;
    buf[base + IDX_Y] = ctrl.position.y;
    buf[base + IDX_Z] = ctrl.position.z;
}
