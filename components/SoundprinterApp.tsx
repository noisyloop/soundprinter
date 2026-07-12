"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fingerprint, ReferenceIndex } from "@/lib/dsp/fingerprint";
import { matchQuery } from "@/lib/dsp/match";
import { SAMPLE_RATE } from "@/lib/dsp/params";
import { decodeFileToMono } from "@/lib/audio/decode";
import { playSamples, stopPlayback } from "@/lib/audio/play";
import { generateLibrary, type ReferenceMeta } from "@/lib/synth/songs";
import { buildDemoQuery } from "@/lib/synth/query";
import { hueForIndex, refColor } from "@/lib/color";
import type { AnalysisState, QueryState, ReferenceEntry } from "@/lib/types";
import FileDrop from "./FileDrop";
import LibraryPanel from "./LibraryPanel";
import ResultsTable from "./ResultsTable";
import WaveformCanvas, {
  type GroundTruthSpan,
  type WaveRegion,
} from "./WaveformCanvas";
import ConstellationCanvas from "./ConstellationCanvas";
import OffsetHistogram from "./OffsetHistogram";

/** Yield to the event loop so status updates paint between DSP stages. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export default function SoundprinterApp() {
  const [refs, setRefs] = useState<ReferenceEntry[]>([]);
  const [query, setQuery] = useState<QueryState | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [selectedMatch, setSelectedMatch] = useState(0);
  const [status, setStatus] = useState("Starting up…");
  const [busy, setBusy] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const indexRef = useRef<ReferenceIndex>(new ReferenceIndex());
  const hueCounter = useRef(0);
  const booted = useRef(false);

  // --- boot: synthesize + index the built-in library, build the demo query
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      setStatus("Synthesizing the built-in reference library…");
      await tick();
      const songs = generateLibrary();
      const entries: ReferenceEntry[] = [];
      for (const song of songs) {
        setStatus(`Fingerprinting “${song.name}”…`);
        await tick();
        const fp = fingerprint(song.samples);
        indexRef.current.add(song.id, fp.landmarks);
        entries.push({
          id: song.id,
          name: song.name,
          samples: song.samples,
          fingerprint: fp,
          meta: song.meta,
          builtIn: true,
          hue: hueForIndex(hueCounter.current++),
        });
        setRefs([...entries]);
      }
      setStatus("Assembling the demo query track…");
      await tick();
      const demo = buildDemoQuery(songs);
      setQuery({
        name: "Demo query track (synthetic)",
        samples: demo.samples,
        fingerprint: null,
        planted: demo.planted,
      });
      setStatus(
        "Ready. The demo query hides excerpts of several references — press Analyze."
      );
      setBusy(false);
    })();
  }, []);

  const refsById = useMemo(() => new Map(refs.map((r) => [r.id, r])), [refs]);

  // --- actions ---------------------------------------------------------------

  const analyze = useCallback(async () => {
    if (!query) return;
    setBusy(true);
    setAnalysis(null);
    try {
      let fp = query.fingerprint;
      if (!fp) {
        setStatus("Computing query spectrogram, constellation and hashes…");
        await tick();
        fp = fingerprint(query.samples);
        setQuery((q) => (q ? { ...q, fingerprint: fp } : q));
      }
      setStatus("Matching against the reference index…");
      await tick();
      const results = matchQuery(fp.landmarks, indexRef.current);
      setAnalysis({
        results,
        queryLandmarkCount: fp.landmarks.length,
        analyzedAtMs: performance.now(),
      });
      setSelectedMatch(0);
      setStatus(
        results.length === 0
          ? "Analysis complete — no reuse detected."
          : `Analysis complete — ${results.length} match${
              results.length === 1 ? "" : "es"
            } across ${new Set(results.map((r) => r.refId)).size} reference(s).`
      );
    } finally {
      setBusy(false);
    }
  }, [query]);

  const addReferenceFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    try {
      for (const file of files) {
        setStatus(`Decoding “${file.name}” locally…`);
        try {
          const samples = await decodeFileToMono(file);
          setStatus(`Fingerprinting “${file.name}”…`);
          await tick();
          const fp = fingerprint(samples);
          const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          indexRef.current.add(id, fp.landmarks);
          setRefs((prev) => [
            ...prev,
            {
              id,
              name: file.name.replace(/\.[^.]+$/, ""),
              samples,
              fingerprint: fp,
              meta: {},
              builtIn: false,
              hue: hueForIndex(hueCounter.current++),
            },
          ]);
        } catch {
          setStatus(`Could not decode “${file.name}” — is it an audio file?`);
          return;
        }
      }
      setStatus("Reference(s) added. Re-run Analyze to include them.");
      setAnalysis(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const setQueryFile = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    try {
      setStatus(`Decoding “${file.name}” locally…`);
      const samples = await decodeFileToMono(file);
      stopPlayback();
      setPlayingId(null);
      setQuery({
        name: file.name,
        samples,
        fingerprint: null,
        planted: null,
      });
      setAnalysis(null);
      setStatus(`Query set to “${file.name}” (${(samples.length / SAMPLE_RATE).toFixed(1)}s). Press Analyze.`);
    } catch {
      setStatus(`Could not decode “${file.name}” — is it an audio file?`);
    } finally {
      setBusy(false);
    }
  }, []);

  const restoreDemoQuery = useCallback(() => {
    const songs = refs.filter((r) => r.builtIn);
    const demo = buildDemoQuery(
      songs.map((r) => ({ id: r.id, name: r.name, samples: r.samples, meta: r.meta }))
    );
    stopPlayback();
    setPlayingId(null);
    setQuery({
      name: "Demo query track (synthetic)",
      samples: demo.samples,
      fingerprint: null,
      planted: demo.planted,
    });
    setAnalysis(null);
    setStatus("Demo query restored. Press Analyze.");
  }, [refs]);

  const removeReference = useCallback((id: string) => {
    indexRef.current.remove(id);
    setRefs((prev) => prev.filter((r) => r.id !== id));
    setAnalysis(null);
    setStatus("Reference removed. Re-run Analyze to refresh results.");
  }, []);

  const changeMeta = useCallback((id: string, meta: ReferenceMeta) => {
    setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, meta } : r)));
  }, []);

  const playToggle = useCallback(
    (id: string) => {
      if (playingId === id) {
        stopPlayback();
        setPlayingId(null);
        return;
      }
      const samples =
        id === "__query__" ? query?.samples : refsById.get(id)?.samples;
      if (!samples) return;
      playSamples(samples, () => setPlayingId(null));
      setPlayingId(id);
    },
    [playingId, query, refsById]
  );

  // --- derived view data -------------------------------------------------------

  const regions: WaveRegion[] = useMemo(() => {
    if (!analysis) return [];
    return analysis.results.map((r, i) => ({
      startSec: r.queryStartSec,
      endSec: r.queryEndSec,
      label: refsById.get(r.refId)?.name ?? r.refId,
      hue: refsById.get(r.refId)?.hue ?? 0,
      selected: i === selectedMatch,
    }));
  }, [analysis, refsById, selectedMatch]);

  const planted: GroundTruthSpan[] | null = useMemo(() => {
    if (!query?.planted) return null;
    return query.planted.map((p) => ({
      startSec: p.startSec,
      endSec: p.startSec + p.durationSec,
      label: p.transform ? `${p.refName} (${p.transform})` : p.refName,
      transformed: p.transform !== null,
    }));
  }, [query]);

  const selected = analysis?.results[selectedMatch] ?? null;
  const selectedRef = selected ? refsById.get(selected.refId) : null;

  const highlightFrames = useMemo(() => {
    if (!selected) return null;
    return new Set(selected.alignedPairs.map((p) => p.queryT));
  }, [selected]);

  const missedTransformed = useMemo(() => {
    if (!query?.planted || !analysis) return [];
    return query.planted.filter(
      (p) =>
        p.transform !== null &&
        !analysis.results.some((r) => r.refId === p.refId)
    );
  }, [query, analysis]);

  // -----------------------------------------------------------------------------

  return (
    <div className="app">
      <header className="app-header">
        <h1>Soundprinter</h1>
        <span className="tagline">
          landmark audio fingerprinting &amp; reuse detection, entirely in your
          browser
        </span>
      </header>
      <p className="privacy-note">
        All decoding, fingerprinting and matching runs client-side. No audio,
        fingerprints or metadata leave this machine — there is no backend.
      </p>

      <div className="layout">
        <div>
          <LibraryPanel
            refs={refs}
            playingId={playingId}
            busy={busy}
            onPlayToggle={playToggle}
            onRemove={removeReference}
            onMetaChange={changeMeta}
            onAddFiles={addReferenceFiles}
          />
        </div>

        <div>
          <section className="panel">
            <h2>Query track</h2>
            <div className="query-toolbar">
              <strong>{query?.name ?? "—"}</strong>
              {query ? (
                <span className="faint mono">
                  {(query.samples.length / SAMPLE_RATE).toFixed(1)}s
                </span>
              ) : null}
              <button
                className="small"
                disabled={!query}
                onClick={() => playToggle("__query__")}
              >
                {playingId === "__query__" ? "■ Stop" : "▶ Listen"}
              </button>
              <span className="spacer" />
              {query?.planted == null && refs.some((r) => r.builtIn) ? (
                <button className="small" onClick={restoreDemoQuery}>
                  Restore demo query
                </button>
              ) : null}
              <button
                className="primary"
                onClick={analyze}
                disabled={busy || !query || refs.length === 0}
              >
                {busy ? "Working…" : "Analyze"}
              </button>
            </div>

            {query ? (
              <WaveformCanvas
                samples={query.samples}
                regions={regions}
                planted={planted}
                onSelectRegion={setSelectedMatch}
              />
            ) : null}
            {planted ? (
              <div className="legend">
                <span className="key">
                  <i style={{ background: "rgba(79,195,247,0.35)" }} /> detected
                  region (labeled, colored per reference)
                </span>
                <span className="key">
                  <i style={{ border: "1px solid #9aa7b3" }} /> planted ground
                  truth (bottom strip)
                </span>
                <span className="key">
                  <i style={{ border: "1px dashed #f0b429" }} /> planted, but
                  transformed
                </span>
              </div>
            ) : null}
            <div style={{ marginTop: 8 }}>
              <FileDrop
                label={
                  busy
                    ? "Working…"
                    : "Drop an audio file here (or click) to use it as the query"
                }
                onFiles={setQueryFile}
              />
            </div>
            <div className="status-line" role="status">
              {status}
            </div>
          </section>

          <section className="panel">
            <h2>Results</h2>
            {analysis ? (
              <>
                <ResultsTable
                  results={analysis.results}
                  refsById={refsById}
                  selected={selectedMatch}
                  onSelect={setSelectedMatch}
                />
                {missedTransformed.length > 0 ? (
                  <div className="callout">
                    <strong>Known limitation, demonstrated live:</strong> this
                    query also contains{" "}
                    {missedTransformed
                      .map((p) => `“${p.refName}” (${p.transform})`)
                      .join(", ")}{" "}
                    — and it was <em>not</em> detected. Landmark fingerprinting
                    keys on exact time–frequency geometry, so pitch-shifted,
                    time-stretched or re-performed audio evades it. Absence of a
                    match is <em>not</em> evidence of absence of reuse.
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">
                Press <strong>Analyze</strong> to fingerprint the query and
                match it against the library.
              </p>
            )}
          </section>

          {analysis && query?.fingerprint ? (
            <section className="panel">
              <h2>Why it matched — explainability</h2>
              <p className="faint" style={{ marginTop: 0 }}>
                Left: the query&apos;s spectrogram with its constellation of
                spectral peaks (the entire input to hashing).{" "}
                {selected
                  ? "Peaks that participate in the selected match are lit in its color. Right: every hash collision with that reference, binned by time offset — the tall spike is the alignment."
                  : "Select a result row to inspect its alignment."}
              </p>
              <div className="explain-grid">
                <div>
                  <h3>Query constellation</h3>
                  <ConstellationCanvas
                    fingerprint={query.fingerprint}
                    highlightFrames={highlightFrames}
                    highlightHue={selectedRef?.hue ?? 0}
                  />
                  <p className="faint">
                    {query.fingerprint.peaks.length} peaks →{" "}
                    {analysis.queryLandmarkCount} landmark hashes
                  </p>
                </div>
                <div>
                  <h3>
                    Offset histogram
                    {selectedRef ? (
                      <>
                        {" — "}
                        <span style={{ color: refColor(selectedRef.hue) }}>
                          {selectedRef.name}
                        </span>
                      </>
                    ) : null}
                  </h3>
                  {selected && selectedRef ? (
                    <>
                      <OffsetHistogram match={selected} hue={selectedRef.hue} />
                      <p className="faint">
                        {selected.totalCollisions} hash collisions with this
                        reference in total; {selected.score} of them agree on
                        one time offset (±2 frames) — that agreement is the
                        evidence. Purity{" "}
                        {(selected.purity * 100).toFixed(0)}%, confidence{" "}
                        {(selected.confidence * 100).toFixed(0)}%.
                      </p>
                    </>
                  ) : (
                    <p className="muted">No match selected.</p>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

