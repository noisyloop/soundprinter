import { SAMPLE_RATE } from "../dsp/params";

/**
 * A tiny offline additive/FM synth used to generate the built-in demo
 * library. Everything renders straight into Float32Array at the analysis
 * sample rate — no AudioContext needed, so it also runs in Node for tests.
 */

export type Timbre =
  | "pluck" // bright additive pluck, fast decay
  | "pad" // detuned saw-ish pad, slow attack
  | "bell" // FM bell, inharmonic sparkle
  | "bass" // dark additive bass, punchy
  | "organ"; // steady drawbar-style partials

export interface NoteEvent {
  /** Onset in seconds. */
  time: number;
  /** Fundamental frequency in Hz. */
  freq: number;
  /** Length in seconds. */
  dur: number;
  /** Linear gain 0..1. */
  gain: number;
  timbre: Timbre;
}

interface Partial {
  ratio: number;
  amp: number;
}

const TIMBRE_PARTIALS: Record<Timbre, Partial[]> = {
  pluck: [
    { ratio: 1, amp: 1 },
    { ratio: 2, amp: 0.55 },
    { ratio: 3, amp: 0.35 },
    { ratio: 4, amp: 0.2 },
    { ratio: 5, amp: 0.12 },
  ],
  pad: [
    { ratio: 1, amp: 1 },
    { ratio: 1.005, amp: 0.8 },
    { ratio: 2, amp: 0.4 },
    { ratio: 2.01, amp: 0.3 },
    { ratio: 3, amp: 0.18 },
  ],
  bell: [
    { ratio: 1, amp: 1 },
    { ratio: 2.76, amp: 0.6 },
    { ratio: 5.4, amp: 0.35 },
    { ratio: 8.93, amp: 0.15 },
  ],
  bass: [
    { ratio: 0.5, amp: 0.9 },
    { ratio: 1, amp: 1 },
    { ratio: 2, amp: 0.35 },
    { ratio: 3, amp: 0.1 },
  ],
  organ: [
    { ratio: 0.5, amp: 0.6 },
    { ratio: 1, amp: 1 },
    { ratio: 2, amp: 0.7 },
    { ratio: 3, amp: 0.45 },
    { ratio: 4, amp: 0.3 },
    { ratio: 6, amp: 0.15 },
  ],
};

function envelope(timbre: Timbre, t: number, dur: number): number {
  switch (timbre) {
    case "pluck":
      return t < 0.005 ? t / 0.005 : Math.exp(-4.5 * t);
    case "bell":
      return t < 0.003 ? t / 0.003 : Math.exp(-3 * t);
    case "bass":
      return t < 0.008 ? t / 0.008 : Math.exp(-6 * (t / dur)) * (1 - t / dur);
    case "pad": {
      const attack = Math.min(1, t / (dur * 0.3));
      const release = Math.min(1, (dur - t) / (dur * 0.35));
      return attack * release;
    }
    case "organ": {
      const attack = Math.min(1, t / 0.02);
      const release = Math.min(1, (dur - t) / 0.05);
      return attack * Math.max(0, release);
    }
  }
}

/** Render one note additively into `out` (accumulates). */
export function renderNote(out: Float32Array, note: NoteEvent): void {
  const start = Math.floor(note.time * SAMPLE_RATE);
  const len = Math.min(
    Math.floor(note.dur * SAMPLE_RATE),
    out.length - start
  );
  if (len <= 0 || start < 0) return;

  const partials = TIMBRE_PARTIALS[note.timbre];
  const nyquist = SAMPLE_RATE / 2 - 200;
  for (const p of partials) {
    const freq = note.freq * p.ratio;
    if (freq >= nyquist || freq < 20) continue;
    const w = (2 * Math.PI * freq) / SAMPLE_RATE;
    const amp = note.gain * p.amp;
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      out[start + i] += amp * envelope(note.timbre, t, note.dur) * Math.sin(w * i);
    }
  }
}

/** Short filtered-noise burst — hats/shaker-style percussion. */
export function renderNoiseBurst(
  out: Float32Array,
  time: number,
  dur: number,
  gain: number,
  rand: () => number,
  bright: boolean
): void {
  const start = Math.floor(time * SAMPLE_RATE);
  const len = Math.min(Math.floor(dur * SAMPLE_RATE), out.length - start);
  if (len <= 0 || start < 0) return;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const white = rand() * 2 - 1;
    // One-pole high-pass (bright) or low-pass (dark) shaping.
    const shaped = bright ? white - prev * 0.7 : prev * 0.85 + white * 0.15;
    prev = bright ? white : shaped;
    out[start + i] += gain * shaped * Math.exp((-8 * i) / len);
  }
}

/** Normalize a buffer to a target peak (no-op for silence). */
export function normalize(buf: Float32Array, targetPeak = 0.9): void {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-9) return;
  const g = targetPeak / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}

/** MIDI note number → Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
