import * as THREE from 'three';
import { getTerrainHeight } from '../../simulation/constants';

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
      
      if (height < -0.3) {
        color.setHex(0x5a5438); // Deep dry olive
      } else if (height < 0.2) {
        const t = (height + 0.3) / 0.5;
        color.copy(new THREE.Color(0x5a5438)).lerp(new THREE.Color(0x6e6848), t); // Lerp to dry grass bottom
      } else if (height < 1.2) {
        const t = (height - 0.2) / 1.0;
        color.copy(new THREE.Color(0x6e6848)).lerp(new THREE.Color(0xc2af78), t); // Seamless blend with grass bottom & top
      } else if (height < 2.5) {
        const t = (height - 1.2) / 1.3;
        color.copy(new THREE.Color(0xc2af78)).lerp(new THREE.Color(0xa39360), t); // Olive gold on slopes
      } else {
        const t = Math.min(1.0, (height - 2.5) / 2.0);
        color.copy(new THREE.Color(0xa39360)).lerp(new THREE.Color(0x877a4e), t); // Darker olive gold on high hills
      }
      colors.push(color.r, color.g, color.b);
    }
    
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    this.mesh = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0.05
      })
    );
    this.mesh.rotation.x = -Math.PI / 2;
    scene.add(this.mesh);
  }
}
