import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  decodeRecording,
  selectedObservationIndices,
  surfacePoints,
} from "./recording.js";

const SOURCE = new URL(
  "../../../.botanical/research/environment-round3-20260908/sph-library-fit/basilisk-native-v1/basin-motion-v1/transport-accounted-v1/",
  import.meta.url,
);
const PUBLIC = new URL(
  "../../../public/study-evidence/slosh/surface-v1.json",
  import.meta.url,
);
const json = (url) => JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
const observations = (tier) =>
  json(new URL(`result-v1/${tier}/capture.json`, SOURCE)).rows.filter(
    (row) => row.kind === "observation",
  );

test("compact slosh record retains every selected source surface", () => {
  const recording = decodeRecording(json(PUBLIC));
  assert.ok(statSync(fileURLToPath(PUBLIC)).size < 1_000_000);
  assert.equal(
    recording.provenance.resultsSha256,
    "08dffba97befad55d190028b2ad9eb2030986984725419c9bf0a3fb95686f394",
  );
  assert.equal(
    recording.provenance.handoffSha256,
    "d2cf0d646005bd5652bcb519350c46a862df843a874f539860951a44a3b49dd5",
  );
  assert.deepEqual(
    {
      widthM: recording.reference.widthM,
      heightM: recording.reference.heightM,
      waterDepthM: recording.reference.waterDepthM,
      periodSeconds: recording.reference.periodSeconds,
    },
    {
      widthM: 1,
      heightM: 1.08,
      waterDepthM: 0.54,
      periodSeconds: 1.171908997384657,
    },
  );
  for (const tierId of ["coarse", "fine"]) {
    const source = observations(tierId);
    const tier = recording.tiers[tierId];
    const indices = selectedObservationIndices(source.length);
    assert.deepEqual(tier.sampleIndices, indices);
    assert.equal(tier.samples.length, 101);
    assert.equal(tier.samples[0].nominalFractionTimeSeconds, 0);
    assert.equal(
      tier.samples.at(-1).velocityTimeSeconds,
      tier.completedSeconds,
    );
    assert.equal(tier.deltaM, tierId === "coarse" ? 0.02 : 0.01);
    assert.equal(
      tier.nativeWallSeconds,
      tierId === "coarse" ? 11.91953775001457 : 45.31083960796241,
    );
    for (const [i, sourceIndex] of indices.entries()) {
      const row = source[sourceIndex];
      assert.deepEqual(tier.samples[i], {
        step: row.step,
        nominalFractionTimeSeconds: row.nominalFractionTimeSeconds,
        velocityTimeSeconds: row.velocityTimeSeconds,
        columnHeightsM: row.columnHeightsM,
      });
    }
  }
});

test("surface points use exact saved columns rather than a fluid field", () => {
  const recording = decodeRecording(json(PUBLIC));
  const points = surfacePoints(recording, "fine", 0);
  assert.equal(points.length, 100);
  assert.equal(points[0].xM, 0.005);
  assert.equal(points.at(-1).xM, 0.995);
  assert.equal(
    points[0].heightM,
    recording.tiers.fine.samples[0].columnHeightsM[0],
  );
  const coarse = surfacePoints(recording, "coarse", 0);
  assert.equal(coarse[0].xM, 0.01);
  assert.equal(coarse.at(-1).xM, 0.99);
});

test("the leaf keeps one recorded-reference control owner", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./SloshLab.jsx", import.meta.url)),
    "utf8",
  );
  for (const fragment of [
    "@fungi.computer/caps/components/slider",
    "@fungi.computer/caps/components/tabs",
    "@fungi.computer/caps/components/button",
    "data-slosh-surface",
    "velocity arrows, full field, or live fluid state",
    "coarse absolute stock diagnostic remains failed",
  ]) {
    assert.ok(source.includes(fragment), `missing leaf contract: ${fragment}`);
  }
  assert.match(source, /vertical\s+exaggeration/);
});

for (const [label, corrupt] of [
  ["source hash", (raw) => (raw.provenance.sourcePinsSha256 = "bad")],
  ["results hash", (raw) => (raw.provenance.resultsSha256 = "bad")],
  ["handoff hash", (raw) => (raw.provenance.handoffSha256 = "bad")],
  ["reference period", (raw) => (raw.reference.periodSeconds = 2)],
  ["native wall cost", (raw) => (raw.tiers.fine.nativeWallSeconds = 45)],
  ["cell-centre delta", (raw) => (raw.tiers.coarse.deltaM = 0.01)],
  ["sample index", (raw) => (raw.tiers.coarse.sampleIndices[4] = 999)],
  ["column count", (raw) => raw.tiers.fine.samples[2].columnHeightsM.pop()],
  [
    "old failure provenance",
    (raw) => (raw.reference.legacyDiagnostic.passed = true),
  ],
])
  test(`rejects corrupted ${label}`, () => {
    const raw = json(PUBLIC);
    corrupt(raw);
    assert.throws(() => decodeRecording(raw));
  });
