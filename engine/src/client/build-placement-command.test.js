import { test } from "node:test";
import { strict as assert } from "node:assert";
import { localBindings } from "./whistle-runtime.js";
import { colonyPack } from "../games/colony.ts";
import { bindingCommand, buildPlacementCommand, terrainAreaCommand, terrainCellCommand } from "./whistle-command.js";

const colonyBindings = localBindings(colonyPack.id, colonyPack.commands);
const buildControl = (id) => colonyBindings.find((control) => control.id === id);

test("local floor binding turns a rectangle into one durable command input", () => {
  const control = buildControl("timber-floor");
  assert.deepEqual(terrainAreaCommand(control, [], { start: [0, 13, 0], end: [1, 13, 1] }).input, {
    catalog: "timber-floor", orientation: "north", target: { area: { start: [0, 13, 0], end: [1, 13, 1] } },
  });
});

test("wall placement binds one canonical edge run to the shared build command", () => {
  const wall = buildControl("timber-wall");
  assert.equal(wall.target, "world-edge");
  assert.deepEqual(wall.designation, ["edge-line"]);
  const edges = [{ cell: [0, 13, 0], axis: "z" }, { cell: [1, 13, 0], axis: "z" }];
  assert.deepEqual(buildPlacementCommand(wall, [], { mode: "edge-line", edges }).input,
    { catalog: "timber-wall", target: { edges } });
  assert.throws(() => buildPlacementCommand(wall, [], { mode: "edge-line", cells: [[0, 13, 0]] }), /requires an edge/);
  assert.throws(() => buildPlacementCommand(wall, [], { mode: "edge-line", edges: [{ cell: [0, 13, 0], axis: "y" }] }), /invalid edge/);
});

test("floor and roof areas fill through the same generic binder, while stairs stay point presets", () => {
  for (const catalog of ["timber-floor", "timber-roof"]) {
    const control = buildControl(catalog);
    assert.deepEqual(control.designation, ["point", "rectangle"]);
    assert.deepEqual(buildPlacementCommand(control, [], { mode: "rectangle", cells: [[0, 13, 0], [1, 13, 0], [0, 13, 1], [1, 13, 1]], start: [0, 13, 0], end: [1, 13, 1] }).input,
      { catalog, orientation: "north", target: { area: { start: [0, 13, 0], end: [1, 13, 1] } } });
  }
  for (const orientation of ["north", "east", "south", "west"]) {
    const control = buildControl(`stair-${orientation}`);
    assert.deepEqual(control.designation, ["point"]);
    assert.deepEqual(buildPlacementCommand(control, [], { mode: "point", cells: [[2, 13, 3]], start: [2, 13, 3], end: [2, 13, 3] }).input,
      { catalog: "timber-stair", orientation, target: { cell: [2, 13, 3] } });
  }
});

test("surface bindings preserve point source validation and selected entities", () => {
  const build = { commandId: "colony:build", preset: { catalog: "timber-floor" }, target: "world-surface", designation: ["point", "rectangle"] };
  assert.deepEqual(terrainCellCommand(build, [], { cell: [1, 13, 2], material: 2 }).input, {
    catalog: "timber-floor", target: { cell: [1, 13, 2] },
  });
  assert.deepEqual(terrainCellCommand(build, [], { cell: [1, 13, 2], source: "structure" }).input, {
    catalog: "timber-floor", target: { cell: [1, 13, 2] },
  });
  assert.throws(() => terrainCellCommand({ commandId: "colony:dig", target: "terrain-cell" }, [], { cell: [1, 13, 2], source: "placement" }), /placement target/);
  const selection = bindingCommand({ commandId: "colony:deposit", selection: "entities" }, ["worker", "worker"]);
  assert.deepEqual(selection.input, { entities: ["worker"] });
});

test("single entity bindings bind a scoped selected subject to their declared field", () => {
  const control = { commandId: "colony:deconstruct", selection: { field: "site", cardinality: "one" }, subjects: ["site-1", "other"] };
  assert.deepEqual(bindingCommand(control, ["site-1"]).input, { site: "site-1" });
  assert.throws(() => bindingCommand(control, []), /exactly one/);
  assert.throws(() => bindingCommand(control, ["site-1", "other"]), /exactly one/);
  assert.throws(() => bindingCommand(control, ["worker"]), /exactly one/);
  assert.throws(() => bindingCommand({ ...control, preset: { site: "preset-site" } }, ["site-1"]), /collision/);
});

test("affected game bindings use one entity fields and brew station point placement", () => {
  assert.deepEqual(colonyBindings.find((entry) => entry.id === "deconstruct").selection, { field: "site", cardinality: "one" });
  const brew = buildControl("brew-station");
  assert.deepEqual(brew.designation, ["point"]);
  assert.deepEqual(buildPlacementCommand(brew, [], { mode: "point", cells: [[2, 13, 3]], start: [2, 13, 3], end: [2, 13, 3] }).input,
    { catalog: "brew-station", orientation: "north", target: { cell: [2, 13, 3] } });
});

test("area bindings reject mixed levels and oversized designations", () => {
  const control = { commandId: "colony:dig", target: "terrain-area", designation: ["rectangle"] };
  assert.throws(() => terrainAreaCommand(control, [], { start: [0, 1, 0], end: [0, 2, 0] }), /exceeds 256/);
  assert.throws(() => terrainAreaCommand(control, [], { start: [0, 1, 0], end: [16, 1, 16] }), /exceeds 256/);
});
