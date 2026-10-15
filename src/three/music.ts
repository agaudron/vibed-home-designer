import { ctx } from './shotgun';

/**
 * Shotgun-mode soundtrack: an original, Doom-flavoured metal loop synthesised with Web Audio
 * (gallop riff on distorted power chords, bass, drums and a lead every other pass).
 * You can also load your own audio file instead; it stays in the browser and is only played locally.
 */

const BPM = 168;
const STEP = 60 / BPM / 4; // a 16th note
const LOOP = 64; // 4 bars of 16ths

const E = 40;
const Fs = 42;
const G = 43;
const A = 45;
const Bb = 46;
const C = 48;

type Beat = 'g' | [number, number]; // gallop on low E, or a power chord [root, beats]
const RIFF: Beat[][] = [
  ['g', 'g', 'g', [G, 1]],
  ['g', 'g', [A, 1], [G, 1]],
  ['g', 'g', 'g', [Bb, 1]],
  [[A, 2], [C, 1], [Fs, 1]],
];
/** Lead line in 8th notes (MIDI, 0 = rest). */
const LEAD = [
  71, 74, 76, 79, 78, 76, 74, 71, 69, 71, 74, 76, 74, 71, 69, 67, 71, 74, 76, 79, 81, 79, 76, 74, 76, 74, 71, 69, 67, 69, 71, 0,
];

interface Ev {
  step: number;
  root: number;
  len: number; // in steps
  chord: boolean;
}

const EVENTS: Ev[] = (() => {
  const out: Ev[] = [];
  RIFF.forEach((bar, bi) => {
    let beat = 0;
    for (const b of bar) {
      const s = bi * 16 + beat * 4;
      if (b === 'g') {
        out.push({ step: s, root: E, len: 2, chord: false }, { step: s + 2, root: E, len: 1, chord: false }, { step: s + 3, root: E, len: 1, chord: false });
        beat += 1;
      } else {
        out.push({ step: s, root: b[0], len: b[1] * 4, chord: true });
        beat += b[1];
      }
    }
  });
  return out;
})();

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function distortion(a: AudioContext, k: number) {
  const ws = a.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

export class Music {
  private a: AudioContext | null = null;
  private master: GainNode | null = null;
  private guitar: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private step = 0;
  private next = 0;
  private loops = 0;
  private file: HTMLAudioElement | null = null;
  private fileUrl = '';
  playing = false;
  muted = false;

  start() {
    if (this.playing) return;
    this.playing = true;
    if (this.muted) return;
    this.resume();
  }

  stop() {
    this.playing = false;
    this.pause();
  }

  /** Returns true if now muted. */
  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.pause();
    else if (this.playing) this.resume();
    return this.muted;
  }

  /** A file of your own has been chosen. */
  get hasFile() {
    return !!this.file;
  }

  /** Play a file of your own (looped) instead of the built-in track. */
  useFile(f: File) {
    this.pause();
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = URL.createObjectURL(f);
    this.file = new Audio(this.fileUrl);
    this.file.loop = true;
    this.file.volume = 0.6;
    if (this.playing && !this.muted) this.resume();
  }

  private resume() {
    if (this.file) {
      this.file.play().catch(() => {});
      return;
    }
    const a = ctx();
    if (!a) return;
    if (!this.master) this.setup(a);
    this.a = a;
    this.step = 0;
    this.next = a.currentTime + 0.05;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  private pause() {
    clearInterval(this.timer);
    this.timer = 0;
    this.file?.pause();
    // Let already-scheduled notes ring out quietly rather than cutting with a click.
    if (this.master && this.a) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.a.currentTime);
      g.setValueAtTime(g.value, this.a.currentTime);
      g.linearRampToValueAtTime(0, this.a.currentTime + 0.15);
      g.setValueAtTime(0.32, this.a.currentTime + 0.6);
    }
  }

  private setup(a: AudioContext) {
    this.master = a.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(a.destination);
    // Guitar: distortion → cab-ish filtering.
    const drive = distortion(a, 60);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const mid = a.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 800;
    mid.gain.value = -5;
    const out = a.createGain();
    out.gain.value = 0.32;
    drive.connect(lp).connect(mid).connect(out).connect(this.master);
    this.guitar = drive;
    this.noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }

  private schedule() {
    const a = this.a;
    if (!a) return;
    // If the tab was in the background, skip ahead rather than playing a pile of notes at once.
    if (this.next < a.currentTime - 0.2) this.next = a.currentTime + 0.05;
    while (this.next < a.currentTime + 0.15) {
      this.play(this.step, this.next);
      this.next += STEP;
      this.step = (this.step + 1) % LOOP;
      if (this.step === 0) this.loops++;
    }
  }

  private play(step: number, t: number) {
    for (const ev of EVENTS) if (ev.step === step) this.chord(ev, t);
    const inBeat = step % 4;
    const beat = Math.floor(step / 4) % 4;
    const gallop = EVENTS.some((e) => !e.chord && e.step === step);
    // Drums: kick on the beat and with the gallop, snare on 2 and 4, hats on 8ths.
    if (inBeat === 0 || (gallop && inBeat !== 0 && beat % 2 === 0)) this.kick(t);
    if (inBeat === 0 && beat % 2 === 1) this.snare(t);
    if (inBeat % 2 === 0) this.hat(t, inBeat === 0 ? 0.12 : 0.07);
    if (step === 0 && this.loops % 4 === 0) this.crash(t);
    // Lead every other time round.
    if (this.loops % 2 === 1 && inBeat % 2 === 0) {
      const m = LEAD[step / 2];
      if (m) this.lead(m, t, STEP * 2);
    }
  }

  private chord(ev: Ev, t: number) {
    const a = this.a!;
    const dur = ev.len * STEP;
    const g = a.createGain();
    // Gallop notes are palm-muted (short, choked); chords ring.
    const ring = ev.chord ? dur * 0.95 : Math.min(dur, STEP * 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.chord ? 0.5 : 0.42, t + 0.004);
    g.gain.exponentialRampToValueAtTime(ev.chord ? 0.25 : 0.05, t + ring);
    g.gain.linearRampToValueAtTime(0, t + ring + 0.03);
    g.connect(this.guitar!);
    const notes = ev.chord ? [ev.root, ev.root + 7, ev.root + 12] : [ev.root, ev.root + 7];
    for (const [i, m] of notes.entries()) {
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = i === 0 ? -6 : 6;
      o.connect(g);
      o.start(t);
      o.stop(t + ring + 0.05);
    }
    // Bass doubles the root an octave down.
    const b = a.createOscillator();
    b.type = 'triangle';
    b.frequency.value = hz(ev.root - 12);
    const bg = a.createGain();
    bg.gain.setValueAtTime(0.45, t);
    bg.gain.exponentialRampToValueAtTime(0.01, t + ring + 0.02);
    b.connect(bg).connect(this.master!);
    b.start(t);
    b.stop(t + ring + 0.05);
  }

  private lead(m: number, t: number, dur: number) {
    const a = this.a!;
    const o = a.createOscillator();
    o.type = 'square';
    o.frequency.value = hz(m);
    const vib = a.createOscillator();
    vib.frequency.value = 6;
    const vg = a.createGain();
    vg.gain.value = 8;
    vib.connect(vg).connect(o.detune);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.01);
    g.gain.setValueAtTime(0.07, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const a = this.a!;
    const o = a.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = a.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.2);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, gain: number, dur: number) {
    const a = this.a!;
    const s = a.createBufferSource();
    s.buffer = this.noise;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5, dur + 0.02);
  }

  private snare(t: number) {
    this.noiseHit(t, 'bandpass', 1800, 0.6, 0.16);
    const a = this.a!;
    const o = a.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = a.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, gain: number) {
    this.noiseHit(t, 'highpass', 7000, gain, 0.04);
  }

  private crash(t: number) {
    this.noiseHit(t, 'highpass', 5000, 0.25, 1.2);
  }
}
