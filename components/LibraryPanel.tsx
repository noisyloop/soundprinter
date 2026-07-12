"use client";

import { useState } from "react";
import type { ReferenceEntry } from "@/lib/types";
import type { ReferenceMeta } from "@/lib/synth/songs";
import { SAMPLE_RATE } from "@/lib/dsp/params";
import { refColor } from "@/lib/color";
import FileDrop from "./FileDrop";

interface Props {
  refs: ReferenceEntry[];
  playingId: string | null;
  busy: boolean;
  onPlayToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onMetaChange: (id: string, meta: ReferenceMeta) => void;
  onAddFiles: (files: File[]) => void;
}

export default function LibraryPanel({
  refs,
  playingId,
  busy,
  onPlayToggle,
  onRemove,
  onMetaChange,
  onAddFiles,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="panel">
      <h2>Reference library</h2>
      <p className="faint" style={{ marginTop: 0 }}>
        Sounds you want to detect. Five synthetic songs are generated locally
        at startup; add your own samples below. Metadata you attach shows up
        in the results when a reference matches, so a detection doubles as a
        clearance record.
      </p>

      {refs.map((entry) => {
        const seconds = entry.samples.length / SAMPLE_RATE;
        const open = openId === entry.id;
        const meta = entry.meta;
        const hasMeta = meta.source || meta.license || meta.purchaseLink;
        return (
          <div className="ref-row" key={entry.id}>
            <div className="ref-row-head">
              <span
                className="ref-swatch"
                style={{ background: refColor(entry.hue) }}
              />
              <span className="ref-name" title={entry.name}>
                {entry.name}
              </span>
              <button
                className="small"
                onClick={() => onPlayToggle(entry.id)}
                title="Preview"
              >
                {playingId === entry.id ? "■" : "▶"}
              </button>
              <button
                className="small"
                onClick={() => setOpenId(open ? null : entry.id)}
              >
                {open ? "Close" : "Edit"}
              </button>
              <button
                className="small danger"
                onClick={() => onRemove(entry.id)}
                title="Remove from library"
              >
                ✕
              </button>
            </div>
            <div className="ref-stats mono">
              {seconds.toFixed(1)}s · {entry.fingerprint.peaks.length} peaks ·{" "}
              {entry.fingerprint.landmarks.length} hashes
              {entry.builtIn ? " · built-in" : ""}
            </div>
            {open ? (
              <div className="ref-meta-form">
                <label>
                  Source / pack
                  <input
                    value={meta.source ?? ""}
                    onChange={(e) =>
                      onMetaChange(entry.id, { ...meta, source: e.target.value })
                    }
                    placeholder="e.g. Vintage Drums Vol. 2"
                  />
                </label>
                <label>
                  License note
                  <input
                    value={meta.license ?? ""}
                    onChange={(e) =>
                      onMetaChange(entry.id, { ...meta, license: e.target.value })
                    }
                    placeholder="e.g. royalty-free, single-user"
                  />
                </label>
                <label>
                  Purchase link
                  <input
                    value={meta.purchaseLink ?? ""}
                    onChange={(e) =>
                      onMetaChange(entry.id, {
                        ...meta,
                        purchaseLink: e.target.value,
                      })
                    }
                    placeholder="https://…"
                  />
                </label>
              </div>
            ) : hasMeta ? (
              <div className="ref-meta-view">
                {meta.source ? <div>{meta.source}</div> : null}
                {meta.license ? <div>{meta.license}</div> : null}
                {meta.purchaseLink ? (
                  <div>
                    <a href={meta.purchaseLink} target="_blank" rel="noreferrer">
                      {meta.purchaseLink}
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <FileDrop
        label={busy ? "Working…" : "Drop audio here (or click) to add as reference"}
        multiple
        onFiles={onAddFiles}
      />
    </section>
  );
}
