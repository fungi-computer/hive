import test from "node:test";
import assert from "node:assert/strict";
import { createMotionCueOwner } from "./motion.js";

test("stationary and support motion do not emit contacts", () => {
  const owner = createMotionCueOwner();
  owner.sample([{ id: "crew", local: { position: { x: 0, y: 0, z: 0 } }, support: "ship" }], { sequence: 1 });
  assert.deepEqual(owner.sample([{ id: "crew", local: { position: { x: 0, y: 0, z: 0 } }, support: "ship" }], { sequence: 2 }), []);
  assert.deepEqual(owner.sample([{ id: "crew", local: { position: { x: 0, y: 0, z: 0 } }, pose: { position: { x: 1, y: 0, z: 0 } }, support: "ship" }], { sequence: 3 }), []);
});

test("presented walking emits bounded footsteps and teleports establish a baseline", () => {
  const owner = createMotionCueOwner();
  owner.sample([{ id: "crew", local: { position: { x: 0, y: 0, z: 0 } }, support: null }], { sequence: 1 });
  assert.equal(owner.sample([{ id: "crew", local: { position: { x: 1.8, y: 0, z: 0 } }, support: null }], { sequence: 2 }).length, 2);
  assert.deepEqual(owner.sample([{ id: "crew", local: { position: { x: 8, y: 0, z: 0 } }, support: null }], { sequence: 3 }), []);
});
