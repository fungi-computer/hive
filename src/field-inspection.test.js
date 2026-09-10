import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { terrainSurfaces } from "./terrain-surface-geometry.js";
import { createClearing } from "./clearing.ts";
import {
  excavateTerrain,
  parseTerrain,
  terrainEnvironment,
} from "./terrain.ts";
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
import {
  prepareWaterEnvironmentGeometry,
  exchangeWaterEnvironment,
  parseWaterEnvironment,
} from "./world-presets/goblin-environment/water-state.ts";
const cell = { x: 0, y: 14, z: 128 };
const displayCell = { x: 7, z: 9, level: 0 };
const reference = {
  binding: FIELD_WATER.id,
  nodeId: "cell:0,14,128",
};

const environment = (state) => ({
  terrain: terrainEnvironment(state.terrain),
  sites: state.sites,
});
function excavatedFixture() {
  const state = createClearing(),
    before = environment(state);
  const terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  const next = prepareWaterEnvironmentGeometry(state.water, before, {
    terrain: terrainEnvironment(terrain),
    sites: state.sites,
  });
  assert.equal(next.status, "applied");
  state.terrain = terrain;
  state.water = next.state;
  return state;
}
// Authored finite boundary stocks exercise queries, not a paid pail transaction.
function deposit(state, massKg) {
  state.water = exchangeWaterEnvironment(state.water, environment(state), {
    id: reference.nodeId,
    direction: "deposit",
    massKg,
  }).state;
}

test("dry and fractional excavated stock stays inspectable without collectable supply", () => {
  assert.equal(fieldInspectionAt(createClearing(), cell), null);
  const state = excavatedFixture();
  assert.deepEqual(fieldInspectionAt(state, cell), reference);
  const dry = resolveFieldInspection(fieldInspectionFacts(state), reference);
  assert.equal(dry.litres, 0);
  assert.equal(dry.wholeMeasures, 0);
  assert.equal(fieldInspectionText(dry).stock, "0 L standing water");
  deposit(state, 0.25);
  const facts = fieldInspectionFacts(state);
  const wet = resolveFieldInspection(facts, reference);
  assert(wet.litres > 0 && wet.litres < 1);
  assert.equal(wet.wholeMeasures, 0);
  assert.equal(fieldWaterSources(state).length, 0);
  assert.deepEqual(fieldInspectionAt(state, cell), reference);
  assert.notDeepEqual(fieldInspectionAt(state, { ...cell, y: 15 }), reference);
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
    fieldInspectionFacts({
      ...state,
      terrain: parseTerrain(state.terrain),
      water: parseWaterEnvironment(
        structuredClone(state.water),
        environment(state),
      ),
    }),
    facts,
    "reloaded actual facts agree",
  );
});

test("authored finite field stock shows whole measures independently of actor permission", () => {
  const state = excavatedFixture();
  deposit(state, 2);
  const fact = resolveFieldInspection(fieldInspectionFacts(state), reference);
  assert.equal(fact.litres, 2);
  assert.equal(fact.wholeMeasures, 2);
  assert.equal(fact.hasDrawingRim, true);
  assert.equal(fieldInspectionText(fact).measures, "2 whole 1 L measures");
  state.actors.rowan.drafted = true;
  assert.deepEqual(
    resolveFieldInspection(fieldInspectionFacts(state), reference),
    fact,
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
  const state = excavatedFixture();
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
  const fact = resolveFieldInspection(fieldInspectionFacts(state), reference);
  assert.deepEqual({ x: fact.x, y: fact.y, z: fact.z }, cell);
  assert.notDeepEqual(
    fieldInspectionAt(state, { ...cell, y: cell.y + fact.heightCells }),
    reference,
  );
});
