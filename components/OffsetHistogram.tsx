"use client";

import type { MatchResult } from "@/lib/dsp/match";
import { OFFSET_TOLERANCE, SECONDS_PER_FRAME } from "@/lib/dsp/params";
import { refColor } from "@/lib/color";
import { useCanvas } from "./useCanvas";

interface Props {
  match: MatchResult;
  hue: number;
  height?: number;
}

/**
 * Offset histogram for one match: every hash collision with this reference,
 * binned by (reference time − query time). Random collisions scatter; the
 * true alignment stands up as a single tall spike — that spike IS the match.
 */
export default function OffsetHistogram({ match, hue, height = 160 }: Props) {
  const canvasRef = useCanvas(
    (ctx, w, h) => {
      const { histogram, offsetFrames } = match;
      if (histogram.length === 0) return;

      const minOff = histogram[0].offsetFrames;
      const maxOff = histogram[histogram.length - 1].offsetFrames;
      const span = Math.max(1, maxOff - minOff);
      let maxCount = 1;
      for (const b of histogram) if (b.count > maxCount) maxCount = b.count;

      const plotH = h - 16;
      const barW = Math.max(1, w / (span + 1));

      for (const bin of histogram) {
        const x = ((bin.offsetFrames - minOff) / span) * (w - barW);
        const bh = Math.max(1, (bin.count / maxCount) * plotH);
        const inSpike =
          Math.abs(bin.offsetFrames - offsetFrames) <= OFFSET_TOLERANCE;
        ctx.fillStyle = inSpike ? refColor(hue, 1) : "rgba(154, 167, 179, 0.45)";
        ctx.fillRect(x, plotH - bh, barW, bh);
      }

      // Axis labels: offsets in seconds.
      ctx.fillStyle = "#6b7681";
      ctx.font = "10px sans-serif";
      const label = (frames: number) =>
        `${(frames * SECONDS_PER_FRAME).toFixed(1)}s`;
      ctx.fillText(label(minOff), 2, h - 4);
      const midText = `offset = ref time − query time`;
      ctx.fillText(midText, w / 2 - ctx.measureText(midText).width / 2, h - 4);
      const maxLabel = label(maxOff);
      ctx.fillText(maxLabel, w - ctx.measureText(maxLabel).width - 2, h - 4);

      // Spike annotation.
      const spikeX = ((offsetFrames - minOff) / span) * (w - barW) + barW / 2;
      ctx.fillStyle = refColor(hue, 1);
      const spikeLabel = `${match.score} aligned @ ${label(offsetFrames)}`;
      const tx = Math.min(Math.max(2, spikeX + 6), w - ctx.measureText(spikeLabel).width - 2);
      ctx.fillText(spikeLabel, tx, 12);
    },
    [match, hue]
  );

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} style={{ height }} />
    </div>
  );
}
