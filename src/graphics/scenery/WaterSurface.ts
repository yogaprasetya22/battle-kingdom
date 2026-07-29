import * as THREE from "three";
import { getTerrainHeight } from "../../simulation/constants";

/**
 * WaterSurface.ts — Seamless water body with visible underwater terrain.
 * Full-coverage plane. Vertices display terrain when underwater, water surface when above.
 * Fragment shader: blend terrain/water based on wetness, smooth transition at shoreline.
 */

const WORLD_W = 80;
const WORLD_H = 60;
const WATER_Y = -0.15;

export class WaterSurface {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;

    constructor(scene: THREE.Scene, uniforms: { uTime: { value: number } }) {
        const segX = 120;
        const segZ = 90;
        const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, segX, segZ);

        const pos = geo.attributes.position;
        const heights = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vz = pos.getY(i);
            heights[i] = getTerrainHeight(vx, vz);
        }
        geo.setAttribute("aTerrainY", new THREE.BufferAttribute(heights, 1));
        geo.computeVertexNormals();

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: uniforms.uTime,
                uWaterY: { value: WATER_Y },
                uCamPos: { value: new THREE.Vector3() },
            },
            vertexShader: /* glsl */ `
                uniform float uWaterY;
                attribute float aTerrainY;
                varying float vWetness;
                varying vec3 vWorldPos;
                varying float vTerrainY;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vec3 worldPos = position;
                    worldPos.z = aTerrainY;
                    vWorldPos = worldPos;
                    vTerrainY = aTerrainY;

                    float depth = uWaterY - aTerrainY;
                    vWetness = smoothstep(-0.1, 0.4, depth);

                    float finalZ;
                    if (aTerrainY > uWaterY) {
                        finalZ = aTerrainY;
                    } else {
                        finalZ = uWaterY;
                    }

                    vec3 finalPos = vec3(position.x, position.y, finalZ);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform float uTime;
                uniform float uWaterY;
                uniform vec3 uCamPos;
                varying float vWetness;
                varying vec3 vWorldPos;
                varying float vTerrainY;
                varying vec2 vUv;

                void main() {
                    // Skip dry land completely
                    if (vWetness < 0.01) discard;

                    // ── Underwater terrain blend (shallow + transitional) ──
                    if (vWetness < 0.7) {
                        // Show terrain with water tint in shallow/transition zones
                        float terrainBlend = vWetness / 0.7;
                        
                        // Terrain base colors (sandy brown underwater)
                        vec3 terrainColor = mix(
                            vec3(0.8, 0.75, 0.65),  // light sand
                            vec3(0.65, 0.58, 0.45), // darker wet sand
                            terrainBlend
                        );
                        
                        // Apply water tint over terrain
                        vec3 waterTint = mix(
                            vec3(0.4, 0.6, 0.55),   // light teal
                            vec3(0.1, 0.3, 0.4),   // deeper teal
                            terrainBlend
                        );
                        
                        vec3 blendedColor = mix(terrainColor, waterTint, terrainBlend * 0.6);
                        
                        // Gentle ripple at shallow end
                        float ripple = sin(vWorldPos.x * 2.0 + uTime) * 0.02;
                        blendedColor += ripple * vec3(0.05, 0.1, 0.08);
                        
                        gl_FragColor = vec4(blendedColor, mix(0.5, 0.75, terrainBlend));
                        return;
                    }

                    // ── Deep water ──
                    float depth = uWaterY - vTerrainY;
                    float depthFactor = smoothstep(0.0, 1.2, depth);

                    vec3 shallowColor = vec3(0.2, 0.55, 0.65);  // teal
                    vec3 deepColor    = vec3(0.05, 0.18, 0.35); // dark navy
                    vec3 waterColor = mix(shallowColor, deepColor, depthFactor);

                    // ── Gentle ripple normals ──
                    float nx = sin(vWorldPos.x * 2.5 + uTime * 0.8) * 0.03
                             + sin(vWorldPos.x * 6.0 + uTime * 1.8) * 0.015;
                    float nz = cos(vWorldPos.y * 2.2 + uTime * 1.0) * 0.03
                             + cos(vWorldPos.y * 5.5 + uTime * 1.5) * 0.015;

                    // ── Specular highlight ──
                    float spec = abs(nx + nz) * 1.8;
                    waterColor += vec3(0.1, 0.15, 0.12) * spec;

                    // ── Shore foam at transition ──
                    float shoreMask = smoothstep(0.4, 0.7, vWetness) * (1.0 - smoothstep(0.7, 0.8, vWetness));
                    float foamNoise = sin(vWorldPos.x * 18.0 + uTime * 2.5)
                                    * cos(vWorldPos.y * 15.0 + uTime * 2.0);
                    float foam = shoreMask * (0.3 + foamNoise * 0.2) * 0.5;
                    waterColor = mix(waterColor, vec3(0.87, 0.92, 0.93), foam);

                    // ── Alpha: transparent at shore, opaque in deep ──
                    float alpha = mix(0.55, 0.85, depthFactor);

                    // ── Soft caustics ──
                    float caustic = sin(vWorldPos.x * 8.0 + uTime * 1.2)
                                  * sin(vWorldPos.y * 6.5 - uTime * 0.9);
                    caustic = abs(caustic) * 0.03;
                    waterColor += caustic * vec3(0.05, 0.12, 0.1);

                    gl_FragColor = vec4(waterColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: true,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        scene.add(this.mesh);
    }

    update(camPos: THREE.Vector3) {
        this.material.uniforms.uCamPos.value.copy(camPos);
    }
}
