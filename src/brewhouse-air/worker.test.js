import test from "node:test";
import assert from "node:assert/strict";
import { ROOM_FUEL } from "../world-presets/brewhouse-air/fuel.ts";
import { createBrewhouseAirProgram } from "../world-presets/brewhouse-air/region.ts";
import {
  createLocalBrewhouseSession,
  projectBrewhouseScene,
} from "./worker.js";

function commit(session, id, action, details = {}) {
  const staged = session.prepare({ id, action, ...details });
  staged.commit();
  return staged.reply;
}

test("local worker composes the registered finite room and strictly reopens it", () => {
  const session = createLocalBrewhouseSession();
  const initial = commit(session, 1, "inspect");
  assert.equal(initial.scene.result.fuelUnits, 1);
  assert.equal(initial.scene.result.remainingDoseFraction, 1);
  assert.equal(initial.scene.result.timeS, 0);
  assert.equal(initial.scene.cells.length, 368);
  assert.deepEqual(initial.scene.frame, {
    x: -7,
    y: 15,
    z: 119,
    storeyVoxels: 4,
  });
  assert.deepEqual(initial.scene.terrain.bounds, {
    min: [0, 0],
    max: [15, 15],
  });
  assert.equal(initial.scene.terrain.faces.length, 236);
  assert.equal(initial.scene.trees.length, 3);

  const ignition = commit(session, 2, "ignite");
  assert.equal(ignition.revision, 1);
  assert.equal(ignition.scene.result.fuelUnits, 0);
  assert.equal(ignition.scene.result.emittedHeatJ, 0);

  const partial = commit(session, 3, "advance", { seconds: 2 });
  assert.equal(partial.revision, 2);
  assert.ok(Math.abs(partial.scene.result.emittedHeatJ - 600) < 1e-5);
  assert.ok(
    Math.abs(partial.scene.result.emittedSmokeKg - ROOM_FUEL.smokeKg / 3) <
      1e-10,
  );

  const opened = commit(session, 4, "vent", { open: true });
  assert.equal(opened.scene.result.ventOpen, true);
  assert.equal(opened.scene.result.timeS, 2);
  assert.ok(Math.abs(opened.scene.result.emittedHeatJ - 600) < 1e-5);

  const excavated = commit(session, 5, "excavate");
  assert.equal(excavated.scene.result.excavatedVoxels, 1);
  assert.ok(excavated.scene.result.exportedWaterKg > 0);
  assert.ok(excavated.scene.terrain.faces.length > 236);

  const reopened = commit(session, 6, "reopen", {
    checkpoint: excavated.checkpoint,
  });
  assert.deepEqual(reopened.scene, excavated.scene);
  assert.equal(reopened.checkpoint, excavated.checkpoint);
  assert.throws(
    () =>
      session.prepare({
        id: 7,
        action: "reopen",
        checkpoint: excavated.checkpoint.replace(
          '"state":',
          '"extra":true,"state":',
        ),
      }),
    /invalid local room checkpoint/,
  );
});

test("unpublished and rejected worker stages cannot change local room truth", () => {
  const session = createLocalBrewhouseSession();
  commit(session, 1, "ignite");
  const staged = session.prepare({ id: 2, action: "advance", seconds: 1 });
  assert.equal(staged.reply.scene.result.timeS, 1);
  const unchanged = commit(session, 3, "inspect");
  assert.equal(unchanged.scene.result.timeS, 0);
  assert.equal(unchanged.revision, 1);

  const duplicate = session.prepare({ id: 4, action: "ignite" });
  assert.equal(duplicate.reply.ok, false);
  duplicate.commit();
  const after = commit(session, 5, "inspect");
  assert.equal(after.revision, 1);
  assert.equal(after.scene.result.timeS, 0);
  assert.equal(after.scene.result.fuelUnits, 0);

  let getterCalls = 0;
  const accessor = { id: 6 };
  Object.defineProperty(accessor, "action", {
    enumerable: true,
    get() {
      getterCalls++;
      return "inspect";
    },
  });
  assert.throws(() => session.prepare(accessor), /invalid room request/);
  assert.equal(getterCalls, 0);
});

test("equal terrain revisions from different excavation histories have distinct static scene keys", () => {
  const program = createBrewhouseAirProgram(),
    a = program.initial(),
    b = program.initial();
  assert.equal(
    program.execute(
      a,
      program.parseCommand({ kind: "excavate", at: [0, 14, 129] }),
    ).status,
    "applied",
  );
  assert.equal(
    program.execute(
      b,
      program.parseCommand({ kind: "excavate", at: [1, 14, 129] }),
    ).status,
    "applied",
  );
  const first = projectBrewhouseScene(program, a, 1),
    second = projectBrewhouseScene(program, b, 1);
  assert.equal(first.terrain.revision, second.terrain.revision);
  assert.notEqual(first.terrain.key, second.terrain.key);
  assert.notDeepEqual(first.terrain.faces, second.terrain.faces);
});
