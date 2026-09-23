import test from "node:test";
import assert from "node:assert/strict";
import { Container, Texture, MeshGeometry } from "pixi.js";
import { createTerrainBatchMeshes as createPaintBatchMeshes } from "./terrain-face-batches.js";

// Existing resource-lifecycle fixtures vary the records inside one paint leaf.
// Production callers supply the structural owner's immutable leaves directly.
function createTerrainBatchMeshes(options) {
  const owner = createPaintBatchMeshes(options);
  const leaf = records => [Object.freeze({ band: 0, records: Object.freeze(records) })];
  return {
    prepare: records => owner.prepare(leaf(records)),
    update: records => owner.update(leaf(records)),
    get size() { return owner.size; },
    metrics: owner.metrics,
    dispose: owner.dispose,
  };
}

const BYTES_PER_QUAD = 8 * 4 * 2 + 6 * 2;
function view(region, runs, quads) {
  return Array.from({ length: runs }, (_, run) => [
    ...Array.from({ length: quads }, (_, index) => ({
      id: `${region}:${run}:${index}`,
      part: "face",
      projected: [
        { x: region, y: 0 },
        { x: region, y: 1 },
        { x: region + 1, y: 1 },
        { x: region + 1, y: 0 },
      ],
      terrainBatch: { texture: Texture.WHITE, uvs: [0, 0, 0, 1, 1, 1, 1, 0] },
    })),
    { id: `separator:${run}` },
  ]).flat();
}
function bounded(owner, activeRecords) {
  const metrics = owner.metrics();
  assert(Object.isFrozen(metrics));
  assert(Object.isFrozen(metrics.limits));
  assert(metrics.activeMeshes + metrics.spareMeshes <= metrics.limits.meshes);
  assert(metrics.spareMeshes <= metrics.limits.spareMeshes);
  assert(metrics.spareQuads <= metrics.limits.spareQuads);
  assert(metrics.spareBufferBytes <= 16000 * BYTES_PER_QUAD);
  assert.equal(metrics.activeBufferBytes, metrics.activeQuads * BYTES_PER_QUAD);
  assert.equal(metrics.spareBufferBytes, metrics.spareQuads * BYTES_PER_QUAD);
  assert.equal(
    metrics.spareRecords,
    0,
    "idle meshes retain no historical world records",
  );
  assert.equal(metrics.activeRecords, activeRecords);
  assert.equal(metrics.retainedRecords, activeRecords + metrics.pendingRecords);
  assert(
    metrics.activeMeshes + metrics.spareMeshes + metrics.pendingMeshes <=
      metrics.limits.retainedMeshes,
  );
  assert(
    metrics.activeQuads + metrics.spareQuads + metrics.pendingQuads <=
      metrics.limits.retainedQuads,
  );
  assert.equal(
    metrics.pendingBufferBytes,
    metrics.pendingQuads * BYTES_PER_QUAD,
  );
  return metrics;
}

test("many changed views bound idle buffers and records through large, small, empty and dispose", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent });
  const texture = Texture.WHITE,
    source = texture.source;
  for (let region = 0; region < 8; region++) {
    const large = owner
      .update(view(region, 20, 1200))
      .filter((batch) => batch.kind === "terrain");
    assert.equal(bounded(owner, 24000).activeMeshes, 20);
    assert.equal(parent.children.length, 20);
    const small = owner.update(view(region + 100, 1, 2))[0].display;
    assert(
      !large.some((batch) => batch.display === small),
      "changed geometry is prepared in a detached mesh",
    );
    assert.equal(
      small.geometry.positions.length,
      16,
      "large replacement buffers shrink to current geometry",
    );
    for (const buffer of [
      small.geometry.attributes.aPosition.buffer,
      small.geometry.attributes.aUV.buffer,
      small.geometry.indexBuffer,
    ]) {
      assert.equal(buffer.shrinkToFit, true);
      assert.equal(
        buffer.descriptor.size,
        buffer.data.byteLength,
        "GPU allocation request also shrinks",
      );
    }
    bounded(owner, 2);
    assert.equal(parent.children.length, 1);
    owner.update([]);
    const empty = bounded(owner, 0);
    assert.equal(empty.activeMeshes, 0);
    assert(empty.spareMeshes > 0);
    assert(
      large.some((batch) => batch.display.destroyed),
      "excess idle buffers are destroyed",
    );
    assert.equal(parent.children.length, 0);
  }
  owner.dispose();
  owner.dispose();
  for (const [key, value] of Object.entries(owner.metrics()))
    if (key !== "limits") assert.equal(value, 0, `${key} released`);
  assert.equal(
    texture.destroyed,
    false,
    "art texture remains owned by the pack",
  );
  assert.equal(
    source.destroyed,
    false,
    "shared atlas source survives mesh disposal",
  );
  assert.throws(() => owner.update([]), /disposed/);
  parent.destroy();
});

test("idle mesh count respects both the fixed cap and a smaller owner budget and can be reused", () => {
  for (const maxMeshes of [4, 32]) {
    const owner = createTerrainBatchMeshes({ maxMeshes });
    const records = view(0, maxMeshes, 1);
    const meshes = owner
      .update(records)
      .filter((batch) => batch.kind === "terrain")
      .map((batch) => batch.display);
    owner.update([]);
    const idle = bounded(owner, 0);
    assert.equal(idle.spareMeshes, Math.min(maxMeshes, 16));
    assert.equal(
      meshes.filter((mesh) => !mesh.destroyed).length,
      idle.spareMeshes,
    );
    const next = owner.update(view(1, 1, 1))[0].display;
    assert(
      meshes.includes(next),
      "idle mesh is reused without its retired record identity",
    );
    assert.equal(
      next.geometry.positions[0],
      1,
      "reused geometry reflects the new region",
    );
    bounded(owner, 1);
    const positions = next.geometry.positions;
    const fresh = view(1, 1, 1);
    assert.equal(owner.update(fresh)[0].display, next);
    assert.strictEqual(
      next.geometry.positions,
      positions,
      "unchanged active geometry retains its buffers",
    );
    owner.dispose();
    assert(meshes.every((mesh) => mesh.destroyed));
  }
});

function finish(task, budget = { records: 32, meshes: 1 }) {
  let turns = 0;
  while (!task.advance(budget)) {
    assert(++turns < 100000, "preparation must make bounded progress");
  }
  return turns;
}

test("changed views leave old mesh buffers and ordinary displays untouched until publication", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent, maxMeshes: 4 });
  const oldActor = new Container(),
    futureActor = new Container();
  oldActor.zIndex = 41;
  futureActor.zIndex = 93;
  parent.addChild(oldActor);
  const initial = view(0, 1, 40).filter((record) => record.terrainBatch);
  const mesh = owner.update([
    ...initial,
    { id: "actor-old", display: oldActor },
  ])[0].display;
  const positions = mesh.geometry.positions,
    values = [...positions],
    initialChildren = [...parent.children],
    oldZ = oldActor.zIndex;
  const task = owner.prepare([
    ...view(1, 1, 60).filter((record) => record.terrainBatch),
    { id: "actor-future", display: futureActor },
  ]);
  assert.equal(task.ready, false);
  assert.throws(() => task.publish(), /not ready/);
  let turns = 0;
  do {
    task.advance({ records: 7, meshes: 1 });
    turns++;
    assert.deepEqual(parent.children, initialChildren);
    assert.strictEqual(mesh.geometry.positions, positions);
    assert.deepEqual([...positions], values);
    assert.equal(oldActor.zIndex, oldZ);
    assert.equal(futureActor.parent, null);
    assert.equal(futureActor.zIndex, 93);
    bounded(owner, 40);
  } while (!task.ready);
  assert(turns > 10, "planning and packing span multiple advances");
  parent.addChild(futureActor); // The actor owner publishes immediately before meshes.
  const published = task.publish();
  assert.notStrictEqual(published[0].display, mesh);
  assert.equal(published[0].display.geometry.positions[0], 1);
  assert.equal(futureActor.zIndex, 1);
  assert.equal(mesh.parent, null);
  assert.equal(oldActor.destroyed, false);
  bounded(owner, 60);
  owner.dispose();
  assert.equal(oldActor.destroyed, false);
  assert.equal(futureActor.destroyed, false);
  parent.destroy({ children: true });
});

test("unchanged records and non-terrain displays still yield and retain existing meshes", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent });
  const records = view(0, 1, 100),
    mesh = owner.update(records)[0].display,
    positions = mesh.geometry.positions;
  const task = owner.prepare(records);
  assert.equal(task.advance({ records: 1, meshes: 1 }), false);
  assert(finish(task, { records: 1, meshes: 1 }) >= 100);
  assert.equal(owner.metrics().pendingMeshes, 0);
  assert.strictEqual(task.publish()[0].display, mesh);
  assert.strictEqual(mesh.geometry.positions, positions);
  const future = Array.from({ length: 300 }, (_, id) => ({
    id: `ordinary-${id}`,
    display: new Container(),
  }));
  const ordinary = owner.prepare(future);
  assert.equal(ordinary.advance({ records: 1, meshes: 1 }), false);
  assert(finish(ordinary, { records: 1, meshes: 1 }) >= 300);
  assert(future.every((record) => record.display.parent === null));
  ordinary.cancel();
  assert.strictEqual(parent.children[0], mesh);
  owner.dispose();
  for (const record of future) record.display.destroy();
  parent.destroy();
});

test("fresh equivalent records preserve geometry and defer style changes until publish", () => {
  const owner = createTerrainBatchMeshes(),
    records = view(0, 1, 3),
    mesh = owner.update(records)[0].display;
  const positions = mesh.geometry.positions,
    originalBlend = mesh.blendMode;
  const changed = view(0, 1, 3).map((record) =>
    record.terrainBatch
      ? {
          ...record,
          terrainBatch: { ...record.terrainBatch, blendMode: "add" },
        }
      : record,
  );
  const task = owner.prepare(changed);
  finish(task);
  assert.equal(owner.metrics().pendingMeshes, 0);
  assert.equal(mesh.blendMode, originalBlend);
  assert.strictEqual(task.publish()[0].display, mesh);
  assert.strictEqual(mesh.geometry.positions, positions);
  assert.equal(mesh.blendMode, "add");
  owner.dispose();
});

test("mesh creation credit can stop after bounded packing without touching the visible scene", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent, maxMeshes: 2, maxQuads: 100 });
  const old = owner.update(view(0, 1, 80))[0].display,
    positions = old.geometry.positions;
  const task = owner.prepare(view(1, 1, 100));
  assert.equal(task.advance({ records: 1000, meshes: 0 }), false);
  const pending = bounded(owner, 80);
  assert.equal(pending.pendingMeshes, 0);
  assert.equal(pending.pendingQuads, 100);
  assert.equal(parent.children.length, 1);
  assert.strictEqual(old.geometry.positions, positions);
  assert.equal(
    task.advance({ records: 0, meshes: 1 }),
    false,
    "ordinary display separator still gets its own step",
  );
  assert.equal(owner.metrics().pendingMeshes, 1);
  assert.equal(parent.children.length, 1);
  assert.equal(task.advance({ records: 1, meshes: 0 }), true);
  task.cancel();
  assert.equal(owner.metrics().pendingMeshes, 0);
  assert.equal(owner.metrics().pendingBufferBytes, 0);
  assert.strictEqual(parent.children[0], old);
  bounded(owner, 80);
  owner.dispose();
  parent.destroy();
});

test("cancel and supersede release only staged resources and cannot resume stale work", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent, maxMeshes: 2, maxQuads: 20 });
  const mesh = owner.update(view(0, 1, 20))[0].display,
    positions = mesh.geometry.positions;
  const cancelled = owner.prepare(view(1, 1, 20));
  finish(cancelled);
  assert.equal(owner.metrics().pendingMeshes, 1);
  cancelled.cancel();
  cancelled.cancel();
  assert.throws(() => cancelled.advance(), /cancelled/);
  assert.throws(() => cancelled.publish(), /cancelled/);
  assert.strictEqual(parent.children[0], mesh);
  assert.strictEqual(mesh.geometry.positions, positions);
  bounded(owner, 20);
  const old = owner.prepare(view(2, 1, 20));
  old.advance({ records: 25, meshes: 1 });
  const replacement = owner.prepare(view(3, 1, 20));
  assert.throws(() => old.advance(), /cancelled/);
  assert.equal(parent.children.length, 1);
  finish(replacement);
  const next = replacement.publish()[0].display;
  assert.equal(next.geometry.positions[0], 3);
  assert.notEqual(next, mesh);
  old.cancel();
  assert.strictEqual(parent.children[0], next);
  bounded(owner, 20);
  owner.dispose();
  parent.destroy();
});

test("view budget and late validation failures preserve accepted buffers without partial publication", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent, maxMeshes: 2, maxQuads: 10 });
  const mesh = owner.update(view(0, 1, 4))[0].display,
    positions = mesh.geometry.positions;
  for (const records of [
    view(1, 3, 1),
    view(1, 1, 11),
    [
      ...view(1, 1, 3),
      {
        id: "bad",
        terrainBatch: { texture: Texture.WHITE, uvs: [] },
        projected: [],
      },
    ],
  ]) {
    const task = owner.prepare(records);
    assert.throws(() => finish(task), /view-budget|requires/);
    assert.strictEqual(parent.children[0], mesh);
    assert.strictEqual(mesh.geometry.positions, positions);
    assert.equal(owner.metrics().pendingMeshes, 0);
    assert.equal(owner.metrics().pendingBufferBytes, 0);
    bounded(owner, 4);
  }
  owner.dispose();
  parent.destroy();
});

test("active, pending and spare buffers remain bounded through repeated staged travel and disposal", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent, maxMeshes: 4, maxQuads: 80 });
  owner.update(view(0, 4, 20));
  for (let region = 1; region <= 12; region++) {
    const before = owner.metrics().activeRecords;
    const task = owner.prepare(view(region, region % 2 ? 1 : 4, 20));
    while (!task.advance({ records: 11, meshes: 1 })) bounded(owner, before);
    bounded(owner, before);
    if (region % 3 === 0) task.cancel();
    else task.publish();
    bounded(owner, owner.metrics().activeRecords);
  }
  const pending = owner.prepare(view(99, 4, 20));
  finish(pending);
  owner.dispose();
  owner.dispose();
  pending.cancel();
  for (const [key, value] of Object.entries(owner.metrics()))
    if (key !== "limits") assert.equal(value, 0, `${key} released`);
  assert.equal(parent.children.length, 0);
  assert.equal(Texture.WHITE.destroyed, false);
  assert.equal(Texture.WHITE.source.destroyed, false);
  assert.throws(() => pending.publish(), /disposed/);
  parent.destroy();
});

test("ordinary display admission is bounded and fails before publishing or silently dropping sprites", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent });
  const mesh = owner.update(view(0, 1, 2))[0].display;
  const records = Array.from({ length: 4096 }, (_, id) => ({
    id: `sprite-${id}`,
  }));
  const accepted = owner.prepare(records);
  finish(accepted);
  assert.equal(owner.metrics().pendingDisplays, 4096);
  assert.equal(parent.children.length, 1);
  accepted.cancel();
  const tooMany = owner.prepare([...records, { id: "overflow" }]);
  assert.throws(
    () => finish(tooMany),
    (error) =>
      error instanceof RangeError &&
      /ordinary-display view-budget/.test(error.message),
  );
  assert.strictEqual(parent.children[0], mesh);
  assert.equal(owner.metrics().pendingDisplays, 0);
  assert.equal(owner.metrics().limits.ordinaryDisplays, 4096);
  owner.dispose();
  parent.destroy();
});

test("a mesh-construction failure releases earlier staged meshes and its failed geometry", () => {
  const parent = new Container(),
    owner = createTerrainBatchMeshes({ parent, maxMeshes: 4 });
  const mesh = owner.update(view(0, 1, 2))[0].display,
    positions = mesh.geometry.positions;
  const badTexture = {
    source: Texture.WHITE.source,
    dynamic: true,
    on() {
      throw new Error("texture admission failed");
    },
  };
  const records = view(1, 2, 2).map((record) =>
    record.terrainBatch && record.id.startsWith("1:1:")
      ? {
          ...record,
          terrainBatch: { ...record.terrainBatch, texture: badTexture },
        }
      : record,
  );
  const original = MeshGeometry.prototype.destroy;
  let destroyed = 0;
  MeshGeometry.prototype.destroy = function (...args) {
    destroyed++;
    return original.apply(this, args);
  };
  try {
    const task = owner.prepare(records);
    assert.throws(() => finish(task), /texture admission failed/);
    assert(destroyed >= 1, "failed constructor geometry is released");
    assert.strictEqual(parent.children[0], mesh);
    assert.strictEqual(mesh.geometry.positions, positions);
    assert.equal(owner.metrics().pendingMeshes, 0);
    assert.equal(owner.metrics().pendingBufferBytes, 0);
    bounded(owner, 2);
  } finally {
    MeshGeometry.prototype.destroy = original;
    owner.dispose();
    parent.destroy();
  }
});


test("indexing retained active runs also consumes preparation credit, including empty successors",()=>{
 const owner=createTerrainBatchMeshes({maxMeshes:4});owner.update(view(0,4,1));
 const task=owner.prepare([]);assert.equal(task.ready,false);
 for(let i=0;i<3;i++)assert.equal(task.advance({records:1,meshes:0}),false);
 assert.equal(task.advance({records:1,meshes:0}),true);assert.equal(owner.size,4);
 task.cancel();assert.equal(owner.size,4);owner.dispose();
});

test("batch preparation owns its deadline and reports the work that caused it", () => {
  let now = 0;
  const owner = createTerrainBatchMeshes({ clock: () => now++ });
  const records = view(0, 1, 96);
  const task = owner.prepare(records);
  const afterPrepare = owner.metrics();
  assert.equal(afterPrepare.started, 1);
  assert.equal(afterPrepare.planRecords, 1);
  assert.equal(
    task.advance({ records: 1000, meshes: 10, deadline: now }),
    false,
  );
  assert.equal(
    owner.metrics().planRecords,
    afterPrepare.planRecords,
    "an expired deadline admits no hidden batch work",
  );
  finish(task, { records: 1000, meshes: 10, deadline: Infinity });
  const prepared = owner.metrics();
  assert.equal(prepared.planRecords, records.length);
  assert.equal(prepared.packedQuads, 96);
  assert.equal(prepared.meshesCreated, 1);
  assert.equal(prepared.bufferBytesAllocated, 96 * BYTES_PER_QUAD);
  assert(prepared.preparationMs >= 4);
  task.publish();
  assert.equal(owner.metrics().published, 1);
  owner.dispose();
});

test("moving actor in one retained paint leaf leaves distant Pixi buffer untouched", () => {
  const owner = createPaintBatchMeshes();
  const leaf = (band, records) => Object.freeze({ band, records: Object.freeze(records) });
  const near = leaf(0, view(0, 1, 128));
  const far = leaf(2, view(16, 1, 128));
  const initial = owner.update([near, far]);
  const farMesh = initial.find(item => item.kind === "terrain" && item.records[0] === far.records[0]).display;
  const farPositions = farMesh.geometry.positions;
  const before = owner.metrics();
  const actor = new Container();
  const changed = leaf(0, [...near.records.slice(0, 64), { id: "moved-actor", display: actor }, ...near.records.slice(64)]);
  const next = owner.update([changed, far]);
  const retained = next.find(item => item.kind === "terrain" && item.records[0] === far.records[0]).display;
  const after = owner.metrics();
  assert.strictEqual(retained, farMesh);
  assert.strictEqual(retained.geometry.positions, farPositions);
  assert.equal(after.plannedLeaves - before.plannedLeaves, 1);
  assert.equal(after.reusedLeaves - before.reusedLeaves, 1);
  assert.equal(after.planRecords - before.planRecords, changed.records.length,
    "the unaffected leaf is not visited record by record");
  assert(after.packedQuads - before.packedQuads <= 128,
    "actor insertion cannot repack the distant leaf");
  owner.dispose();
  actor.destroy();
});

test("a neighboring region arrival keeps a distant retained depth-band buffer", () => {
  const owner = createPaintBatchMeshes();
  const leaf = records => Object.freeze({ records: Object.freeze(records) });
  const far = leaf(view(16, 1, 128));
  const first = owner.update([far]);
  const farMesh = first.find(item => item.kind === "terrain").display;
  const positions = farMesh.geometry.positions;
  const before = owner.metrics();
  const near = leaf(view(0, 1, 128));
  const second = owner.update([near, far]);
  const retained = second.find(item => item.kind === "terrain" && item.records[0] === far.records[0]).display;
  const after = owner.metrics();
  assert.strictEqual(retained, farMesh);
  assert.strictEqual(retained.geometry.positions, positions);
  assert.equal(after.planRecords - before.planRecords, near.records.length);
  assert.equal(after.packedQuads - before.packedQuads, 128);
  owner.dispose();
});
