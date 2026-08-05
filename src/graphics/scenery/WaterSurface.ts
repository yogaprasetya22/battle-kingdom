import * as THREE from "three";
import { LAKES, type LakeDef, getTerrainHeight } from "../../simulation/constants";

/**
 * WaterSurface.ts — Flat horizontal water planes placed exactly at Y = -3.0.
 * 
 * Sesuai spesifikasi:
 * 1. Air rata secara horizontal di Y = -3.0.
 * 2. Menggunakan PlaneGeometry standard Three.js tanpa manipulasi vertex Y di shader.
 * 3. Kliping air dilakukan di Fragment Shader:
 *    - Kita hitung tinggi tanah asli di koordinat world XZ.
 *    - Jika tinggi tanah >= -3.0 (daratan kering), pixel air di-discard.
 *    - Jika tinggi tanah < -3.0, pixel air digambar dengan kedalaman = -3.0 - tinggi_tanah.
 */

const VERT = /* glsl */ `
    varying vec2 vWorldXZ;

    void main() {
        // modelMatrix memindahkan plane lokal ke posisi world danau
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldXZ = worldPos.xz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const FRAG = /* glsl */ `
    uniform float uTime;
    uniform vec2  uLakeCenter;
    uniform vec2  uLakeRadius;
    varying vec2  vWorldXZ;

    // Helper untuk mengambil tinggi tanah secara matematis (fungsi getTerrainHeight versi GLSL)
    // Kita samakan persis dengan rumus bukit + cekungan di constants.ts
    float smoothstepGLSL(float edge0, float edge1, float x) {
        float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    float mixGLSL(float x, float y, float a) {
        return x * (1.0 - a) + y * a;
    }

    float getTerrainHeightGLSL(vec2 p) {
        // Flat battlefield boundary
        float dxEdge = max(0.0, abs(p.x) - 42.0);
        float dzEdge = max(0.0, abs(p.y) - 38.0);
        float edgeDist = sqrt(dxEdge * dxEdge + dzEdge * dzEdge);
        float forestFactor = smoothstepGLSL(0.0, 8.0, edgeDist);

        // Bukit perbukitan
        float h1 = sin(p.x * 0.12 + 0.5) * cos(p.y * 0.12) * 3.5;
        float h2 = sin(p.x * 0.28) * sin(p.y * 0.22 + 1.2) * 1.2;
        float hills = h1 + h2;

        // Cekungan mangkok danau
        // Danau NW (-68, -62), NE (68, -62), SW (-68, 62), SE (68, 62), W (-88, 0), E (88, 0)
        // Kita hitung wetness danau terdekat
        float maxWetness = 0.0;
        float lakeBowlDepth = 0.0;

        // NW
        {
            float dx = (p.x - (-68.0)) / 22.0;
            float dz = (p.y - (-62.0)) / 15.0;
            float wet = exp(-(dx*dx + dz*dz) * 0.5);
            maxWetness = max(maxWetness, wet);
            lakeBowlDepth -= (1.4 * 2.2) * wet;
        }
        // 2. NE
        {
            float dx = (p.x - 68.0) / 20.0;
            float dz = (p.y - (-62.0)) / 14.0;
            float wet = exp(-(dx*dx + dz*dz) * 0.5);
            maxWetness = max(maxWetness, wet);
            lakeBowlDepth -= (1.3 * 2.2) * wet;
        }
        // 3. SW
        {
            float dx = (p.x - (-68.0)) / 19.0;
            float dz = (p.y - 62.0) / 15.0;
            float wet = exp(-(dx*dx + dz*dz) * 0.5);
            maxWetness = max(maxWetness, wet);
            lakeBowlDepth -= (1.2 * 2.2) * wet;
        }
        // 4. SE
        {
            float dx = (p.x - 68.0) / 22.0;
            float dz = (p.y - 62.0) / 14.0;
            float wet = exp(-(dx*dx + dz*dz) * 0.5);
            maxWetness = max(maxWetness, wet);
            lakeBowlDepth -= (1.5 * 2.2) * wet;
        }
        // 5. W
        {
            float dx = (p.x - (-88.0)) / 14.0;
            float dz = (p.y - 0.0) / 11.0;
            float wet = exp(-(dx*dx + dz*dz) * 0.5);
            maxWetness = max(maxWetness, wet);
            lakeBowlDepth -= (1.0 * 2.2) * wet;
        }
        // 6. E
        {
            float dx = (p.x - 88.0) / 14.0;
            float dz = (p.y - 0.0) / 11.0;
            float wet = exp(-(dx*dx + dz*dz) * 0.5);
            maxWetness = max(maxWetness, wet);
            lakeBowlDepth -= (1.0 * 2.2) * wet;
        }

        hills = mixGLSL(hills, -3.0, smoothstepGLSL(0.0, 0.8, maxWetness));
        return (hills + lakeBowlDepth) * forestFactor;
    }

    void main() {
        // Ambil tinggi tanah di koordinat world pixel ini
        float terrainY = getTerrainHeightGLSL(vWorldXZ);

        // Level permukaan air horizontal target
        float WATER_LEVEL = -3.0;

        // Jika tanah di titik ini lebih tinggi atau sama dengan level air, maka ini daratan kering!
        if (terrainY >= WATER_LEVEL) {
            discard;
        }

        // Kedalaman air di bawah permukaan rata Y = -3.0
        float depth = WATER_LEVEL - terrainY;

        float dx = (vWorldXZ.x - uLakeCenter.x) / uLakeRadius.x;
        float dz = (vWorldXZ.y - uLakeCenter.y) / uLakeRadius.y;
        float distCenter = sqrt(dx * dx + dz * dz);

        // Memotong tepi air agar menyatu halus dengan lereng pantai
        float shoreFade = smoothstepGLSL(0.0, 0.25, depth);
        if (shoreFade < 0.01) discard;

        // Warna air berdasarkan kedalaman
        float depthFactor = clamp(depth * 0.7, 0.0, 1.0);

        vec3 shallowColor = vec3(0.18, 0.55, 0.62);
        vec3 deepColor    = vec3(0.04, 0.16, 0.30);
        vec3 waterColor   = mix(shallowColor, deepColor, depthFactor);

        // Animasi riak air
        float r1 = sin(vWorldXZ.x * 3.5 + uTime * 0.9)  * 0.02;
        float r2 = cos(vWorldXZ.y * 4.2 + uTime * 1.3)  * 0.015;
        waterColor += vec3(0.08, 0.12, 0.10) * abs(r1 + r2) * 2.5;

        // Busa air di tepi
        float foamRing  = smoothstepGLSL(0.60, 0.88, distCenter)
                        * (1.0 - smoothstepGLSL(0.88, 1.08, distCenter));
        float foamNoise = sin(vWorldXZ.x * 16.0 + uTime * 2.0)
                        * cos(vWorldXZ.y * 13.0 + uTime * 2.5);
        waterColor = mix(waterColor, vec3(0.85, 0.90, 0.91),
                         foamRing * (0.25 + foamNoise * 0.2) * 0.5 * shoreFade);

        // Caustics matahari
        float caustic = abs(
            sin(vWorldXZ.x * 9.0 + uTime * 1.4) *
            sin(vWorldXZ.y * 7.5 - uTime * 1.0)
        );
        waterColor += caustic * vec3(0.04, 0.10, 0.08) * depthFactor;

        gl_FragColor = vec4(waterColor, mix(0.40, 0.82, depthFactor) * shoreFade);
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
        // Tentukan batas bidang air (Plane) horizontal
        const width = lake.rx * 2.6;
        const height = lake.rz * 2.6;
        const geo = new THREE.PlaneGeometry(width, height);

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime:       uniforms.uTime,
                uLakeCenter: { value: new THREE.Vector2(lake.cx, lake.cz) },
                uLakeRadius: { value: new THREE.Vector2(lake.rx, lake.rz) },
            },
            vertexShader:   VERT,
            fragmentShader: FRAG,
            transparent:    true,
            depthWrite:     false,
            side:           THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        
        // Putar plane lokal (XY) menjadi horizontal (XZ)
        mesh.rotation.x = -Math.PI / 2;
        
        // Posisikan horizontal rata tepat di Y = -3.0
        mesh.position.set(lake.cx, -3.0, lake.cz);
        
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;

        return { mesh, mat };
    }
}
