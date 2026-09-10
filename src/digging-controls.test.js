import assert from "node:assert/strict";
import test from "node:test";
import { createActor } from "xstate";
import {
  decideLevelTransition,
  dispatchLevelAction,
  requiredToolLevel,
  terrainDesignationCells,
  toolMachine,
} from "./ui-actions.ts";

const point = (x, z, level = 0) => ({
  cell: { x, z, level },
  screen: { x: x * 10, y: z * 10 },
});

test("Dig remains armed through hover, one release, and stroke cancellation", () => {
  const actor = createActor(toolMachine).start();
  actor.send({ type: "TOOL", tool: "dig" });
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.tool, "dig");

  actor.send({ type: "MOVE", point: point(2, 3) });
  assert.deepEqual(actor.getSnapshot().context.end, point(2, 3));

  actor.send({ type: "BEGIN", point: point(4, 5) });
  actor.send({ type: "MOVE", point: point(2, 3) });
  actor.send({ type: "END", point: point(2, 3) });
  const released = actor.getSnapshot();
  assert.equal(released.value, "fixed");
  assert.deepEqual(
    terrainDesignationCells("dig", [
      { ownerVoxel: [0, 10, 128] },
      { ownerVoxel: [0, 10, 128] },
      { ownerVoxel: [-1, -2, 128] },
    ]),
    [
      { kind: "dig", voxel: [-1, -2, 128] },
      { kind: "dig", voxel: [0, 10, 128] },
    ],
  );

  actor.send({ type: "PLACED", point: point(2, 3) });
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.tool, "dig");

  actor.send({ type: "BEGIN", point: point(7, 6) });
  actor.send({ type: "CANCEL_STROKE" });
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.tool, "dig");
  assert.equal(actor.getSnapshot().context.start, null);
});

test("Dig disarms on Escape but retains the selected underground or upper layer", () => {
  const actor = createActor(toolMachine).start();
  actor.send({ type: "TOOL", tool: "dig" });
  actor.send({ type: "ESCAPE" });
  assert.equal(actor.getSnapshot().value, "idle");
  assert.equal(actor.getSnapshot().context.tool, null);

  assert.equal(requiredToolLevel("dig"), null);
  for (const level of [-2, -1, 1, 3])
    assert.deepEqual(decideLevelTransition(0, level, "dig"), {
      changed: true,
      level,
      disarm: false,
      notice: null,
    });
});

test("changing the selected slice clears the active stroke without issuing work or disarming Dig", () => {
  const actor = createActor(toolMachine).start();
  actor.send({ type: "TOOL", tool: "dig" });
  actor.send({ type: "BEGIN", point: point(4, 5, -1) });
  let level = -1,
    cleared = 0;
  dispatchLevelAction(
    { kind: "level", level: -2 },
    {
      range: () => ({ min: -19, max: 11 }),
      currentLevel: () => level,
      armedTool: () => actor.getSnapshot().context.tool,
      resetGesture: () => actor.send({ type: "CANCEL_STROKE" }),
      disarmTool: () => assert.fail("Dig must retain its selected layer"),
      setLevel: (value) => {
        level = value;
      },
      clearInspection: () => {
        cleared++;
      },
      notice: () => assert.fail("no forced-level notice"),
    },
  );
  assert.equal(level, -2);
  assert.equal(cleared, 1);
  assert.equal(actor.getSnapshot().context.tool, "dig");
  assert.equal(actor.getSnapshot().context.start, null);
  actor.stop();
});

test("Dig move and release retain the same screen endpoint outside a guessed placement plane", () => {
  const actor = createActor(toolMachine).start();
  actor.send({ type: "TOOL", tool: "dig" });
  actor.send({ type: "BEGIN", point: point(7, 9, -1) });
  const outside = {
    cell: { x: -2, z: 16, level: -1 },
    screen: { x: 12, y: 380 },
  };
  actor.send({ type: "MOVE", point: outside });
  const preview = structuredClone(actor.getSnapshot().context.end);
  actor.send({ type: "END", point: outside });
  assert.deepEqual(actor.getSnapshot().context.end, preview);
  assert.deepEqual(preview.screen, outside.screen);
  actor.stop();
});
