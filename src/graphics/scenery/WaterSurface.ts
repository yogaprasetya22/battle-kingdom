import * as THREE from "three";
import { LAKES, type LakeDef } from "../../simulation/constants";

/**
 * WaterSurface.ts — Lake meshes placed over bowl depressions.
 * One CircleGeometry per LakeDef. Uniform-based per-lake params.
 */

const WATER_Y = -0.15;

const VERT = /* glsl */ `
    uniform float uWaterY;
    attribute vec2 aWorldXZ;
    varying vec2 vWorldXZ;

    void main() {
        vec3 worldPos = vec3(aWorldXZ.x, aWorldXZ.y, uWaterY);
        vWorldXZ = worldPos.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
    }
`;

const FRAG = /* glsl */ `
    uniform float uTime;
    uniform vec2 uLakeCenter;
    uniform vec2 uLakeRadius;
    varying vec2 vWorldXZ;

    void main() {
        float dx = (vWorldXZ.x - uLakeCenter.x) / uLakeRadius.x;
        float dz = (vWorldXZ.y - uLakeCenter.y) / uLakeRadius.y;
        float distCenter = sqrt(dx * dx + dz * dz);

        float shoreFade = 1.0 - smoothstep(0.85, 1.30, distCenter);
        if (shoreFade < 0.01) discard;

        float centerDepth = exp(-distCenter * distCenter * 0.5);
        float depthFactor = mix(0.12, 0.88, centerDepth);

        vec3 shallowColor = vec3(0.18, 0.55, 0.62);
        vec3 deepColor    = vec3(0.04, 0.16, 0.30);
        vec3 waterColor   = mix(shallowColor, deepColor, depthFactor);

        float r1 = sin(vWorldXZ.x * 3.5 + uTime * 0.9) * 0.02;
        float r2 = cos(vWorldXZ.y * 4.2 + uTime * 1.3) * 0.015;

        float spec = abs(r1 + r2) * 2.5;
        waterColor += vec3(0.08, 0.12, 0.10) * spec;

        float foamRing = smoothstep(0.55, 0.85, distCenter)
                       * (1.0 - smoothstep(0.85, 1.10, distCenter));
        float foamNoise = sin(vWorldXZ.x * 16.0 + uTime * 2.0)
                        * cos(vWorldXZ.y * 13.0 + uTime * 2.5);
        float foam = foamRing * (0.25 + foamNoise * 0.2) * 0.5;
        waterColor = mix(waterColor, vec3(0.85, 0.90, 0.91), foam);

        float caustic = abs(
            sin(vWorldXZ.x * 9.0 + uTime * 1.4) *
            sin(vWorldXZ.y * 7.5 - uTime * 1.0)
        );
        waterColor += caustic * vec3(0.04, 0.10, 0.08) * centerDepth;

        float alpha = mix(0.45, 0.82, depthFactor) * shoreFade;
        gl_FragColor = vec4(waterColor, alpha);
    }
`;

export class WaterSurface {
    meshes: THREE.Mesh[] = [];
    materials: THREE.ShaderMaterial[] = [];

    constructor(scene: THREE.Scene, uniforms: { uTime: { value: number } }) {
        for (const lake of LAKES) {
            const { mesh, mat } = this._buildLake(lake, uniforms);
            scene.add(mesh);
            this.meshes.push(mesh);
            this.materials.push(mat);
        }
    }

    update(_camPos: THREE.Vector3) {
        /* reserved for future fresnel */
    }

    private _buildLake(
        lake: LakeDef,
        uniforms: { uTime: { value: number } },
    ): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
        const radius = Math.max(lake.rx, lake.rz) * 1.35;
        const segs = 40;
        const geo = new THREE.CircleGeometry(radius, segs);

        const vertCount = geo.attributes.position.count;
        const posArr = geo.attributes.position.array as Float32Array;

        const aWorldXZ = new Float32Array(vertCount * 2);
        for (let i = 0; i < vertCount; i++) {
            aWorldXZ[i * 2] = lake.cx + posArr[i * 3];
            aWorldXZ[i * 2 + 1] = lake.cz + posArr[i * 3 + 1];
        }
        geo.setAttribute("aWorldXZ", new THREE.BufferAttribute(aWorldXZ, 2));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: uniforms.uTime,
                uWaterY: { value: WATER_Y },
                uLakeCenter: { value: new THREE.Vector2(lake.cx, lake.cz) },
                uLakeRadius: { value: new THREE.Vector2(lake.rx, lake.rz) },
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthWrite: true,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 1;

        return { mesh, mat };
    }
}
