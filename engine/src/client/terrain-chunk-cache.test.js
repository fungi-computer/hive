import assert from "node:assert/strict";
import test from "node:test";
import { createTerrainChunkCache } from "./terrain-chunk-cache.js";

const baseline = Object.freeze({
  protocolVersion: 3,
  bounds: { minX: -32, maxX: 32, minY: -32, maxY: 32, minZ: -32, maxZ: 32 },
  verticalMetres: 0.54,
  materials: [{ slot: 0, solid: false }, { slot: 1, solid: true }],
});
const chunk = key => ({ key, min: key.map(value => value * 8), max: key.map(value => value * 8 + 8),
  columns: [{ x: key[0] * 8, z: key[2] * 8, runs: [{ minY: key[1] * 8, maxY: key[1] * 8 + 8, material: 0 }] }] });
const frame = (epoch, revision, changes) => ({ epoch, terrain: { revision, baseline, ...(changes ? { changes } : {}) } });

function controlledRuntime() {
  const requests = [];
  return {
    requests,
    terrainChunks(request) {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      requests.push({ request, resolve });
      return promise;
    },
  };
}

test("terrain chunk cache loads priority batches and retains the last complete view", async () => {
  const runtime = controlledRuntime();
  const owner = createTerrainChunkCache({ runtime });
  owner.updateFrame(frame(1, 4));
  const keys = Array.from({ length: 10 }, (_, x) => [x, 0, 0]);
  owner.updateDemand(keys);
  const first = owner.service();
  assert.deepEqual(runtime.requests[0].request.chunks, keys.slice(0, 8));
  assert.deepEqual(owner.snapshot().coverage.map(item => item.status), [
    ...Array(8).fill("loading"), ...Array(2).fill("unknown"),
  ]);
  runtime.requests[0].resolve({ kind: "ready", requestId: 1, epoch: 1, terrainRevision: 4,
    chunks: keys.slice(0, 8).map(chunk) });
  await first;
  assert.equal(owner.snapshot().viewComplete, false);
  const second = owner.service();
  assert.deepEqual(runtime.requests[1].request.chunks, keys.slice(8));
  runtime.requests[1].resolve({ kind: "ready", requestId: 2, epoch: 1, terrainRevision: 4,
    chunks: keys.slice(8).map(chunk) });
  await second;
  assert.equal(owner.snapshot().viewComplete, true);
  assert.equal(owner.snapshot().chunks.length, 10);

  owner.updateDemand(keys.slice(0, 2).map(([x, y, z]) => [x, y, z + 1]));
  assert.equal(owner.snapshot().chunks.length, 10, "old complete coverage stays drawable while demand loads");
  assert.deepEqual(owner.snapshot().coverage.map(item => item.status), ["unknown", "unknown"]);
  assert.equal(owner.snapshot().viewComplete, true);
  assert.equal(owner.snapshot().demandComplete, false, "drawable old coverage cannot stop new camera demand");
});

test("terrain changes invalidate vertical coverage and all dual-grid neighbor chunks", async () => {
  const runtime = controlledRuntime();
  const owner = createTerrainChunkCache({ runtime });
  owner.updateFrame(frame(2, 8));
  const keys = [[0, -1, 0], [0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [2, 0, 0], [0, 0, 2]];
  owner.updateDemand(keys);
  const read = owner.service();
  runtime.requests[0].resolve({ kind: "ready", requestId: 1, epoch: 2, terrainRevision: 8, chunks: keys.map(chunk) });
  await read;
  owner.updateFrame(frame(2, 9, { kind: "changed-columns", revision: 9, columns: [[7, 7]] }));
  owner.updateDemand(keys);
  assert.deepEqual(owner.snapshot().coverage.map(item => item.status), ["unknown", "unknown", "unknown", "unknown", "unknown", "ready", "ready"]);
  assert.equal(owner.snapshot().viewComplete, false, "a topology edit never retains stale complete geometry");
});

test("epoch, full reset, stale replies and pinned-view capacity reset explicitly", async () => {
  const runtime = controlledRuntime();
  const owner = createTerrainChunkCache({ runtime, capacity: 2 });
  owner.updateFrame(frame(1, 1));
  owner.updateDemand([[0, 0, 0]]);
  const initial = owner.service();
  runtime.requests[0].resolve({ kind: "ready", requestId: 1, epoch: 1, terrainRevision: 1, chunks: [chunk([0, 0, 0])] });
  await initial;
  owner.updateDemand([[1, 0, 0], [2, 0, 0]]);
  assert.equal(owner.snapshot().viewBudget, false, "an old view cannot exhaust the new view's valid budget");
  assert.equal(owner.snapshot().viewComplete, false);
  const replacement = owner.service();
  assert.deepEqual(runtime.requests[1].request.chunks, [[1, 0, 0], [2, 0, 0]]);
  runtime.requests[1].resolve({ kind: "ready", requestId: 2, epoch: 1, terrainRevision: 1,
    chunks: [chunk([1, 0, 0]), chunk([2, 0, 0])] });
  await replacement;
  assert.equal(owner.snapshot().demandComplete, true);

  owner.updateFrame(frame(2, 3));
  assert.equal(owner.snapshot().cachedChunks, 0);
  owner.updateDemand([[0, 0, 0]]);
  const stale = owner.service();
  runtime.requests[2].resolve({ kind: "stale", requestId: 3, epoch: 2, terrainRevision: 4 });
  await stale;
  assert.equal(owner.snapshot().terrainRevision, 4);
  assert.equal(owner.snapshot().coverage[0].status, "unknown");
  owner.updateFrame(frame(2, 5, { kind: "full-reset", revision: 5, reason: "history" }));
  assert.equal(owner.snapshot().cachedChunks, 0);
  owner.dispose();
  assert.throws(() => owner.updateDemand([]), /disposed/);
});

test("a newer frame obsoletes a reply without opening a second concurrent read", async () => {
  const runtime = controlledRuntime();
  const owner = createTerrainChunkCache({ runtime });
  owner.updateFrame(frame(1, 1));
  owner.updateDemand([[0, 0, 0]]);
  const oldRead = owner.service();
  owner.updateFrame(frame(1, 2, { kind: "changed-columns", revision: 2, columns: [[0, 0]] }));
  assert.strictEqual(owner.service(), oldRead);
  assert.equal(runtime.requests.length, 1);
  runtime.requests[0].resolve({ kind: "ready", requestId: 1, epoch: 1, terrainRevision: 1,
    chunks: [chunk([0, 0, 0])] });
  await oldRead;
  assert.equal(owner.snapshot().coverage[0].status, "unknown");
  const currentRead = owner.service();
  assert.equal(runtime.requests.length, 2);
  runtime.requests[1].resolve({ kind: "ready", requestId: 2, epoch: 1, terrainRevision: 2,
    chunks: [chunk([0, 0, 0])] });
  await currentRead;
  assert.equal(owner.snapshot().coverage[0].status, "ready");
});
