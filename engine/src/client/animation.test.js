import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnimationClock, animationFrames, figureFrame } from "./animation.js";
import { DEFAULT_VISUAL_BINDINGS, COLONY_VISUAL_BINDINGS } from "./visual-bindings.js";

const actor = (id, x, z, facing = 0) => ({ id, x, y: 0, z, facing });
test("real work faces its target and animates without pretending the actor walks", () => {
  const clock = createAnimationClock();
  const working = { ...actor("a", 0, 0), activity: { kind: "dig", target: [1, 0] } };
  clock.sample([working], { now: 0 });
  const work = clock.sample([working], { now: 250 })[0];
  assert.deepEqual(work, { id: "a", walking: false, direction: 1, frame: 2 });
  assert.deepEqual(clock.sample([working], { now: 500, paused: true })[0], work);
  assert.equal(clock.sample([actor("a", 0, 0)], { now: 600 })[0].direction, 1);
});
test("actual work chooses its authored pose; held stock returns to carrying when work ends", () => {
  const figure = { dig: [["dig-0", "dig-1"]], carry: [["carry-0", "carry-1"]], idle: [["idle"]] };
  const binding = { workPoses: { dig: "dig" }, carryPoses: { soil: "carry" } };
  const carrying = { inventory: { items: [{ kind: "soil", quantity: 1 }] } };
  const animation = { direction: 0, frame: 1, walking: false };
  assert.equal(figureFrame(figure, binding, { ...carrying, activity: { kind: "dig" } }, animation), "dig-1");
  assert.equal(figureFrame(figure, binding, carrying, animation), "carry-0");
  assert.equal(figureFrame(figure, binding, carrying, { ...animation, walking: true }), "carry-1");
  assert.equal(figureFrame(figure, binding, {}, animation), "idle");
});

test("retained worker binds dig, build and chop activities without idle snap", () => {
  const figure = Object.fromEntries(["dig", "build", "chop", "carry"].map(pose => [pose, [0, 1, 2, 3].map(direction => [`${pose}-${direction}`]) ]));
  const binding = DEFAULT_VISUAL_BINDINGS["goblin.worker"];
  const colonyBindings = [COLONY_VISUAL_BINDINGS["colony.rowan"], COLONY_VISUAL_BINDINGS["colony.sedge"]];
  const subject = { inventory: { items: [] } };
  for (const workerBinding of [binding, ...colonyBindings]) for (const kind of ["dig", "build", "chop"]) for (const direction of [0, 1, 2, 3])
    assert.equal(figureFrame(figure, workerBinding, { ...subject, activity: { kind } }, { direction, frame: 0 }), `${kind}-${direction}`);
  assert.equal(figureFrame(figure, binding, { ...subject, inventory: { items: [{ kind: "wood", quantity: 1 }] } }, { direction: 0, frame: 0 }), "carry-0");
});
test("brief stationary samples retain walking and facing, then settle without turning", () => {
  const clock = createAnimationClock();
  clock.sample([actor("a", 0, 0)], { now: 0, sequence: 1 });
  assert.equal(clock.sample([actor("a", 1, 0)], { now: 33, sequence: 2 })[0].walking, true);
  assert.equal(clock.sample([actor("a", 1, 0)], { now: 50, sequence: 2 })[0].walking, true);
  assert.equal(clock.sample([actor("a", 1, 0)], { now: 66, sequence: 3 })[0].walking, true);
  const stopped = clock.sample([actor("a", 1, 0)], { now: 200, sequence: 4 })[0];
  assert.equal(stopped.walking, false);
  assert.equal(stopped.direction, 1);
});
test("movement samples select walk and measured direction, stationary samples return idle", () => {
  const clock = createAnimationClock({ frameMs: 100 });
  assert.deepEqual(clock.sample([actor("a", 0, 0)], { now: 0 }), [
    { id: "a", walking: false, direction: 2, frame: 0 },
  ]);
  assert.deepEqual(clock.sample([actor("a", 1, 0)], { now: 250 }), [
    { id: "a", walking: true, direction: 1, frame: 2 },
  ]);
  assert.deepEqual(clock.sample([actor("a", 1, 0)], { now: 400 }), [
    { id: "a", walking: false, direction: 1, frame: 1 },
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


test("passive ship motion leaves crew idle while local walking animates", () => {
  const clock = createAnimationClock();
  const crew = (x, localX, facing = 0) => ({
    ...actor("crew", x, 0, facing), support: "ship",
    local: {position: {x: localX,y: 1,z: 0},facing: 0},
  });
  clock.sample([crew(10,0)], {now: 0,sequence: 1});
  assert.equal(clock.sample([crew(20,0,1)], {now: 100,sequence: 2})[0].walking,false);
  const walked = clock.sample([crew(20,1,1)], {now: 200,sequence: 3})[0];
  assert.equal(walked.walking,true);
  assert.equal(walked.direction,0);
});
