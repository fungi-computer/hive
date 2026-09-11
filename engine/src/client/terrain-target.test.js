import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { terrainTargetMachine } from "./controls.js";

test("canceling a stroke preserves the tool; explicit exit clears it", () => {
  const owner = createActor(terrainTargetMachine).start();
  const control = { id: "dig", target: "terrain-cell" };
  owner.send({ type: "ARM", control });
  owner.send({ type: "CANCEL_STROKE" });
  assert.equal(owner.getSnapshot().value, "armed");
  assert.equal(owner.getSnapshot().context.control, control);
  owner.send({ type: "ESCAPE" });
  assert.equal(owner.getSnapshot().value, "idle");
  assert.equal(owner.getSnapshot().context.control, null);
  owner.stop();
});
