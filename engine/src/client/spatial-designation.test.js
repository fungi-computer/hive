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
