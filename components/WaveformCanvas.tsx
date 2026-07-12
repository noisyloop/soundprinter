"use client";

import { SAMPLE_RATE } from "@/lib/dsp/params";
import { refColor } from "@/lib/color";
import { useCanvas } from "./useCanvas";

export interface WaveRegion {
  startSec: number;
  endSec: number;
  label: string;
  hue: number;
  selected: boolean;
}

export interface GroundTruthSpan {
  startSec: number;
  endSec: number;
  label: string;
  transformed: boolean;
}

interface Props {
  samples: Float32Array;
  regions: WaveRegion[];
  /** Planted ground truth (demo query only) — drawn as an outline strip. */
  planted: GroundTruthSpan[] | null;
  onSelectRegion?: (index: number) => void;
  height?: number;
}

/**
 * Query waveform with detected reuse regions overlaid as labeled colored
 * spans; the demo's planted ground truth renders as an outline strip along
 * the bottom so detections can be compared against what was actually there.
 */
export default function WaveformCanvas({
  samples,
  regions,
  planted,
  onSelectRegion,
  height = 190,
}: Props) {
  const durationSec = samples.length / SAMPLE_RATE;

  const canvasRef = useCanvas(
    (ctx, w, h) => {
      const waveTop = 16;
      const gtStrip = planted && planted.length > 0 ? 24 : 0;
      const waveBottom = h - gtStrip - 4;
      const waveH = waveBottom - waveTop;
      const mid = waveTop + waveH / 2;

      // Min/max column rendering of the waveform.
      ctx.strokeStyle = "#3c5a6e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const samplesPerPx = samples.length / w;
      for (let x = 0; x < w; x++) {
        const s0 = Math.floor(x * samplesPerPx);
        const s1 = Math.min(samples.length, Math.floor((x + 1) * samplesPerPx) + 1);
        let min = 1, max = -1;
        for (let i = s0; i < s1; i++) {
          const v = samples[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (min > max) continue;
        ctx.moveTo(x + 0.5, mid - max * (waveH / 2) * 0.95);
        ctx.lineTo(x + 0.5, mid - min * (waveH / 2) * 0.95 + 0.5);
      }
      ctx.stroke();

      ctx.strokeStyle = "#22303a";
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      const xOf = (sec: number) => (sec / durationSec) * w;

      // Detected regions: translucent fill + label chip.
      for (const region of regions) {
        const x0 = xOf(region.startSec);
        const x1 = xOf(region.endSec);
        ctx.fillStyle = refColor(region.hue, region.selected ? 0.3 : 0.18);
        ctx.fillRect(x0, waveTop, x1 - x0, waveH);
        ctx.strokeStyle = refColor(region.hue, region.selected ? 1 : 0.6);
        ctx.lineWidth = region.selected ? 2 : 1;
        ctx.strokeRect(x0 + 0.5, waveTop + 0.5, x1 - x0 - 1, waveH - 1);

        ctx.font = "600 11px sans-serif";
        const text = region.label;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = refColor(region.hue, 0.95);
        ctx.fillRect(x0, 1, Math.min(tw + 10, Math.max(40, x1 - x0)), 14);
        ctx.fillStyle = "#0d1117";
        ctx.fillText(text, x0 + 5, 12, Math.max(30, x1 - x0 - 10));
      }

      // Ground-truth strip.
      if (planted && planted.length > 0) {
        const gy = h - gtStrip + 2;
        ctx.font = "10px sans-serif";
        for (const gt of planted) {
          const x0 = xOf(gt.startSec);
          const x1 = xOf(gt.endSec);
          ctx.setLineDash(gt.transformed ? [4, 3] : []);
          ctx.strokeStyle = gt.transformed ? "#f0b429" : "#9aa7b3";
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 0.5, gy + 0.5, x1 - x0 - 1, 12);
          ctx.setLineDash([]);
          ctx.fillStyle = gt.transformed ? "#f0b429" : "#9aa7b3";
          ctx.fillText(gt.label, x0 + 4, gy + 10, Math.max(20, x1 - x0 - 8));
        }
      }

      // Time ruler ticks every 10 s.
      ctx.fillStyle = "#6b7681";
      ctx.font = "10px sans-serif";
      for (let sec = 0; sec <= durationSec; sec += 10) {
        const x = xOf(sec);
        ctx.fillRect(x, waveBottom - 4, 1, 4);
        ctx.fillText(`${sec}s`, x + 3, waveBottom - 2);
      }
    },
    [samples, regions, planted, durationSec]
  );

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectRegion || regions.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = ((e.clientX - rect.left) / rect.width) * durationSec;
    let best = -1;
    let bestSpan = Infinity;
    regions.forEach((r, i) => {
      const span = r.endSec - r.startSec;
      if (sec >= r.startSec && sec <= r.endSec && span < bestSpan) {
        best = i;
        bestSpan = span;
      }
    });
    if (best >= 0) onSelectRegion(best);
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        style={{ height, cursor: regions.length ? "pointer" : "default" }}
        onClick={handleClick}
      />
    </div>
  );
}
