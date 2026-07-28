import * as THREE from "three";

class SoundManager {
    private ctx: AudioContext | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    // ponytail: throttle — cegah suara menumpuk dalam waktu singkat
    private lastPlayed: Record<string, number> = {};
    private readonly THROTTLE_MS: Record<string, number> = {
        slash: 40,
        bow: 60,
        magicCast: 70,
        lightning: 0, // chain lightning boleh tiap kali
        iceShatter: 50,
        heal: 80,
        death: 30,
        spawn: 100,
        dash: 100,
        arrowVolley: 0, // ulti — no throttle, biar mewah
        fireball: 0,
        shieldBash: 0,
    };

    init() {
        if (this.ctx) return;
        try {
            const AudioCtx =
                window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioCtx();
            const sampleRate = this.ctx.sampleRate;
            const bufferSize = sampleRate * 1.0;
            this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        } catch (e) {
            console.warn("Failed to initialize Web Audio API:", e);
        }
    }

    // ponytail: throttle gate — return false jika terlalu cepat sejak terakhir
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

    private tone(
        type: OscillatorType,
        freq: number,
        vol: number,
        startTime: number,
    ): [OscillatorNode, GainNode] {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(vol, startTime);
        osc.connect(gain);
        return [osc, gain];
    }

    private out(gain: GainNode, pan: number = 0) {
        if (pan === 0) {
            gain.connect(this.ctx!.destination);
        } else {
            const panner = this.ctx!.createStereoPanner();
            panner.pan.value = pan;
            gain.connect(panner);
            panner.connect(this.ctx!.destination);
        }
    }

    // Tank Melee — slash + metal clang + thud
    playSlash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("slash")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(900, now);
            filter.frequency.exponentialRampToValueAtTime(120, now + 0.14);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.3 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            noise.connect(filter);
            filter.connect(gain);
            this.out(gain, pan);
            noise.start(now);
            noise.stop(now + 0.15);
        }

        const [ringOsc, ringGain] = this.tone("square", 2200, 0.15 * vol, now);
        ringOsc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
        ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        this.out(ringGain, pan);
        ringOsc.start(now);
        ringOsc.stop(now + 0.08);

        const [thud, thudGain] = this.tone("triangle", 160, 0.45 * vol, now);
        thud.frequency.exponentialRampToValueAtTime(35, now + 0.12);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        this.out(thudGain, pan);
        thud.start(now);
        thud.stop(now + 0.13);
    }

    // Archer Basic & Skill 1 — string twang + arrow whistle
    playBow(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("bow")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const [twang, twangGain] = this.tone("sine", 900, 0.2 * vol, now);
        twang.frequency.exponentialRampToValueAtTime(250, now + 0.06);
        twangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        this.out(twangGain, pan);
        twang.start(now);
        twang.stop(now + 0.08);

        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(1200, now);
            filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.12 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            noise.connect(filter);
            filter.connect(gain);
            this.out(gain, pan);
            noise.start(now);
            noise.stop(now + 0.17);
        }

        const [tick, tickGain] = this.tone("sine", 1800, 0.1 * vol, now);
        tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        this.out(tickGain, pan);
        tick.start(now);
        tick.stop(now + 0.04);
    }

    // Ultimate: Arrow Volley — epic rain of arrows, descending swarm
    playArrowVolley(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("arrowVolley")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        // Layer 1: multiple bow twangs staggered — swarm effect
        const twangFreqs = [900, 750, 1050, 600];
        for (let i = 0; i < twangFreqs.length; i++) {
            const t = now + i * 0.04;
            const [tw, twGain] = this.tone(
                "sine",
                twangFreqs[i],
                0.15 * vol,
                t,
            );
            tw.frequency.exponentialRampToValueAtTime(200, t + 0.08);
            twGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            this.out(twGain, pan * (0.7 + Math.random() * 0.6));
            tw.start(t);
            tw.stop(t + 0.1);
        }

        // Layer 2: descending mass whoosh — noise bandpass sweeping down
        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.setValueAtTime(1800, now);
            bp.frequency.exponentialRampToValueAtTime(80, now + 0.6);
            const ngain = this.ctx.createGain();
            ngain.gain.setValueAtTime(0.2 * vol, now);
            ngain.gain.linearRampToValueAtTime(0.28 * vol, now + 0.15);
            ngain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            noise.connect(bp);
            bp.connect(ngain);
            this.out(ngain, pan);
            noise.start(now);
            noise.stop(now + 0.61);
        }

        // Layer 3: war horn — low sawtooth growl
        const [horn, hornGain] = this.tone("sawtooth", 80, 0.2 * vol, now);
        horn.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        hornGain.gain.setValueAtTime(0.2 * vol, now);
        hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        this.out(hornGain, 0);
        horn.start(now);
        horn.stop(now + 0.51);

        // Layer 4: impact rain — multiple low thuds staggered
        for (let i = 0; i < 5; i++) {
            const t2 = now + 0.3 + i * 0.06;
            const [thud, thudGain] = this.tone("triangle", 120, 0.18 * vol, t2);
            thud.frequency.exponentialRampToValueAtTime(25, t2 + 0.15);
            thudGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.16);
            this.out(thudGain, pan * (0.5 + Math.random()));
            thud.start(t2);
            thud.stop(t2 + 0.17);
        }
    }

    // Evasive Leap — quick whoosh + fwip
    playDash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("dash")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        if (this.noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(700, now);
            filter.frequency.exponentialRampToValueAtTime(180, now + 0.12);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.18 * vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            noise.connect(filter);
            filter.connect(gain);
            this.out(gain, pan);
            noise.start(now);
            noise.stop(now + 0.14);
        }

        const [fwip, fwipGain] = this.tone("sine", 500, 0.1 * vol, now);
        fwip.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        fwipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        this.out(fwipGain, pan);
        fwip.start(now);
        fwip.stop(now + 0.12);
    }

    // Mage Basic — arcane whoosh naik
    playMagicCast(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("magicCast")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const [sweep, sweepGain] = this.tone("triangle", 200, 0.18 * vol, now);
        sweep.frequency.exponentialRampToValueAtTime(900, now + 0.22);
        sweepGain.gain.setValueAtTime(0.18 * vol, now);
        sweepGain.gain.linearRampToValueAtTime(0.22 * vol, now + 0.08);
        sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        this.out(sweepGain, pan);
        sweep.start(now);
        sweep.stop(now + 0.23);

        const [flutter, flGain] = this.tone("sine", 600, 0.08 * vol, now);
        flutter.frequency.setValueAtTime(600, now);
        flutter.frequency.linearRampToValueAtTime(620, now + 0.04);
        flutter.frequency.linearRampToValueAtTime(590, now + 0.08);
        flutter.frequency.exponentialRampToValueAtTime(350, now + 0.18);
        flGain.gain.setValueAtTime(0.08 * vol, now);
        flGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        this.out(flGain, pan);
        flutter.start(now);
        flutter.stop(now + 0.2);
    }

    // Ultimate: Meteor Fireball — deep rumble + explosion + debris
    playFireball(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("fireball")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        // Layer 1: deep earthquake rumble
        const [rumble, rumbleGain] = this.tone("sawtooth", 25, 0.35 * vol, now);
        rumble.frequency.exponentialRampToValueAtTime(10, now + 0.7);
        rumbleGain.gain.setValueAtTime(0.35 * vol, now);
        rumbleGain.gain.linearRampToValueAtTime(0.4 * vol, now + 0.2);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        this.out(rumbleGain, 0);
        rumble.start(now);
        rumble.stop(now + 0.71);

        // Layer 2: explosion blast — noise burst
        if (this.noiseBuffer) {
            const blast = this.ctx.createBufferSource();
            blast.buffer = this.noiseBuffer;
            const lp = this.ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.setValueAtTime(600, now);
            lp.frequency.exponentialRampToValueAtTime(50, now + 0.4);
            const bgain = this.ctx.createGain();
            bgain.gain.setValueAtTime(0.4 * vol, now);
            bgain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            blast.connect(lp);
            lp.connect(bgain);
            this.out(bgain, pan);
            blast.start(now);
            blast.stop(now + 0.41);
        }

        // Layer 3: high crack — sine spike
        const [crack, crackGain] = this.tone("sine", 3000, 0.2 * vol, now);
        crack.frequency.exponentialRampToValueAtTime(200, now + 0.3);
        crackGain.gain.setValueAtTime(0.2 * vol, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.31);
        this.out(crackGain, pan);
        crack.start(now);
        crack.stop(now + 0.32);

        // Layer 4: debris sizzle — highpass noise scatter
        if (this.noiseBuffer) {
            for (let i = 0; i < 3; i++) {
                const t = now + i * 0.06;
                const sp = this.ctx.createBufferSource();
                sp.buffer = this.noiseBuffer;
                const hp = this.ctx.createBiquadFilter();
                hp.type = "highpass";
                hp.frequency.setValueAtTime(4000, t);
                const sgain = this.ctx.createGain();
                sgain.gain.setValueAtTime(0.08 * vol, t);
                sgain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                sp.connect(hp);
                hp.connect(sgain);
                this.out(sgain, pan * (0.5 + Math.random()));
                sp.start(t);
                sp.stop(t + 0.13);
            }
        }
    }

    // Ultimate: Shield Bash — heavy metal crash + chain rattle
    playShieldBash(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("shieldBash")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        // Layer 1: heavy impact — square wave clang
        const [clang, clangGain] = this.tone("square", 300, 0.3 * vol, now);
        clang.frequency.exponentialRampToValueAtTime(40, now + 0.18);
        clangGain.gain.setValueAtTime(0.3 * vol, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        this.out(clangGain, pan);
        clang.start(now);
        clang.stop(now + 0.2);

        // Layer 2: ringing metal overtone
        const [ring, ringGain] = this.tone("sine", 1600, 0.18 * vol, now);
        ring.frequency.exponentialRampToValueAtTime(900, now + 0.25);
        ringGain.gain.setValueAtTime(0.18 * vol, now);
        ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        this.out(ringGain, pan);
        ring.start(now);
        ring.stop(now + 0.27);

        // Layer 3: noise crunch — impact debris
        if (this.noiseBuffer) {
            const cr = this.ctx.createBufferSource();
            cr.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.setValueAtTime(500, now);
            bp.frequency.exponentialRampToValueAtTime(60, now + 0.15);
            const cgain = this.ctx.createGain();
            cgain.gain.setValueAtTime(0.22 * vol, now);
            cgain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            cr.connect(bp);
            bp.connect(cgain);
            this.out(cgain, pan);
            cr.start(now);
            cr.stop(now + 0.17);
        }

        // Layer 4: secondary thud (tameng ketemu tanah)
        const [thud, thudGain] = this.tone(
            "triangle",
            50,
            0.25 * vol,
            now + 0.08,
        );
        thud.frequency.exponentialRampToValueAtTime(15, now + 0.28);
        thudGain.gain.setValueAtTime(0.25 * vol, now + 0.08);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
        this.out(thudGain, pan);
        thud.start(now + 0.08);
        thud.stop(now + 0.3);
    }

    // Chain Lightning — electrical crackle
    playLightning(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("lightning")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const [crack, crackGain] = this.tone("sawtooth", 55, 0.25 * vol, now);
        crack.frequency.linearRampToValueAtTime(340, now + 0.09);
        crack.frequency.linearRampToValueAtTime(140, now + 0.17);
        crack.frequency.linearRampToValueAtTime(480, now + 0.26);
        crackGain.gain.setValueAtTime(0.25 * vol, now);
        crackGain.gain.linearRampToValueAtTime(0.04 * vol, now + 0.09);
        crackGain.gain.linearRampToValueAtTime(0.22 * vol, now + 0.17);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        this.out(crackGain, pan);
        crack.start(now);
        crack.stop(now + 0.27);

        if (this.noiseBuffer) {
            const spark = this.ctx.createBufferSource();
            spark.buffer = this.noiseBuffer;
            const hp = this.ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.setValueAtTime(3000, now);
            const sgain = this.ctx.createGain();
            sgain.gain.setValueAtTime(0.12 * vol, now);
            sgain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            spark.connect(hp);
            hp.connect(sgain);
            this.out(sgain, pan);
            spark.start(now);
            spark.stop(now + 0.16);
        }
    }

    // Ice Shatter — glassy crunch
    playIceShatter(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("iceShatter")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        if (!this.noiseBuffer) return;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.linearRampToValueAtTime(2400, now + 0.18);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.35 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        noise.connect(filter);
        filter.connect(gain);
        this.out(gain, pan);
        noise.start(now);
        noise.stop(now + 0.23);

        const [ping, pingGain] = this.tone("sine", 2800, 0.15 * vol, now);
        ping.frequency.exponentialRampToValueAtTime(4000, now + 0.06);
        pingGain.gain.setValueAtTime(0.15 * vol, now);
        pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        this.out(pingGain, pan);
        ping.start(now);
        ping.stop(now + 0.08);

        const [rumble, rumbleGain] = this.tone("triangle", 90, 0.2 * vol, now);
        rumble.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        rumbleGain.gain.setValueAtTime(0.2 * vol, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        this.out(rumbleGain, pan);
        rumble.start(now);
        rumble.stop(now + 0.17);
    }

    // Holy Heal — major chord chime, sparkling ascend
    playHeal(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("heal")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const freqs = [523, 659, 784];
        for (const freq of freqs) {
            const [chime, chimeGain] = this.tone("sine", freq, 0.04 * vol, now);
            chime.frequency.exponentialRampToValueAtTime(
                freq * 1.5,
                now + 0.35,
            );
            chimeGain.gain.setValueAtTime(0.01, now);
            chimeGain.gain.linearRampToValueAtTime(0.08 * vol, now + 0.06);
            chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            this.out(chimeGain, pan);
            chime.start(now);
            chime.stop(now + 0.36);
        }

        const [spark, sparkGain] = this.tone("sine", 1047, 0.03 * vol, now);
        spark.frequency.exponentialRampToValueAtTime(1568, now + 0.4);
        sparkGain.gain.setValueAtTime(0.01, now);
        sparkGain.gain.linearRampToValueAtTime(0.05 * vol, now + 0.08);
        sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        this.out(sparkGain, pan);
        spark.start(now);
        spark.stop(now + 0.41);
    }

    // Unit Death — low rumble crash + noise decay
    playDeath(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.noiseBuffer || !this.throttle("death")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const [rumble, rumbleGain] = this.tone("triangle", 70, 0.3 * vol, now);
        rumble.frequency.exponentialRampToValueAtTime(18, now + 0.5);
        rumbleGain.gain.setValueAtTime(0.3 * vol, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        this.out(rumbleGain, pan);
        rumble.start(now);
        rumble.stop(now + 0.51);

        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(400, now);
        bp.frequency.exponentialRampToValueAtTime(80, now + 0.4);
        const ngain = this.ctx.createGain();
        ngain.gain.setValueAtTime(0.15 * vol, now);
        ngain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noise.connect(bp);
        bp.connect(ngain);
        this.out(ngain, pan);
        noise.start(now);
        noise.stop(now + 0.41);
    }

    // Unit Spawn — rising shimmer, short
    playSpawn(x: number, y: number, z: number, cameraPos: THREE.Vector3) {
        if (!this.ctx || !this.throttle("spawn")) return;
        const vol = this.getVolumeScale(x, y, z, cameraPos);
        if (vol <= 0.01) return;
        const now = this.ctx.currentTime;
        const pan = Math.min(1, Math.max(-1, (x - cameraPos.x) / 30));

        const [shimmer, shGain] = this.tone("sine", 300, 0.05 * vol, now);
        shimmer.frequency.exponentialRampToValueAtTime(900, now + 0.25);
        shGain.gain.setValueAtTime(0.01, now);
        shGain.gain.linearRampToValueAtTime(0.12 * vol, now + 0.08);
        shGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        this.out(shGain, pan);
        shimmer.start(now);
        shimmer.stop(now + 0.26);

        const [sh2, sh2Gain] = this.tone("sine", 450, 0.03 * vol, now + 0.05);
        sh2.frequency.exponentialRampToValueAtTime(1100, now + 0.3);
        sh2Gain.gain.setValueAtTime(0.01, now + 0.05);
        sh2Gain.gain.linearRampToValueAtTime(0.07 * vol, now + 0.13);
        sh2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        this.out(sh2Gain, pan);
        sh2.start(now + 0.05);
        sh2.stop(now + 0.31);
    }

    // Victory fanfare — major chord arpeggio
    playVictory() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [523, 659, 784, 1047];
        for (let i = 0; i < notes.length; i++) {
            const t = now + i * 0.12;
            const [osc, gain] = this.tone("triangle", notes[i], 0.18, t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            this.out(gain, 0);
            osc.start(t);
            osc.stop(t + 0.51);
        }
    }

    // Defeat sound — descending minor
    playDefeat() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [659, 523, 440];
        for (let i = 0; i < notes.length; i++) {
            const t = now + i * 0.2;
            const [osc, gain] = this.tone("sawtooth", notes[i], 0.1, t);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            this.out(gain, 0);
            osc.start(t);
            osc.stop(t + 0.41);
        }
        const [tail, tailGain] = this.tone("triangle", 40, 0.15, now + 0.6);
        tailGain.gain.setValueAtTime(0.15, now + 0.6);
        tailGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        this.out(tailGain, 0);
        tail.start(now + 0.6);
        tail.stop(now + 1.21);
    }
}

export const soundFX = new SoundManager();
