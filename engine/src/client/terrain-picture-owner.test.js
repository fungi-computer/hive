import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainPictureOwner } from "./terrain-picture-owner.js";
import { materialPatch } from "../runtime/terrain-region-fixture.js";
import { createOrderingProjection } from "./ordering-projection.js";

function input() {
  const bounds = { minX: 0, maxX: 4, minY: -2, maxY: 3, minZ: 0, maxZ: 4 };
  const baseline = { protocolVersion: 5, bounds, verticalMetres: .54, materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] };
  return { snapshot: { baseline, patches: [materialPatch([0,0,0], bounds, ([,y]) => y <= 0 ? 1 : 0)] },
    plan: {}, surfaces: [], level: 0, projection: createOrderingProjection(), appearance: { body() {} } };
}
function finish(task) {
  let slices = 0;
  while (task.status === "pending") { task.advance({ maxOperations: 1 }); assert(++slices < 10000); }
  assert.equal(task.status, "ready"); return task.result;
}

function coveredInput() {
  const bounds = { minX: 0, maxX: 16, minY: -2, maxY: 3, minZ: 0, maxZ: 8 };
  const baseline = { protocolVersion: 5, bounds, verticalMetres: .54,
    materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] };
  const grass = { kind: "grass", condition: "green", height: "full" };
  const patches = [[0, 0, 0], [1, 0, 0]].map(key => {
    const patch = materialPatch(key, bounds, ([, y]) => y <= 0 ? 1 : 0);
    for (let x = patch.coverage.minX; x < patch.coverage.maxX; x++)
      for (let z = patch.coverage.minZ; z < patch.coverage.maxZ; z++)
        patch.surfaces.push({ cell: [x, 0, z], material: 1, generatedTop: 0, cover: grass });
    return patch;
  });
  const projection = createOrderingProjection(), styles = new Map();
  const appearance = {
    body() {},
    cover({ root, mask, cover }) {
      const key = `${mask}:${cover.height}`;
      if (!styles.has(key)) styles.set(key, { key });
      const at = projection.project({ x: root[0] + .5, y: .27, z: root[1] + .5 });
      return { terrainBatch: styles.get(key), projected: [
        { x: at.x - 2, y: at.y - 4 }, { x: at.x - 2, y: at.y + 2 },
        { x: at.x + 2, y: at.y + 2 }, { x: at.x + 2, y: at.y - 4 },
      ] };
    },
  };
  return { baseline, patches, projection, appearance,
    source: { snapshot: { baseline, patches }, plan: {}, viewport: { left: -10, right: 10, top: -10, bottom: 10 },
      surfaces: [], level: 0, projection, appearance } };
}

function publish(owner, source) {
  const task = owner.prepare(source);
  finish(task);
  return task.publish();
}

test("one-operation preparation keeps old terrain visible through ready and publishes only on commit", () => {
  const owner = createTerrainPictureOwner(), source = input(), before = owner.published;
  const first = owner.prepare(source);
  first.advance({ maxOperations: 1 });
  assert.equal(owner.metrics().operations, 1);
  assert.equal(owner.published, before);
  const initial = finish(first);
  assert.equal(initial.records.length, 16);
  assert.equal(owner.published, before, "ready is not published");
  first.publish();
  assert.equal(owner.published, initial);
  const cut = owner.prepare({ ...source, level: -1 });
  const cutPicture = finish(cut);
  assert(cutPicture.records.every(record => record.cap && record.cell[1] === -1));
  assert.equal(owner.published, initial);
  cut.publish(); assert.equal(owner.published, cutPicture);
  owner.dispose();
});

test("published picture omits cave floor under intact roof and reveals it after a cut", () => {
  const bounds = { minX: 0, maxX: 3, minY: 0, maxY: 5, minZ: 0, maxZ: 3 };
  const baseline = { protocolVersion: 5, bounds, verticalMetres: .54,
    materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] };
  const source = { snapshot: { baseline, patches: [materialPatch([0, 0, 0], bounds,
    ([, y]) => y === 0 || y === 3 ? 1 : 0)] }, surfaces: [], level: 4,
    projection: createOrderingProjection(), appearance: { body() {} } };
  const owner = createTerrainPictureOwner();
  const roof = publish(owner, source);
  assert(roof.exposedFaces.length > 0 && roof.exposedFaces.every(record => record.cell[1] === 3));
  const cut = publish(owner, { ...source, level: 2 });
  assert(cut.exposedFaces.length > 0 && cut.exposedFaces.every(record => record.cell[1] === 0));
  owner.dispose();
});

test("unchanged terrain retains complete picture identity, cancelled and superseded cuts do not publish", () => {
  const owner = createTerrainPictureOwner(), source = input();
  const initial = owner.prepare(source); finish(initial); const shown = initial.publish();
  const unchanged = owner.prepare(source); finish(unchanged);
  assert.equal(unchanged.result.records, shown.records);
  assert.equal(unchanged.result.exposedFaces, shown.exposedFaces);
  assert.equal(unchanged.result.surfaces, shown.surfaces);
  unchanged.publish();
  const cancelled = owner.prepare({ ...source, level: -1 }); finish(cancelled); cancelled.cancel();
  assert.equal(cancelled.result, undefined);
  assert.equal(owner.published.records, shown.records);
  assert.throws(() => cancelled.publish(), /not ready|stale/);
  const older = owner.prepare({ ...source, level: -2 }); older.advance({ maxOperations: 1 });
  const newer = owner.prepare(source);
  assert.equal(older.status, "cancelled"); assert.equal(older.result, undefined);
  finish(newer); newer.publish(); assert.equal(owner.published.records, shown.records);
  owner.dispose();
});

test("deadline, record budget and disposal protect the published picture", () => {
  const source = input(), owner = createTerrainPictureOwner({ clock: () => 10, maxRecords: 1 });
  const before = owner.published, task = owner.prepare(source);
  task.advance({ deadline: 10 });
  assert.equal(owner.metrics().operations, 0);
  assert.equal(task.status, "pending");
  assert.throws(() => finish(task), /record budget exceeded/);
  assert.equal(task.status, "failed"); assert.equal(task.result, undefined);
  assert.equal(owner.metrics().failed, 1); assert.equal(owner.metrics().cancelled, 0);
  assert.equal(owner.published, before);
  const pending = owner.prepare(source); owner.dispose();
  assert.equal(pending.status, "cancelled");
  assert.throws(() => owner.prepare(source), /disposed/);
});

test("picture budget rejects disabled or invalid limits",()=>{
  for(const maxRecords of [-1,0,NaN,Infinity,1.5]) assert.throws(()=>createTerrainPictureOwner({maxRecords}),/positive safe integer/);
  for(const maxRetainedEntries of [-1,0,NaN,Infinity,1.5])
    assert.throws(()=>createTerrainPictureOwner({maxRetainedEntries}),/positive safe integer/);
  for(const maxRetainedRecords of [-1,0,NaN,Infinity,1.5])
    assert.throws(()=>createTerrainPictureOwner({maxRetainedRecords}),/positive safe integer/);
});

test("pan plan and viewport changes publish the same full chunk derivative with zero reconstruction", () => {
  const owner = createTerrainPictureOwner(), source = input(), first = publish(owner, source), before = owner.metrics();
  const panned = publish(owner, { ...source, plan: { regions: [[0, 0]] },
    viewport: { left: 10000, right: 10001, top: 10000, bottom: 10001 } });
  const after = owner.metrics();
  assert.strictEqual(panned.records, first.records);
  assert.strictEqual(panned.exposedFaces, first.exposedFaces);
  assert.strictEqual(panned.surfaces, first.surfaces);
  assert.equal(after.bodyBuilds, before.bodyBuilds, "pan does not rerun material exposure");
  assert.equal(after.faceRecordsBuilt, before.faceRecordsBuilt, "pan does not reproject face records");
  assert.equal(after.coverBuilds, before.coverBuilds, "pan does not reconstruct cover records");
  assert.equal(after.retainedEntries, 1);
  owner.dispose();
});

test("view membership return reuses entries while inactive derivatives own zero canonical material references or bytes", () => {
  const { source, patches } = coveredInput(), owner = createTerrainPictureOwner();
  const first = publish(owner, { ...source, snapshot: { ...source.snapshot, patches: [patches[0]] } });
  const both = publish(owner, source), built = owner.metrics();
  assert.strictEqual(both.regions[0], first.regions[0], "an arriving region does not rebuild its neighbor's picture");
  assert.equal(both.regions[0].id, patches[0].key.join(","));
  assert.strictEqual(both.regions[0].exposedFaces, first.regions[0].exposedFaces);
  assert(first.records.every(record => both.records.includes(record)), "adding a patch preserves the first derivative");
  const secondRecords = both.records.filter(record => !first.records.includes(record));
  const onlySecond = publish(owner, { ...source, snapshot: { ...source.snapshot, patches: [patches[1]] } });
  assert(secondRecords.every(record => onlySecond.records.includes(record)), "leaving hides without rebuilding the remaining patch");
  const returned = publish(owner, source);
  assert.strictEqual(returned.regions[0], first.regions[0]);
  assert.strictEqual(returned.regions[1], both.regions[1]);
  assert(both.records.every(record => returned.records.includes(record)), "return reuses recently-left records by identity");
  assert.equal(owner.metrics().bodyBuilds, built.bodyBuilds);
  assert.equal(owner.metrics().coverBuilds, built.coverBuilds);
  assert.equal(owner.metrics().retainedEntries, 2);
  assert.equal(owner.metrics().retainedMaterialPatches, 0, "derived retention never becomes material residency");
  assert.equal(owner.metrics().retainedMaterialBytes, 0);
  owner.dispose();
});

test("cancelled ready successor cannot evict or reorder the published retention LRU", () => {
  const { source, patches } = coveredInput(), owner = createTerrainPictureOwner({ maxRetainedEntries: 1 });
  const withPatch = patch => ({ ...source, snapshot: { ...source.snapshot, patches: [patch] } });
  const shown = publish(owner, withPatch(patches[0]));
  const successor = owner.prepare(withPatch(patches[1]));
  finish(successor);
  successor.cancel();
  const afterCancel = owner.metrics();
  assert.strictEqual(owner.published.records, shown.records, "cancellation preserves the published picture");
  assert.equal(afterCancel.retainedEntries, 1);
  assert.equal(afterCancel.retentionEvictions, 0, "candidate eviction does not mutate the accepted LRU");
  const returned = publish(owner, withPatch(patches[0]));
  assert.strictEqual(returned.records, shown.records);
  assert.equal(owner.metrics().bodyBuilds, afterCancel.bodyBuilds, "the accepted derivative survived candidate cancellation");
  owner.dispose();
});

test("retention is bounded and an evicted return reconstructs only the entering chunk", () => {
  const { source, patches } = coveredInput(), owner = createTerrainPictureOwner({ maxRetainedEntries: 1 });
  const withPatch = patch => ({ ...source, snapshot: { ...source.snapshot, patches: [patch] } });
  publish(owner, withPatch(patches[0]));
  publish(owner, withPatch(patches[1]));
  const beforeReturn = owner.metrics();
  assert.equal(beforeReturn.retainedEntries, 1);
  assert.equal(beforeReturn.retentionEvictions, 1);
  publish(owner, withPatch(patches[0]));
  const afterReturn = owner.metrics();
  assert.equal(afterReturn.bodyBuilds, beforeReturn.bodyBuilds + 1);
  assert.equal(afterReturn.coverBuilds, beforeReturn.coverBuilds + 1);
  assert.equal(afterReturn.retainedEntries, 1);
  assert.equal(afterReturn.retentionEvictions, 2);
  owner.clear();
  assert.equal(owner.metrics().retainedEntries, 0);
  assert.equal(owner.metrics().retainedRecords, 0);
  owner.dispose();
});

test("cut changes discard inactive old-view derivatives instead of accumulating view history", () => {
  const { source, patches } = coveredInput(), owner = createTerrainPictureOwner();
  publish(owner, source);
  publish(owner, { ...source, snapshot: { ...source.snapshot, patches: [patches[0]] } });
  assert.equal(owner.metrics().retainedEntries, 2, "the left chunk remains reusable in the current view");
  publish(owner, { ...source, level: -1, snapshot: { ...source.snapshot, patches: [patches[0]] } });
  assert.equal(owner.metrics().retainedEntries, 1, "old-cut inactive pictures are released");
  owner.dispose();
});

test("cut, turn, art and material identity invalidate their chunk derivative", () => {
  const owner = createTerrainPictureOwner(), source = input();
  publish(owner, source);
  let builds = owner.metrics().bodyBuilds;
  publish(owner, { ...source, level: -1 });
  assert.equal(owner.metrics().bodyBuilds, ++builds, "cut changes exposure");
  const projection = createOrderingProjection();
  publish(owner, { ...source, level: -1, projection });
  assert.equal(owner.metrics().bodyBuilds, ++builds, "turn projection changes projected pictures");
  publish(owner, { ...source, level: -1, projection, appearance: { body() {} } });
  assert.equal(owner.metrics().bodyBuilds, ++builds, "art convention changes pictures");
  const replacement = materialPatch([0, 0, 0], source.snapshot.baseline.bounds, ([, y]) => y <= 0 ? 1 : 0);
  publish(owner, { ...source, level: -1, projection, appearance: source.appearance,
    snapshot: { ...source.snapshot, patches: [replacement] } });
  assert.equal(owner.metrics().bodyBuilds, ++builds, "new material patch identity invalidates only its derivative");
  owner.dispose();
});

test("one mown cell rebuilds four local mask roots while earth and unrelated cover retain identity", () => {
  const { source } = coveredInput(), owner = createTerrainPictureOwner(), initial = publish(owner, source);
  const body = initial.records.filter(record => record.role === "terrain");
  const cover = initial.records.filter(record => record.role === "terrain-cover");
  const affected = new Set(["2,2", "1,2", "1,1", "2,1"]);
  const unaffected = cover.filter(record => !affected.has(`${record.attachment.point.x - .5},${record.attachment.point.z - .5}`));
  const before = owner.metrics();
  const mown = publish(owner, { ...source, surfaces: [{ cell: [2, 0, 2], material: 1, generatedTop: 0,
    cover: { kind: "grass", condition: "green", height: "short" } }] });
  assert.notStrictEqual(mown.regions[0], initial.regions[0]);
  assert.strictEqual(mown.regions[1], initial.regions[1], "mowing cannot invalidate the neighboring region picture");
  const after = owner.metrics();
  assert(body.every(record => mown.records.includes(record)), "cover mutation never rebuilds earth body");
  assert(unaffected.every(record => mown.records.includes(record)), "unaffected mask roots retain record identity");
  assert.equal(after.bodyBuilds, before.bodyBuilds);
  assert.equal(after.faceRecordsBuilt, before.faceRecordsBuilt);
  assert.equal(after.coverBuilds, before.coverBuilds + 1, "only the owning chunk updates cover");
  assert.equal(after.coverRootsRebuilt, before.coverRootsRebuilt + 4);
  assert(after.coverRecordsBuilt - before.coverRecordsBuilt <= 8, "local mixed masks build bounded replacement records");
  owner.dispose();
});
