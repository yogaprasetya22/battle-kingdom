import { getTerrainHeight, LAKES } from "../src/simulation/constants.ts";

console.log("=== ANALISIS DANAU DAN KETINGGIAN TANAH ===");
for (const lake of LAKES) {
    console.log(`\nDanau di (${lake.cx}, ${lake.cz}) | Radius X: ${lake.rx}, Z: ${lake.rz} | Depth: ${lake.depth}`);
    
    const hCenter = getTerrainHeight(lake.cx, lake.cz);
    console.log(`  Tinggi tanah di pusat: ${hCenter.toFixed(3)}`);
    
    const testPoints = [
        { name: "Timur", dx: lake.rx * 1.25, dz: 0 },
        { name: "Barat", dx: -lake.rx * 1.25, dz: 0 },
        { name: "Utara", dx: 0, dz: lake.rz * 1.25 },
        { name: "Selatan", dx: 0, dz: -lake.rz * 1.25 }
    ];
    
    for (const p of testPoints) {
        const tx = lake.cx + p.dx;
        const tz = lake.cz + p.dz;
        const h = getTerrainHeight(tx, tz);
        console.log(`  Tinggi di tepi ${p.name} (${tx.toFixed(1)}, ${tz.toFixed(1)}): ${h.toFixed(3)}`);
    }
}
