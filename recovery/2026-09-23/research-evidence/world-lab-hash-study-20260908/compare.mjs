import * as baseline from "./baseline.mjs";
import * as candidate from "./candidate.mjs";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

const samples = [];
for (let i = 0; i < 1024; i++) {
  // Mix signed global regions, fractional overview centers and chunk boundaries.
  const x = ((i * 197) % 16384) - 8192 + (i % 2 ? 0.5 : 0);
  const z = ((i * 311) % 16384) - 8192 + (i % 3 ? 0 : 0.5);
  for (const footprint of [1, 8, 16]) samples.push([x, z, footprint]);
}
samples.push([-1, 0, 1], [0, -1, 1], [-16, 16, 1], [16, -16, 1]);
const variants = [baseline, candidate];
const seedSpecs = ["hive-world-lab-seed-20260907", "hash-study-independent-seed"].map((seed) =>
  variants.map((module) => module.createWorldSpec({ seed })),
);
const result = {
  passed: false,
  scope: "scalar full sampleTerrain descriptor; same-process loaded-host comparison, not browser/worker/world-capacity proof",
  source: JSON.parse(await readFile(new URL("./source-inventory.json", import.meta.url), "utf8")),
  samplesPerSeed: samples.length,
  seeds: seedSpecs.length,
  equality: {},
  rounds: [],
};

function run(module, spec) {
  let sink = 0;
  const start = performance.now();
  for (const [x, z, footprint] of samples) {
    const cell = module.sampleTerrain(spec, x, z, footprint);
    sink += cell.elevation + cell.moisture + cell.ridgeLift + cell.canyonCarve;
  }
  return { milliseconds: performance.now() - start, sink };
}

try {
  const baselineHash = createHash("sha256");
  const candidateHash = createHash("sha256");
  for (const specs of seedSpecs) {
    assert.deepEqual(baseline.namedFeatures(specs[0]), candidate.namedFeatures(specs[1]));
    for (const [x, z, footprint] of samples) {
      const a = baseline.sampleTerrain(specs[0], x, z, footprint);
      const b = candidate.sampleTerrain(specs[1], x, z, footprint);
      assert.deepEqual(b, a, `changed output at ${x},${z} footprint ${footprint}`);
      baselineHash.update(JSON.stringify(a)); candidateHash.update(JSON.stringify(b));
    }
  }
  result.equality = { exactFullDescriptors: true, namedFeatures: true, baseline: baselineHash.digest("hex"), candidate: candidateHash.digest("hex") };
  // Baseline-first and candidate-first rounds alternate. Equality pass warms both.
  for (let round = 0; round < 4; round++) {
    const record = { order: round % 2 ? "candidate-first" : "baseline-first" };
    for (const index of round % 2 ? [1, 0] : [0, 1])
      record[index === 0 ? "baseline" : "candidate"] = run(variants[index], seedSpecs[round % seedSpecs.length][index]);
    assert.equal(record.baseline.sink, record.candidate.sink);
    record.ratio = record.baseline.milliseconds / record.candidate.milliseconds;
    result.rounds.push(record);
  }
  // Cache must not silently change results if an external diagnostic spec is revised.
  const mutable = { ...seedSpecs[0][1] };
  candidate.sampleTerrain(mutable, -17, 31, 8);
  mutable.identity += ":revised";
  assert.deepEqual(candidate.sampleTerrain(mutable, -17, 31, 8), baseline.sampleTerrain(mutable, -17, 31, 8));
  result.equality.changedIdentityRevalidated = true;
  result.passed = true;
  console.log(JSON.stringify(result));
} catch (error) {
  result.failure = String(error.stack || error);
  console.error(result.failure);
  process.exitCode = 1;
} finally {
  await writeFile(new URL("./proof.json", import.meta.url), JSON.stringify(result, null, 2));
}
