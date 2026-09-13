import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import {
  entityDesignation, lineDesignation, pointDesignation, rectangleDesignation,
  spatialDesignationMachine,
} from "./spatial-designation.js";

test("spatial designations are deterministic and data-only", () => {
  assert.deepEqual(pointDesignation([2, 4, 3]), { kind: "point", cells: [[2, 4, 3]] });
  assert.deepEqual(lineDesignation([2, 4, 3], [0, 4, 1]).cells, [[2, 4, 3], [1, 4, 3], [0, 4, 3]]);
  assert.deepEqual(rectangleDesignation([2, 4, 3], [0, 4, 2]).cells, [
    [0, 4, 2], [1, 4, 2], [2, 4, 2], [0, 4, 3], [1, 4, 3], [2, 4, 3],
  ]);
  assert.deepEqual(entityDesignation(["z", "a", "z"]), { kind: "entities", entities: ["a", "z"] });
  assert.throws(() => lineDesignation([0, 1, 0], [1, 2, 0]), /one level/);
});

test("one XState owner previews, commits, and cancels every spatial stroke", () => {
  const owner = createActor(spatialDesignationMachine).start();
  owner.send({ type: "SET_MODE", mode: "line" });
  owner.send({ type: "BEGIN", cell: [0, 4, 0] });
  owner.send({ type: "MOVE", cell: [2, 4, 0] });
  owner.send({ type: "END" });
  assert.deepEqual(owner.getSnapshot().context.committed, lineDesignation([0, 4, 0], [2, 4, 0]));
  owner.send({ type: "SET_MODE", mode: "rectangle" });
  owner.send({ type: "BEGIN", cell: [0, 4, 0] });
  owner.send({ type: "MOVE", cell: [2, 4, 2] });
  owner.send({ type: "CANCEL" });
  assert.deepEqual(owner.getSnapshot().context.committed, []);
  owner.send({ type: "BEGIN_ENTITIES", entities: ["worker.2", "worker.1"] });
  assert.deepEqual(owner.getSnapshot().context.committed, entityDesignation(["worker.2", "worker.1"]));
  owner.stop();
});


test("oversized and cross-level gestures reject without killing the tool", () => {
  const owner = createActor(spatialDesignationMachine).start();
  for (const end of [[1000000, 4, 1000000], [1, 5, 1]]) {
    owner.send({ type: "BEGIN", cell: [0, 4, 0] });
    owner.send({ type: "MOVE", cell: end });
    assert.equal(owner.getSnapshot().value, "dragging");
    assert.ok(owner.getSnapshot().context.rejection);
    owner.send({ type: "END" });
    assert.equal(owner.getSnapshot().status, "active");
    assert.equal(owner.getSnapshot().value, "idle");
    assert.deepEqual(owner.getSnapshot().context.committed, []);
    assert.ok(owner.getSnapshot().context.rejection);
  }
  owner.send({ type: "BEGIN", cell: [0, 4, 0] });
  owner.send({ type: "MOVE", cell: [1, 4, 1] });
  owner.send({ type: "END" });
  assert.equal(owner.getSnapshot().context.rejection, null);
  assert.equal(owner.getSnapshot().context.committed.cells.length, 4);
  owner.stop();
});


test("dragging back inside the limit clears rejection before release", () => {
  const owner = createActor(spatialDesignationMachine).start();
  owner.send({ type: "BEGIN", cell: [0, 0, 0] });
  owner.send({ type: "MOVE", cell: [999, 0, 999] });
  assert.ok(owner.getSnapshot().context.rejection);
  owner.send({ type: "MOVE", cell: [1, 0, 1] });
  assert.equal(owner.getSnapshot().context.rejection, null);
  owner.send({ type: "END" });
  assert.equal(owner.getSnapshot().context.committed.cells.length, 4);
  owner.stop();
});
