import fs from "fs";
import path from "path";

const filepath = "public/models/character/characters/Knight.glb";
const buffer = fs.readFileSync(filepath);
const jsonLength = buffer.readUInt32LE(12);
const jsonBuffer = buffer.slice(20, 20 + jsonLength);
const gltf = JSON.parse(jsonBuffer.toString("utf8"));

console.log("=== GLTF Inspect ===");
console.log("Nodes count:", gltf.nodes ? gltf.nodes.length : 0);
console.log("Meshes count:", gltf.meshes ? gltf.meshes.length : 0);
if (gltf.meshes) {
    gltf.meshes.forEach((mesh, i) => {
        console.log(`Mesh ${i}: "${mesh.name || ""}" has ${mesh.primitives.length} primitives`);
    });
}
console.log("Skins count:", gltf.skins ? gltf.skins.length : 0);
