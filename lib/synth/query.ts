import { SAMPLE_RATE } from "../dsp/params";
import { midiToFreq, normalize, renderNoiseBurst, renderNote } from "./engine";
import { mulberry32 } from "./prng";
import type { SyntheticSong } from "./songs";

/** Ground truth for one segment planted into the demo query track. */
export interface PlantedSegment {
  refId: string;
  refName: string;
  /** Where the excerpt starts in the query (seconds). */
  startSec: number;
  /** Excerpt length (seconds). */
  durationSec: number;
  /** Non-null when the copy was transformed before embedding. */
  transform: string | null;
}

export interface DemoQuery {
  samples: Float32Array;
  planted: PlantedSegment[];
}

/**
 * Naive linear-interpolation resample. Speeds the clip up by `factor` and
 * raises its pitch by the same factor — exactly the kind of combined
 * pitch/tempo transform that landmark fingerprinting is blind to, which is
 * the point of the transformed segment in the demo.
 */
function resampleTransform(
  input: Float32Array,
  factor: number
): Float32Array<ArrayBuffer> {
  const outLen = Math.floor(input.length / factor);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * factor;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = input[i0];
    const b = input[Math.min(i0 + 1, input.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Mix `clip` into `out` starting at `startSec`, scaled by `gain`. */
function mixIn(
  out: Float32Array,
  clip: Float32Array,
  startSec: number,
  gain: number
): void {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.min(clip.length, out.length - start);
  for (let i = 0; i < len; i++) out[start + i] += clip[i] * gain;
}

/**
 * Build the demo "query track": original filler material (different scale,
 * different seed — deliberately absent from the library) with excerpts of
 * several references mixed in at fixed offsets. One embed is pitch-shifted /
 * time-stretched so it demonstrably evades landmark matching.
 */
export function buildDemoQuery(library: SyntheticSong[]): DemoQuery {
  const totalSec = 72;
  const out = new Float32Array(totalSec * SAMPLE_RATE);
  const rand = mulberry32(9999);

  // Filler: sparse whole-tone noodling + soft percussion, quiet enough that
  // the embedded excerpts stay clearly audible above it.
  const wholeTone = [0, 2, 4, 6, 8, 10];
  for (let beat = 0; beat < totalSec * 2; beat++) {
    const time = beat * 0.5;
    if (rand() < 0.4) {
      renderNote(out, {
        time,
        freq: midiToFreq(66 + wholeTone[Math.floor(rand() * wholeTone.length)]),
        dur: 0.4,
        gain: 0.07,
        timbre: "pluck",
      });
    }
    if (rand() < 0.3) {
      renderNoiseBurst(out, time + 0.25, 0.04, 0.03, rand, false);
    }
  }

  const byId = new Map(library.map((s) => [s.id, s]));
  const planted: PlantedSegment[] = [];

  const plant = (
    refId: string,
    startSec: number,
    excerptSec: number,
    transform: "pitch" | null
  ) => {
    const song = byId.get(refId);
    if (!song) return;
    let clip = song.samples.slice(
      0,
      Math.min(song.samples.length, Math.floor(excerptSec * SAMPLE_RATE))
    );
    let label: string | null = null;
    if (transform === "pitch") {
      clip = resampleTransform(clip, Math.pow(2, 1 / 12)); // +1 semitone, ~6% faster
      label = "pitch-shifted +1 semitone (resampled)";
    }
    mixIn(out, clip, startSec, 0.9);
    planted.push({
      refId,
      refName: song.name,
      startSec,
      durationSec: clip.length / SAMPLE_RATE,
      transform: label,
    });
  };

  plant("ref-neon-arcade", 6, 8, null);
  plant("ref-clockwork-toy", 22, 9, null);
  plant("ref-glass-cathedral", 38, 10, null);
  plant("ref-velvet-dusk", 56, 10, "pitch");

  normalize(out, 0.85);
  return { samples: out, planted };
}
