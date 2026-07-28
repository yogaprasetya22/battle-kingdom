import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getTerrainHeight } from '../../simulation/constants';

export class Castles {
  castleA: THREE.Group | null = null;
  castleB: THREE.Group | null = null;
  constructor(scene: THREE.Scene, gltfLoader: GLTFLoader) {
    gltfLoader.load('/models/npc/tower.glb', (gltf) => {
      this.castleA = gltf.scene;
      this.castleA.position.set(-37.5, getTerrainHeight(-37.5, 0), 0);
      this.castleA.scale.setScalar(1.6);
      this.castleA.rotation.y = Math.PI / 2;
      scene.add(this.castleA);
    });

    gltfLoader.load('/models/npc/tower_2.glb', (gltf) => {
      this.castleB = gltf.scene;
      this.castleB.position.set(37.5, getTerrainHeight(37.5, 0), 0);
      this.castleB.scale.setScalar(0.6);
      this.castleB.rotation.y = -Math.PI / 2;
      scene.add(this.castleB);
    });
  }
}
