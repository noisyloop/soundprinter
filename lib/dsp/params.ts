/**
 * Shared fingerprinting parameters. Everything downstream (hashes, offsets,
 * timecodes) is expressed in terms of these, so they live in one place.
 */

/** Internal analysis sample rate. All audio is resampled to this. */
export const SAMPLE_RATE = 11025;

/** STFT window size (samples). 1024 @ 11025 Hz ≈ 93 ms, ~10.8 Hz per bin. */
export const FFT_SIZE = 1024;

/** Hop between frames — 50% overlap. One frame ≈ 46.4 ms. */
export const HOP_SIZE = FFT_SIZE / 2;

/** Number of usable spectrogram bins (positive frequencies). */
export const NUM_BINS = FFT_SIZE / 2; // 512 → 9 bits

/** Seconds per STFT frame (hop). */
export const SECONDS_PER_FRAME = HOP_SIZE / SAMPLE_RATE;

// --- Peak picking ---------------------------------------------------------

/** Half-width of the local-max neighborhood along the time axis (frames). */
export const PEAK_NEIGHBORHOOD_T = 3;

/** Half-width of the local-max neighborhood along the frequency axis (bins). */
export const PEAK_NEIGHBORHOOD_F = 9;

/** Keep at most this many peaks per second of audio (strongest first). */
export const MAX_PEAKS_PER_SECOND = 30;

/** Peaks must exceed the spectrogram's mean log-magnitude by this many dB. */
export const PEAK_THRESHOLD_DB = 6;

// --- Combinatorial hashing -------------------------------------------------

/** Target zone: pair the anchor with peaks 1..MAX_DT frames ahead. */
export const TARGET_ZONE_MIN_DT = 1;
export const TARGET_ZONE_MAX_DT = 63; // 6 bits, ≈ 2.9 s ahead

/** Target zone frequency half-width (bins) around the anchor frequency. */
export const TARGET_ZONE_F = 127;

/** Max pairs generated per anchor peak (fan-out). */
export const FAN_OUT = 8;

// --- Matching --------------------------------------------------------------

/** Offsets within ± this many frames of the histogram peak count as aligned. */
export const OFFSET_TOLERANCE = 2;

/** Minimum aligned-pair count for a match to be reported at all. */
export const MIN_MATCH_SCORE = 12;

/** Minimum fraction of a reference's collisions that must be aligned
 *  (applied to the strongest spike only — self-similar audio spreads
 *  collisions across echo offsets, diluting purity for real matches too). */
export const MIN_MATCH_PURITY = 0.1;
