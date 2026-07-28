import * as THREE from "three";

class SoundManager {
    private ctx: AudioContext | null = null;
    private noiseBuffer: AudioBuffer | null = null;

    init() {
        if (this.ctx) return;
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioCtx();
            // Pre-create a noise buffer for wind/slash/ice crackle effects
            const sampleRate = this.ctx.sampleRate;
            const bufferSize = sampleRate * 1.0; // 1 second of noise
            this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        } catch (e) {
            console.warn("Failed to initialize Web Audio API:", e);
        }
    }

    private getVolumeScale(x: number, y: number, z: number, cameraPos: THREE.Vector3): number {
        const dx = x - cameraPos.x;
        const dy = y - cameraPos.y;
        const dz = z - cameraPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Fade out completely by 55 units distance
        return Math.max(0.0, Math.min(1.0, 1.0 - dist / 55.0));
    }

    // Tank Melee Attack / Slash
    playSlash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;

        const now = this.ctx.currentTime;
        
        // 1. Noise Node for the air cut / swoosh
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(800, now);
            filter.frequency.exponentialRampToValueAtTime(150, now + 0.12);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);
            noise.stop(now + 0.13);
        }

        // 2. Low-frequency pitch impact (thud)
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

        oscGain.gain.setValueAtTime(0.4 * vol, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.11);
    }

    // Archer Bow Release / Arrow Shot
    playBow(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);

        gain.gain.setValueAtTime(0.25 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    // Mage Spell / Magic Sphere Basic Attack
    playMagicCast(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.2);

        gain.gain.setValueAtTime(0.2 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.21);
    }

    // Mage Chain Lightning Surge
    playLightning(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(60, now);
        // Crackling frequency vibration
        osc.frequency.linearRampToValueAtTime(320, now + 0.08);
        osc.frequency.linearRampToValueAtTime(150, now + 0.16);
        osc.frequency.linearRampToValueAtTime(450, now + 0.25);

        gain.gain.setValueAtTime(0.3 * vol, now);
        // Flicker voltage gain drops
        gain.gain.linearRampToValueAtTime(0.05 * vol, now + 0.08);
        gain.gain.linearRampToValueAtTime(0.25 * vol, now + 0.16);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
    }

    // Ice Block Freeze / Shatter Crunch
    playIceShatter(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;

        const now = this.ctx.currentTime;
        if (!this.noiseBuffer) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.linearRampToValueAtTime(2200, now + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + 0.23);
    }

    // Holy Healing spell chime sound effect
    playHeal(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3); // rising frequency for holy spell

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.25 * vol, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.31);
    }
}

export const soundFX = new SoundManager();
