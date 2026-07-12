import { SAMPLE_RATE } from "../dsp/params";
import {
  midiToFreq,
  normalize,
  renderNoiseBurst,
  renderNote,
  type NoteEvent,
  type Timbre,
} from "./engine";
import { mulberry32 } from "./prng";

export interface ReferenceMeta {
  source?: string;
  license?: string;
  purchaseLink?: string;
}

export interface SyntheticSong {
  id: string;
  name: string;
  samples: Float32Array;
  meta: ReferenceMeta;
}

interface SongSpec {
  id: string;
  name: string;
  seed: number;
  bpm: number;
  bars: number;
  /** Chord progression as MIDI root notes, one chord per bar (loops). */
  roots: number[];
  /** Chord intervals in semitones from the root. */
  chord: number[];
  /** Scale (semitones from root of first chord) for the melody. */
  scale: number[];
  leadTimbre: Timbre;
  padTimbre: Timbre | null;
  bassTimbre: Timbre | null;
  hats: boolean;
  meta: ReferenceMeta;
}

const SPECS: SongSpec[] = [
  {
    id: "ref-neon-arcade",
    name: "Neon Arcade",
    seed: 101,
    bpm: 140,
    bars: 8,
    roots: [57, 53, 55, 52], // Am – F – G – E
    chord: [0, 3, 7],
    scale: [0, 2, 3, 5, 7, 8, 10, 12],
    leadTimbre: "pluck",
    padTimbre: null,
    bassTimbre: "bass",
    hats: true,
    meta: {
      source: "Built-in synth library",
      license: "Synthetic demo audio — generated in your browser at startup",
    },
  },
  {
    id: "ref-velvet-dusk",
    name: "Velvet Dusk",
    seed: 202,
    bpm: 76,
    bars: 4,
    roots: [50, 57, 55, 48], // Dm – Am – G – C
    chord: [0, 3, 7, 10],
    scale: [0, 2, 3, 5, 7, 9, 10, 12],
    leadTimbre: "pad",
    padTimbre: "pad",
    bassTimbre: null,
    hats: false,
    meta: {
      source: "Built-in synth library",
      license: "Synthetic demo audio — generated in your browser at startup",
    },
  },
  {
    id: "ref-clockwork-toy",
    name: "Clockwork Toy",
    seed: 303,
    bpm: 112,
    bars: 6,
    roots: [64, 62, 60, 67], // E – D – C – G
    chord: [0, 4, 7],
    scale: [0, 2, 4, 7, 9, 12, 14],
    leadTimbre: "bell",
    padTimbre: null,
    bassTimbre: null,
    hats: true,
    meta: {
      source: "Built-in synth library",
      license: "Synthetic demo audio — generated in your browser at startup",
    },
  },
  {
    id: "ref-basement-groove",
    name: "Basement Groove",
    seed: 404,
    bpm: 96,
    bars: 8,
    roots: [45, 45, 48, 43], // A – A – C – G (low)
    chord: [0, 7, 12],
    scale: [0, 3, 5, 6, 7, 10, 12],
    leadTimbre: "bass",
    padTimbre: null,
    bassTimbre: "bass",
    hats: true,
    meta: {
      source: "Built-in synth library",
      license: "Synthetic demo audio — generated in your browser at startup",
    },
  },
  {
    id: "ref-glass-cathedral",
    name: "Glass Cathedral",
    seed: 505,
    bpm: 60,
    bars: 4,
    roots: [60, 65, 67, 62], // C – F – G – Dm
    chord: [0, 4, 7, 12],
    scale: [0, 2, 4, 5, 7, 9, 11, 12],
    leadTimbre: "organ",
    padTimbre: "organ",
    bassTimbre: null,
    hats: false,
    meta: {
      source: "Built-in synth library",
      license: "Synthetic demo audio — generated in your browser at startup",
    },
  },
];

function renderSpec(spec: SongSpec): Float32Array {
  const rand = mulberry32(spec.seed);
  const secPerBeat = 60 / spec.bpm;
  const secPerBar = secPerBeat * 4;
  const totalSec = spec.bars * secPerBar + 1.5; // tail for decays
  const out = new Float32Array(Math.ceil(totalSec * SAMPLE_RATE));
  const notes: NoteEvent[] = [];

  const tonic = spec.roots[0];

  for (let bar = 0; bar < spec.bars; bar++) {
    const barStart = bar * secPerBar;
    const root = spec.roots[bar % spec.roots.length];

    // Pad: whole-bar chord.
    if (spec.padTimbre) {
      for (const interval of spec.chord) {
        notes.push({
          time: barStart,
          freq: midiToFreq(root + interval),
          dur: secPerBar * 0.98,
          gain: 0.16,
          timbre: spec.padTimbre,
        });
      }
    }

    // Bass: root on beats 1 and 3 (plus a passing note sometimes).
    if (spec.bassTimbre) {
      for (const beat of [0, 2]) {
        notes.push({
          time: barStart + beat * secPerBeat,
          freq: midiToFreq(root - 12),
          dur: secPerBeat * 0.9,
          gain: 0.4,
          timbre: spec.bassTimbre,
        });
      }
      if (rand() < 0.5) {
        notes.push({
          time: barStart + 3.5 * secPerBeat,
          freq: midiToFreq(root - 12 + (rand() < 0.5 ? 7 : 5)),
          dur: secPerBeat * 0.45,
          gain: 0.32,
          timbre: spec.bassTimbre,
        });
      }
    }

    // Lead: eighth-note melody walked over the scale.
    const eighth = secPerBeat / 2;
    let degree = Math.floor(rand() * spec.scale.length);
    for (let step = 0; step < 8; step++) {
      if (rand() < 0.25) continue; // rests keep the rhythm distinctive
      degree = Math.max(
        0,
        Math.min(
          spec.scale.length - 1,
          degree + Math.floor(rand() * 5) - 2
        )
      );
      notes.push({
        time: barStart + step * eighth,
        freq: midiToFreq(tonic + 12 + spec.scale[degree]),
        dur: eighth * (rand() < 0.3 ? 1.8 : 0.9),
        gain: 0.3,
        timbre: spec.leadTimbre,
      });
    }

    // Hats: offbeat noise bursts.
    if (spec.hats) {
      for (let beat = 0; beat < 4; beat++) {
        renderNoiseBurst(
          out,
          barStart + (beat + 0.5) * secPerBeat,
          0.05,
          0.12,
          rand,
          true
        );
      }
    }
  }

  for (const note of notes) renderNote(out, note);
  normalize(out, 0.85);
  return out;
}

/** Generate the five built-in reference "songs". Deterministic. */
export function generateLibrary(): SyntheticSong[] {
  return SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    samples: renderSpec(spec),
    meta: spec.meta,
  }));
}
