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
});
