import type { Peak } from "./peaks";
import {
  FAN_OUT,
  TARGET_ZONE_F,
  TARGET_ZONE_MAX_DT,
  TARGET_ZONE_MIN_DT,
} from "./params";

export interface Landmark {
  /** Packed 24-bit hash: (anchorFreq << 15) | (targetFreq << 6) | dt. */
  hash: number;
  /** Anchor's absolute frame index within its clip. */
  anchorT: number;
}

/**
 * Combinatorial hashing (Wang 2003): each anchor peak is paired with up to
 * FAN_OUT peaks inside a forward "target zone". The pair's two frequencies
 * plus the time delta between them are packed into a single integer. The
 * anchor's absolute time rides along separately — it's what offset alignment
 * is computed from at match time.
 */
export function computeLandmarks(peaks: Peak[]): Landmark[] {
  const landmarks: Landmark[] = [];
  // `peaks` is sorted by time, so the target zone is a forward scan.
  for (let i = 0; i < peaks.length; i++) {
    const anchor = peaks[i];
    let paired = 0;
    for (let j = i + 1; j < peaks.length && paired < FAN_OUT; j++) {
      const target = peaks[j];
      const dt = target.t - anchor.t;
      if (dt < TARGET_ZONE_MIN_DT) continue;
      if (dt > TARGET_ZONE_MAX_DT) break;
      if (Math.abs(target.f - anchor.f) > TARGET_ZONE_F) continue;
      landmarks.push({
        hash: (anchor.f << 15) | (target.f << 6) | dt,
        anchorT: anchor.t,
      });
      paired++;
    }
  }
  return landmarks;
}
