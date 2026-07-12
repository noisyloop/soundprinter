import type { Landmark } from "./hash";
import type { ReferenceIndex } from "./fingerprint";
import {
  MIN_MATCH_PURITY,
  MIN_MATCH_SCORE,
  OFFSET_TOLERANCE,
  SECONDS_PER_FRAME,
} from "./params";

export interface MatchResult {
  refId: string;
  /** Aligned landmark pairs in the winning offset bin (± tolerance). */
  score: number;
  /** 0..1 heuristic combining absolute support and spike dominance. */
  confidence: number;
  /** Fraction of this reference's hash collisions that were aligned. */
  purity: number;
  /** Total hash collisions with this reference at any offset. */
  totalCollisions: number;
  /** Winning offset (frames): refTime − queryTime. Negative when the
   *  reference starts partway into the query. */
  offsetFrames: number;
  /** Matched region in the query (seconds). */
  queryStartSec: number;
  queryEndSec: number;
  /** Matched region within the reference (seconds). */
  refStartSec: number;
  refEndSec: number;
  /** Full offset histogram for the explainability panel. */
  histogram: { offsetFrames: number; count: number }[];
  /** Aligned (queryT, refT) anchor pairs, for overlays. */
  alignedPairs: { queryT: number; refT: number }[];
}

interface Spike {
  offset: number;
  score: number;
  pairs: { queryT: number; refT: number }[];
  minQ: number;
  maxQ: number;
}

/**
 * Match a query fingerprint against the reference index.
 *
 * For every query landmark whose hash collides with a reference landmark we
 * record offset = refAnchorT − queryAnchorT. Random collisions scatter across
 * offsets; a genuine reuse puts many pairs at one offset, producing a tall
 * spike in that reference's offset histogram. The spike height is the score,
 * and the time span of the pairs in the spike localizes the reuse.
 */
export function matchQuery(
  queryLandmarks: Landmark[],
  index: ReferenceIndex
): MatchResult[] {
  // refId → (offset → pairs at that offset)
  const byRef = new Map<string, Map<number, { queryT: number; refT: number }[]>>();

  for (const lm of queryLandmarks) {
    const postings = index.lookup(lm.hash);
    if (!postings) continue;
    for (const post of postings) {
      const offset = post.anchorT - lm.anchorT;
      let offsets = byRef.get(post.refId);
      if (!offsets) byRef.set(post.refId, (offsets = new Map()));
      let pairs = offsets.get(offset);
      if (!pairs) offsets.set(offset, (pairs = []));
      pairs.push({ queryT: lm.anchorT, refT: post.anchorT });
    }
  }

  const results: MatchResult[] = [];

  for (const [refId, offsets] of byRef) {
    let totalCollisions = 0;
    for (const pairs of offsets.values()) totalCollisions += pairs.length;

    const histogram = [...offsets.entries()]
      .map(([offsetFrames, pairs]) => ({ offsetFrames, count: pairs.length }))
      .sort((a, b) => a.offsetFrames - b.offsetFrames);

    // Greedily decompose the histogram into non-overlapping spikes: for each
    // offset, the score of its ±tolerance window; accept spikes strongest
    // first, suppressing offsets adjacent to an accepted spike.
    const windowScore = (offset: number): number => {
      let count = 0;
      for (let d = -OFFSET_TOLERANCE; d <= OFFSET_TOLERANCE; d++) {
        count += offsets.get(offset + d)?.length ?? 0;
      }
      return count;
    };
    const candidates = [...offsets.keys()]
      .map((offset) => ({ offset, score: windowScore(offset) }))
      .sort((a, b) => b.score - a.score);

    const spikes: Spike[] = [];
    const minSeparation = OFFSET_TOLERANCE * 2 + 1;
    for (const c of candidates) {
      if (c.score < MIN_MATCH_SCORE) break;
      if (spikes.some((s) => Math.abs(c.offset - s.offset) < minSeparation)) continue;
      const pairs: { queryT: number; refT: number }[] = [];
      for (let d = -OFFSET_TOLERANCE; d <= OFFSET_TOLERANCE; d++) {
        const p = offsets.get(c.offset + d);
        if (p) pairs.push(...p);
      }
      pairs.sort((a, b) => a.queryT - b.queryT);
      let minQ = Infinity, maxQ = -Infinity;
      for (const p of pairs) {
        if (p.queryT < minQ) minQ = p.queryT;
        if (p.queryT > maxQ) maxQ = p.queryT;
      }
      spikes.push({ offset: c.offset, score: c.score, pairs, minQ, maxQ });
    }
    if (spikes.length === 0) continue;

    // Self-similar audio (steady chords, repeating phrases) produces echo
    // spikes at nearby offsets covering the SAME query region as the true
    // alignment. Genuine repeated reuse occupies a DIFFERENT query region.
    // So: accept spikes strongest-first, rejecting any whose query region
    // substantially overlaps an accepted one; the strongest rejected spike
    // becomes the "runner-up" that drags confidence down.
    const accepted: Spike[] = [];
    let runnerUp = 0;
    for (const spike of spikes) {
      const overlapsAccepted = accepted.some((a) => {
        const overlap =
          Math.min(a.maxQ, spike.maxQ) - Math.max(a.minQ, spike.minQ);
        const shorter = Math.min(a.maxQ - a.minQ, spike.maxQ - spike.minQ);
        return overlap > 0.5 * Math.max(1, shorter);
      });
      const strongEnough =
        spike.score >= MIN_MATCH_SCORE &&
        spike.score >= 0.35 * spikes[0].score;
      if (!overlapsAccepted && strongEnough && accepted.length < 8) {
        accepted.push(spike);
      } else if (spike.score > runnerUp) {
        runnerUp = spike.score;
      }
    }

    const topPurity = totalCollisions > 0 ? spikes[0].score / totalCollisions : 0;
    if (topPurity < MIN_MATCH_PURITY) continue;

    for (const spike of accepted) {
      let minR = Infinity, maxR = -Infinity;
      for (const p of spike.pairs) {
        if (p.refT < minR) minR = p.refT;
        if (p.refT > maxR) maxR = p.refT;
      }

      // Confidence = absolute support × dominance over the best competing
      // alignment for the same audio. A tall lone spike scores near 1; a
      // spike barely above the histogram noise floor scores low.
      const support = Math.min(1, spike.score / 40);
      const dominance = spike.score / (spike.score + runnerUp);
      const confidence = Math.min(1, support * dominance);

      results.push({
        refId,
        score: spike.score,
        confidence,
        purity: totalCollisions > 0 ? spike.score / totalCollisions : 0,
        totalCollisions,
        offsetFrames: spike.offset,
        queryStartSec: spike.minQ * SECONDS_PER_FRAME,
        queryEndSec: spike.maxQ * SECONDS_PER_FRAME,
        refStartSec: minR * SECONDS_PER_FRAME,
        refEndSec: maxR * SECONDS_PER_FRAME,
        histogram,
        alignedPairs: spike.pairs,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
