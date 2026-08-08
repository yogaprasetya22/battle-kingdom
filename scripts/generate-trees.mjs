import fs from 'fs';
import path from 'path';

// Define boundaries and zones based on constants.ts
const MAP_MIN_X = -115; // Ground floor is 240 units wide (-120 to 120), so we stay inside at -115
const MAP_MAX_X = 115;
const MAP_MIN_Z = -85;  // Ground floor is 180 units tall (-90 to 90), so we stay inside at -85
const MAP_MAX_Z = 85;

const BF_HALF_X = 46; // Buffered slightly to prevent trees overlapping onto the battlefield
const BF_HALF_Z = 42;

const LAKES = [
  { cx: -68, cz: -62, rx: 22, rz: 15 },
  { cx: 68, cz: -62, rx: 20, rz: 14 },
  { cx: -68, cz: 62, rx: 19, rz: 15 },
  { cx: 68, cz: 62, rx: 22, rz: 14 },
  { cx: -88, cz: 0, rx: 14, rz: 11 },
  { cx: 88, cz: 0, rx: 14, rz: 11 }
];

const TREE_TYPES = [
  // Birch trees (Highly optimized and matching the map style)
  'BirchTree_1', 'BirchTree_2', 'BirchTree_3', 'BirchTree_4', 'BirchTree_5',
  // Maple trees
  'MapleTree_1', 'MapleTree_2', 'MapleTree_3', 'MapleTree_4',
  // Pine trees
  'Pine_1', 'Pine_2', 'Pine_3', 'Pine_5',
  // Twisted trees
  'TwistedTree_1', 'TwistedTree_3'
];

function isInsideBattlefield(x, z) {
  return Math.abs(x) < BF_HALF_X && Math.abs(z) < BF_HALF_Z;
}

function isInsideLake(x, z) {
  for (const lake of LAKES) {
    const dx = (x - lake.cx) / lake.rx;
    const dz = (z - lake.cz) / lake.rz;
    // We add a safety margin of 1.15 to avoid placing trees on the shore/inside water
    if (dx * dx + dz * dz < 1.15) {
      return true;
    }
  }
  return false;
}

function generateTreesGrid() {
  const trees = [];
  const cellSize = 13.2; // Adjusted to target ~150 total trees (very light, perfect spread)
  const jitterRange = 3.5; // Jitter to prevent grid alignment

  for (let x = MAP_MIN_X + cellSize / 2; x < MAP_MAX_X; x += cellSize) {
    for (let z = MAP_MIN_Z + cellSize / 2; z < MAP_MAX_Z; z += cellSize) {
      // Jitter the position within the cell
      const jx = parseFloat((x + (Math.random() * 2 - 1) * jitterRange).toFixed(1));
      const jz = parseFloat((z + (Math.random() * 2 - 1) * jitterRange).toFixed(1));

      // Must be outside the battlefield and outside any lake
      if (isInsideBattlefield(jx, jz) || isInsideLake(jx, jz)) {
        continue;
      }

      // Check distance against already generated trees to guarantee spacing
      let tooClose = false;
      for (const tree of trees) {
        const dx = jx - tree.x;
        const dz = jz - tree.z;
        if (dx * dx + dz * dz < 25.0) { // Minimum distance of 5.0 units
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }

      const type = TREE_TYPES[Math.floor(Math.random() * TREE_TYPES.length)];
      
      // Scale range: min 2, max 4 (for TwistedTree max 3)
      let scale;
      if (type.startsWith('TwistedTree')) {
        scale = parseFloat((Math.random() * 1.0 + 2.0).toFixed(2)); // min 2, max 3
      } else {
        scale = parseFloat((Math.random() * 2.0 + 2.0).toFixed(2)); // min 2, max 4
      }
      
      // Random rotation in radians (0 to 2*PI)
      const rotation = parseFloat((Math.random() * Math.PI * 2).toFixed(2));

      trees.push({
        x: jx,
        z: jz,
        type,
        scale,
        rotation
      });
    }
  }

  console.log(`Generated ${trees.length} trees using grid-jitter layout.`);
  return trees;
}

const treesData = generateTreesGrid();
const outputPath = path.resolve('src/graphics/scenery/treesData.json');

fs.writeFileSync(outputPath, JSON.stringify(treesData, null, 2), 'utf-8');
console.log(`Successfully saved trees data to ${outputPath}`);
