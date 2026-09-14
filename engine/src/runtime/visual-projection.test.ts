import { test } from "node:test";
import { strict as assert } from "node:assert";
import { entity } from "../sdk/authoring";
import { appendVisualProjections } from "./visual-projection";
import { colonyConstructionVisuals } from "../games/colony-construction-visuals";
import { ConstructionSite } from "../sdk/construction";
const id = entity("site.floor");
const contact = { position: { x: -1, y: 2, z: 0 }, facing: 0 };
const art = { id, pose: { position: { x: 0, y: 2, z: 0 }, facing: 2 }, visual: "floor", label: "Floor", pickable: false };
test("static entity display keeps identity and contact without a second entity", () => {
  const facts = [{ id, pose: contact, local: contact, visual: null }];
  const result = appendVisualProjections(facts, [art], () => [true], 512);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].view, { pickable: false });
  assert.deepEqual(result[0].pose, art.pose);
  assert.deepEqual(result[0].local, contact);
  assert.deepEqual(facts[0].pose, contact);
});
test("projection rejects missing entities, duplicate projections and existing art", () => {
  assert.throws(() => appendVisualProjections([], [art], () => [false], 512));
  assert.throws(() => appendVisualProjections([], [art, art], () => [true, true], 512));
  assert.throws(() => appendVisualProjections([{ id, visual: "worker" }], [art], () => [true], 512));
});

test("projection preserves explicit pickability for real projected entities", () => {
  const selectable = appendVisualProjections([], [{ ...art, pickable: true }], () => [true], 512);
  const hidden = appendVisualProjections([], [{ ...art, pickable: false }], () => [true], 512);
  assert.equal(selectable[0].view?.pickable, true);
  assert.equal(hidden[0].view?.pickable, false);
});

test("construction placement survives projection for fixture and stair art", () => {
  const states = [
    [entity("colony.build.timber-bed"), { catalog: "timber-bed", x: 1, y: 13, z: 1, orientation: "north", phase: "finished", seconds: 0 }],
    [entity("colony.build.brew-station"), { catalog: "brew-station", x: 3, y: 13, z: 1, orientation: "east", phase: "working", seconds: 1 }],
    [entity("colony.build.timber-stair"), { catalog: "timber-stair", x: 5, y: 13, z: 1, orientation: "south", phase: "planned", seconds: 0 }],
  ] as const;
  const rows = states.map(([id, state]) => ({ id, get: () => state }));
  const projections = colonyConstructionVisuals({ query: () => rows as never });
  const result = appendVisualProjections([], projections, ids => ids.map(id => states.some(([candidate]) => candidate === id)), 512);
  assert.deepEqual(result.map(fact => fact.placement), [
    { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "north" },
    { kind: "footprint", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], orientation: "east" },
    { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, -2], orientation: "south" },
  ]);
  assert.deepEqual(result.map(fact => fact.view?.pickable), [true, true, true]);
});

test("projection rejects malformed placement values at the boundary", () => {
  assert.throws(() => appendVisualProjections([], [{ ...art, placement: { kind: "footprint", footprint: [[0.5, 0]], orientation: "north" } as never }], () => [true], 512), /visual placement/);
  assert.throws(() => appendVisualProjections([], [{ ...art, placement: { kind: "footprint", footprint: [[0, 0], [0, 0]], orientation: "north" } as never }], () => [true], 512), /visual placement/);
  assert.throws(() => appendVisualProjections([], [{ ...art, placement: { kind: "footprint", footprint: [[0, 0]], orientation: "north", extra: true } as never }], () => [true], 512), /visual placement/);
  assert.throws(() => appendVisualProjections([], [{ ...art, placement: { kind: "stair", entrance: [0, 0, 0], landing: [0, Infinity, 2], orientation: "north" } as never }], () => [true], 512), /visual placement/);
});
