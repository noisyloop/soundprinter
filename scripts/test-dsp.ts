/**
 * End-to-end sanity check of the fingerprinting pipeline, runnable in Node:
 * generate the library, index it, build the demo query, match, and verify
 * the planted (untransformed) segments are detected at the right offsets
 * while the pitch-shifted segment and absent references stay silent.
 */
import { generateLibrary } from "../lib/synth/songs";
import { buildDemoQuery } from "../lib/synth/query";
import { fingerprint, ReferenceIndex } from "../lib/dsp/fingerprint";
import { matchQuery } from "../lib/dsp/match";
import { SAMPLE_RATE } from "../lib/dsp/params";

const t0 = Date.now();
const library = generateLibrary();
const index = new ReferenceIndex();
for (const song of library) {
  const fp = fingerprint(song.samples);
  index.add(song.id, fp.landmarks);
  console.log(
    `${song.id}: ${(song.samples.length / SAMPLE_RATE).toFixed(1)}s, ` +
      `${fp.peaks.length} peaks, ${fp.landmarks.length} landmarks`
  );
}

const query = buildDemoQuery(library);
const qfp = fingerprint(query.samples);
console.log(
  `query: ${(query.samples.length / SAMPLE_RATE).toFixed(1)}s, ` +
    `${qfp.peaks.length} peaks, ${qfp.landmarks.length} landmarks`
);
console.log("planted:", query.planted.map((p) =>
  `${p.refName}@${p.startSec}s${p.transform ? ` [${p.transform}]` : ""}`
).join(", "));

const results = matchQuery(qfp.landmarks, index);
console.log(`\nmatch time total: ${Date.now() - t0} ms`);
for (const r of results) {
  console.log(
    `${r.refId}: score=${r.score} conf=${(r.confidence * 100).toFixed(0)}% ` +
      `purity=${r.purity.toFixed(2)} collisions=${r.totalCollisions} ` +
      `query ${r.queryStartSec.toFixed(1)}–${r.queryEndSec.toFixed(1)}s ` +
      `(ref ${r.refStartSec.toFixed(1)}–${r.refEndSec.toFixed(1)}s)`
  );
}

// --- assertions -------------------------------------------------------------
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`FAIL: ${msg}`);
};

for (const p of query.planted) {
  const hits = results.filter((r) => r.refId === p.refId);
  if (p.transform) {
    if (hits.length > 0) fail(`transformed ${p.refId} should NOT match, got score ${hits[0].score}`);
    else console.log(`OK: transformed ${p.refId} evades matching (expected)`);
  } else {
    const hit = hits.find(
      (r) => Math.abs(r.queryStartSec - p.startSec) < 2.5
    );
    if (!hit) fail(`${p.refId} planted at ${p.startSec}s not detected near that offset`);
    else if (hit.confidence < 0.5) fail(`${p.refId} confidence too low: ${hit.confidence}`);
    else console.log(`OK: ${p.refId} detected at ${hit.queryStartSec.toFixed(1)}s conf ${(hit.confidence * 100).toFixed(0)}%`);
  }
}

const plantedIds = new Set(query.planted.filter((p) => !p.transform).map((p) => p.refId));
for (const r of results) {
  if (!plantedIds.has(r.refId)) fail(`false positive: ${r.refId} score=${r.score}`);
}

// --- multi-occurrence: same reference planted twice --------------------------
{
  const song = library.find((s) => s.id === "ref-clockwork-toy")!;
  const twice = new Float32Array(40 * SAMPLE_RATE);
  const clip = song.samples.slice(0, 6 * SAMPLE_RATE);
  for (const startSec of [4, 26]) {
    const start = startSec * SAMPLE_RATE;
    for (let i = 0; i < clip.length; i++) twice[start + i] += clip[i] * 0.9;
  }
  const hits = matchQuery(fingerprint(twice).landmarks, index).filter(
    (r) => r.refId === song.id
  );
  const starts = hits.map((r) => r.queryStartSec).sort((a, b) => a - b);
  if (
    hits.length !== 2 ||
    Math.abs(starts[0] - 4) > 2 ||
    Math.abs(starts[1] - 26) > 2
  ) {
    fail(
      `expected 2 occurrences near 4s and 26s, got ${hits.length}: ` +
        starts.map((s) => s.toFixed(1)).join(", ")
    );
  } else {
    console.log(
      `OK: repeated reuse found twice at ${starts[0].toFixed(1)}s and ${starts[1].toFixed(1)}s`
    );
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll DSP assertions passed.");
