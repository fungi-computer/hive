import test from "node:test";
import assert from "node:assert/strict";
import { advanceTerrain } from "./terrain.ts";
import { createClearing } from "./clearing.ts";
import {
  serializeClearing,
  parseLiveClearing,
  snapshotFor,
  restoreSnapshot,
} from "./clearing-state.ts";

test("current region reconstruction preserves running/paused state and detached game facts; browser Continue still pauses", () => {
  for (const paused of [false, true]) {
    const state = createClearing();
    state.paused = paused;
    state.tick = 37;
    state.terrain = advanceTerrain(state.terrain, 37 * 0.05);
    state.commands.push({
      kind: "recruit",
      party: "home",
      actor: "sedge",
      tick: 0,
    });
    const wire = serializeClearing(state);
    const restored = parseLiveClearing(wire);
    assert.deepEqual(serializeClearing(restored), wire);
    assert.equal(restored.paused, paused);
    assert.equal(restored.tick, 37);
    assert.deepEqual(restored.commands, []);
    restored.actors.rowan.name = "Changed only in this candidate";
    assert.equal(wire.actors.rowan.name, "Rowan");
    assert.equal(state.actors.rowan.name, "Rowan");
    assert.equal(restoreSnapshot(snapshotFor(state)).state.paused, true);
  }
});

test("live reconstruction checks the same terrain/material relations and accepts no historical envelope", () => {
  const state = createClearing();
  const wire = structuredClone(serializeClearing(state));
  wire.terrain.exports.push({ id: "invented" });
  assert.throws(() => parseLiveClearing(wire));
  assert.throws(() =>
    restoreSnapshot({ ...snapshotFor(state), savedState: wire }),
  );
  assert.throws(() => parseLiveClearing(snapshotFor(state)));
});

test("current envelope rejects every unsupported predecessor without upgrading its state", () => {
  const current = snapshotFor(createClearing());
  assert.equal(current.schema, 21);
  for (const schema of [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    const unsupported = { ...structuredClone(current), schema };
    const before = structuredClone(unsupported);
    assert.throws(() => restoreSnapshot(unsupported));
    assert.deepEqual(unsupported, before);
  }
});
