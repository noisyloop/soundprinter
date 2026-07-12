import type { Fingerprint } from "./dsp/fingerprint";
import type { ReferenceMeta } from "./synth/songs";
import type { MatchResult } from "./dsp/match";
import type { PlantedSegment } from "./synth/query";

export interface ReferenceEntry {
  id: string;
  name: string;
  samples: Float32Array;
  fingerprint: Fingerprint;
  meta: ReferenceMeta;
  builtIn: boolean;
  /** Stable hue (degrees) used everywhere this reference is visualized. */
  hue: number;
}

export interface QueryState {
  name: string;
  samples: Float32Array;
  fingerprint: Fingerprint | null;
  /** Ground truth, only known for the built-in demo query. */
  planted: PlantedSegment[] | null;
}

export interface AnalysisState {
  results: MatchResult[];
  /** Total landmarks extracted from the query, for the explainability text. */
  queryLandmarkCount: number;
  analyzedAtMs: number;
}
