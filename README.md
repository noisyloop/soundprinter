# Soundprinter

**Client-side audio fingerprinting and reuse detection.** Soundprinter detects
when a reference sound — a sample, a loop, a stem — reappears inside a track,
the way content-ID systems flag reused audio. It is a self-audit tool: load
the sounds you care about, load a track, and see exactly where (and how
confidently) the references occur, with the evidence laid out visually.

Everything runs in the browser. Audio is decoded, fingerprinted and matched
entirely client-side; nothing is uploaded anywhere, there is no backend, no
account, and no third-party API. The app is an original, clean-room
implementation of the classic landmark-fingerprinting approach described in
Avery Wang's 2003 paper *"An Industrial-Strength Audio Search Algorithm"* —
it uses no ACR libraries and no external audio database.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run test:dsp   # end-to-end pipeline test in Node (no browser needed)
```

On startup the app synthesizes five distinct reference "songs" locally
(different chord progressions, tempos and timbres) and a 72-second demo query
track that hides excerpts of several of them at fixed offsets — so the first
**Analyze** is guaranteed to demonstrate real detections, with ground truth
shown for comparison. You can then drag in your own audio as additional
references or as the query.

## The algorithm

The pipeline turns audio into a sparse set of integer hashes and reduces
"does this reference occur in that track?" to counting hash collisions that
agree on a time offset.

### 1. Decode and resample

User files are decoded with Web Audio's `decodeAudioData`, then rendered
through an `OfflineAudioContext` to downmix to mono and resample to
**11 025 Hz** (`lib/audio/decode.ts`). Fingerprinting only needs the coarse
spectral shape below ~5 kHz, and the low rate makes everything cheap.

### 2. Spectrogram (STFT)

A hand-written radix-2 FFT (`lib/dsp/fft.ts`) computes a short-time Fourier
transform: **1024-sample Hann windows, 50 % overlap** (hop = 512 ≈ 46 ms per
frame, ~10.8 Hz per bin), stored as log-magnitude (`lib/dsp/stft.ts`).

### 3. Peak picking — the constellation

A point in the time–frequency plane becomes a *peak* if it is the strict
maximum of its 2D neighborhood (±3 frames × ±9 bins) and sits at least 6 dB
above the spectrogram's mean level. Peaks are then thinned to at most 30 per
second, strongest first, so loud passages don't dominate (`lib/dsp/peaks.ts`).
The result is a sparse "constellation" of the perceptually dominant spectral
points — robust to added noise and mixing, because a superimposed quieter
signal rarely displaces the peaks of a louder one.

### 4. Combinatorial hashing — landmarks

Single peaks are not distinctive; *pairs* are. Each peak acts as an **anchor**
and is paired with up to 8 subsequent peaks inside a forward **target zone**
(1–63 frames ahead, within ±127 bins). Each pair is packed into one 24-bit
integer (`lib/dsp/hash.ts`):

```
hash = (freq_anchor << 15) | (freq_target << 6) | Δt
        9 bits              9 bits               6 bits
```

The anchor's absolute frame index rides along with the hash. Crucially, the
hash itself contains only *relative* information (two frequencies and a time
delta), so the same audio produces the same hashes no matter where it sits in
a track.

### 5. Reference index — the data model

The reference database is an in-memory inverted index
(`lib/dsp/fingerprint.ts`):

```
Map<hash, Array<{ refId, anchorT }>>
```

Every reference contributes its landmarks; a typical few-second clip yields a
few thousand. References can be added and removed at runtime. Alongside the
audio, each reference can carry optional metadata — source/pack name, license
note, purchase link — which is surfaced in the results when that reference
matches, so a detection doubles as a clearance record.

### 6. Matching — offset histograms

To search a query (`lib/dsp/match.ts`):

1. Fingerprint the query the same way.
2. For every query landmark, look its hash up in the index. Each collision
   yields a candidate pair and an **offset = reference time − query time**.
3. Bin the offsets per reference. Random collisions scatter across offsets;
   a genuine occurrence puts many collisions at *one* offset, because every
   landmark inside the reused span shifts by the same amount.
4. A tall spike in one bin (± 2 frames of tolerance) is a match. The spike
   height is the **score**; the time span of the query landmarks inside the
   spike gives the **start/end region** in the query (and, via the offset,
   the matching region inside the reference).

A reference reused more than once produces one spike per occurrence; the
matcher extracts spikes greedily, rejecting "echo" spikes whose query region
overlaps an already-accepted one (self-similar music — steady chords,
repeated phrases — produces such echoes at nearby offsets).

### Scoring

- **Score** — number of collision pairs in the winning offset bin
  (± 2 frames). This is the raw evidence count.
- **Purity** — winning-bin pairs ÷ all collisions with that reference.
  Gates the match (strongest spike must have ≥ 10 %).
- **Confidence** — `support × dominance`, where *support* saturates as the
  score approaches 40 pairs, and *dominance* is the spike height relative to
  the strongest competing alignment for the same audio
  (`score / (score + runnerUp)`). A tall lone spike scores near 100 %; a
  spike barely above the histogram noise floor scores low. Reporting floor:
  score ≥ 12.

### Explainability

The UI deliberately exposes the algorithm's internals rather than just a
verdict:

- the query waveform with detected regions highlighted and labeled (and, for
  the demo track, the planted ground truth drawn underneath for comparison);
- the query spectrogram with its peak constellation — the entire input to
  hashing — with the selected match's aligned peaks lit up;
- the selected match's full offset histogram, so you can see the alignment
  spike standing above the collision noise floor.

## Documented limitations

Be honest with yourself about what this class of algorithm can and cannot do:

- **Transformed audio evades it.** Landmark hashes encode absolute
  frequencies and time deltas. Pitch-shifting moves the frequencies;
  time-stretching changes the deltas; either breaks the hashes. The demo
  query deliberately embeds one reference pitch-shifted by a semitone
  (via resampling) — it is *not* detected, and the UI says so explicitly.
  Re-recorded, re-performed, heavily filtered or slowed/sped material will
  likewise slip through. **Absence of a match is not evidence of absence of
  reuse.**
- **It is near-verbatim-oriented.** The method excels at recognizing the
  *same recording* (even under added noise, mixing with other material, or
  lossy re-encoding, since constellation peaks tend to survive those). It
  does not recognize melodies, cover versions, or interpolations — it
  matches recordings, not compositions.
- **It only knows what you load.** Soundprinter ships with no external audio
  database — the built-in references are synthetic demo material generated on
  your machine at startup. It can only identify references you put in the
  library, so it is a self-audit tool, not a general "what song is this"
  identifier or a substitute for a licensed content-ID service.
- **Short or spectrally sparse references match weakly.** Very short clips,
  near-silence, or single sustained tones yield few landmarks, and matches
  against them (in either direction) carry correspondingly low scores.
- **Heuristic scoring.** Score/purity/confidence thresholds are tuned for
  demonstration-scale libraries. Very large libraries increase random
  collision rates and would warrant re-tuning (and a disk-backed index).

## Project layout

```
lib/dsp/        FFT, STFT, peak picking, hashing, index, matcher (pure TS,
                no browser APIs — also runs in Node for tests)
lib/synth/      deterministic synthetic songs + demo query assembly
lib/audio/      Web Audio decode/resample + playback helpers
components/     React UI: library, waveform + region overlay, results,
                constellation + offset-histogram explainability canvases
scripts/        test-dsp.ts — end-to-end pipeline assertions in Node
```

## License

MIT (see `LICENSE`).
