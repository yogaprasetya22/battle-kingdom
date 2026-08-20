import * as THREE from 'three';
import { CHARACTER_CONFIG } from '../../character/character-config';

// Module-level scratch — avoid per-frame allocations in hot update loop
const _dummy = new THREE.Object3D();
const _baseColor = new THREE.Color();
const _highlightColor = new THREE.Color();
const _cfgColor = new THREE.Color();
const _targetWorldPos = new THREE.Vector3();

interface SmokeParticle {
  x: number;
  y: number;
  z: number;
  angle: number;
  radius: number;
  speedY: number;
  spinSpeed: number;
  size: number;
  age: number;
  maxLife: number;
  rot: number;
  rotSpeed: number;
  opacity: number;
}

interface TornadoInstance {
  outerMesh1: THREE.Mesh;
  outerMesh2: THREE.Mesh;
  flameMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  smokeMesh: THREE.InstancedMesh;
  outerMat1: THREE.ShaderMaterial;
  outerMat2: THREE.ShaderMaterial;
  flameMat: THREE.ShaderMaterial;
  ringMat: THREE.ShaderMaterial;
  smokeMat: THREE.ShaderMaterial;
  particles: SmokeParticle[];
  age: number;
  maxLife: number;
  spawnPos: THREE.Vector3;
  anchor?: THREE.Object3D;
  active: boolean;
}

export class CartoonTornadoNativeVFX {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private pool: TornadoInstance[] = [];
  private poolSize = 8;

  private tex0!: THREE.Texture;
  private tex1!: THREE.Texture;
  private tex3!: THREE.Texture;
  
  private outerGeometry1!: THREE.BufferGeometry;
  private outerGeometry2!: THREE.BufferGeometry;
  private flameGeometry!: THREE.BufferGeometry;
  private ringGeometry!: THREE.BufferGeometry;
  private smokeGeometry!: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;

    // Load textures
    const L = new THREE.TextureLoader();
    
    this.tex0 = L.load('/vfx/tornado/tex_0.png');
    this.tex0.wrapS = THREE.RepeatWrapping;
    this.tex0.wrapT = THREE.RepeatWrapping;
    this.tex0.minFilter = THREE.LinearFilter;
    this.tex0.generateMipmaps = false;

    this.tex1 = L.load('/vfx/tornado/tex_1.png');
    this.tex1.wrapS = THREE.RepeatWrapping;
    this.tex1.wrapT = THREE.RepeatWrapping;
    this.tex1.minFilter = THREE.LinearFilter;
    this.tex1.generateMipmaps = false;

    this.tex3 = L.load('/vfx/tornado/tex_3.png');
    this.tex3.wrapS = THREE.RepeatWrapping;
    this.tex3.wrapT = THREE.RepeatWrapping;
    this.tex3.minFilter = THREE.LinearFilter;
    this.tex3.generateMipmaps = false;

    // Wind geometries
    this.outerGeometry1 = new THREE.CylinderGeometry(2.3, 0.45, 4.5, 32, 64, true);
    this.outerGeometry2 = new THREE.CylinderGeometry(1.9, 0.35, 4.5, 32, 64, true);
    this.flameGeometry = new THREE.CylinderGeometry(1.4, 0.25, 4.5, 32, 64, true);
    this.ringGeometry = new THREE.PlaneGeometry(5.0, 5.0);
    this.smokeGeometry = new THREE.PlaneGeometry(1.0, 1.0);

    // Initialize pool
    const cfgColor = new THREE.Color(CHARACTER_CONFIG.skills.tornado.hudColor);
    const maxParticles = 100;

    const createWindShader = (twistSpeed: number, twistTension: number, stepThreshold: number, colorShift: number, textureFlowSpeed: number, colorVal: THREE.Color, map0Tex: THREE.Texture) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          uMap0: { value: map0Tex },
          uMap1: { value: this.tex1 },
          uTime: { value: 0 },
          uColor: { value: colorVal.clone() },
          uOpacity: { value: 1.0 },
          uSpawnY: { value: 0 },
        },
        vertexShader: `
          uniform float uTime;
          varying vec2 vUv;
          varying float vHeightY;
          varying float vAngle;
          varying vec3 vWorldPos;

          void main() {
            vUv = uv;
            vHeightY = position.y;
            vec3 pos = position;
            float anchor = smoothstep(-2.0, -1.3, position.y);
            float speed = ${twistSpeed.toFixed(1)};
            float tension = ${twistTension.toFixed(1)};
            float angle = (position.y * tension - uTime * speed) * anchor;
            vAngle = angle;
            float cosA = cos(angle);
            float sinA = sin(angle);
            float rx = pos.x * cosA - pos.z * sinA;
            float rz = pos.x * sinA + pos.z * cosA;
            pos.x = rx;
            pos.z = rz;
            pos.x += sin(position.y * 2.0 - uTime * 2.5) * 0.22 * anchor;
            pos.z += cos(position.y * 2.0 - uTime * 2.5) * 0.22 * anchor;
            float pulse = sin((position.y + uTime * 8.0) * 2.5) * 0.05 * anchor;
            pos.xz *= (1.0 + pulse);
            vec4 worldPos = modelMatrix * vec4(pos, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap0;
          uniform sampler2D uMap1;
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uSpawnY;
          varying vec2 vUv;
          varying float vHeightY;
          varying float vAngle;
          varying vec3 vWorldPos;

          void main() {
            if (vWorldPos.y < uSpawnY + 0.35) discard;
            vec2 rotUv = vUv;
            rotUv.x += vAngle / 6.2831853;
            float flowSpeed = ${textureFlowSpeed.toFixed(1)};
            vec2 uvFlow0 = rotUv * vec2(2.0, 1.0) + vec2(0.0, -uTime * flowSpeed);
            vec2 uvFlow1 = rotUv * vec2(1.5, 1.5) + vec2(0.0, -uTime * (flowSpeed * 1.5));
            float t0 = texture2D(uMap0, uvFlow0).r;
            float t1 = texture2D(uMap1, uvFlow1).g;
            float combined = max(t0, t1);
            float band = step(${stepThreshold.toFixed(2)}, combined);
            float vertFade = smoothstep(-2.0, -1.6, vUv.y * 4.5 - 2.25) * smoothstep(2.25, 1.4, vUv.y * 4.5 - 2.25);
            float alpha = band * vertFade * uOpacity;
            if (alpha < 0.08) discard;
            vec3 finalColor = uColor * ${colorShift.toFixed(2)};
            gl_FragColor = vec4(finalColor, alpha * 0.95);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
    };

    for (let k = 0; k < this.poolSize; k++) {
      const outerMat1 = createWindShader(3.5, 1.6, 0.78, 1.0, 2.0, cfgColor.clone().lerp(new THREE.Color(1, 1, 1), 0.5), this.tex0);
      const outerMat2 = createWindShader(2.5, 1.1, 0.71, 0.85, 1.5, cfgColor, this.tex0);
      const flameMat = createWindShader(4.5, 1.4, 0.58, 1.0, 2.5, cfgColor, this.tex3);

      const ringMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: this.tex1 },
          uTime: { value: 0 },
          uColor: { value: cfgColor.clone() },
          uOpacity: { value: 1.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;

          void main() {
            vec2 uvCenter = vUv - vec2(0.5);
            float radius = length(uvCenter) * 2.0;
            float angle = atan(uvCenter.y, uvCenter.x) / (2.0 * 3.14159) + 0.5;
            vec2 ringUv = vec2(radius * 1.6 - uTime * 0.4, angle - uTime * 0.7);
            float val = texture2D(uMap, ringUv).r;
            float ringBand = step(0.55, val);
            float ringShape = smoothstep(0.95, 0.7, radius) * smoothstep(0.15, 0.4, radius);
            float alpha = ringBand * ringShape * uOpacity;
            if (alpha < 0.08) discard;
            gl_FragColor = vec4(uColor, alpha * 0.75);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const smokeMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: this.tex0 },
          uOpacity: { value: 1.0 },
          uSpawnY: { value: 0 },
        },
        vertexShader: `
          attribute vec4 aColorAlpha;
          varying vec2 vUv;
          varying vec4 vColorAlpha;
          varying vec3 vWorldPos;

          void main() {
            vUv = uv;
            vColorAlpha = aColorAlpha;
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform float uOpacity;
          uniform float uSpawnY;
          varying vec2 vUv;
          varying vec4 vColorAlpha;
          varying vec3 vWorldPos;

          void main() {
            if (vWorldPos.y < uSpawnY + 0.35) discard;
            float dist = length(vUv - vec2(0.5));
            float radialFade = smoothstep(0.5, 0.25, dist);
            float noise = texture2D(uMap, vUv).r;
            float smokeEdge = step(0.38, noise);
            float alpha = smokeEdge * radialFade * vColorAlpha.a * uOpacity;
            if (alpha < 0.05) discard;
            gl_FragColor = vec4(vColorAlpha.rgb, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      });

      const outerMesh1 = new THREE.Mesh(this.outerGeometry1, outerMat1);
      const outerMesh2 = new THREE.Mesh(this.outerGeometry2, outerMat2);
      const flameMesh = new THREE.Mesh(this.flameGeometry, flameMat);
      const ringMesh = new THREE.Mesh(this.ringGeometry, ringMat);
      const smokeMesh = new THREE.InstancedMesh(this.smokeGeometry, smokeMat, maxParticles);
      
      const colorAlphaArray = new Float32Array(maxParticles * 4);
      smokeMesh.geometry.setAttribute('aColorAlpha', new THREE.InstancedBufferAttribute(colorAlphaArray, 4));

      // Hide initially and add to scene
      outerMesh1.visible = false;
      outerMesh2.visible = false;
      flameMesh.visible = false;
      ringMesh.visible = false;
      smokeMesh.visible = false;

      this.scene.add(outerMesh1);
      this.scene.add(outerMesh2);
      this.scene.add(flameMesh);
      this.scene.add(ringMesh);
      this.scene.add(smokeMesh);

      const particles: SmokeParticle[] = [];
      for (let p = 0; p < maxParticles; p++) {
        particles.push(this.createSmokeParticle());
      }

      this.pool.push({
        outerMesh1,
        outerMesh2,
        flameMesh,
        ringMesh,
        smokeMesh,
        outerMat1,
        outerMat2,
        flameMat,
        ringMat,
        smokeMat,
        particles,
        age: 0,
        maxLife: CHARACTER_CONFIG.skills.tornado.activeDuration || 3.5,
        spawnPos: new THREE.Vector3(),
        active: false
      });
    }
  }

  public spawn(x: number, y: number, z: number, anchor?: THREE.Object3D) {
    // Find first inactive tornado in the pool
    const fx = this.pool.find(item => !item.active);
    if (!fx) return; // Pool exhausted

    const uSpawnYVal = anchor ? anchor.position.y : y;

    fx.active = true;
    fx.age = 0;
    fx.maxLife = CHARACTER_CONFIG.skills.tornado.activeDuration || 3.5;
    fx.spawnPos.set(x, y, z);
    fx.anchor = anchor;

    // Reset material parameters without compiling anything new
    fx.outerMat1.uniforms.uSpawnY.value = uSpawnYVal;
    fx.outerMat1.uniforms.uOpacity.value = 1.0;
    fx.outerMat1.uniforms.uTime.value = 0;

    fx.outerMat2.uniforms.uSpawnY.value = uSpawnYVal;
    fx.outerMat2.uniforms.uOpacity.value = 1.0;
    fx.outerMat2.uniforms.uTime.value = 0;

    fx.flameMat.uniforms.uSpawnY.value = uSpawnYVal;
    fx.flameMat.uniforms.uOpacity.value = 1.0;
    fx.flameMat.uniforms.uTime.value = 0;

    fx.ringMat.uniforms.uOpacity.value = 1.0;
    fx.ringMat.uniforms.uTime.value = 0;

    fx.smokeMat.uniforms.uSpawnY.value = uSpawnYVal;
    fx.smokeMat.uniforms.uOpacity.value = 1.0;

    fx.outerMesh1.position.set(x, y + 2.0, z);
    fx.outerMesh2.position.set(x, y + 2.0, z);
    fx.flameMesh.position.set(x, y + 2.0, z);
    fx.ringMesh.position.set(x, y + 0.03, z);
    fx.ringMesh.rotation.x = -Math.PI / 2;
    fx.smokeMesh.position.set(x, y, z);

    fx.outerMesh1.scale.set(0.01, 0.01, 0.01);
    fx.outerMesh2.scale.set(0.01, 0.01, 0.01);
    fx.flameMesh.scale.set(0.01, 0.01, 0.01);
    fx.ringMesh.scale.set(0.01, 0.01, 0.01);
    fx.smokeMesh.scale.set(0.01, 0.01, 0.01);

    fx.outerMesh1.visible = true;
    fx.outerMesh2.visible = true;
    fx.flameMesh.visible = true;
    fx.ringMesh.visible = true;
    fx.smokeMesh.visible = true;

    // Reset particles
    fx.particles.forEach((pt) => {
      Object.assign(pt, this.createSmokeParticle());
    });
  }

  private createSmokeParticle(): SmokeParticle {
    const age = Math.random() * -1.5;
    const maxLife = 1.2 + Math.random() * 0.8;
    const speedY = 0.5 + Math.random() * 0.5;
    const spinSpeed = 0.8 + Math.random() * 0.8;
    const radius = 0.2 + Math.random() * 0.6;

    return {
      x: 0,
      y: 0,
      z: 0,
      angle: Math.random() * Math.PI * 2,
      radius,
      speedY,
      spinSpeed,
      size: 1.0 + Math.random() * 1.0,
      age,
      maxLife,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.8,
      opacity: 0.5 + Math.random() * 0.3,
    };
  }

  public update(delta: number) {
    _cfgColor.set(CHARACTER_CONFIG.skills.tornado.hudColor);
    _baseColor.copy(_cfgColor);
    _highlightColor.set(1.0, 1.0, 1.0).lerp(_cfgColor, 0.3);

    for (let i = 0; i < this.pool.length; i++) {
      const fx = this.pool[i];
      if (!fx.active) continue;

      fx.age += delta;

      if (fx.age >= fx.maxLife) {
        fx.active = false;
        fx.outerMesh1.visible = false;
        fx.outerMesh2.visible = false;
        fx.flameMesh.visible = false;
        fx.ringMesh.visible = false;
        fx.smokeMesh.visible = false;
        continue;
      }

      // Update positions to track anchor target dynamically if it exists
      if (fx.anchor) {
        const isDead = !fx.anchor.parent || 
                       !fx.anchor.visible || 
                       fx.anchor.scale.x < 0.05 || 
                       (fx.anchor.userData && fx.anchor.userData.hp <= 0);
        
        if (isDead) {
          console.warn("Tornado target released. Reason:", {
            noParent: !fx.anchor.parent,
            notVisible: !fx.anchor.visible,
            scaleLow: fx.anchor.scale.x < 0.05,
            hpLow: fx.anchor.userData && fx.anchor.userData.hp <= 0,
            scaleX: fx.anchor.scale.x,
            hpValue: fx.anchor.userData ? fx.anchor.userData.hp : undefined
          });
          fx.anchor = undefined;
        } else {
          fx.anchor.getWorldPosition(_targetWorldPos);
          fx.spawnPos.copy(_targetWorldPos);

          fx.outerMat1.uniforms.uSpawnY.value = _targetWorldPos.y;
          fx.outerMat2.uniforms.uSpawnY.value = _targetWorldPos.y;
          fx.flameMat.uniforms.uSpawnY.value = _targetWorldPos.y;
          fx.smokeMat.uniforms.uSpawnY.value = _targetWorldPos.y;
        }
      }

      // Update Mesh positions to follow tracking target
      fx.outerMesh1.position.set(fx.spawnPos.x, fx.spawnPos.y + 2.0, fx.spawnPos.z);
      fx.outerMesh2.position.set(fx.spawnPos.x, fx.spawnPos.y + 2.0, fx.spawnPos.z);
      fx.flameMesh.position.set(fx.spawnPos.x, fx.spawnPos.y + 2.0, fx.spawnPos.z);
      fx.ringMesh.position.set(fx.spawnPos.x, fx.spawnPos.y + 0.03, fx.spawnPos.z);
      fx.smokeMesh.position.set(fx.spawnPos.x, fx.spawnPos.y, fx.spawnPos.z);

      // Update shader uniforms
      fx.outerMat1.uniforms.uTime.value = fx.age;
      fx.outerMat2.uniforms.uTime.value = fx.age;
      fx.flameMat.uniforms.uTime.value = fx.age;
      fx.ringMat.uniforms.uTime.value = fx.age;

      const progress = fx.age / fx.maxLife;
      let scale = 1.0;
      if (progress < 0.12) {
        scale = progress / 0.12;
      } else if (progress > 0.75) {
        scale = (1.0 - progress) / 0.25;
      }

      const sizeScale = scale * 1.1;
      fx.outerMesh1.scale.set(sizeScale, sizeScale, sizeScale);
      fx.outerMesh2.scale.set(sizeScale, sizeScale, sizeScale);
      fx.flameMesh.scale.set(sizeScale, sizeScale, sizeScale);
      fx.ringMesh.scale.set(sizeScale, sizeScale, sizeScale);
      fx.smokeMesh.scale.set(sizeScale, sizeScale, sizeScale);

      const attr = fx.smokeMesh.geometry.getAttribute('aColorAlpha') as THREE.InstancedBufferAttribute;
      const colorAlpha = attr.array as Float32Array;

      for (let p = 0; p < fx.particles.length; p++) {
        const pt = fx.particles[p];
        pt.age += delta;

        if (pt.age >= pt.maxLife) {
          Object.assign(pt, this.createSmokeParticle());
          pt.age = 0;
        }

        if (pt.age < 0) {
          _dummy.scale.set(0, 0, 0);
          _dummy.updateMatrix();
          fx.smokeMesh.setMatrixAt(p, _dummy.matrix);
          continue;
        }

        pt.angle += pt.spinSpeed * delta;
        pt.y += pt.speedY * delta;
        
        const wobbleX = Math.sin(pt.y * 1.5 - fx.age * 1.5) * 0.18;
        const wobbleZ = Math.cos(pt.y * 1.5 - fx.age * 1.5) * 0.18;

        const coneRadius = pt.radius * (1.0 + pt.y * 0.65);

        pt.x = Math.cos(pt.angle) * coneRadius + wobbleX;
        pt.z = Math.sin(pt.angle) * coneRadius + wobbleZ;
        pt.rot += pt.rotSpeed * delta;

        const lifeRatio = pt.age / pt.maxLife;
        
        let ptScale = pt.size * sizeScale;
        if (lifeRatio < 0.2) {
          ptScale *= (lifeRatio / 0.2);
        } else {
          ptScale *= (1.0 - lifeRatio);
        }

        _dummy.position.set(pt.x, pt.y, pt.z);
        _dummy.rotation.copy(this.camera.rotation);
        _dummy.rotation.z += pt.rot;
        _dummy.scale.set(ptScale, ptScale, ptScale);
        _dummy.updateMatrix();
        fx.smokeMesh.setMatrixAt(p, _dummy.matrix);

        const pColor = _baseColor.clone().lerp(_highlightColor, lifeRatio);
        const pAlpha = pt.opacity * (1.0 - lifeRatio) * scale;

        const idx = p * 4;
        colorAlpha[idx] = pColor.r;
        colorAlpha[idx + 1] = pColor.g;
        colorAlpha[idx + 2] = pColor.b;
        colorAlpha[idx + 3] = pAlpha;
      }

      attr.needsUpdate = true;
      fx.smokeMesh.instanceMatrix.needsUpdate = true;

      if (progress > 0.75) {
        const fade = (1.0 - progress) / 0.25;
        fx.outerMat1.uniforms.uOpacity.value = fade;
        fx.outerMat2.uniforms.uOpacity.value = fade;
        fx.flameMat.uniforms.uOpacity.value = fade;
        fx.ringMat.uniforms.uOpacity.value = fade;
        fx.smokeMat.uniforms.uOpacity.value = fade;
      }
    }
  }
}
