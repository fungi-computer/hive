import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { terrainSurfaces } from "./terrain-surface-geometry.js";
import { createClearing } from "./clearing.ts";
import { excavateTerrain, advanceTerrain, parseTerrain } from "./terrain.ts";
import {
  fieldInspectionFacts,
  fieldInspectionAt,
  fieldInspectionFromFace,
  resolveFieldInspection,
  fieldInspectionText,
} from "./field-inspection.ts";
import { FIELD_WATER, fieldWaterSources } from "./field-water-source.ts";
import {
  toolMachine,
  groundInspectionGesture,
  dispatchUiAction,
} from "./ui-actions.ts";
import { createHeldFieldFixture } from "../tools/engine-do/goblin-field-fixture.ts";
import { returnFieldWater } from "./field-water.ts";
import { selectContainerPortions } from "./materials.ts";
const cell = { x: 0, y: 14, z: 128 };
const displayCell = { x: 7, z: 9, level: 0 };
const reference = {
  binding: FIELD_WATER.id,
  nodeId: "reservoir:column-p0-p128",
};

test("dry and fractional excavated stock stays inspectable without collectable supply", () => {
  const state = createClearing();
  assert.equal(fieldInspectionAt(state, cell), null);
  state.terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  assert.deepEqual(fieldInspectionAt(state, cell), reference);
  const dry = resolveFieldInspection(fieldInspectionFacts(state), reference);
  assert.equal(dry.litres, 0);
  assert.equal(dry.wholeMeasures, 0);
  assert.equal(fieldInspectionText(dry).stock, "0 L standing water");
  state.terrain = advanceTerrain(state.terrain, 6);
  const facts = fieldInspectionFacts(state);
  const wet = resolveFieldInspection(facts, reference);
  assert(wet.litres > 0 && wet.litres < 1);
  assert.equal(wet.wholeMeasures, 0);
  assert.equal(fieldWaterSources(state).length, 0);
  assert.deepEqual(fieldInspectionAt(state, cell), reference);
  assert.equal(fieldInspectionAt(state, { ...cell, y: 15 }), null);
  assert.equal(
    fieldInspectionAt(state, { ...cell, x: 1 }),
    null,
    "no nearest-water retarget",
  );
  assert.throws(() => {
    wet.litres = 100;
  });
  assert.equal(
    resolveFieldInspection(facts, { ...reference, binding: "forged" }),
    null,
  );
  assert.equal(
    resolveFieldInspection(fieldInspectionFacts(createClearing()), reference),
    null,
    "reset/removal invalidates target",
  );
  assert.deepEqual(
    fieldInspectionFacts({ terrain: parseTerrain(state.terrain) }),
    facts,
    "reloaded actual facts agree",
  );
});

test("paid field stock shows whole measures independently of actor permission", () => {
  const { state, operation, interior } = createHeldFieldFixture();
  assert(
    returnFieldWater(state, {
      ...reference,
      operation: operation.id,
      quantity: 2,
      portions: selectContainerPortions(
        state.materials,
        interior.id,
        "water",
        2,
      ).portions,
    }).ok,
  );
  const fact = resolveFieldInspection(fieldInspectionFacts(state), reference);
  assert.equal(fact.litres, 2);
  assert.equal(fact.wholeMeasures, 2);
  assert.equal(fact.hasDrawingRim, true);
  assert.equal(fieldInspectionText(fact).measures, "2 whole 1 L measures");
  state.actors.rowan.drafted = true;
  assert.deepEqual(
    fieldInspectionFacts(state),
    [fact],
    "inspection does not grant worker permission",
  );
  assert.match(
    fieldInspectionText(fact).access,
    /still needs a clear route and a pail/,
  );
});

test("existing XState click ownership separates field inspection from tool and box gestures", () => {
  const actor = createActor(toolMachine).start();
  const point = { cell: displayCell, screen: { x: 20, y: 30 } };
  actor.send({ type: "BEGIN", point });
  actor.send({ type: "END", point });
  assert(groundInspectionGesture(actor.getSnapshot().context));
  actor.send({ type: "ESCAPE" });
  actor.send({ type: "TOOL", tool: "dig" });
  actor.send({ type: "BEGIN", point });
  actor.send({ type: "END", point });
  assert.equal(groundInspectionGesture(actor.getSnapshot().context), false);
  actor.send({ type: "ESCAPE" });
  actor.send({ type: "BEGIN", point });
  actor.send({ type: "END", point: { ...point, screen: { x: 80, y: 30 } } });
  assert.equal(groundInspectionGesture(actor.getSnapshot().context), false);
  actor.stop();
  const action = {
    kind: "inspect-field-water",
    reference,
    point: point.screen,
  };
  const forwarded = [];
  dispatchUiAction(action, {
    run: (value) => forwarded.push(value),
    level: null,
  });
  assert.deepEqual(forwarded, [action]);
});

test("picked floor and wall identify the adjacent physical hollow, not the solid or map plane", () => {
  const state = createClearing();
  state.terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  const faces = terrainSurfaces(state.terrain, 15).filter(
    (face) => face.cell.x === displayCell.x && face.cell.z === displayCell.z,
  );
  const floor = faces.find((face) => face.kind === "pit-floor");
  const wall = faces.find((face) => face.kind === "cut-wall");
  assert(floor && wall);
  assert.deepEqual(fieldInspectionFromFace(state, floor), reference);
  assert.deepEqual(fieldInspectionFromFace(state, wall), reference);
  assert.equal(
    fieldInspectionAt(state, {
      x: floor.ownerVoxel[0],
      y: floor.ownerVoxel[1],
      z: floor.ownerVoxel[2],
    }),
    null,
  );
  assert.equal(fieldInspectionFromFace(state, null), null);
  const fact = fieldInspectionFacts(state)[0];
  assert.deepEqual({ x: fact.x, y: fact.y, z: fact.z }, cell);
  assert.equal(
    fieldInspectionAt(state, { ...cell, y: cell.y + fact.heightCells }),
    null,
  );
});
