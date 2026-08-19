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
    
    // Handle continuous basic attack (mousedown/mouseup tracking)
    let isShooting = false;
    window.addEventListener('mousedown', (e) => {
        if (e.button === 0 && ctrl.enabled && document.pointerLockElement) {
            isShooting = true;
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            isShooting = false;
        }
    });

    // Reset shooting status when pointer lock is lost
    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement) {
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

    // Skill + damage dispatch keyboard handler
    // ponytail: map keyCodes ke damage config — upgrade ke config file jika skill bertambah
    const SKILL_DAMAGE: Record<string, { radius: number; damage: number }> = {
        'Digit1': { radius: 5,  damage: 1500 },
        'Digit2': { radius: 3,  damage:  800 },
        'Digit3': { radius: 6,  damage: 2000 },
    };

    window.addEventListener('keydown', (e) => {
        if (!ctrl.enabled) return;
        skills.handleInput(e.code, ctrl.position, ctrl.getForwardVector(), ctrl);

        const dmg = SKILL_DAMAGE[e.code];
        if (dmg) {
            for (const w of workers) {
                w.postMessage({
                    type: 'PLAYER_SKILL_CAST',
                    skillId: e.code,
                    originX: ctrl.position.x,
                    originZ: ctrl.position.z,
                    ...dmg,
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
