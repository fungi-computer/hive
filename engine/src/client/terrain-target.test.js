import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { terrainTargetMachine } from "./controls.js";

test("rotating a placement preserves its selected build plane and hover; choosing a new tool clears them", () => {
  const owner = createActor(terrainTargetMachine).start();
  const north = { id: "stair-north", target: "world-surface" };
  const east = { id: "stair-east", target: "world-surface" };
  owner.send({ type: "ARM", control: north });
  owner.send({ type: "SET_BUILD_PLANE", y: 17 });
  owner.send({ type: "HOVER", cell: [1, 17, 0] });
  owner.send({ type: "ROTATE", control: east });
  assert.equal(owner.getSnapshot().context.control, east);
  assert.equal(owner.getSnapshot().context.planeY, 17);
  assert.deepEqual(owner.getSnapshot().context.hover, [1, 17, 0]);
  owner.send({ type: "ARM", control: { id: "floor", target: "world-surface" } });
  assert.equal(owner.getSnapshot().context.planeY, null);
  assert.equal(owner.getSnapshot().context.hover, null);
  owner.stop();
});

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


test("placement completion clears its build plane while keeping the build tool armed", () => {
  const owner = createActor(terrainTargetMachine).start();
  const control = { id: "build", target: "world-surface" };
  owner.send({type:"ARM",control});
  owner.send({type:"SET_BUILD_PLANE",y:17});
  owner.send({type:"HOVER",cell:[1,17,0]});
  owner.send({type:"CLEAR_PLACEMENT"});
  assert.equal(owner.getSnapshot().value,"armed");
  assert.equal(owner.getSnapshot().context.control,control);
  assert.equal(owner.getSnapshot().context.planeY,null);
  owner.stop();
});
