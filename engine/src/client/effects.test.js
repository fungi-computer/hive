import test from "node:test";
import assert from "node:assert/strict";
import { createCueCursor, createEffectOwner } from "./effects.js";

test("cue cursor establishes a fresh baseline and deduplicates reconnects", () => {
  let time = 0;
  const cursor = createCueCursor({ now: () => time, ttl: 100 });
  const frame = { epoch: "one", cues: [{ epoch: "one", sequence: 1, kind: "cannon.fired" }] };
  assert.deepEqual(cursor.accept(frame), []);
  assert.deepEqual(cursor.accept(frame), []);
  assert.deepEqual(cursor.accept({ epoch: "one", cues: [{ epoch: "one", sequence: 2, kind: "cannon.hit" }] }).map(c => c.sequence), [2]);
  time = 101;
  assert.deepEqual(cursor.accept({ epoch: "one", cues: [{ sequence: 1, kind: "cannon.fired" }] }), []);
});

test("effect owner sheds oldest effects at the shared budget", () => {
  const removed = [];
  const owner = createEffectOwner({ maxEffects: 1, maxSprites: 2, spawn: definition => definition.id, destroy: value => removed.push(value) });
  owner.play({ id: "flash", lifetime: 500 });
  owner.play({ id: "smoke", lifetime: 500 });
  assert.equal(owner.size, 1);
  assert.deepEqual(removed, ["flash"]);
});
