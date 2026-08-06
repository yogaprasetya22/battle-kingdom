/**
 * UnitVisualFactory.ts — Pabrik Pemanggil Karakter.
 * Menerima uType (0-7) dan mengembalikan IUnitVisual yang sudah lengkap
 * (model + senjata + animasi). Sistem utama tidak perlu tahu detail perakitan.
 */
import * as THREE from "three";
import type { IUnitVisual } from "./base/IUnitVisual";
import { TankVisual } from "./Tank/TankVisual";
import { KnightVisual } from "./Knight/KnightVisual";
import { ArcherVisual } from "./Archer/ArcherVisual";
import { MageVisual } from "./Mage/MageVisual";
import { HealerVisual } from "./Healer/HealerVisual";
import { GunslingerVisual } from "./Gunslinger/GunslingerVisual";
import { AssassinVisual } from "./Assassin/AssassinVisual";

/**
 * Factory: buat unit visual berdasarkan tipe.
 *
 * @param uType      0=Barbarian, 1=Archer, 2=Mage, 3=Healer, 4=Gunslinger, 5=Assassin, 12=Knight
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
    isSkeleton: boolean = false,
): IUnitVisual {
    let unit: IUnitVisual;

    switch (uType) {
        case 0:
            unit = new TankVisual(sourceGLTF, teamMat, isSkeleton); // Barbarian
            break;
        case 1:
            unit = new ArcherVisual(sourceGLTF, teamMat, isSkeleton);
            break;
        case 2:
            unit = new MageVisual(sourceGLTF, teamMat, isSkeleton);
            break;
        case 3:
            unit = new HealerVisual(sourceGLTF, teamMat, isSkeleton);
            break;
        case 4:
            unit = new GunslingerVisual(sourceGLTF, teamMat, isSkeleton);
            break;
        case 5:
            unit = new AssassinVisual(sourceGLTF, teamMat, isSkeleton);
            break;
        case 12:
            unit = new KnightVisual(sourceGLTF, teamMat, isSkeleton); // Knight
            break;
        // fallback ke Barbarian
        case 6:
        case 7:
        default:
            unit = new TankVisual(sourceGLTF, teamMat, isSkeleton);
            break;
    }

    // Pasang senjata ke bone
    unit.loadAssets();

    // Pilih klip animasi sesuai tipe
    unit.setupAnimations(animRigs);

    return unit;
}

/**
 * Skala default per tipe unit.
 */
export function getUnitScale(uType: number): number {
    switch (uType) {
        case 0:
            return 0.85; // Barbarian
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
        case 12:
            return 0.85; // Knight
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
 */
export function getModelKey(uType: number, models: Record<string, any>): any {
    switch (uType) {
        case 0:
            return models.tank; // Barbarian (holds under models.tank loader key)
        case 1:
            return models.archer;
        case 2:
            return models.mage;
        case 3:
            return models.mage;
        case 4:
            return models.gunslinger;
        case 5:
            return models.assassin;
        case 12:
            return models.knight; // New separate Knight model
        case 6:
            return models.tank;
        case 7:
            return models.mage;
        default:
            return models.tank;
    }
}
