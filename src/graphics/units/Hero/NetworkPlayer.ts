import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
// @ts-ignore
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadGLTFWithCache } from '../../core/scene';

export class NetworkPlayer {
  public playerGroup: THREE.Group;
  public playerMesh: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: { [key: string]: THREE.AnimationAction } = {};
  private currentActionName = '';
  private scene: THREE.Scene;
  private bowMesh: THREE.Group | null = null;
  
  // Dodge VFX & State
  private isDodging = false;
  private ghostSpawnTimer = 0;
  private activeGhosts: Array<{ ghost: THREE.Group; materials: THREE.Material[]; update: (delta: number) => boolean }> = [];

  // Target position and rotation for interpolation
  public targetPosition = new THREE.Vector3();
  public targetRotationY = 0;

  constructor(scene: THREE.Scene, id: string) {
    this.scene = scene;
    this.playerGroup = new THREE.Group();
    
    // Simple placeholder geometry until assets load
    const geo = new THREE.BoxGeometry(1.0, 1.6, 1.0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.4 }); // Rose color for other players
    const placeholder = new THREE.Mesh(geo, mat);
    placeholder.position.y = 0.8;
    placeholder.name = "placeholder";
    this.playerGroup.add(placeholder);

    this.scene.add(this.playerGroup);
    this.loadAssets();
  }

  private async loadAssets() {
    try {
      const [charGLTF, generalAnim, advancedAnim, combatAnim, basicAnim, flipAnim, bowGLTF, quiverGLTF] = await Promise.all([
        loadGLTFWithCache('/character/characters/Ranger.glb'),
        loadGLTFWithCache('/character/animation/Rig_Medium_General.glb'),
        loadGLTFWithCache('/character/animation/Rig_Medium_MovementAdvanced.glb'),
        loadGLTFWithCache('/character/animation/Rig_Medium_CombatRanged.glb'),
        loadGLTFWithCache('/character/animation/Rig_Medium_MovementBasic.glb'),
        loadGLTFWithCache('/character/animation/Running_Forward_Flip.glb'),
        loadGLTFWithCache('/character/weapons/bow_withString.glb'),
        loadGLTFWithCache('/character/weapons/quiver.glb')
      ]);

      // Remove placeholder
      const placeholder = this.playerGroup.getObjectByName("placeholder");
      if (placeholder) {
        this.playerGroup.remove(placeholder);
      }

      this.playerMesh = SkeletonUtils.clone(charGLTF.scene);
      this.playerMesh.scale.setScalar(0.42);
      this.playerGroup.add(this.playerMesh);

      this.playerMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Attach weapons
      this.bowMesh = this.attachWeaponToBone(this.playerMesh, bowGLTF.scene, 'hand_l', {
        pos: [0.0, 0.05, 0.05],
        rot: [0.0, -0.112, 1.458],
        scale: [1.0, 1.0, 1.0]
      });
      this.attachWeaponToBone(this.playerMesh, quiverGLTF.scene, 'spine', {
        pos: [0.0, 0.15, -0.1],
        rot: [0.0, 0.0, 0.0],
        scale: [0.8, 0.8, 0.8]
      });

      // Setup mixer and animations
      this.mixer = new THREE.AnimationMixer(this.playerMesh);
      const allClips = [
        ...generalAnim.animations,
        ...advancedAnim.animations,
        ...combatAnim.animations,
        ...basicAnim.animations,
        ...flipAnim.animations
      ];

      // Remove root tracks
      allClips.forEach((clip) => {
        clip.tracks = clip.tracks.filter((track: any) => {
          const name = track.name;
          return !(name.startsWith('.position') || name.startsWith('.rotation') || name.startsWith('.quaternion'));
        });
      });

      const pickClip = (names: string[]) => {
        for (const name of names) {
          const found = allClips.find((c) => c.name === name);
          if (found) return found;
        }
        return allClips[0];
      };

      const doubleJumpClip = flipAnim.animations[0];
      if (doubleJumpClip && allClips.length > 0) {
        let targetPrefix = "";
        const targetTrackSample = allClips[0].tracks.find((t: any) => t.name.toLowerCase().includes('hips'));
        if (targetTrackSample) {
          const parts = targetTrackSample.name.split('.');
          const bonePath = parts[0];
          const hipsIndex = bonePath.toLowerCase().indexOf('hips');
          if (hipsIndex !== -1) {
            targetPrefix = bonePath.substring(0, hipsIndex);
          }
        }

        let sourcePrefix = "";
        const sourceTrackSample = doubleJumpClip.tracks.find((t: any) => t.name.toLowerCase().includes('hips'));
        if (sourceTrackSample) {
          const parts = sourceTrackSample.name.split('.');
          const bonePath = parts[0];
          const hipsIndex = bonePath.toLowerCase().indexOf('hips');
          if (hipsIndex !== -1) {
            sourcePrefix = bonePath.substring(0, hipsIndex);
          }
        }

        if (sourcePrefix !== targetPrefix) {
          doubleJumpClip.tracks.forEach((track: any) => {
            const parts = track.name.split('.');
            let bonePath = parts[0];
            const property = parts[1];
            if (bonePath.startsWith(sourcePrefix)) {
              bonePath = targetPrefix + bonePath.substring(sourcePrefix.length);
            }
            track.name = bonePath + '.' + property;
          });
        }
      }

      this.actions['idle'] = this.mixer.clipAction(pickClip(["Ranged_Bow_Idle"]));
      this.actions['walk'] = this.mixer.clipAction(pickClip(["Running_HoldingBow"]));
      this.actions['run'] = this.mixer.clipAction(pickClip(["Running_B", "Running_HoldingBow"]));
      this.actions['run'].timeScale = 1.25;
      
      this.actions['jump_start'] = this.mixer.clipAction(pickClip(["Jump_Start"]));
      this.actions['jump_idle'] = this.mixer.clipAction(pickClip(["Jump_Idle"]));
      
      const jumpLandClip = pickClip(["Jump_Land"]);
      if (jumpLandClip) {
        this.actions['jump_land'] = this.mixer.clipAction(jumpLandClip);
        this.actions['jump_land'].setLoop(THREE.LoopOnce, 1);
        this.actions['jump_land'].clampWhenFinished = true;
      }

      if (doubleJumpClip) {
        this.actions['double_jump'] = this.mixer.clipAction(doubleJumpClip);
        this.actions['double_jump'].setLoop(THREE.LoopOnce, 1);
        this.actions['double_jump'].clampWhenFinished = true;
        this.actions['double_jump'].timeScale = 1.2;
      }

      const attackClip = pickClip(["Ranged_Bow_Release"]);
      if (attackClip) {
        this.actions['attack'] = this.mixer.clipAction(attackClip);
        this.actions['attack'].setLoop(THREE.LoopOnce, 1);
        this.actions['attack'].clampWhenFinished = true;
      }

      // Add dodge animation clips if they exist in imported assets
      const dodgeForwardClip = pickClip(["Dodge_Forward"]);
      const dodgeBackwardClip = pickClip(["Dodge_Backward"]);
      const dodgeLeftClip = pickClip(["Dodge_Left"]);
      const dodgeRightClip = pickClip(["Dodge_Right"]);

      const setDodgeAction = (actionName: string, clip: THREE.AnimationClip) => {
        if (!this.mixer) return;
        this.actions[actionName] = this.mixer.clipAction(clip);
        this.actions[actionName].setLoop(THREE.LoopOnce, 1);
        this.actions[actionName].clampWhenFinished = true;
      };

      if (dodgeForwardClip) setDodgeAction('dodge_forward', dodgeForwardClip);
      if (dodgeBackwardClip) setDodgeAction('dodge_backward', dodgeBackwardClip);
      if (dodgeLeftClip) setDodgeAction('dodge_left', dodgeLeftClip);
      if (dodgeRightClip) setDodgeAction('dodge_right', dodgeRightClip);

      this.playAnimationState('idle');
    } catch (e) {
      console.error("Error loading NetworkPlayer assets:", e);
    }
  }

  private findBone(root: THREE.Object3D, pattern: string): THREE.Bone | null {
    let found: THREE.Bone | null = null;
    const lowerPattern = pattern.toLowerCase();

    // Fallback names matching the structure inside GLB files
    const fallbackBones = lowerPattern.includes('hand_r')
      ? ['handr', 'hand_r', 'armature.hand.r', 'r_hand', 'right_hand']
      : lowerPattern.includes('hand_l')
      ? ['handl', 'hand_l', 'armature.hand.l', 'l_hand', 'left_hand']
      : ['spine', 'armature.spine', 'armature.chest', 'chest', 'torso'];

    root.traverse((child) => {
      if (child instanceof THREE.Bone) {
        const boneNameLower = child.name.toLowerCase();
        if (boneNameLower.includes(lowerPattern) || fallbackBones.some((fb) => boneNameLower.includes(fb))) {
          found = child;
        }
      }
    });

    return found;
  }

  private attachWeaponToBone(
    charRoot: THREE.Object3D,
    weaponScene: THREE.Group,
    boneName: string,
    transform: { pos: number[]; rot: number[]; scale: number[] }
  ): THREE.Group | null {
    const bone = this.findBone(charRoot, boneName);
    if (bone) {
      const clone = SkeletonUtils.clone(weaponScene) as THREE.Group;
      clone.position.set(transform.pos[0], transform.pos[1], transform.pos[2]);
      clone.rotation.set(transform.rot[0], transform.rot[1], transform.rot[2]);
      clone.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
      bone.add(clone);
      return clone;
    }
    return null;
  }

  public playAnimationState(name: string) {
    if (!name || this.currentActionName === name || !this.actions[name]) return;
    const currentAction = this.actions[this.currentActionName];
    const targetAction = this.actions[name];

    targetAction.reset();
    targetAction.play();

    if (currentAction) {
      currentAction.crossFadeTo(targetAction, 0.15, true);
    }
    this.currentActionName = name;

    // Handle dodge state change
    if (name.startsWith('dodge')) {
      this.isDodging = true;
      this.ghostSpawnTimer = 0.05;
      this.spawnGhostTrail();
    } else {
      this.isDodging = false;
    }
  }

  private spawnGhostTrail() {
    if (!this.playerMesh) return;
    const ghost = SkeletonUtils.clone(this.playerMesh) as THREE.Group;
    ghost.position.copy(this.playerGroup.position);
    ghost.rotation.copy(this.playerMesh.rotation);
    this.scene.add(ghost);

    const materials: THREE.Material[] = [];
    ghost.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const ghostMat = new THREE.MeshBasicMaterial({
          color: 0x00dfff,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        mesh.material = ghostMat;
        materials.push(ghostMat);
      }
    });

    let age = 0;
    const duration = 0.38;
    const scene = this.scene;
    this.activeGhosts.push({
      ghost,
      materials,
      update(delta: number) {
        age += delta;
        const t = age / duration;
        if (t >= 1) {
          scene.remove(ghost);
          materials.forEach(m => m.dispose());
          ghost.traverse(c => {
            if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
          });
          return false;
        }
        materials.forEach(m => {
          m.opacity = 0.35 * (1.0 - t);
        });
        return true;
      }
    });
  }

  public update(delta: number) {
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Update active ghost trails
    for (let i = this.activeGhosts.length - 1; i >= 0; i--) {
      if (!this.activeGhosts[i].update(delta)) {
        this.activeGhosts.splice(i, 1);
      }
    }

    // Handle continuous ghost trail spawning during dodge animations
    if (this.isDodging) {
      if (!this.currentActionName.startsWith('dodge')) {
        this.isDodging = false;
      } else {
        this.ghostSpawnTimer -= delta;
        if (this.ghostSpawnTimer <= 0) {
          this.spawnGhostTrail();
          this.ghostSpawnTimer = 0.05;
        }
      }
    }

    // Smoothly interpolate position (entity interpolation)
    this.playerGroup.position.lerp(this.targetPosition, 0.15);
    
    // Interpolate rotation on the playerMesh (which holds character orientation)
    if (this.playerMesh) {
      const currentRotation = this.playerMesh.rotation.y;
      let diff = this.targetRotationY - currentRotation;
      // Normalize to -PI to PI range
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.playerMesh.rotation.y += diff * 0.15;
    }

    // Update weapon visibility based on action state
    if (this.bowMesh) {
      const isRunning = this.currentActionName === 'run';
      const isAirborne = this.currentActionName.startsWith('jump') || this.currentActionName === 'double_jump';
      const isAttacking = this.currentActionName === 'attack';
      this.bowMesh.visible = (!isRunning && !isAirborne) || isAttacking;
    }
  }

  public destroy() {
    this.activeGhosts.forEach(g => {
      this.scene.remove(g.ghost);
      g.materials.forEach(m => m.dispose());
      g.ghost.traverse(c => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose();
      });
    });
    this.scene.remove(this.playerGroup);
  }
}
