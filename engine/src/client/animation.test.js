import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnimationClock, animationFrames } from "./animation.js";

const actor = (id, x, z, facing = 0) => ({ id, x, y: 0, z, facing });
test("extra render frames retain walking until a new stationary sample", () => {
  const clock = createAnimationClock();
  clock.sample([actor("a", 0, 0)], { now: 0, sequence: 1 });
  assert.equal(clock.sample([actor("a", 1, 0)], { now: 33, sequence: 2 })[0].walking, true);
  assert.equal(clock.sample([actor("a", 1, 0)], { now: 50, sequence: 2 })[0].walking, true);
  assert.equal(clock.sample([actor("a", 1, 0)], { now: 66, sequence: 3 })[0].walking, false);
});
test("movement samples select walk and measured direction, stationary samples return idle", () => {
  const clock = createAnimationClock({ frameMs: 100 });
  assert.deepEqual(clock.sample([actor("a", 0, 0)], { now: 0 }), [
    { id: "a", walking: false, direction: 2, frame: 0 },
  ]);
  assert.deepEqual(clock.sample([actor("a", 1, 0)], { now: 250 }), [
    { id: "a", walking: true, direction: 1, frame: 2 },
  ]);
  assert.deepEqual(clock.sample([actor("a", 1, 0)], { now: 350 }), [
    { id: "a", walking: false, direction: 2, frame: 0 },
  ]);
});
test("pause freezes history and reset clears teleport-looking motion", () => {
  const clock = createAnimationClock();
  clock.sample([actor("a", 0, 0)], { now: 0 });
  const frozen = clock.sample([actor("a", 1, 0)], {
    now: 100,
    paused: true,
  })[0];
  assert.deepEqual(
    clock.sample([actor("a", 0, 0)], { now: 200, paused: true })[0],
    frozen,
  );
  clock.reset();
  assert.equal(clock.sample([actor("a", 5, 5)], { now: 0 })[0].walking, false);
});
test("walk falls back to the actual idle bank when no walk frames exist", () => {
  const idle = ["idle-frame"];
  assert.deepEqual(animationFrames({ idle: [idle] }, 0, true), idle);
  assert.deepEqual(
    animationFrames({ idle: [idle], walk: [["walk-frame"]] }, 0, true),
    ["walk-frame"],
  );
});


test("original atlas directions match movement and physics quarter-turn headings", () => {
  const vectors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let heading = 0; heading < 4; heading++) {
    const clock = createAnimationClock();
    const expected = (2 - heading + 4) % 4;
    const resting = clock.sample([actor("a", 0, 0, heading)], { now: 0 });
    assert.equal(resting[0].direction, expected);
    const [x, z] = vectors[heading];
    const walking = clock.sample([actor("a", x, z, heading)], { now: 100 });
    assert.equal(walking[0].direction, expected);
    assert.equal(walking[0].walking, true);
  }
});
