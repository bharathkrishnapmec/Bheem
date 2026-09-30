import { balance } from '@/config/balance';
import type { SaveSettings } from '@/core/SaveManager';

/** Procedural Web Audio SFX + adaptive music. No external audio files required (swap-in ready). */
export type SfxId =
  | 'swing'
  | 'swingHeavy'
  | 'hit'
  | 'hitHeavy'
  | 'deflect'
  | 'bowDraw'
  | 'bowFull'
  | 'bowShoot'
  | 'arrowHit'
  | 'bolt'
  | 'clapCharge'
  | 'thunder'
  | 'jump'
  | 'land'
  | 'dash'
  | 'hurt'
  | 'playerDeath'
  | 'enemyDeath'
  | 'coin'
  | 'pickup'
  | 'heal'
  | 'free'
  | 'shrine'
  | 'purchase'
  | 'deny'
  | 'summon'
  | 'bannerHit'
  | 'bannerBreak'
  | 'liberate'
  | 'telegraph'
  | 'slam'
  | 'roar'
  | 'uiMove'
  | 'uiConfirm'
  | 'uiBack'
  | 'step'
  | 'gate'
  | 'chest'
  | 'hexCast'
  | 'glyph'
  | 'squadHorn';
export type MusicId = 'none' | 'menu' | 'explore' | 'boss' | 'victory';

const SCALE = [0, 1, 4, 5, 7, 8, 11]; // Bhairav-flavoured mode
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class AudioManagerImpl {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private baseLayer!: GainNode;
  private combatLayer!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private track: MusicId = 'none';
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private combat = false;
  private lastPlay = new Map<SfxId, number>();
  private settings = { master: 0.8, music: 0.6, sfx: 0.8 };
  muted = false;
  private drone: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  /** Create/resume the context. Must be called from a user gesture at least once. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.baseLayer = this.ctx.createGain();
        this.combatLayer = this.ctx.createGain();
        this.combatLayer.gain.value = 0;
        this.baseLayer.connect(this.musicBus);
        this.combatLayer.connect(this.musicBus);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolumes();
        if (this.track !== 'none') this.startTrack(this.track);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) {
      console.warn('[Audio] unavailable', e);
      this.ctx = null;
    }
  }

  setVolumes(s: Pick<SaveSettings, 'master' | 'music' | 'sfx'>): void {
    this.settings = { master: s.master, music: s.music, sfx: s.sfx };
    this.applyVolumes();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.settings.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx * 0.7, t, 0.05);
  }

  /** Temporarily lowers music (e.g. banner break / boss death). */
  duck(ms: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    const target = this.settings.music * 0.5;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(target * Math.pow(10, balance.audio.duckDb / 20), t, 0.05);
    g.setTargetAtTime(target, t + ms / 1000, 0.3);
  }

  // ------------------------------------------------------------ primitives
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; attack?: number; when?: number; dest?: AudioNode; pan?: number } = {}): void {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    let out: AudioNode = g;
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p);
      out = p;
    }
    out.connect(opts.dest ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, opts: { type?: BiquadFilterType; slide?: number; q?: number; when?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const t = opts.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slide), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.dest ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(id: SfxId, opts: { pan?: number; vol?: number } = {}): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const minGap = id === 'coin' || id === 'step' ? 40 : 25;
    if (now - (this.lastPlay.get(id) ?? 0) < minGap) return;
    this.lastPlay.set(id, now);
    const v = opts.vol ?? 1;
    const r = 1 + (Math.random() - 0.5) * 0.08;
    const pan = opts.pan;
    switch (id) {
      case 'swing':
        this.noise(0.12, 0.35 * v, 1800 * r, { slide: 600, q: 0.8 });
        break;
      case 'swingHeavy':
        this.noise(0.2, 0.45 * v, 1200 * r, { slide: 300, q: 0.7 });
        this.tone(140, 0.15, 'triangle', 0.15 * v, { slide: 70 });
        break;
      case 'hit':
        this.noise(0.08, 0.5 * v, 2500 * r, { type: 'highpass' });
        this.tone(220 * r, 0.08, 'square', 0.12 * v, { slide: 90, pan });
        break;
      case 'hitHeavy':
        this.noise(0.14, 0.6 * v, 900, { slide: 200 });
        this.tone(110, 0.18, 'sawtooth', 0.2 * v, { slide: 45, pan });
        break;
      case 'deflect':
        this.tone(1800, 0.25, 'triangle', 0.25 * v, { slide: 2400 });
        this.tone(2700, 0.18, 'sine', 0.12 * v);
        break;
      case 'bowDraw':
        this.noise(0.25, 0.12 * v, 400, { slide: 1200, q: 4 });
        break;
      case 'bowFull':
        this.tone(1320, 0.18, 'sine', 0.2 * v);
        this.tone(1980, 0.22, 'sine', 0.12 * v, { when: this.ctx.currentTime + 0.05 });
        break;
      case 'bowShoot':
        this.tone(320 * r, 0.1, 'triangle', 0.25 * v, { slide: 120 });
        this.noise(0.1, 0.2 * v, 3000, { type: 'highpass' });
        break;
      case 'arrowHit':
        this.noise(0.06, 0.4 * v, 1500, { q: 2 });
        this.tone(180, 0.05, 'square', 0.1 * v, { pan });
        break;
      case 'bolt':
        this.noise(0.25, 0.4 * v, 5000, { type: 'highpass', slide: 2000 });
        this.tone(900, 0.15, 'sawtooth', 0.12 * v, { slide: 200 });
        break;
      case 'clapCharge':
        this.tone(200, 0.9, 'sawtooth', 0.06 * v, { slide: 800, attack: 0.3 });
        break;
      case 'thunder':
        this.noise(1.1, 0.8 * v, 600, { type: 'lowpass', slide: 60 });
        this.tone(60, 0.8, 'sine', 0.5 * v, { slide: 30 });
        this.noise(0.15, 0.5 * v, 6000, { type: 'highpass' });
        break;
      case 'jump':
        this.tone(300, 0.1, 'square', 0.06 * v, { slide: 520 });
        break;
      case 'land':
        this.noise(0.08, 0.2 * v, 300, { type: 'lowpass' });
        break;
      case 'dash':
        this.noise(0.18, 0.35 * v, 800, { slide: 3000, q: 1.5 });
        break;
      case 'hurt':
        this.tone(260, 0.2, 'square', 0.2 * v, { slide: 110 });
        this.noise(0.1, 0.3 * v, 1200);
        break;
      case 'playerDeath':
        this.tone(330, 1.2, 'triangle', 0.3 * v, { slide: 60 });
        this.tone(165, 1.4, 'sine', 0.3 * v, { slide: 40 });
        break;
      case 'enemyDeath':
        this.noise(0.3, 0.35 * v, 700, { slide: 150 });
        this.tone(200 * r, 0.25, 'sawtooth', 0.1 * v, { slide: 50, pan });
        break;
      case 'coin':
        this.tone(1568 * r, 0.08, 'square', 0.07 * v);
        this.tone(2093 * r, 0.12, 'square', 0.07 * v, { when: this.ctx.currentTime + 0.05 });
        break;
      case 'pickup':
        this.tone(660, 0.1, 'triangle', 0.15 * v, { slide: 990 });
        break;
      case 'heal':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.15 * v, { when: this.ctx!.currentTime + i * 0.06 }));
        break;
      case 'free':
        [587, 740, 880, 1175].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15 * v, { when: this.ctx!.currentTime + i * 0.08 }));
        break;
      case 'shrine':
        [294, 440, 587, 880].forEach((f, i) => this.tone(f, 1.2, 'sine', 0.12 * v, { when: this.ctx!.currentTime + i * 0.12, attack: 0.05 }));
        break;
      case 'purchase':
        [784, 988, 1319].forEach((f, i) => this.tone(f, 0.2, 'square', 0.08 * v, { when: this.ctx!.currentTime + i * 0.07 }));
        break;
      case 'deny':
        this.tone(140, 0.18, 'square', 0.15 * v);
        this.tone(110, 0.2, 'square', 0.15 * v, { when: this.ctx.currentTime + 0.1 });
        break;
      case 'summon':
      case 'squadHorn':
        this.tone(220, 0.7, 'sawtooth', 0.15 * v, { slide: 294, attack: 0.08 });
        this.tone(330, 0.7, 'sawtooth', 0.1 * v, { slide: 440, attack: 0.08 });
        break;
      case 'bannerHit':
        this.noise(0.1, 0.35 * v, 900, { q: 1.2 });
        this.tone(160, 0.1, 'triangle', 0.15 * v);
        break;
      case 'bannerBreak':
        this.noise(0.6, 0.6 * v, 400, { slide: 80 });
        this.tone(90, 0.5, 'sawtooth', 0.25 * v, { slide: 40 });
        break;
      case 'liberate':
        [587, 740, 880, 1175, 1480].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.14 * v, { when: this.ctx!.currentTime + i * 0.1 }));
        break;
      case 'telegraph':
        this.tone(880, 0.12, 'square', 0.08 * v, { pan });
        break;
      case 'slam':
        this.noise(0.5, 0.7 * v, 300, { type: 'lowpass', slide: 50 });
        this.tone(70, 0.4, 'sine', 0.5 * v, { slide: 35 });
        break;
      case 'roar':
        this.noise(1.4, 0.5 * v, 300, { slide: 150, q: 3 });
        this.tone(80, 1.4, 'sawtooth', 0.3 * v, { slide: 55, attack: 0.2 });
        break;
      case 'uiMove':
        this.tone(660, 0.05, 'square', 0.05 * v);
        break;
      case 'uiConfirm':
        this.tone(880, 0.08, 'square', 0.07 * v);
        this.tone(1320, 0.1, 'square', 0.06 * v, { when: this.ctx.currentTime + 0.05 });
        break;
      case 'uiBack':
        this.tone(440, 0.08, 'square', 0.06 * v, { slide: 330 });
        break;
      case 'step':
        this.noise(0.04, 0.08 * v, 500, { type: 'lowpass' });
        break;
      case 'gate':
        this.noise(0.8, 0.4 * v, 250, { type: 'lowpass' });
        this.tone(55, 0.8, 'sawtooth', 0.12 * v);
        break;
      case 'chest':
        this.tone(392, 0.1, 'triangle', 0.15 * v);
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.2, 'sine', 0.1 * v, { when: this.ctx!.currentTime + 0.1 + i * 0.06 }));
        break;
      case 'hexCast':
        this.tone(300, 0.4, 'sine', 0.12 * v, { slide: 150, pan });
        this.tone(307, 0.4, 'sine', 0.12 * v, { slide: 155, pan });
        break;
      case 'glyph':
        this.tone(200, 0.9, 'triangle', 0.12 * v, { slide: 400, attack: 0.3 });
        break;
    }
  }

  // ------------------------------------------------------------ music
  setMusic(id: MusicId): void {
    if (id === this.track) return;
    this.track = id;
    if (this.ctx) this.startTrack(id);
  }

  setCombat(on: boolean): void {
    if (on === this.combat) return;
    this.combat = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = balance.audio.combatCrossfadeMs / 1000 / 3;
    this.combatLayer.gain.setTargetAtTime(on ? 1 : 0, t, s);
    this.baseLayer.gain.setTargetAtTime(on ? 0.7 : 1, t, s);
  }

  private startTrack(id: MusicId): void {
    const ctx = this.ctx!;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stopDrone();
    if (id === 'none') return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    const root = id === 'boss' ? 38 : id === 'victory' ? 50 : 50; // D
    this.startDrone(midi(root - 12), id === 'boss' ? 0.05 : 0.035);
    this.timer = window.setInterval(() => this.schedule(id, root), 25);
  }

  private startDrone(f: number, vol: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(vol, ctx.currentTime, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const osc = [f, f * 1.5, f * 2.003].map((fr) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(lp);
      o.start();
      return o;
    });
    lp.connect(gain).connect(this.baseLayer);
    this.drone = { osc, gain };
  }

  private stopDrone(): void {
    if (!this.drone || !this.ctx) return;
    const d = this.drone;
    d.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    window.setTimeout(() => d.osc.forEach((o) => o.stop()), 1500);
    this.drone = null;
  }

  private schedule(id: MusicId, root: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const bpm = id === 'boss' ? 132 : id === 'victory' ? 100 : id === 'menu' ? 72 : 92;
    const stepDur = 60 / bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.musicStep(id, root, this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private musicStep(id: MusicId, root: number, i: number, t: number, sd: number): void {
    const bar = Math.floor(i / 16) % 8;
    const s = i % 16;
    const note = (deg: number, oct = 0) => {
      const d = ((deg % 7) + 7) % 7;
      return midi(root + SCALE[d]! + 12 * (oct + Math.floor(deg / 7)));
    };
    const base = this.baseLayer;
    const cmb = this.combatLayer;
    // deterministic pseudo-melody
    const h = (n: number) => {
      const x = Math.sin(n * 12.9898 + bar * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    if (id === 'victory') {
      const arp = [0, 2, 4, 7, 4, 2];
      if (s % 2 === 0) this.tone(note(arp[(i / 2) % arp.length]!, 1), sd * 3, 'triangle', 0.12, { when: t, dest: base });
      if (s === 0) this.tone(note(0, -1), sd * 16, 'sine', 0.15, { when: t, dest: base, attack: 0.05 });
      return;
    }
    if (id === 'menu') {
      if (s === 0 || (s === 10 && h(i) > 0.4)) this.tone(note(Math.floor(h(i + 3) * 7), 1), sd * 8, 'triangle', 0.09, { when: t, dest: base, attack: 0.02 });
      return;
    }
    const melodyEvery = id === 'boss' ? 2 : 4;
    if (s % melodyEvery === 0 && h(i) > (id === 'boss' ? 0.35 : 0.55)) {
      const deg = Math.floor(h(i + 7) * 9) - 1;
      this.tone(note(deg, 1), sd * 3, id === 'boss' ? 'sawtooth' : 'triangle', id === 'boss' ? 0.05 : 0.08, { when: t, dest: base });
    }
    // tabla-ish percussion (combat layer, and always in boss)
    const perc = id === 'boss' ? base : cmb;
    const dha = [0, 6, 8, 11];
    const na = [3, 4, 10, 14, 15];
    if (dha.includes(s)) this.tone(id === 'boss' ? 90 : 120, 0.18, 'sine', 0.35, { when: t, slide: 55, dest: perc });
    if (na.includes(s)) this.noise(0.05, 0.18, 3500, { when: t, type: 'highpass', dest: perc });
    if (s % 4 === 2) this.tone(note(0, -1), sd * 2, 'square', 0.05, { when: t, dest: perc });
    if (id === 'boss' && s % 8 === 4) this.noise(0.15, 0.25, 1800, { when: t, dest: perc });
  }
}

export const AudioManager = new AudioManagerImpl();
