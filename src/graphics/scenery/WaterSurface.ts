import * as THREE from 'three';
import { getTerrainHeight } from '../../simulation/constants';

export class WaterSurface {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  constructor(scene: THREE.Scene, uniforms: { uTime: { value: number } }) {
    const riverGeo = new THREE.PlaneGeometry(3.0, 180, 2, 36);
    const riverPos = riverGeo.attributes.position;
    for (let i = 0; i < riverPos.count; i++) {
      const vy = riverPos.getY(i);
      const height = getTerrainHeight(0, -vy) + 0.15;
      riverPos.setZ(i, height);
    }
    riverGeo.computeVertexNormals();

    this.material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave = sin(pos.y * 0.4 + uTime * 2.0) * 0.08 + cos(pos.x * 1.5 + uTime * 1.5) * 0.03;
          pos.z += wave;
          vWave = wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vec3 deepBlue = vec3(0.04, 0.16, 0.42);
          vec3 cyan = vec3(0.08, 0.48, 0.68);
          vec3 foamColor = vec3(1.0, 1.0, 1.0);
          vec3 color = mix(deepBlue, cyan, (vWave + 0.1) * 3.0);
          float ripples = sin(vUv.y * 50.0 - uTime * 4.5) * 0.5 + 0.5;
          if (ripples > 0.85) {
            color = mix(color, foamColor, 0.3);
          }
          float shoreDist = abs(vUv.x - 0.5) * 2.0;
          float shoreWiggle = sin(vUv.y * 22.0 + uTime * 3.5) * 0.03;
          float shoreFoam = smoothstep(0.62 + shoreWiggle, 0.96, shoreDist);
          color = mix(color, foamColor, shoreFoam * 0.9);
          float alpha = mix(0.8, 1.0, shoreFoam);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(riverGeo, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    scene.add(this.mesh);
  }
}
