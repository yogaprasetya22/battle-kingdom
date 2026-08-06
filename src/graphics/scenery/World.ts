import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { Floor } from './Floor';
import { WaterSurface } from './WaterSurface';
import { Castles } from './Turret';
import { Trees } from './Trees';
import { Flowers } from './Flowers';
import { SceneryWindLines } from './SceneryWindLines';
import { Grass } from './Grass';
import { Leaves } from './Leaves';
import { invalidateTerrainCache } from '../../simulation/constants';

export class World {
  floor: Floor;
  waterSurface?: WaterSurface;
  trees?: Trees;
  grass?: Grass;
  flowers?: Flowers;
  windLines: SceneryWindLines;
  castles: Castles;
  leaves: Leaves;

  elapsed = 0;
  uniforms = {
    uTime: { value: 0 }
  };

  constructor(scene: THREE.Scene, gltfLoader: GLTFLoader) {
    invalidateTerrainCache();
    this.floor        = new Floor(scene);
    this.waterSurface = new WaterSurface(scene, this.uniforms);
    this.trees        = new Trees(scene, gltfLoader);
    this.grass        = new Grass(scene, this.uniforms);
    // this.flowers      = new Flowers(scene, this.uniforms);
    this.windLines    = new SceneryWindLines(scene);
    this.castles      = new Castles(scene, gltfLoader);
    this.leaves       = new Leaves(scene);
  }

  update(delta: number, camPos: THREE.Vector3, camera?: THREE.Camera) {
    this.elapsed += delta;
    this.uniforms.uTime.value = this.elapsed;
    this.windLines.update(delta, this.elapsed);
    this.waterSurface?.update(camPos);
    if (camera) {
      this.castles.update(camera, delta);
    }
  }
}
