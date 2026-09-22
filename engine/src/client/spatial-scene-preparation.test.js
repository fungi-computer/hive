import assert from "node:assert/strict";
import test from "node:test";
import { createSpatialSceneOwner } from "./spatial-scene-owner.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { createOrderingProjection } from "./ordering-projection.js";

const projection = { direction: { x: 0, y: 0, z: 1 }, project: ({ x, y }) => ({ x, y }),
  ray: ({ x, y }) => ({ origin: { x, y, z: 0 }, direction: { x: 0, y: 0, z: 1 } }) };
const panel = (id, x = 0, z = 0) => ({ id, orderGeometry: { kind: "face", points: [
  { x, y: 0, z }, { x: x + 2, y: 0, z }, { x: x + 2, y: 2, z }, { x, y: 2, z },
] } });
function finish(task, budget = 17, inspect = () => {}) {
  let calls = 0;
  while (task.status === "pending") {
    const next = task.advance({ maxOperations: budget });
    assert(next.operations <= budget);
    inspect(next);
    assert(++calls < 200000, "preparation must make progress");
  }
  assert.equal(task.status, "ready");
  return task.result;
}

test("preparation yields through geometry, candidate discovery and topology while old picking stays live", () => {
  const owner = createSpatialSceneOwner({ projection }), old = { ...panel("old"), contains: () => true };
  const first = owner.update({ revision: 1, staticRecords: () => [old] });
  const next = Array.from({ length: 24 }, (_, index) => ({ ...panel(`next:${index}`, 0, index), contains: () => true }));
  let supplied = 0;
  const task = owner.prepare({ revision: 2, staticRecords: () => { supplied++; return next; } });
  assert.equal(supplied, 0, "prepare itself does not run the scene supplier");
  assert.throws(() => owner.publish(task), /ready/);
  const result = finish(task, 17, () => {
    assert.equal(owner.pick({ x: 1, y: 1 }).record, old);
    assert.deepEqual(first.records, [old]);
  });
  assert.equal(supplied, 1);
  for (const phase of ["geometry", "candidate", "sort", "topology", "reference"])
    assert(task.metrics().phases[phase] > 0, `actual ${phase} work must yield`);
  const oracle = compileSpatialDrawOrder(next, { projection });
  assert.deepEqual(result.records, oracle.records);
  assert.deepEqual(result.stagedRecords, oracle.records);
  assert.equal(result.metrics.staticWork.topologyBuilds, 0);
  assert.equal(result.metrics.topologyBuilds, 1);
  assert.equal(owner.metrics().counts.compile, 1, "ready does not publish");
  const published = owner.publish(task);
  assert.equal(owner.pick({ x: 1, y: 1 }).record, published.records.at(-1));
  assert.equal(task.status, "published");
  assert.equal(task.result, null, "finished task releases its staged references");
  assert.equal(owner.metrics().tasks.published, 2);
});

test("equal-edge refreshes publish every current reference atomically without replacing the order", () => {
  const owner = createSpatialSceneOwner({ projection });
  const ground = panel("ground", 0, 1), old = { ...panel("actor", 0, 0), contains: () => true, display: {} };
  const options = { revision: 1, staticRecords: () => [ground] };
  const first = owner.update({ ...options, dynamicRecords: [old] });
  const currentGround = { ...ground, display: {} }, current = { ...old, pickable: false, target: "current" };
  const task = owner.prepare({ ...options, currentStaticRecords: [currentGround], dynamicRecords: [current] });
  finish(task, 1, () => {
    assert.equal(first.records[0], ground);
    assert.equal(first.records[1], old);
    assert.equal(owner.pick({ x: 0, y: 0 }).record, old);
  });
  assert.equal(task.result.metrics.topologyReuses, 1);
  assert.equal(task.result.recordChanges.length, 2);
  const candidate = task.result.stagedRecords;
  assert.deepEqual(candidate, [currentGround, current], "display preparation consumes candidate refs directly");
  assert.deepEqual(first.records, [ground, old], "candidate view does not mutate the live view");
  const published = owner.publish(task);
  assert.equal(published.records, first.records);
  assert.deepEqual(first.records, [currentGround, current]);
  assert.deepEqual(owner.pick({ x: 0, y: 0 }), { record: current, target: null, occluded: true });
  assert.equal(published.applyOrderRequired, true);
  assert.equal(published.stagedRecords, undefined, "published owner does not retain a stale candidate map");
  const later = { ...current, target: "later" };
  owner.update({ ...options, dynamicRecords: [later] });
  assert.deepEqual(candidate, [currentGround, current], "held candidate remains pinned after later publications");
  assert.equal(first.records[1], later);
});

test("cancelled, superseded, failed and reset preparations never replace the published picker", () => {
  const owner = createSpatialSceneOwner({ projection }), old = { ...panel("old"), contains: () => true };
  const base = { revision: 1, staticRecords: () => [old] };
  owner.update(base);
  const next = { revision: 2, staticRecords: () => Array.from({ length: 12 }, (_, index) => panel(`next:${index}`, index * 4)) };
  const partial = owner.prepare(next); partial.advance({ maxOperations: 55 });
  assert.equal(partial.cancel(), true); assert.equal(partial.cancel(), false);
  assert.equal(partial.result, null); assert.equal(partial.advance().status, "cancelled");
  assert.throws(() => owner.publish(partial), /stale/);
  assert.equal(owner.pick({ x: 0, y: 0 }).record, old);
  const ready = owner.prepare(next); finish(ready); ready.cancel();
  assert.equal(owner.pick({ x: 0, y: 0 }).record, old);
  const replaced = owner.prepare(next), replacement = owner.prepare(base);
  assert.equal(replaced.status, "cancelled");
  finish(replacement); assert.equal(owner.publish(replacement).staticRebuilt, false);
  const malformed = owner.prepare({ revision: 3, staticRecords: () => [panel("valid"), { id: "invalid", orderGeometry: {} }] });
  assert.throws(() => finish(malformed), /volume or planar face/);
  assert.equal(malformed.status, "failed"); assert.equal(malformed.result, null);
  assert.equal(owner.pick({ x: 0, y: 0 }).record, old);
  const reset = owner.prepare(next); finish(reset); owner.reset();
  assert.equal(reset.status, "cancelled"); assert.equal(owner.pick({ x: 0, y: 0 }).record, null);
  assert.equal(owner.metrics().tasks.failed, 1);
  assert.equal(owner.metrics().tasks.cancelled, 4);
});

test("deadline and operation budgets both stop work without counting idle time as preparation", () => {
  let time = 0;
  const owner = createSpatialSceneOwner({ projection, clock: () => ++time });
  const task = owner.prepare({ revision: 1, staticRecords: () => [panel("a"), panel("b", 1, 1)] });
  assert.equal(task.advance({ maxOperations: 10, deadline: time }).operations, 0);
  const limited = task.advance({ maxOperations: 10000, deadline: time + 8 });
  assert.equal(limited.status, "pending"); assert(limited.operations > 0 && limited.operations < 8);
  const elapsed = task.metrics().preparationMs;
  time += 100000;
  assert.equal(task.metrics().preparationMs, elapsed);
  finish(task, 31); owner.publish(task);
  assert(owner.metrics().tasks.preparationMs < 100000);
  assert.throws(() => task.advance({ maxOperations: 0 }), /positive operation budget/);
  assert.throws(() => task.advance({ deadline: NaN }), /deadline/);
});

test("opaque-rectangle cross-products yield even when every narrow rectangle pair misses", () => {
  const rectangles = offset => Array.from({ length: 24 }, (_, index) => ({ left: index * 2 + offset, right: index * 2 + offset + .4, top: 0, bottom: 1 }));
  const card = (id, offset) => ({ id, orderGeometry: { kind: "card", offset: { x: 0, y: 0 }, plane: { normal: projection.direction, constant: 1 },
    shape: { width: 48, height: 1, points: [{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 48, y: 1 }, { x: 0, y: 1 }], rectangles: rectangles(offset) } } });
  const owner = createSpatialSceneOwner({ projection });
  const task = owner.prepare({ revision: 1, staticRecords: () => [card("a", 0), card("b", .6)] });
  finish(task, 1);
  assert(task.metrics().phases.relation >= 24 * 24, "one coarse pair must not hide the coverage cross-product");
  assert.equal(task.result.metrics.staticWork.edges, 0);
  assert.equal(task.result.records.length, 2);
  owner.publish(task);
});

test("cycle fallback yields while preserving the supported deterministic approximation", () => {
  const view = createOrderingProjection();
  const volume = (id, min, max) => ({ id, orderGeometry: { kind: "volume", min, max } });
  const records = [volume("0", { x: 3, y: 2, z: 4 }, { x: 3.3, y: 3.8, z: 6.3 }),
    volume("1", { x: 3.5, y: 1, z: 2 }, { x: 3.8, y: 2.3, z: 4.8 }),
    volume("2", { x: 3, y: 1.5, z: 3.5 }, { x: 5.3, y: 3.3, z: 4.3 })];
  const owner = createSpatialSceneOwner({ projection: view });
  const task = owner.prepare({ revision: 1, staticRecords: () => records });
  finish(task, 1);
  assert(task.metrics().phases.cycle >= records.length);
  assert.equal(task.result.metrics.approximateCycles, 1);
  assert.deepEqual(task.result.records, compileSpatialDrawOrder(records, { projection: view }).records);
  owner.publish(task);
});
