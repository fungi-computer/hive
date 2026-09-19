// Read-only diagnostic of the cache/client contract at 950bea93.
// This is a regression reproduction, not a browser or timing benchmark.
import assert from "node:assert/strict";
import { createTerrainChunkCache } from "../../../src/client/terrain-chunk-cache.js";

const requests = [];
const cache = createTerrainChunkCache({ runtime: {
  terrainChunks(request) {
    requests.push(request);
    return { kind: "ready", ...request, chunks: request.chunks.map(key => ({
      key, min: key.map(n => n * 8), max: key.map(n => n * 8 + 8), columns: [],
    })) };
  },
} });
cache.updateFrame({ epoch: 1, terrain: { revision: 1, baseline: {
  protocolVersion: 2,
  bounds: { minX: -32, maxX: 32, minY: -8, maxY: 8, minZ: -32, maxZ: 32 },
  verticalMetres: 0.54, materials: [{ slot: 0, solid: false }],
} } });
cache.updateDemand([[0, 0, 0]]);
await cache.service();
cache.updateDemand([[1, 0, 0]]);
const snapshot = cache.snapshot();
// position() additionally checks a service-turn token. Even a fresh token cannot
// pass this existing first gate while the previous complete view is retained.
const clientWouldService = !snapshot.viewComplete && !snapshot.viewBudget;
assert.equal(snapshot.viewComplete, true);
assert.equal(snapshot.coverage[0].status, "unknown");
assert.equal(clientWouldService, false);
assert.equal(requests.length, 1);
console.log(JSON.stringify({ source: "950bea93", retainedChunks: snapshot.chunks.map(c => c.key),
  demanded: snapshot.coverage, viewComplete: snapshot.viewComplete,
  clientWouldService, requestsMade: requests.length,
  conclusion: "Last drawable view is complete while new demand is unknown; the client service gate is false.",
  limit: "Cache reproduction plus source gate; no hosted pan or frame-time measurement.",
}, null, 2));
cache.dispose();
