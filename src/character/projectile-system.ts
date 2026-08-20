import * as THREE from 'three';
import { CHARACTER_CONFIG } from './character-config';
import { getTerrainHeight } from '../simulation/constants';

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  target: THREE.Object3D | null;
}

// Module-level pre-allocated scratch vectors — zero heap allocation in hot loop
const _gravity = new THREE.Vector3(0, -5.0, 0);
const _targetPos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _movementVec = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _tPos = new THREE.Vector3();

export class ProjectileSystem {
  private scene: THREE.Scene;
  private projectiles: Projectile[] = [];
  private arrowGeometry: THREE.CylinderGeometry;
  private arrowMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Procedural Cylinder Geometry (extremely lightweight)
    this.arrowGeometry = new THREE.CylinderGeometry(0.01, 0.04, 1.2, 8);
    this.arrowGeometry.rotateX(Math.PI / 2);

    // 2. Custom glowing GLSL ShaderMaterial (additive blended)
    this.arrowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(CHARACTER_CONFIG.projectiles.glowColor) } // Vibrant Custom Energy color
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec2 vUv;
        void main() {
          float sideGlow = sin(vUv.x * 3.14159);
          float tailFade = vUv.y;
          float alpha = sideGlow * tailFade;
          vec3 finalColor = mix(glowColor, vec3(1.0, 1.0, 1.0), pow(sideGlow, 4.0));
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  public spawn(startPosition: THREE.Vector3, direction: THREE.Vector3, speed = CHARACTER_CONFIG.projectiles.speed, target: THREE.Object3D | null = null) {
    const arrowMesh = new THREE.Mesh(this.arrowGeometry, this.arrowMaterial);
    arrowMesh.position.copy(startPosition);

    const targetLookAt = startPosition.clone().add(direction);
    arrowMesh.lookAt(targetLookAt);

    this.scene.add(arrowMesh);

    const velocity = direction.clone().normalize().multiplyScalar(speed);

    this.projectiles.push({
      mesh: arrowMesh,
      velocity: velocity,
      age: 0,
      maxAge: CHARACTER_CONFIG.projectiles.maxDistance / speed,
      target: target
    });
  }

  public update(delta: number, environmentMesh: THREE.Mesh | null, spawnVFXCallback?: (pos: THREE.Vector3) => void) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += delta;

      // 1. Auto-Aim Homing / Target Seeking steering
      if (p.target) {
        p.target.getWorldPosition(_targetPos);
        _targetPos.y += 1.0; // Aim at target center/chest height

        // Vector pointing directly from projectile to target center
        _toTarget.copy(_targetPos).sub(p.mesh.position).normalize();
        const currentSpeed = p.velocity.length();
        _toTarget.multiplyScalar(currentSpeed);

        // Interpolate velocity towards target direction using configured steer force
        p.velocity.lerp(_toTarget, CHARACTER_CONFIG.projectiles.homingSteerForce * delta);
      } else {
        // Apply normal gravity drop if no active target
        p.velocity.addScaledVector(_gravity, delta);
      }

      // Record old position for collision raycast
      const oldX = p.mesh.position.x, oldY = p.mesh.position.y, oldZ = p.mesh.position.z;

      // Move forward
      p.mesh.position.addScaledVector(p.velocity, delta);

      // Orient to follow velocity vector
      _targetLook.copy(p.mesh.position).add(p.velocity);
      p.mesh.lookAt(_targetLook);

      let collided = false;

      // Direct Target/Unit Collision Check
      if (p.target) {
        p.target.getWorldPosition(_tPos);
        _tPos.y += 0.5;
        const distToTarget = p.mesh.position.distanceTo(_tPos);
        if (distToTarget < 0.7) {
          collided = true;
          if (spawnVFXCallback) spawnVFXCallback(p.mesh.position);
          const targetIndexAttr = p.target.userData.unitIndex ?? p.target.name;
          const targetIdx = parseInt(targetIndexAttr);
          if (!isNaN(targetIdx)) {
             window.dispatchEvent(new CustomEvent('projectile_hit', {
                detail: { targetIdx: targetIdx, damage: CHARACTER_CONFIG.combat.damage }
             }));
          }
        }
      }

      // Collision Check against static environment BVH using Raycaster
      if (!collided && environmentMesh && environmentMesh.geometry.boundsTree) {
        _movementVec.set(
          p.mesh.position.x - oldX,
          p.mesh.position.y - oldY,
          p.mesh.position.z - oldZ,
        );
        const dist = _movementVec.length();
        if (dist > 0.001) {
          const dir = _movementVec.normalize();
          const raycaster = new THREE.Raycaster(
            new THREE.Vector3(oldX, oldY, oldZ), dir, 0, dist
          );
          const intersects = raycaster.intersectObject(environmentMesh);
          if (intersects.length > 0) {
            collided = true;
            p.mesh.position.copy(intersects[0].point);
            if (spawnVFXCallback) spawnVFXCallback(intersects[0].point);
          }
        }
      }

      // Falls below terrain floor fallback
      const floorY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y < floorY + 0.05) {
        collided = true;
        p.mesh.position.y = floorY + 0.05;
        if (spawnVFXCallback) spawnVFXCallback(p.mesh.position);
      }

      // Swap-pop O(1) removal
      if (collided || p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.length--;
      }
    }
  }

  public dispose() {
    this.arrowGeometry.dispose();
    this.arrowMaterial.dispose();
  }
}
