/**
 * UnitVisualFactory.ts — Pabrik Pemanggil Karakter.
 * Menerima uType (0-7) dan mengembalikan IUnitVisual yang sudah lengkap
 * (model + senjata + animasi). Sistem utama tidak perlu tahu detail perakitan.
 */
import * as THREE from "three";
import type { IUnitVisual } from "./base/IUnitVisual";
import { KnightVisual } from "./Knight/KnightVisual";
import { ArcherVisual } from "./Archer/ArcherVisual";
import { MageVisual } from "./Mage/MageVisual";
import { HealerVisual } from "./Healer/HealerVisual";
import { GunslingerVisual } from "./Gunslinger/GunslingerVisual";
import { AssassinVisual } from "./Assassin/AssassinVisual";

/**
 * Factory: buat unit visual berdasarkan tipe.
 *
 * @param uType      0=Knight, 1=Archer, 2=Mage, 3=Healer, 4=Gunslinger, 5=Assassin, 6=Merchant, 7=Druid
 * @param sourceGLTF  GLTF model karakter (sesuai tipe)
 * @param teamMat     Material tim (warna merah/biru)
 * @param animRigs    Map nama rig → AnimationClip[] hasil load paralel
 * @returns           IUnitVisual yang sudah siap (assets loaded + animations setup)
 */
export function createUnitVisual(
    uType: number,
    sourceGLTF: any,
    teamMat: THREE.MeshStandardMaterial,
    animRigs: Record<string, THREE.AnimationClip[]>,
): IUnitVisual {
    let unit: IUnitVisual;

    switch (uType) {
        case 0:
            unit = new KnightVisual(sourceGLTF, teamMat);
            break;
        case 1:
            unit = new ArcherVisual(sourceGLTF, teamMat);
            break;
        case 2:
            unit = new MageVisual(sourceGLTF, teamMat);
            break;
        case 3:
            unit = new HealerVisual(sourceGLTF, teamMat);
            break;
        case 4:
            unit = new GunslingerVisual(sourceGLTF, teamMat);
            break;
        case 5:
            unit = new AssassinVisual(sourceGLTF, teamMat);
            break;
        // ponytail: tipe 6-7 belum dibuat class mandiri, fallback ke Knight dulu
        case 6:
        case 7:
        default:
            unit = new KnightVisual(sourceGLTF, teamMat);
            break;
    }

    unit.loadAssets();

    // Pilih klip animasi sesuai tipe
    unit.setupAnimations(animRigs);

    return unit;
}

/**
 * Skala default per tipe unit.
 * Dipanggil setelah konstruksi untuk override scale bawaan kelas.
 */
export function getUnitScale(uType: number): number {
    switch (uType) {
        case 0:
            return 0.85; // Knight — paling besar
        case 1:
            return 0.42; // Archer
        case 2:
            return 0.6; // Mage
        case 3:
            return 0.5; // Healer
        case 4:
            return 0.55; // Gunslinger
        case 5:
            return 0.5; // Assassin
        case 6:
            return 0.55; // Merchant
        case 7:
            return 0.55; // Druid
        default:
            return 0.6;
    }
}

/**
 * Petakan uType ke key GLTF model.
 * Digunakan oleh changeModel() untuk tahu model mana yang harus dimuat.
 */
export function getModelKey(uType: number, models: Record<string, any>): any {
    switch (uType) {
        case 0:
            return models.tank;
        case 1:
            return models.archer;
        case 2:
            return models.mage;
        case 3:
            return models.mage; // Healer pakai model Mage
        case 4:
            return models.gunslinger;
        case 5:
            return models.assassin;
        case 6:
            return models.tank; // ponytail: Merchant belum punya model sendiri
        case 7:
            return models.mage; // ponytail: Druid belum punya model sendiri
        default:
            return models.tank;
    }
}
