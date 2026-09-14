import assert from "node:assert/strict";
import test from "node:test";
import { createActor } from "xstate";
import { edgeGestureMachine } from "./controls.js";

const start = (edge = { cell: [2, 4, 3], axis: "x" }) => {
  const actor = createActor(edgeGestureMachine).start();
  actor.send({ type: "BEGIN_EDGE", edge });
  return actor;
};

test("edge gesture locks its normal and acquires an inclusive forward or reverse stroke", () => {
  const actor = start();
  actor.send({ type: "MOVE_EDGE", cell: [99, 4, 6] });
  assert.deepEqual(actor.getSnapshot().context.edges, [
    { cell: [2, 4, 3], axis: "x" },
    { cell: [2, 4, 4], axis: "x" },
    { cell: [2, 4, 5], axis: "x" },
    { cell: [2, 4, 6], axis: "x" },
  ]);
  actor.send({ type: "MOVE_EDGE", cell: [99, 4, 1] });
  assert.deepEqual(actor.getSnapshot().context.edges.map(({ cell }) => cell), [[2, 4, 1], [2, 4, 2], [2, 4, 3]]);
  actor.stop();
});

test("edge gesture retains the last valid preview on limit rejection and commits once", () => {
  const actor = start({ cell: [0, 4, 0], axis: "z" });
  actor.send({ type: "MOVE_EDGE", cell: [256, 4, 0] });
  const rejected = actor.getSnapshot();
  assert.match(rejected.context.rejection, /256/);
  assert.equal(rejected.context.edges.length, 1);
  actor.send({ type: "END" });
  assert.equal(actor.getSnapshot().value, "idle");
  assert.deepEqual(actor.getSnapshot().context.committed, []);
  assert.match(actor.getSnapshot().context.rejection, /256/);
  assert.deepEqual(actor.getSnapshot().context.edges, []);
  actor.send({ type: "END" });
  assert.equal(actor.getSnapshot().value, "idle");
  actor.stop();
});

test("edge gesture cancellation clears a partial stroke", () => {
  const actor = start({ cell: [2, 4, 3], axis: "z" });
  actor.send({ type: "MOVE_EDGE", cell: [5, 4, 3] });
  actor.send({ type: "CANCEL" });
  assert.equal(actor.getSnapshot().value, "idle");
  assert.deepEqual(actor.getSnapshot().context, { start: null, current: null, edges: [], committed: [], rejection: null });
  actor.stop();
});
