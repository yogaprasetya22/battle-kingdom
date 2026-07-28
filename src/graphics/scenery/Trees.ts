import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getTerrainHeight } from '../../simulation/constants';
import treesData from './treesData.json';

// Shared module-level state for tree positions
export const treePositions: THREE.Vector3[] = [];

export class Trees {
  constructor(scene: THREE.Scene, gltfLoader: GLTFLoader) {
    treePositions.length = 0;
    const uniqueTypes = Array.from(new Set(treesData.map(t => t.type)));

    const promises = uniqueTypes.map(name => {
      return new Promise<THREE.Group>((resolve) => {
        gltfLoader.load(`/models/trees/${name}.glb`, (gltf) => {
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              if (mesh.material) {
                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.roughness = 0.95;
                mat.flatShading = true;
              }
            }
          });
          resolve(gltf.scene);
        }, undefined, () => resolve(new THREE.Group()));
      });
    });

    Promise.all(promises).then((loadedModels) => {
      const templates: Record<string, THREE.Group> = {};
      uniqueTypes.forEach((name, index) => {
        const model = loadedModels[index];
        if (model && model.children.length > 0) {
          templates[name] = model;
        }
      });

      // Pre-populate treePositions since it is used elsewhere
      treesData.forEach((data) => {
        const groundY = getTerrainHeight(data.x, data.z);
        treePositions.push(new THREE.Vector3(data.x, groundY, data.z));
      });

      // Create InstancedMesh for each unique tree type
      uniqueTypes.forEach((name) => {
        const template = templates[name];
        if (!template) return;

        const instances = treesData.filter(t => t.type === name);
        const count = instances.length;
        if (count === 0) return;

        // Traverse template and collect meshes with their relative transform matrices
        const meshesInfo: { mesh: THREE.Mesh; relativeMatrix: THREE.Matrix4 }[] = [];
        template.updateMatrixWorld(true);
        template.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const relativeMatrix = new THREE.Matrix4();
            let current: THREE.Object3D | null = mesh;
            while (current && current !== template) {
              current.updateMatrix();
              relativeMatrix.premultiply(current.matrix);
              current = current.parent;
            }
            meshesInfo.push({ mesh, relativeMatrix });
          }
        });

        // Create an InstancedMesh for each sub-mesh found in the template
        meshesInfo.forEach(({ mesh, relativeMatrix }) => {
          const instancedMesh = new THREE.InstancedMesh(
            mesh.geometry,
            mesh.material,
            count
          );

          instancedMesh.castShadow = false;
          instancedMesh.receiveShadow = false;

          // Temp variables to compose instance matrices
          const position = new THREE.Vector3();
          const rotation = new THREE.Euler();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          const instanceMatrix = new THREE.Matrix4();
          const finalMatrix = new THREE.Matrix4();

          instances.forEach((data, index) => {
            const groundY = getTerrainHeight(data.x, data.z);
            position.set(data.x, groundY, data.z);
            rotation.set(0, data.rotation, 0);
            quaternion.setFromEuler(rotation);
            scale.set(data.scale, data.scale, data.scale);

            instanceMatrix.compose(position, quaternion, scale);
            finalMatrix.multiplyMatrices(instanceMatrix, relativeMatrix);

            instancedMesh.setMatrixAt(index, finalMatrix);
          });

          instancedMesh.instanceMatrix.needsUpdate = true;
          scene.add(instancedMesh);
        });
      });
    });
  }
}
