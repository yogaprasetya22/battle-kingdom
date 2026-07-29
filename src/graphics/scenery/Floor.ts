import * as THREE from "three";
import { getTerrainHeight } from "../../simulation/constants";

export class Floor {
    mesh: THREE.Mesh;
    constructor(scene: THREE.Scene) {
        const groundGeo = new THREE.PlaneGeometry(240, 180, 192, 144);
        const groundPos = groundGeo.attributes.position;
        const colors: number[] = [];
        const color = new THREE.Color();

        for (let i = 0; i < groundPos.count; i++) {
            const vx = groundPos.getX(i);
            const vy = groundPos.getY(i);
            const height = getTerrainHeight(vx, -vy);
            groundPos.setZ(i, height);

            const waterY = -0.15;
            if (height < waterY) {
                // Underwater lake bed — warm sandy brown
                const wetT = Math.min(1.0, (waterY - height) / 0.85);
                color
                    .copy(new THREE.Color(0x8b7355))
                    .lerp(new THREE.Color(0xa68968), wetT);
            } else if (height < waterY + 0.08) {
                // Wet shore transition — muddy transition
                const t = (height - waterY) / 0.08;
                color
                    .copy(new THREE.Color(0x9d8b6f))
                    .lerp(new THREE.Color(0xa89968), t);
            } else if (height < 0.3) {
                // Low flat — light green grass
                const t = (height - (waterY + 0.08)) / 0.22;
                color
                    .copy(new THREE.Color(0xa89968))
                    .lerp(new THREE.Color(0x9db84a), t);
            } else if (height < 1.0) {
              // Mid slopes — golden-green blend
              const t = (height - 0.3) / 0.7;
              color
                .copy(new THREE.Color(0x9db84a))
                .lerp(new THREE.Color(0xb5a860), t);
            } else if (height < 2.2) {
              // Steeper hills — golden olive
              const t = (height - 1.0) / 1.2;
              color
                .copy(new THREE.Color(0xb5a860))
                .lerp(new THREE.Color(0xa89656), t);
            } else {
              // Mountain peaks — grey-brown rock
              const t = Math.min(1.0, (height - 2.2) / 1.8);
              color
                .copy(new THREE.Color(0xa89656))
                .lerp(new THREE.Color(0x8a8470), t);
            }
            colors.push(color.r, color.g, color.b);
        }

        groundGeo.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3),
        );
        groundGeo.computeVertexNormals();

        this.mesh = new THREE.Mesh(
            groundGeo,
            new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.9,
                metalness: 0.03,
            }),
        );
        this.mesh.rotation.x = -Math.PI / 2;
        scene.add(this.mesh);
    }
}
