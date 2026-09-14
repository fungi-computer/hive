import assert from "node:assert/strict";
import test from "node:test";
import { STATIC_ART_RENDER, STATIC_ART_SCHEMA, parseStaticArtManifest } from "./static-manifest.js";

const hash = "a".repeat(64);
const empty = { rows: [0, 0, 0], spans: [] };
function manifest() {
  return {
    schema: STATIC_ART_SCHEMA, textureCount: 3,
    anchors: { pawn: { x: .5, y: .75 }, prop: { x: .5, y: .8 }, vehicle: { x: .5, y: .82 } },
    ground: { file: "ground.png", sha256: hash, width: 640, height: 400, silhouette: { rows: Array(401).fill(0), spans: [] } },
    pages: [{ id: "atlas-0", file: "atlas-0.png", sha256: hash, width: 16, height: 16 }],
    entries: [
      { path: ["buildings", "stair", "finished", 0], page: "atlas-0", x: 1, y: 1, width: 2, height: 2, placement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2, 2], rotationPivot: [0, 0, 0] }, silhouette: empty },
      { path: ["parts", "stair", 0, "surface"], page: "atlas-0", x: 4, y: 1, width: 2, height: 2, silhouette: empty, part: { owner: JSON.stringify(["buildings", "stair", "finished", 0]), id: "surface", role: "supporting-surface", geometry: { footprint: [[0, 0, 0]], minY: 0, maxY: 2 } } },
    ],
    provenance: { threeRevision: "185", renderer: { ...STATIC_ART_RENDER.renderer }, sources: [{ path: "src/art/stair.js", sha256: hash }] },
  };
}

test("multipart manifest part owner is canonical and strictly validated", () => {
  const parsed = parseStaticArtManifest(manifest());
  assert.equal(parsed.entries[1].part.owner, '["buildings","stair","finished",0]');
  const malformed = manifest();
  malformed.entries[1].part.owner = "stair";
  assert.throws(() => parseStaticArtManifest(malformed), /path-encoding|unknown-owner/);
  const duplicate = manifest();
  duplicate.entries[0].part = { ...duplicate.entries[1].part };
  assert.throws(() => parseStaticArtManifest(duplicate), /duplicate-id|unknown-owner/);
});
