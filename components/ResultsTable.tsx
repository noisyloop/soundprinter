"use client";

import type { MatchResult } from "@/lib/dsp/match";
import type { ReferenceEntry } from "@/lib/types";
import { refColor } from "@/lib/color";

interface Props {
  results: MatchResult[];
  refsById: Map<string, ReferenceEntry>;
  selected: number;
  onSelect: (index: number) => void;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export default function ResultsTable({
  results,
  refsById,
  selected,
  onSelect,
}: Props) {
  if (results.length === 0) {
    return (
      <p className="muted">
        No reuse detected — no reference produced a coherent offset alignment
        in this query.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="results">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Found in query</th>
            <th>Matches ref region</th>
            <th>Score</th>
            <th>Confidence</th>
            <th>Source / license</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const ref = refsById.get(r.refId);
            const name = ref?.name ?? r.refId;
            const hue = ref?.hue ?? 0;
            const meta = ref?.meta;
            return (
              <tr
                key={`${r.refId}-${r.offsetFrames}`}
                className={`selectable${i === selected ? " selected" : ""}`}
                onClick={() => onSelect(i)}
              >
                <td>
                  <span
                    className="ref-swatch"
                    style={{
                      background: refColor(hue),
                      display: "inline-block",
                      marginRight: 7,
                    }}
                  />
                  <strong>{name}</strong>
                </td>
                <td className="mono">
                  {fmtTime(r.queryStartSec)} – {fmtTime(r.queryEndSec)}
                </td>
                <td className="mono">
                  {fmtTime(r.refStartSec)} – {fmtTime(r.refEndSec)}
                </td>
                <td className="mono">{r.score}</td>
                <td>
                  <span className="conf-bar">
                    <span
                      style={{
                        width: `${Math.round(r.confidence * 100)}%`,
                        background: refColor(hue),
                      }}
                    />
                  </span>
                  <span className="mono">{Math.round(r.confidence * 100)}%</span>
                </td>
                <td className="faint">
                  {meta?.source ? <div>{meta.source}</div> : null}
                  {meta?.license ? <div>{meta.license}</div> : null}
                  {meta?.purchaseLink ? (
                    <div>
                      <a
                        href={meta.purchaseLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        purchase link
                      </a>
                    </div>
                  ) : null}
                  {!meta?.source && !meta?.license && !meta?.purchaseLink
                    ? "—"
                    : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
