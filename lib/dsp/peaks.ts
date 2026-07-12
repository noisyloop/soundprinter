import type { Spectrogram } from "./stft";
import {
  MAX_PEAKS_PER_SECOND,
  PEAK_NEIGHBORHOOD_F,
  PEAK_NEIGHBORHOOD_T,
  PEAK_THRESHOLD_DB,
  SECONDS_PER_FRAME,
} from "./params";

export interface Peak {
  /** Frame index (time axis). */
  t: number;
  /** Frequency bin index. */
  f: number;
  /** Log magnitude (dB), used for ranking. */
  mag: number;
}

/**
 * Constellation extraction: a point (t, f) is a peak when it is the strict
 * maximum of its 2D neighborhood and sits sufficiently above the spectrogram's
 * mean level. Peaks are then thinned to a bounded density by keeping the
 * strongest per one-second slice, so loud passages don't dominate the map.
 */
export function findPeaks(spec: Spectrogram): Peak[] {
  const { mags, numFrames, numBins } = spec;
  if (numFrames === 0) return [];

  let mean = 0;
  for (let i = 0; i < mags.length; i++) mean += mags[i];
  mean /= mags.length;
  const threshold = mean + PEAK_THRESHOLD_DB;

  const candidates: Peak[] = [];
  for (let t = 0; t < numFrames; t++) {
    const base = t * numBins;
    // Skip bin 0 (DC) and the topmost bins the anti-alias filter empties out.
    for (let f = 1; f < numBins - 1; f++) {
      const v = mags[base + f];
      if (v <= threshold) continue;

      let isMax = true;
      const t0 = Math.max(0, t - PEAK_NEIGHBORHOOD_T);
      const t1 = Math.min(numFrames - 1, t + PEAK_NEIGHBORHOOD_T);
      const f0 = Math.max(1, f - PEAK_NEIGHBORHOOD_F);
      const f1 = Math.min(numBins - 1, f + PEAK_NEIGHBORHOOD_F);
      for (let tt = t0; tt <= t1 && isMax; tt++) {
        const b = tt * numBins;
        for (let ff = f0; ff <= f1; ff++) {
          if (tt === t && ff === f) continue;
          if (mags[b + ff] >= v) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) candidates.push({ t, f, mag: v });
    }
  }

  // Density cap: strongest peaks per one-second bucket.
  const framesPerSecond = Math.round(1 / SECONDS_PER_FRAME);
  const buckets = new Map<number, Peak[]>();
  for (const p of candidates) {
    const key = Math.floor(p.t / framesPerSecond);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(p);
  }

  const kept: Peak[] = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => b.mag - a.mag);
    kept.push(...list.slice(0, MAX_PEAKS_PER_SECOND));
  }
  kept.sort((a, b) => a.t - b.t || a.f - b.f);
  return kept;
}
