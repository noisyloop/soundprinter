"use client";

import type { Fingerprint } from "@/lib/dsp/fingerprint";
import { NUM_BINS, SECONDS_PER_FRAME } from "@/lib/dsp/params";
import { refColor } from "@/lib/color";
import { useCanvas } from "./useCanvas";

interface Props {
  fingerprint: Fingerprint;
  /** Anchor frames of the selected match's aligned pairs (query side). */
  highlightFrames?: Set<number> | null;
  highlightHue?: number;
  height?: number;
}

/**
 * The explainability core: the log-magnitude spectrogram with the extracted
 * constellation peaks drawn on top. Peaks belonging to the selected match's
 * aligned landmark pairs light up in that reference's color.
 */
export default function ConstellationCanvas({
  fingerprint,
  highlightFrames,
  highlightHue = 0,
  height = 200,
}: Props) {
  const canvasRef = useCanvas(
    (ctx, w, h) => {
      const { spectrogram, peaks } = fingerprint;
      const { mags, numFrames } = spectrogram;
      if (numFrames === 0) return;

      // Only the lower bins carry energy at 11 kHz — showing all 512 wastes
      // vertical space, so display up to bin 384 (~4.1 kHz).
      const maxBin = Math.min(NUM_BINS, 384);

      // Normalize dB range for display.
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < mags.length; i++) {
        const v = mags[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const range = Math.max(1, hi - lo);

      const img = ctx.createImageData(w, h);
      const data = img.data;
      for (let y = 0; y < h; y++) {
        const bin = Math.floor(((h - 1 - y) / h) * maxBin);
        for (let x = 0; x < w; x++) {
          const frame = Math.floor((x / w) * numFrames);
          const v = (mags[frame * NUM_BINS + bin] - lo) / range;
          const t = Math.max(0, Math.min(1, v * v * 1.4));
          // Dark navy → teal → warm white ramp.
          const idx = (y * w + x) * 4;
          data[idx] = Math.round(10 + 235 * t * t);
          data[idx + 1] = Math.round(14 + 190 * t);
          data[idx + 2] = Math.round(23 + 140 * Math.sqrt(t));
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // Constellation peaks.
      for (const p of peaks) {
        if (p.f >= maxBin) continue;
        const x = (p.t / numFrames) * w;
        const y = h - (p.f / maxBin) * h;
        const highlighted = highlightFrames?.has(p.t) ?? false;
        ctx.beginPath();
        ctx.arc(x, y, highlighted ? 2.6 : 1.4, 0, Math.PI * 2);
        ctx.fillStyle = highlighted
          ? refColor(highlightHue, 1)
          : "rgba(230, 237, 243, 0.75)";
        ctx.fill();
      }

      // Time ruler.
      const durationSec = numFrames * SECONDS_PER_FRAME;
      ctx.fillStyle = "rgba(230,237,243,0.55)";
      ctx.font = "10px sans-serif";
      for (let sec = 0; sec <= durationSec; sec += 10) {
        const x = (sec / durationSec) * w;
        ctx.fillRect(x, h - 4, 1, 4);
        ctx.fillText(`${sec}s`, x + 3, h - 3);
      }
    },
    [fingerprint, highlightFrames, highlightHue]
  );

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} style={{ height }} />
    </div>
  );
}
