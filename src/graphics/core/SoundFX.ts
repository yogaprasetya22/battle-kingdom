import * as THREE from "three";

// Map throttle name → MP3 filename di public/sounds/
const SOUND_FILE: Record<string, string> = {
    slash: "slash.mp3",
    bow: "bow.mp3",
    arrowVolley: "arrow_volley.mp3",
    dash: "dash.mp3",
    magicCast: "magic_cast.mp3",
    fireball: "fireball.mp3",
    shieldBash: "shield_bash.mp3",
    lightning: "lightning.mp3",
    iceShatter: "ice_shatter.mp3",
    heal: "heal.mp3",
    death: "death_3.mp3",
    spawn: "spawn.mp3",
    victory: "victory.mp3",
    defeat: "defeat.mp3",
};

class SoundManager {
    private ctx: AudioContext | null = null;
    private buffers = new Map<string, AudioBuffer>();
    private loading: Promise<void> | null = null;

    // ponytail: throttle — cegah chaos; basic attack & death dikunci keras
    private lastPlayed: Record<string, number> = {};
    private readonly THROTTLE_MS: Record<string, number> = {
        slash: 180,
        bow: 200,
        magicCast: 200,
        lightning: 0,
        iceShatter: 120,
        heal: 200,
        death: 250,
        spawn: 150,
        dash: 200,
        arrowVolley: 0,
        fireball: 0,
        shieldBash: 0,
    };

    init() {
        if (this.ctx) return;
        try {
            const AudioCtx =
                window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioCtx();
            this._preloadAll();
        } catch (e) {
            console.warn("Failed to initialize Web Audio API:", e);
        }
    }

    // ponytail: preload semua mp3 async — silent fail kalau belum siap
    private _preloadAll() {
        if (this.loading) return;
        this.loading = Promise.all(
            Object.entries(SOUND_FILE).map(([name, file]) =>
                fetch(`/sounds/${file}`)
                    .then((r) => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.arrayBuffer();
                    })
                    .then((buf) => this.ctx!.decodeAudioData(buf))
                    .then((audio) => this.buffers.set(name, audio))
                    .catch((e) =>
                        console.warn(`Gagal load /sounds/${file}:`, e),
                    ),
            ),
        ).then(() => {});
    }

    private throttle(name: string): boolean {
        const now = performance.now();
        const minGap = this.THROTTLE_MS[name] ?? 0;
        if (minGap > 0) {
            const last = this.lastPlayed[name] ?? 0;
            if (now - last < minGap) return false;
        }
        this.lastPlayed[name] = now;
        return true;
    }

    private getVolumeScale(
        x: number,
        y: number,
        z: number,
        cameraPos: THREE.Vector3,
    ): number {
        const dx = x - cameraPos.x;
        const dy = y - cameraPos.y;
        const dz = z - cameraPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return Math.max(0.0, Math.min(1.0, 1.0 - dist / 55.0));
    }

    /** Putar buffer dengan volume + stereo pan */
    private playBuf(
        name: string,
        vol: number,
        pan: number = 0,
        rate: number = 1.0,
    ) {
        const buf = this.buffers.get(name);
        if (!buf || !this.ctx) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buf;
        source.playbackRate.value = rate;

        const gain = this.ctx.createGain();
        gain.gain.value = vol;

        if (pan === 0) {
            source.connect(gain);
            gain.connect(this.ctx.destination);
        } else {
            const panner = this.ctx.createStereoPanner();
            panner.pan.value = pan;
            source.connect(gain);
            gain.connect(panner);
            panner.connect(this.ctx.destination);
        }

        source.start(0);
        // source & nodes auto-GC setelah buffer habis
    }

    // ── Volume hierarchy: Ulti (1.0) > skill menengah (0.5) > basic (0.40) > death (0.3) ──

    playSlash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("slash")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "slash",
            vol * 0.4,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playBow(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("bow")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "bow",
            vol * 0.4,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playArrowVolley(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("arrowVolley")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "arrowVolley",
            vol * 1.0,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playDash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("dash")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "dash",
            vol * 0.45,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playMagicCast(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("magicCast")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "magicCast",
            vol * 0.4,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playFireball(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("fireball")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "fireball",
            vol * 1.0,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playShieldBash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("shieldBash")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "shieldBash",
            vol * 1.0,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playLightning(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("lightning")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "lightning",
            vol * 0.9,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playIceShatter(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("iceShatter")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "iceShatter",
            vol * 0.45,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playHeal(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("heal")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "heal",
            vol * 0.5,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playDeath(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("death")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "death",
            vol * 0.3,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playSpawn(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("spawn")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        this.playBuf(
            "spawn",
            vol * 0.45,
            Math.min(1, Math.max(-1, (x - cameraPos.x) / 30)),
        );
    }

    playVictory() {
        if (!this.ctx) return;
        this.playBuf("victory", 0.8, 0);
    }

    playDefeat() {
        if (!this.ctx) return;
        this.playBuf("defeat", 0.8, 0);
    }
}

export const soundFX = new SoundManager();
