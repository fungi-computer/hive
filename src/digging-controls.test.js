import assert from "node:assert/strict";
import test from "node:test";
import { initialTerrain } from "./terrain.ts";
import { createActor } from "xstate";
import {
  decideLevelTransition,
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
    terrainDesignationCells(
      "dig",
      released.context.start?.cell ?? null,
      released.context.end.cell,
      initialTerrain(),
    ),
    [
      { kind: "dig", voxel: [-5, 14, 122] },
      { kind: "dig", voxel: [-4, 14, 122] },
      { kind: "dig", voxel: [-3, 14, 122] },
      { kind: "dig", voxel: [-5, 14, 123] },
      { kind: "dig", voxel: [-4, 14, 123] },
      { kind: "dig", voxel: [-3, 14, 123] },
      { kind: "dig", voxel: [-5, 14, 124] },
      { kind: "dig", voxel: [-4, 14, 124] },
      { kind: "dig", voxel: [-3, 14, 124] },
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

test("terrain tools disarm on Escape and when Ground switches to Upper", () => {
  const actor = createActor(toolMachine).start();
  actor.send({ type: "TOOL", tool: "dig" });
  actor.send({ type: "ESCAPE" });
  assert.equal(actor.getSnapshot().value, "idle");
  assert.equal(actor.getSnapshot().context.tool, null);

  assert.equal(requiredToolLevel("dig"), 0);
  assert.deepEqual(decideLevelTransition(0, 1, "dig"), {
    changed: true,
    level: 1,
    disarm: true,
    notice:
      "Upper selected; the armed tool was disarmed because it is unavailable on this level.",
  });
});
