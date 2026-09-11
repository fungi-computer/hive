import test from "node:test";
import assert from "node:assert/strict";
import { createMotionCueOwner } from "./motion.js";

const subject = (x, { motion = { kind: "foot", stride: 0.8 }, support = null, worldX = x, correction } = {}) => ({ id: "crew", motion, support, correction, local: { position: { x, y: 0, z: 0 } }, pose: { position: { x: worldX, y: 2, z: 4 } } });

test("slow 60fps movement accumulates residual distance into contacts", () => {
  const owner = createMotionCueOwner();
  owner.sample([subject(0)], {});
  let cues = [];
  for (let index = 1; index <= 20; index++) cues = cues.concat(owner.sample([subject(index * 0.1)], { now: index * 16 }));
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0].at, { x: 0.8, y: 2, z: 4 });
});

test("carried deckhands use local motion and world foot positions", () => {
  const owner = createMotionCueOwner();
  owner.sample([subject(0, { support: "ship", worldX: 10 })]);
  const cues = owner.sample([subject(0.9, { support: "ship", worldX: 11 })]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].at.x, 11);
});

test("stationary carried actors, support changes, corrections and jumps emit nothing", () => {
  const owner = createMotionCueOwner();
  owner.sample([subject(0, { support: "ship" })]);
  assert.deepEqual(owner.sample([subject(0, { support: "ship", worldX: 4 })]), []);
  assert.deepEqual(owner.sample([subject(0.9, { support: "dock", worldX: 4 })]), []);
  assert.deepEqual(owner.sample([subject(4, { support: "dock", worldX: 8, correction: true })]), []);
  assert.deepEqual(owner.sample([subject(8, { support: "dock", worldX: 12 })]), []);
});

test("wake is data-driven and placed behind the moving support", () => {
  const owner = createMotionCueOwner();
  const motion = { kind: "wake", stride: 1, localOffset: { x: -1, y: 0, z: 0 } };
  owner.sample([subject(0, { motion, worldX: 5 })]);
  const cues = owner.sample([subject(1.1, { motion, worldX: 6 })]);
  assert.equal(cues[0].kind, "wake");
  assert.equal(cues[0].at.x, 5);
});
