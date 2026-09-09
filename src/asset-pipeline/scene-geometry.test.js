import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { compileSceneDocument, exportSceneDocument } from "./scene-geometry.js";
import { sceneInputSchema, documentFromRecipe } from "./legacy-recipe.js";
import {
  buildAssetScene,
  assetCatalog,
} from "../../tools/asset-mcp/assets.mjs";
import { applySceneBatch } from "./scene-editor.ts";
import { inspectScene, GEOMETRY_LIMITS } from "./scene-inspection.js";
const transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
const box = (id, parentId = null) => ({
  id,
  parentId,
  transform,
  geometry: { kind: "box", size: [1, 1, 1] },
  material: null,
});
const document = (nodes) => ({
  version: 1,
  revision: 0,
  name: "geometry law",
  nodes,
});

test("legacy defaults and degrees resolve through shared pack and export exact bytes", async () => {
  const recipe = sceneInputSchema.parse({
    assets: [
      { id: "bench", kind: "bench", rotationY: 180 },
      { id: "bottle", kind: "bottle" },
    ],
  });
  assert.deepEqual(recipe.assets[0].parameters, {
    width: 1.8,
    depth: 0.75,
    height: 0.81,
  });
  assert.deepEqual(recipe.assets[1].parameters, { color: "#728e79", size: 1 });
  assert.deepEqual(documentFromRecipe(recipe).nodes[0].transform.rotation, [
    0,
    Math.PI,
    0,
  ]);
  assert.deepEqual(
    assetCatalog().builders.map((b) => b.kind),
    ["kettle", "bench", "bottle", "bookcase"],
  );
  const result = await buildAssetScene(recipe);
  assert.deepEqual(result.recipe, recipe);
  const bytes = JSON.stringify(result.scene);
  assert.equal(
    result.metadata.sha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
  assert.equal(result.metadata.bytes, Buffer.byteLength(bytes));
  const loaded = new THREE.ObjectLoader().parse(result.scene);
  assert.deepEqual(inspectScene(loaded), {
    bounds: result.metadata.bounds,
    stats: result.metadata.stats,
  });
  loaded.traverse((o) => {
    o.geometry?.dispose();
    if (o.isMesh) o.material.dispose();
  });
});

test("nested local transforms survive arbitrary saved order and Object JSON roundtrip", async () => {
  const group = {
    ...box("parent"),
    geometry: { kind: "group" },
    transform: {
      position: [2, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      scale: [2, 2, 2],
    },
  };
  const child = {
    ...box("child", "parent"),
    transform: { ...transform, position: [1, 0, 0] },
  };
  const value = await exportSceneDocument(document([child, group]));
  const loaded = new THREE.ObjectLoader().parse(value.scene);
  const subject = loaded.getObjectByName("child");
  assert.equal(subject.parent.name, "parent");
  assert.deepEqual(subject.position.toArray(), [1, 0, 0]);
  const world = subject.getWorldPosition(new THREE.Vector3());
  assert(world.distanceTo(new THREE.Vector3(2, 0, -2)) < 1e-10);
  assert.deepEqual(inspectScene(loaded).bounds, value.metadata.bounds);
  loaded.traverse((o) => {
    o.geometry?.dispose();
    if (o.isMesh) o.material.dispose();
  });
});

test("editing one original instance isolates its sibling and shared palette", () => {
  const source = documentFromRecipe(
    sceneInputSchema.parse({
      assets: [
        { id: "a", kind: "bottle" },
        { id: "b", kind: "bottle" },
      ],
    }),
  );
  const edited = applySceneBatch(source, {
    expectedRevision: 0,
    operations: [{ type: "material", id: "a", material: { color: "#ff0000" } }],
  });
  const original = compileSceneDocument(source),
    changed = compileSceneDocument(edited);
  try {
    const colors = (value, id) => {
      const result = [];
      value.root.getObjectByName(id).traverse((o) => {
        if (o.isMesh) result.push(o.material.color.getHexString());
      });
      return result;
    };
    assert.deepEqual(colors(changed, "b"), colors(original, "b"));
    assert(colors(changed, "a").every((color) => color === "ff0000"));
    assert.notDeepEqual(colors(original, "a"), colors(changed, "a"));
  } finally {
    original.dispose();
    changed.dispose();
  }
});

test("partial compiler failure disposes constructed geometry and cloned materials only", () => {
  const source = documentFromRecipe(
    sceneInputSchema.parse({ assets: [{ id: "bench", kind: "bench" }] }),
  );
  source.nodes[0].material = { color: "#ff0000" };
  const originals = [],
    disposed = [],
    clones = [];
  const geometryDispose = THREE.BufferGeometry.prototype.dispose;
  const materialDispose = THREE.Material.prototype.dispose;
  const clone = THREE.Material.prototype.clone;
  const compute = THREE.BufferGeometry.prototype.computeBoundingBox;
  try {
    THREE.Material.prototype.clone = function () {
      originals.push(this);
      const value = clone.call(this);
      clones.push(value);
      return value;
    };
    THREE.BufferGeometry.prototype.dispose = function () {
      disposed.push(this);
      return geometryDispose.call(this);
    };
    THREE.Material.prototype.dispose = function () {
      disposed.push(this);
      return materialDispose.call(this);
    };
    THREE.BufferGeometry.prototype.computeBoundingBox = function () {
      throw new Error("owned failure probe");
    };
    assert.throws(() => compileSceneDocument(source), /owned failure probe/);
    assert.equal(disposed.filter((value) => value.isBufferGeometry).length, 9);
    assert.equal(clones.length, 9);
    assert(clones.every((value) => disposed.includes(value)));
    assert(originals.every((value) => !disposed.includes(value)));
  } finally {
    THREE.BufferGeometry.prototype.dispose = geometryDispose;
    THREE.Material.prototype.dispose = materialDispose;
    THREE.Material.prototype.clone = clone;
    THREE.BufferGeometry.prototype.computeBoundingBox = compute;
  }
});

test("maximum supported original scenes fit actual budgets; empty bounds are explicit", () => {
  for (const kind of ["kettle", "bench", "bottle", "bookcase"]) {
    const value = compileSceneDocument(
      documentFromRecipe(
        sceneInputSchema.parse({
          assets: Array.from({ length: 24 }, (_, i) => ({ id: `n${i}`, kind })),
        }),
      ),
    );
    try {
      assert(value.stats.nodes <= GEOMETRY_LIMITS.nodes);
      assert(value.stats.triangles <= GEOMETRY_LIMITS.triangles);
    } finally {
      value.dispose();
    }
  }
  const empty = compileSceneDocument(document([]));
  assert.equal(empty.bounds, null);
  empty.dispose();
  empty.dispose();
  const oversized = new THREE.Group();
  for (let i = 0; i < GEOMETRY_LIMITS.nodes; i++)
    oversized.add(new THREE.Group());
  assert.throws(() => inspectScene(oversized), /budget/);
});
