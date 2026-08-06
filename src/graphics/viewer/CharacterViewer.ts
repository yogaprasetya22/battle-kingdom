/**
 * CharacterViewer.ts — Model Viewer / Katalog Karakter 3D.
 *
 * Fitur:
 * - Render karakter tunggal di tengah layar dengan OrbitControls
 * - Navigasi kiri/kanan untuk ganti karakter (Knight, Archer, Mage, Healer, Gunslinger, Assassin)
 * - Tombol animasi: Idle, Run, Attack, Death (auto-return ke idle setelah selesai)
 * - Tombol skill VFX: memicu efek partikel di posisi karakter
 * - Dispose otomatis saat ganti karakter (cegah memory leak)
 *
 * Dipanggil dari main.ts saat user membuka Model Viewer overlay.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// @ts-ignore
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { IUnitVisual } from "../units/base/IUnitVisual";
import { weaponCache, WEAPON_OFFSETS } from "../units/UnitVisualHelpers";
import { createUnitVisual } from "../units/UnitVisualFactory";
import {
    createWeaponOffsetUI,
    formatOffsetForCode,
    type WeaponOffset,
} from "./WeaponOffsetConfig";
import { debugBoneStructure } from "./GenericBoneDebug";

// ── FX imports (untuk trigger skill) ──
import {
    spawnTauntFX,
    spawnShieldBashFX,
    spawnIronFortitudeAuraFX,
    spawnFrostNovaBurstFX,
    spawnFireballFX,
    spawnLightningFX,
    spawnArrowVolleyFX,
    spawnDoubleShotFX,
    spawnEvasiveLeapFX,
    spawnHealFX,
    spawnDivineShieldFX,
    spawnHolySanctuaryFX,
    spawnHighNoonFX,
    spawnSmokeBombFX,
    spawnFanFireFX,
    spawnShadowStepFX,
    spawnBackstabFX,
    spawnPoisonBladeFX,
    updateFX,
} from "../effects/SkillFX";

// ── Konfigurasi karakter ──
interface CharacterDef {
    name: string; // Nama tampilan
    model: string; // Nama file GLB (tanpa .glb)
    uType: number; // Tipe unit (0-5)
    skills: { id: string; label: string }[]; // Daftar skill VFX
}

const CHARACTERS: CharacterDef[] = [
    {
        name: "Knight",
        model: "Knight",
        uType: 0,
        skills: [
            { id: "ironFortitude", label: "Iron Fortitude" },
            { id: "taunt", label: "Taunt" },
            { id: "shieldBash", label: "Shield Bash" },
        ],
    },
    {
        name: "Archer",
        model: "Ranger",
        uType: 1,
        skills: [
            { id: "doubleShot", label: "Double Shot" },
            { id: "arrowVolley", label: "Arrow Volley" },
            { id: "evasiveLeap", label: "Evasive Leap" },
        ],
    },
    {
        name: "Mage",
        model: "Mage",
        uType: 2,
        skills: [
            { id: "frostNova", label: "Frost Nova" },
            { id: "chainLightning", label: "Chain Lightning" },
            { id: "fireball", label: "Fireball" },
        ],
    },
    {
        name: "Healer",
        model: "Mage", // Healer pakai model Mage untuk sekarang
        uType: 3,
        skills: [
            { id: "basicHeal", label: "Basic Heal" },
            { id: "rejuvenation", label: "Rejuvenation" },
            { id: "holySanctuary", label: "Holy Sanctuary" },
        ],
    },
    {
        name: "Gunslinger",
        model: "Rogue_Hooded",
        uType: 4,
        skills: [
            { id: "highNoon", label: "High Noon" },
            { id: "smokeBomb", label: "Smoke Bomb" },
            { id: "fanFire", label: "Fan Fire" },
        ],
    },
    {
        name: "Assassin",
        model: "Rogue",
        uType: 5,
        skills: [
            { id: "shadowStep", label: "Shadow Step" },
            { id: "backstab", label: "Backstab" },
            { id: "poisonBlade", label: "Poison Blade" },
        ],
    },
    {
        name: "Skeleton Warrior",
        model: "Skeleton_Warrior",
        uType: 0,
        skills: [
            { id: "ironFortitude", label: "Iron Fortitude" },
            { id: "taunt", label: "Taunt" },
            { id: "shieldBash", label: "Shield Bash" },
        ],
    },
    {
        name: "Skeleton Minion",
        model: "Skeleton_Minion",
        uType: 1,
        skills: [
            { id: "doubleShot", label: "Double Shot" },
            { id: "arrowVolley", label: "Arrow Volley" },
            { id: "evasiveLeap", label: "Evasive Leap" },
        ],
    },
    {
        name: "Skeleton Mage",
        model: "Skeleton_Mage",
        uType: 2,
        skills: [
            { id: "frostNova", label: "Frost Nova" },
            { id: "chainLightning", label: "Chain Lightning" },
            { id: "fireball", label: "Fireball" },
        ],
    },
    {
        name: "Skeleton Rogue",
        model: "Skeleton_Rogue",
        uType: 5,
        skills: [
            { id: "shadowStep", label: "Shadow Step" },
            { id: "backstab", label: "Backstab" },
            { id: "poisonBlade", label: "Poison Blade" },
        ],
    },
];

// ── Daftar senjata (sama dengan UnitRenderer.ts) ──
const WEAPON_ASSETS = [
    { name: "sword_1handed", path: "sword_1handed.glb" },
    { name: "shield_round_color", path: "shield_round_color.glb" },
    { name: "bow_withString", path: "bow_withString.glb" },
    { name: "quiver", path: "quiver.glb" },
    { name: "staff", path: "staff.glb" },
    { name: "wand", path: "wand.glb" },
    { name: "spellbook_open", path: "spellbook_open.glb" },
    { name: "crossbow_1handed", path: "crossbow_1handed.glb" },
    { name: "dagger", path: "dagger.glb" },
    { name: "mug_full", path: "mug_full.glb" },
    { name: "spellbook_closed", path: "spellbook_closed.glb" },
    { name: "Skeleton_Axe", path: "Skeleton_Axe.glb" },
    { name: "Skeleton_Blade", path: "Skeleton_Blade.glb" },
    { name: "Skeleton_Crossbow", path: "Skeleton_Crossbow.glb" },
    { name: "Skeleton_Quiver", path: "Skeleton_Quiver.glb" },
    { name: "Skeleton_Shield_Small_A", path: "Skeleton_Shield_Small_A.glb" },
    { name: "Skeleton_Shield_Large_A", path: "Skeleton_Shield_Large_A.glb" },
    { name: "Skeleton_Staff", path: "Skeleton_Staff.glb" },
    { name: "axe_2handed", path: "axe_2handed.glb" },
];

// ── Daftar animation rig ──
const ANIM_RIGS = [
    "Rig_Medium_General",
    "Rig_Medium_MovementBasic",
    "Rig_Medium_MovementAdvanced",
    "Rig_Medium_CombatMelee",
    "Rig_Medium_CombatRanged",
    "Rig_Medium_Tools",
];

export class CharacterViewer {
    // ── Three.js core ──
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private clock: THREE.Clock;

    // ── Assets ──
    private gltfLoader: GLTFLoader;
    private modelCache: Record<string, any> = {}; // Key: nama model → GLTF
    private animRigs: Record<string, THREE.AnimationClip[]> = {};
    private assetsReady = false;

    // ── Unit aktif ──
    private currentUnit: IUnitVisual | null = null;
    private currentIndex = 0; // Index di CHARACTERS
    private unitMaterial: THREE.MeshStandardMaterial | null = null;

    // ── State ──
    private animId = 0;
    private _visible = false;
    private autoReturnTimeout: ReturnType<typeof setTimeout> | null = null;
    private _isDisposed = false;

    // ── UI element references ──
    private charNameEl: HTMLElement | null = null;
    private skillPanelEl: HTMLElement | null = null;
    private weaponOffsetPanelEl: HTMLElement | null = null;

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(0, 1.8, 5);
        this.camera.lookAt(0, 1.0, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x1a1a2e);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = false;

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement,
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 1.0, 0);
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 8;
        this.controls.maxPolarAngle = Math.PI * 0.7;
        this.controls.update();

        this.clock = new THREE.Clock();
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

        this._setupLights();
    }

    // ── Pencahayaan dramatis ──
    private _setupLights(): void {
        // Ambient — isi bayangan
        const ambient = new THREE.AmbientLight(0x334466, 1.5);
        this.scene.add(ambient);

        // Key light — dari kiri atas
        const key = new THREE.DirectionalLight(0xffeedd, 4.0);
        key.position.set(-3, 5, 4);
        this.scene.add(key);

        // Fill light — dari kanan bawah (lebih redup)
        const fill = new THREE.DirectionalLight(0x8899cc, 2.0);
        fill.position.set(3, 2, -1);
        this.scene.add(fill);

        // Rim light — dari belakang atas (highlight tepi)
        const rim = new THREE.DirectionalLight(0xffffff, 2.5);
        rim.position.set(0, 4, -4);
        this.scene.add(rim);

        // Ground bounce — dari bawah (redup)
        const bounce = new THREE.DirectionalLight(0x334455, 1.0);
        bounce.position.set(0, -0.5, 2);
        this.scene.add(bounce);

        // Hemisphere — langit + tanah
        const hemi = new THREE.HemisphereLight(0x8899cc, 0x332244, 1.0);
        this.scene.add(hemi);
    }

    // ── Inisialisasi: tempel canvas ke DOM ──
    attachToDOM(container: HTMLElement): void {
        if (this._isDisposed) return;
        container.appendChild(this.renderer.domElement);
        this._resize();
        // Resize observer — pakai ResizeObserver untuk ukuran container
        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => this._resize());
            ro.observe(container);
        }
    }

    private _resize(): void {
        const el = this.renderer.domElement.parentElement;
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w === 0 || h === 0) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / Math.max(h, 1);
        this.camera.updateProjectionMatrix();
    }

    // ── Preload semua aset (model, animasi, senjata) ──
    async preloadAssets(
        onProgress?: (msg: string, pct: number) => void,
    ): Promise<void> {
        if (this.assetsReady || this._isDisposed) return;

        const baseUrl = import.meta.env.BASE_URL;
        const totalSteps =
            CHARACTERS.length + ANIM_RIGS.length + WEAPON_ASSETS.length;
        let completed = 0;
        const report = (msg: string) => {
            completed++;
            const pct = Math.round((completed / totalSteps) * 100);
            onProgress?.(msg, pct);
        };

        // ── Load karakter ──
        const modelSet = new Set<string>(CHARACTERS.map((c) => c.model));
        for (const name of modelSet) {
            const gltf = await this.gltfLoader.loadAsync(
                `${baseUrl}models/character/characters/${name}.glb?v=gltfpack`,
            );
            this.modelCache[name] = gltf;
            report(`Model: ${name}`);
        }

        // ── Load animation rigs ──
        for (const rigName of ANIM_RIGS) {
            const gltf = await this.gltfLoader.loadAsync(
                `${baseUrl}models/character/animation/${rigName}.glb?v=gltfpack`,
            );
            this.animRigs[rigName] = gltf.animations;
            report(`Animasi: ${rigName}`);
        }

        // ── Load senjata ──
        for (const w of WEAPON_ASSETS) {
            // Skip jika sudah ada di cache (dari UnitRenderer.preloadWeapons)
            if (weaponCache[w.name]) {
                report(`Senjata: ${w.name} (cached)`);
                continue;
            }
            const gltf = await this.gltfLoader.loadAsync(
                `${baseUrl}models/character/weapons/${w.path}`,
            );
            weaponCache[w.name] = gltf.scene as THREE.Group;
            report(`Senjata: ${w.name}`);
        }

        this.assetsReady = true;
    }

    // ── Tampilkan karakter berdasarkan index ──
    showCharacter(index: number): void {
        if (!this.assetsReady || this._isDisposed) return;

        // Clamp index
        const def =
            CHARACTERS[
                ((index % CHARACTERS.length) + CHARACTERS.length) %
                    CHARACTERS.length
            ];
        this.currentIndex =
            ((index % CHARACTERS.length) + CHARACTERS.length) %
            CHARACTERS.length;

        // Dispose karakter lama
        this._disposeCurrentUnit();

        // Clone model dari cache
        const sourceGLTF = this.modelCache[def.model];
        if (!sourceGLTF) {
            console.warn(
                `[CharacterViewer] Model "${def.model}" tidak ditemukan di cache`,
            );
            return;
        }

        // Buat material standard untuk viewer (preserve warna original)
        if (!this.unitMaterial) {
            this.unitMaterial = new THREE.MeshStandardMaterial({
                metalness: 0.3,
                roughness: 0.7,
                side: THREE.FrontSide,
            });
        }

        // Panggil factory — ini otomatis attach senjata + setup animasi
        const isSkeleton = def.model.toLowerCase().includes("skeleton");
        this.currentUnit = createUnitVisual(
            def.uType,
            sourceGLTF,
            this.unitMaterial,
            this.animRigs,
            isSkeleton,
        );

        // Reset scale (factory & class constructor sudah set scale, kita override untuk viewer)
        // Biarkan scale dari class — sudah proporsional

        // Posisikan di tengah scene
        this.currentUnit.root.position.set(0, 0, 0);
        this.scene.add(this.currentUnit.root);

        // Debug: Cetak bone structure character
        debugBoneStructure(def.model, this.animRigs);

        // Sembunyikan loading message setelah karakter pertama load
        const loadingMsg = document.getElementById("viewer-loading-msg");
        if (loadingMsg) loadingMsg.style.display = "none";

        // Update UI
        this._updateUI(def);

        // Mulai idle
        this.currentUnit.playAnimation(0);
    }

    // ── Ganti animasi ──
    // state: 0=idle, 1=run, 2=attack, 3=death
    playAnimation(state: number): void {
        if (!this.currentUnit || this._isDisposed) return;

        // Clear auto-return timeout sebelumnya
        if (this.autoReturnTimeout) {
            clearTimeout(this.autoReturnTimeout);
            this.autoReturnTimeout = null;
        }

        // Stop semua action sebelum ganti — cegah mixer corruption
        if (this.currentUnit.mixer) {
            this.currentUnit.mixer.stopAllAction();
        }

        // Jika death, trigger khusus (LoopOnce)
        if (state === 3) {
            this.currentUnit.triggerDeath();
            // Auto-kembali ke idle setelah death selesai
            const deathClip = this.currentUnit.actions.death.getClip();
            const dur = (deathClip?.duration || 2.0) * 1000;
            this.autoReturnTimeout = setTimeout(() => {
                this.currentUnit?.playAnimation(0);
                this.autoReturnTimeout = null;
            }, dur + 200);
            return;
        }

        this.currentUnit.playAnimation(state);

        // Jika attack, auto-kembali ke idle setelah selesai
        if (state === 2) {
            const attackClip = this.currentUnit.actions.attack.getClip();
            const dur = (attackClip?.duration || 1.5) * 1000;
            this.autoReturnTimeout = setTimeout(() => {
                this.currentUnit?.playAnimation(0);
                this.autoReturnTimeout = null;
            }, dur + 100);
        }
    }

    // ── Trigger skill VFX ──
    triggerSkill(skillId: string): void {
        if (!this.currentUnit || this._isDisposed) return;

        // Cari hand bone untuk skill yang melepas dari tangan
        let handPos = this.currentUnit.root.position.clone();
        handPos.y += 1.5; // Default: chest level

        const rightHandBone =
            this._findBone(
                this.currentUnit.root,
                "Armature_Upperbody_RightHand",
            ) ||
            this._findBone(this.currentUnit.root, "RightHand") ||
            this._findBone(this.currentUnit.root, "RHand");
        if (rightHandBone) {
            const worldPos = new THREE.Vector3();
            rightHandBone.getWorldPosition(worldPos);
            handPos = worldPos;
        }

        // Posisi karakter (kaki / tengah body)
        const pos = this.currentUnit.root.position.clone();
        // Karakter ada di y=0 (kaki di ground), skill spawn di y sedikit di atas
        const y = pos.y + 1.2;

        // Target dummy (ke depan karakter)
        const tx = pos.x + 2;
        const ty = y - 0.3;
        const tz = pos.z;

        switch (skillId) {
            case "ironFortitude":
                spawnIronFortitudeAuraFX(this.scene, pos.x, y, pos.z);
                break;
            case "taunt":
                spawnTauntFX(this.scene, pos.x, y, pos.z, tx, ty, tz);
                break;
            case "shieldBash":
                spawnShieldBashFX(this.scene, pos.x, y, pos.z, tx, ty, tz);
                break;
            case "frostNova":
                spawnFrostNovaBurstFX(
                    this.scene,
                    handPos.x,
                    handPos.y,
                    handPos.z,
                );
                break;
            case "chainLightning": {
                const points = [
                    new THREE.Vector3(handPos.x, handPos.y, handPos.z),
                    new THREE.Vector3(tx, ty, tz),
                ];
                spawnLightningFX(this.scene, points);
                break;
            }
            case "fireball":
                spawnFireballFX(
                    this.scene,
                    handPos.x,
                    handPos.y,
                    handPos.z,
                    tx,
                    ty,
                    tz,
                );
                break;
            case "doubleShot":
                spawnDoubleShotFX(
                    this.scene,
                    handPos.x,
                    handPos.y,
                    handPos.z,
                    tx,
                    ty,
                    tz,
                );
                break;
            case "arrowVolley":
                spawnArrowVolleyFX(this.scene, tx, tz, handPos.y, 1.5);
                break;
            case "evasiveLeap":
                spawnEvasiveLeapFX(this.scene, pos.x, y, pos.z, tx, ty, tz);
                break;
            case "basicHeal":
                spawnHealFX(
                    this.scene,
                    new THREE.Vector3(handPos.x, handPos.y + 0.3, handPos.z),
                    new THREE.Vector3(pos.x, y, pos.z),
                    false,
                );
                break;
            case "rejuvenation":
                spawnHealFX(
                    this.scene,
                    new THREE.Vector3(handPos.x, handPos.y + 0.3, handPos.z),
                    new THREE.Vector3(pos.x, y, pos.z),
                    true,
                );
                break;
            case "holySanctuary":
                spawnHolySanctuaryFX(
                    this.scene,
                    new THREE.Vector3(pos.x, y, pos.z),
                );
                break;
            case "divineShield":
                spawnDivineShieldFX(
                    this.scene,
                    new THREE.Vector3(pos.x, y, pos.z),
                );
                break;
            case "highNoon":
                spawnHighNoonFX(
                    this.scene,
                    handPos.x,
                    handPos.y,
                    handPos.z,
                    tx,
                    ty,
                    tz,
                );
                break;
            case "smokeBomb":
                spawnSmokeBombFX(this.scene, pos.x, y, pos.z);
                break;
            case "fanFire":
                spawnFanFireFX(
                    this.scene,
                    handPos.x,
                    handPos.z,
                    handPos.y,
                    1.5,
                );
                break;
            case "shadowStep":
                spawnShadowStepFX(this.scene, pos.x, y, pos.z, tx, ty, tz);
                break;
            case "backstab":
                spawnBackstabFX(
                    this.scene,
                    handPos.x,
                    handPos.y,
                    handPos.z,
                    tx,
                    ty,
                    tz,
                );
                break;
            case "poisonBlade":
                spawnPoisonBladeFX(this.scene, handPos.x, handPos.y, handPos.z);
                break;
            default:
                console.warn(
                    `[CharacterViewer] Skill "${skillId}" tidak dikenal`,
                );
        }

        // Mainkan animasi attack bersamaan dengan skill
        this.playAnimation(2);
    }

    // ── Update UI overlay ──
    private _updateUI(def: CharacterDef): void {
        // Nama karakter
        if (!this.charNameEl) {
            this.charNameEl = document.getElementById("viewer-char-name");
        }
        if (this.charNameEl) {
            this.charNameEl.textContent = def.name;
        }

        // Panel skill
        if (!this.skillPanelEl) {
            this.skillPanelEl = document.getElementById("viewer-skill-panel");
        }
        if (this.skillPanelEl) {
            this.skillPanelEl.innerHTML = def.skills
                .map(
                    (s) =>
                        `<button class="viewer-skill-btn" data-skill="${s.id}">✨ ${s.label}</button>`,
                )
                .join("");

            // Pasang event listener
            this.skillPanelEl
                .querySelectorAll<HTMLButtonElement>(".viewer-skill-btn")
                .forEach((btn) => {
                    btn.addEventListener("click", () => {
                        const sid = btn.dataset.skill;
                        if (sid) this.triggerSkill(sid);
                    });
                });
        }

        // Highlight karakter aktif di daftar (jika ada)
        document.querySelectorAll(".viewer-char-dot").forEach((dot, i) => {
            if (i === this.currentIndex) {
                dot.classList.add("active");
            } else {
                dot.classList.remove("active");
            }
        });

        // Setup weapon offset adjuster panel
        this._setupWeaponOffsetPanel();
    }

    // ── Weapon Offset Adjuster UI ──
    private _setupWeaponOffsetPanel(): void {
        if (!this.weaponOffsetPanelEl) {
            this.weaponOffsetPanelEl = document.getElementById(
                "viewer-weapon-offset-panel",
            );
        }
        if (!this.weaponOffsetPanelEl) return;

        this.weaponOffsetPanelEl.innerHTML = "";

        if (!this.currentUnit) {
            this.weaponOffsetPanelEl.innerHTML =
                '<div style="color: #888; font-size: 12px; padding: 8px;">No character loaded</div>';
            return;
        }

        const title = document.createElement("h3");
        title.textContent = "⚙️ Weapon Offset Adjuster";
        title.style.cssText = "margin: 0 0 12px 0; color: #ffd700;";
        this.weaponOffsetPanelEl.appendChild(title);

        const desc = document.createElement("p");
        desc.textContent =
            "Adjust weapon positions here. Copy the config and paste into WEAPON_OFFSETS in UnitVisualHelpers.ts";
        desc.style.cssText =
            "margin: 0 0 12px 0; color: #aaa; font-size: 11px; line-height: 1.4;";
        this.weaponOffsetPanelEl.appendChild(desc);

        // List semua weapons yang sudah attach
        if (this.currentUnit.weapons && this.currentUnit.weapons.length > 0) {
            const weaponsTitle = document.createElement("div");
            weaponsTitle.textContent = `Attached Weapons (${this.currentUnit.weapons.length})`;
            weaponsTitle.style.cssText =
                "color: #ffd700; font-weight: bold; margin-bottom: 8px;";
            this.weaponOffsetPanelEl.appendChild(weaponsTitle);

            this.currentUnit.weapons.forEach((weapon, idx) => {
                const weaponName = weapon.name || `weapon_${idx}`;
                const boneName =
                    this._findParentBone(weapon)?.name || "unknown";

                // Get current offset dari WEAPON_OFFSETS atau default
                const currentOffset: WeaponOffset = WEAPON_OFFSETS[
                    weaponName
                ] || {
                    pos: [0, 0, 0],
                    rot: [0, 0, 0],
                    scale: [1, 1, 1],
                };

                const ui = createWeaponOffsetUI(
                    weaponName,
                    boneName,
                    JSON.parse(JSON.stringify(currentOffset)), // Deep copy
                    (offset) => {
                        // Update weapon transform real-time
                        weapon.position.set(...offset.pos);
                        weapon.rotation.set(...offset.rot);
                        weapon.scale.set(...offset.scale);

                        // Update WEAPON_OFFSETS for export
                        WEAPON_OFFSETS[weaponName] = offset;

                        console.log(
                            `[WeaponOffset] Updated ${weaponName}: ${formatOffsetForCode(weaponName, offset)}`,
                        );
                    },
                );
                this.weaponOffsetPanelEl!.appendChild(ui);
            });
        } else {
            const noWeapons = document.createElement("div");
            noWeapons.textContent = "❌ No weapons attached to this character";
            noWeapons.style.cssText =
                "color: #888; font-size: 12px; padding: 8px;";
            this.weaponOffsetPanelEl.appendChild(noWeapons);
        }
    }

    // ── Find parent bone of a weapon mesh ──
    private _findParentBone(obj: THREE.Object3D): THREE.Bone | null {
        let current: THREE.Object3D | null = obj.parent;
        while (current) {
            if (current instanceof THREE.Bone) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }

    // ── Navigasi ──
    nextCharacter(): void {
        if (!this.assetsReady || this._isDisposed) return;
        this.showCharacter(this.currentIndex + 1);
    }

    prevCharacter(): void {
        if (!this.assetsReady || this._isDisposed) return;
        this.showCharacter(this.currentIndex - 1);
    }

    // ── Render loop (dipanggil dari luar) ──
    startRenderLoop(): void {
        if (this._isDisposed) return;
        this._visible = true;

        const loop = (_timestamp: number) => {
            if (!this._visible || this._isDisposed) {
                this.animId = 0;
                return;
            }

            const delta = Math.min(this.clock.getDelta(), 1 / 15);

            // Update animation mixer
            if (this.currentUnit?.mixer) {
                this.currentUnit.mixer.update(delta);
            }

            // Update OrbitControls
            this.controls.update();

            // Update FX (partikel skill)
            updateFX(delta);

            // Sanitize scene: remove null/invalid objects
            this._sanitizeSceneGraph();

            // Render
            try {
                this.renderer.render(this.scene, this.camera);
            } catch (err) {
                console.error("[CharacterViewer] Render error:", err);
            }

            this.animId = requestAnimationFrame(loop);
        };

        this.animId = requestAnimationFrame(loop);
    }

    stopRenderLoop(): void {
        this._visible = false;
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = 0;
        }
    }

    // ── Helper: cari bone dalam hierarchy ──
    private _findBone(
        root: THREE.Group,
        boneName: string,
    ): THREE.Object3D | null {
        let found: THREE.Object3D | null = null;
        root.traverse((child) => {
            if (child.name.toLowerCase().includes(boneName.toLowerCase())) {
                found = child;
            }
        });
        return found;
    }

    // ── Dispose unit aktif ──
    private _disposeCurrentUnit(): void {
        if (this.autoReturnTimeout) {
            clearTimeout(this.autoReturnTimeout);
            this.autoReturnTimeout = null;
        }
        if (this.currentUnit) {
            this.currentUnit.dispose();
            this.currentUnit = null;
        }
        if (this.unitMaterial) {
            this.unitMaterial.dispose();
            this.unitMaterial = null;
        }
        // Hapus semua objek dari scene (FX leftover, dll.)
        // Jangan hapus lights!
        const toRemove: THREE.Object3D[] = [];
        this.scene.traverse((child) => {
            if (
                child !== this.scene &&
                !(child instanceof THREE.Light) &&
                !(child instanceof THREE.Camera)
            ) {
                toRemove.push(child);
            }
        });
        toRemove.forEach((c) => {
            if (c.parent) c.parent.remove(c);
        });
    }

    // ── Sanitize scene graph: remove null/invalid objects before render ──
    private _sanitizeSceneGraph(): void {
        const toRemove: THREE.Object3D[] = [];
        this.scene.traverse((obj) => {
            // Check jika object atau geometri/material sudah di-dispose
            if (!obj.parent || obj.parent === null) {
                if (obj !== this.scene) {
                    toRemove.push(obj);
                }
            }
            // Cek mesh dengan invalid geometry
            if (obj instanceof THREE.Mesh) {
                if (!obj.geometry || !obj.material) {
                    toRemove.push(obj);
                }
            }
        });

        toRemove.forEach((obj) => {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
        });
    }

    // ── Full dispose ──
    dispose(): void {
        this._isDisposed = true;
        this.stopRenderLoop();
        this._disposeCurrentUnit();
        this.controls.dispose();
        this.renderer.dispose();
        // Bersihkan model cache
        this.modelCache = {};
        this.animRigs = {};
        this.assetsReady = false;
    }
}
