import assert from "node:assert/strict";
import test from "node:test";
import { treeWorkerAtApproach } from "./colony.ts";

test("tree chopping presentation waits for the committed approach point", () => {
  const order = { approachX: 2, approachY: 0, approachZ: 3 };
  assert.equal(treeWorkerAtApproach({ x: 1, y: 0, z: 3 }, order), false, "approach travel keeps walk/carry animation");
  assert.equal(treeWorkerAtApproach({ x: 2.04, y: 0, z: 3 }, order), true, "contact tolerance permits authored chop pose");
  assert.equal(treeWorkerAtApproach({ x: 2, y: 0.051, z: 3 }, order), false, "vertical separation is not contact");
});
