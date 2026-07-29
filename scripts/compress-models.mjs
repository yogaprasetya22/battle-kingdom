import { readdir, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");

const CONFIG = {
    charactersInput: "/home/yoga/Dokumen/model-tiktok-next/sangat mantap/KayKit_Adventurers_2.0_FREE/Characters/characters-gltf",
    charactersOutput: path.join(ROOT_DIR, "public", "models", "character", "characters"),
    weaponsInput: "/home/yoga/Dokumen/model-tiktok-next/sangat mantap/KayKit_Adventurers_2.0_FREE/Assets/waepon-gltf",
    weaponsOutput: path.join(ROOT_DIR, "public", "models", "character", "weapons"),
    animationsFolder: path.join(ROOT_DIR, "public", "models", "character", "animation"),
    simplify: 0.7,
};

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: "ignore" });
        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Exit code ${code}`));
        });
        proc.on("error", (err) => reject(err));
    });
}

async function start() {
    console.log("🚀 MEMULAI OPTIMASI MODEL DENGAN GLTFPACK...");
    console.log("--------------------------------------------------");

    // Pastikan folder output tersedia
    for (const folder of [CONFIG.charactersOutput, CONFIG.weaponsOutput]) {
        if (!existsSync(folder)) {
            await mkdir(folder, { recursive: true });
        }
    }

    let processedCount = 0;

    // 1. Proses Character Models (.glb)
    if (existsSync(CONFIG.charactersInput)) {
        const charFiles = (await readdir(CONFIG.charactersInput)).filter(
            (f) => f.toLowerCase().endsWith(".glb")
        );

        console.log(`\n👤 Memproses Character Models (${charFiles.length} file)...`);
        for (const file of charFiles) {
            const inputPath = path.join(CONFIG.charactersInput, file);
            const outputPath = path.join(CONFIG.charactersOutput, file);

            process.stdout.write(`  📦 [${processedCount + 1}] Mengompresi ${file} (gltfpack)... `);

            try {
                // gltfpack -i input -o output -c -si 0.7
                await runCommand("npx", [
                    "gltfpack",
                    "-i", inputPath,
                    "-o", outputPath,
                    "-c",
                    "-si", CONFIG.simplify.toString()
                ]);
                process.stdout.write("✅ BERHASIL\n");
                processedCount++;
            } catch (err) {
                process.stdout.write("❌ GAGAL\n");
                console.error(`     Error: ${err.message}`);
            }
        }
    } else {
        console.warn(`⚠️ Folder input character tidak ditemukan: ${CONFIG.charactersInput}`);
    }

    // 2. Proses Weapon Models (.gltf -> .glb)
    if (existsSync(CONFIG.weaponsInput)) {
        const weaponFiles = (await readdir(CONFIG.weaponsInput)).filter(
            (f) => f.toLowerCase().endsWith(".gltf")
        );

        console.log(`\n⚔️ Memproses Weapon Models (${weaponFiles.length} file)...`);
        for (const file of weaponFiles) {
            const inputPath = path.join(CONFIG.weaponsInput, file);
            const outputFileName = file.slice(0, -5) + ".glb"; // Simpan sebagai .glb
            const outputPath = path.join(CONFIG.weaponsOutput, outputFileName);

            process.stdout.write(`  📦 [${processedCount + 1}] Mengompresi & convert ${file} -> ${outputFileName} (gltfpack)... `);

            try {
                await runCommand("npx", [
                    "gltfpack",
                    "-i", inputPath,
                    "-o", outputPath,
                    "-c",
                    "-si", CONFIG.simplify.toString()
                ]);
                process.stdout.write("✅ BERHASIL\n");
                processedCount++;
            } catch (err) {
                process.stdout.write("❌ GAGAL\n");
                console.error(`     Error: ${err.message}`);
            }
        }
    } else {
        console.warn(`⚠️ Folder input weapon tidak ditemukan: ${CONFIG.weaponsInput}`);
    }

    // 3. Proses Animation Models (in-place)
    if (existsSync(CONFIG.animationsFolder)) {
        const animFiles = (await readdir(CONFIG.animationsFolder)).filter(
            (f) => f.toLowerCase().endsWith(".glb") && !f.includes("_temp")
        );

        console.log(`\n🎬 Memproses Animation Models (${animFiles.length} file)...`);
        for (const file of animFiles) {
            const inputPath = path.join(CONFIG.animationsFolder, file);
            const tempPath = path.join(CONFIG.animationsFolder, file.replace(".glb", "_temp.glb"));

            process.stdout.write(`  📦 [${processedCount + 1}] Mengompresi ${file} (gltfpack)... `);

            try {
                await runCommand("npx", [
                    "gltfpack",
                    "-i", inputPath,
                    "-o", tempPath,
                    "-c"
                ]);
                if (existsSync(tempPath)) {
                    await rename(tempPath, inputPath);
                    process.stdout.write("✅ BERHASIL\n");
                    processedCount++;
                } else {
                    process.stdout.write("❌ GAGAL (file temp tidak terbentuk)\n");
                }
            } catch (err) {
                process.stdout.write("❌ GAGAL\n");
                console.error(`     Error: ${err.message}`);
            }
        }
    } else {
        console.warn(`⚠️ Folder animasi tidak ditemukan: ${CONFIG.animationsFolder}`);
    }

    console.log("--------------------------------------------------");
    console.log(`✨ SELESAI! Berhasil memproses ${processedCount} file.`);
    console.log(`📁 Character tersimpan di: ${CONFIG.charactersOutput}`);
    console.log(`📁 Weapon tersimpan di: ${CONFIG.weaponsOutput}`);
    console.log(`📁 Animation tersimpan di: ${CONFIG.animationsFolder}\n`);
}

start();
