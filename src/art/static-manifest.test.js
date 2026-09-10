import assert from "node:assert/strict";
import test from "node:test";
import {
  STATIC_ART_RENDER,
  STATIC_ART_SCHEMA,
  completeStaticArtManifest,
  parseStaticArtManifest,
} from "./static-manifest.js";
import {
  registerVisibleSilhouette,
  snapshotVisibleSilhouette,
} from "../visual-hit-geometry.js";

const HASH = "a".repeat(64);

function emptySilhouette(width, height) {
  return { rows: Array(height + 1).fill(0), spans: [] };
}

function manifest() {
  return {
    schema: STATIC_ART_SCHEMA,
    textureCount: 3,
    anchors: {
      pawn: { x: 0.5, y: 0.75 },
      prop: { x: 0.5, y: 0.8 },
      vehicle: { x: 0.5, y: 0.82 },
    },
    ground: {
      file: "ground.png",
      sha256: HASH,
      width: 640,
      height: 400,
      silhouette: emptySilhouette(640, 400),
    },
    pages: [
      {
        id: "atlas-0",
        file: "atlas-0.png",
        sha256: HASH,
        width: 16,
        height: 16,
      },
    ],
    entries: [
      {
        path: ["figures", "rowan"],
        page: "atlas-0",
        x: 1,
        y: 1,
        width: 2,
        height: 2,
        silhouette: { rows: [0, 1, 1], spans: [0, 1] },
      },
      {
        path: ["tree", "standing"],
        page: "atlas-0",
        x: 4,
        y: 1,
        width: 2,
        height: 2,
        silhouette: { rows: [0, 0, 1], spans: [1, 1] },
      },
    ],
    provenance: {
      threeRevision: "185",
      renderer: { ...STATIC_ART_RENDER.renderer },
      sources: [{ path: "src/art.js", sha256: HASH }],
    },
  };
}

test("static art manifest admits detached finite frames and CPU silhouettes", () => {
  const input = manifest();
  input.entries[1].path = ["wood", "1"];
  const parsed = parseStaticArtManifest(input);
  input.entries[0].path[0] = "changed";
  input.entries[0].silhouette.spans[0] = 1;
  input.anchors.pawn.x = 0;
  assert.deepEqual(parsed.entries[0].path, ["figures", "rowan"]);
  assert.deepEqual(parsed.entries[1].path, ["wood", "1"]);
  assert.deepEqual(parsed.entries[0].silhouette.spans, [0, 1]);
  assert.deepEqual(parsed.anchors.pawn, { x: 0.5, y: 0.75 });
  assert.deepEqual(parsed.anchors.vehicle, { x: 0.5, y: 0.82 });
  assert(Object.isFrozen(parsed));
});

test("static art manifest rejects the superseded bank format", () => {
  const input = manifest();
  input.schema = "goblin-static-art-v1";
  assert.throws(() => parseStaticArtManifest(input), /unsupported/);
});

test("manifest completion binds output and source byte identities", () => {
  const input = manifest();
  const draft = {
    ...input,
    ground: (({ sha256, ...ground }) => ground)(input.ground),
    pages: input.pages.map(({ sha256, ...page }) => page),
    provenance: (({ sources, ...provenance }) => provenance)(input.provenance),
  };
  const parsed = completeStaticArtManifest(
    draft,
    { "ground.png": HASH, "atlas-0.png": HASH },
    input.provenance.sources,
  );
  assert.equal(parsed.ground.sha256, HASH);
  assert.equal(parsed.pages[0].sha256, HASH);
  assert.deepEqual(parsed.provenance.sources, input.provenance.sources);
});

test("static art manifest rejects unknown data and malformed finite bounds", () => {
  const unknown = manifest();
  unknown.entries[0].ignored = true;
  assert.throws(() => parseStaticArtManifest(unknown), /unexpected-fields/);
  const nonfinite = manifest();
  nonfinite.entries[0].x = Infinity;
  assert.throws(() => parseStaticArtManifest(nonfinite), /integer-range/);
  const ground = manifest();
  ground.ground.width = 639;
  assert.throws(() => parseStaticArtManifest(ground), /unexpected-size/);
  const getter = manifest();
  Object.defineProperty(getter.entries[0], "width", {
    enumerable: true,
    get() {
      throw new Error("must not read");
    },
  });
  assert.throws(() => parseStaticArtManifest(getter), /plain-data-required/);
});

test("texture paths have one container shape and cannot overlap or alias", () => {
  const duplicate = manifest();
  duplicate.entries[1].path = ["figures", "rowan"];
  assert.throws(() => parseStaticArtManifest(duplicate), /duplicate-path/);
  const prefix = manifest();
  prefix.entries[1].path = ["figures", "rowan", "idle"];
  assert.throws(() => parseStaticArtManifest(prefix), /path-prefix-conflict/);
  const container = manifest();
  container.entries[0].path = ["figures", 0];
  container.entries[1].path = ["figures", "rowan"];
  assert.throws(
    () => parseStaticArtManifest(container),
    /container-kind-conflict/,
  );
  const overlap = manifest();
  overlap.entries[1].x = 2;
  assert.throws(() => parseStaticArtManifest(overlap), /overlapping-frames/);

  const sparse = manifest();
  sparse.entries[0].path = ["figures", 1];
  sparse.entries[1].path = ["figures", 2];
  assert.throws(() => parseStaticArtManifest(sparse), /sparse-array-path/);
});

test("manifest arrays cannot hide holes or ignored properties", () => {
  const hole = manifest();
  delete hole.entries[0].path[0];
  assert.throws(() => parseStaticArtManifest(hole), /plain-array-required/);

  const hidden = manifest();
  Object.defineProperty(hidden.pages, "ignored", { value: true });
  assert.throws(() => parseStaticArtManifest(hidden), /plain-array-required/);
});

test("silhouette rows own ordered, bounded nonadjacent spans", () => {
  const count = manifest();
  count.entries[0].silhouette.rows = [0, 0, 0];
  assert.throws(() => parseStaticArtManifest(count), /span-count/);
  const adjacent = manifest();
  adjacent.entries[0].width = 4;
  adjacent.entries[0].silhouette = { rows: [0, 2, 2], spans: [0, 0, 1, 1] };
  assert.throws(() => parseStaticArtManifest(adjacent), /overlap-or-adjacency/);
  const outside = manifest();
  outside.entries[0].silhouette.spans = [0, 2];
  assert.throws(() => parseStaticArtManifest(outside), /integer-range/);
});

test("loaded silhouette registration detaches checked CPU picking data", () => {
  const texture = {};
  const input = { width: 4, height: 2, rows: [0, 1, 2], spans: [0, 1, 3, 3] };
  registerVisibleSilhouette(texture, input);
  input.rows[1] = 0;
  input.spans[0] = 3;
  assert.deepEqual(snapshotVisibleSilhouette(texture), {
    width: 4,
    height: 2,
    rows: [0, 1, 2],
    spans: [0, 1, 3, 3],
  });
  assert.throws(
    () =>
      registerVisibleSilhouette(
        {},
        {
          width: 4,
          height: 1,
          rows: [0, 1],
          spans: [0, 65536],
        },
      ),
    /Invalid visible texture silhouette/,
  );
});

test("manifest completion preserves actual camelCase art paths", () => {
  const input = manifest();
  const paths = [
    ["mixedShelf", "wood-herb", 0],
    ["wallJoints", "finished", 0],
  ];
  input.entries.forEach((entry, index) => {
    entry.path = paths[index];
  });
  const complete = completeStaticArtManifest(
    input,
    { "ground.png": HASH, "atlas-0.png": HASH },
    input.provenance.sources,
  );
  assert.deepEqual(
    complete.entries.map((entry) => entry.path),
    paths,
  );
  assert.deepEqual(parseStaticArtManifest(complete), complete);
});

test("camelCase path admission retains inherited, reserved and size rejection", () => {
  for (const path of [
    ["figures", "toString"],
    ["figures", "hasOwnProperty"],
    ["figures", "constructor"],
    ["figures", "__proto__"],
    ["pawnAnchor", "x"],
    ["bakeTerrainSlice", "frame"],
    ["mixedShelf", "a".repeat(65)],
  ]) {
    const input = manifest();
    input.entries[0].path = path;
    assert.throws(
      () => parseStaticArtManifest(input),
      /inherited-key|reserved-root|string-format/,
    );
  }
});
