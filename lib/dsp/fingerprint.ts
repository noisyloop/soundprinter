import { computeSpectrogram, type Spectrogram } from "./stft";
import { findPeaks, type Peak } from "./peaks";
import { computeLandmarks, type Landmark } from "./hash";

export interface Fingerprint {
  spectrogram: Spectrogram;
  peaks: Peak[];
  landmarks: Landmark[];
}

/** Full pipeline for one clip: STFT → constellation → landmark hashes. */
export function fingerprint(samples: Float32Array): Fingerprint {
  const spectrogram = computeSpectrogram(samples);
  const peaks = findPeaks(spectrogram);
  const landmarks = computeLandmarks(peaks);
  return { spectrogram, peaks, landmarks };
}

/** One posting in the inverted index: which reference, at what anchor time. */
export interface Posting {
  refId: string;
  anchorT: number;
}

/** In-memory inverted index: hash → all (reference, anchor time) postings. */
export class ReferenceIndex {
  private readonly table = new Map<number, Posting[]>();
  private readonly hashCounts = new Map<string, number>();

  add(refId: string, landmarks: Landmark[]): void {
    for (const lm of landmarks) {
      let postings = this.table.get(lm.hash);
      if (!postings) this.table.set(lm.hash, (postings = []));
      postings.push({ refId, anchorT: lm.anchorT });
    }
    this.hashCounts.set(refId, landmarks.length);
  }

  remove(refId: string): void {
    for (const [hash, postings] of this.table) {
      const filtered = postings.filter((p) => p.refId !== refId);
      if (filtered.length === 0) this.table.delete(hash);
      else if (filtered.length !== postings.length) this.table.set(hash, filtered);
    }
    this.hashCounts.delete(refId);
  }

  lookup(hash: number): Posting[] | undefined {
    return this.table.get(hash);
  }

  landmarkCount(refId: string): number {
    return this.hashCounts.get(refId) ?? 0;
  }

  get size(): number {
    return this.table.size;
  }
}
