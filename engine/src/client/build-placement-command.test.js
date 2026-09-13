import { test } from "node:test";
import { strict as assert } from "node:assert";
import { bindingCommand, buildPlacementCommand, terrainAreaCommand, terrainCellCommand } from "./whistle-command.js";

test("local build binding turns a rectangle into one durable command input", () => {
  const control = { commandId: "colony:build", preset: { catalog: "timber-wall" }, target: "world-surface", designation: ["point", "line", "rectangle"] };
  assert.deepEqual(terrainAreaCommand(control, [], { start: [0, 13, 0], end: [1, 13, 1] }).input, {
    catalog: "timber-wall", target: { area: { start: [0, 13, 0], end: [1, 13, 1] } },
  });
});

test("generic build placement preserves point, line, and rectangle command shapes", () => {
  const wall = { command: "build", commandId: "colony:build", preset: { catalog: "timber-wall" }, target: "world-surface", designation: ["point", "line", "rectangle"] };
  assert.deepEqual(buildPlacementCommand(wall, [], { mode: "point", cells: [[2, 13, 3]], start: [2, 13, 3], end: [2, 13, 3] }).input,
    { catalog: "timber-wall", target: { cell: [2, 13, 3] } });
  assert.deepEqual(buildPlacementCommand(wall, [], { mode: "line", cells: [[0, 13, 0], [1, 13, 0]], start: [0, 13, 0], end: [1, 13, 0] }).input,
    { catalog: "timber-wall", target: { area: { start: [0, 13, 0], end: [1, 13, 0] } } });
  assert.deepEqual(buildPlacementCommand(wall, [], { mode: "rectangle", cells: [[0, 13, 0], [1, 13, 0], [0, 13, 1], [1, 13, 1]], start: [0, 13, 0], end: [1, 13, 1] }).input,
    { catalog: "timber-wall", target: { area: { start: [0, 13, 0], end: [1, 13, 1] } } });
});

test("floor and roof areas fill through the same generic binder, while stairs stay point presets", () => {
  for (const catalog of ["timber-floor", "timber-roof"]) {
    const control = { command: "build", commandId: "colony:build", preset: { catalog, orientation: "north" }, target: "world-surface" };
    assert.deepEqual(buildPlacementCommand(control, [], { mode: "rectangle", cells: [[0, 13, 0], [1, 13, 0], [0, 13, 1], [1, 13, 1]], start: [0, 13, 0], end: [1, 13, 1] }).input,
      { catalog, orientation: "north", target: { area: { start: [0, 13, 0], end: [1, 13, 1] } } });
  }
  for (const orientation of ["north", "east", "south", "west"]) {
    const control = { command: "build", commandId: "colony:build", preset: { catalog: "timber-stair", orientation }, target: "world-surface" };
    assert.deepEqual(buildPlacementCommand(control, [], { mode: "point", cells: [[2, 13, 3]], start: [2, 13, 3], end: [2, 13, 3] }).input,
      { catalog: "timber-stair", orientation, target: { cell: [2, 13, 3] } });
  }
});

test("surface bindings preserve point source validation and selected entities", () => {
  const build = { commandId: "colony:build", preset: { catalog: "timber-wall" }, target: "world-surface", designation: ["point", "line", "rectangle"] };
  assert.deepEqual(terrainCellCommand(build, [], { cell: [1, 13, 2], material: 2 }).input, {
    catalog: "timber-wall", target: { cell: [1, 13, 2] },
  });
  assert.deepEqual(terrainCellCommand(build, [], { cell: [1, 13, 2], source: "structure" }).input, {
    catalog: "timber-wall", target: { cell: [1, 13, 2] },
  });
  assert.throws(() => terrainCellCommand({ commandId: "colony:dig", target: "terrain-cell" }, [], { cell: [1, 13, 2], source: "placement" }), /placement target/);
  const selection = bindingCommand({ commandId: "colony:deposit", selection: "entities" }, ["worker", "worker"]);
  assert.deepEqual(selection.input, { entities: ["worker"] });
});

test("area bindings reject mixed levels and oversized designations", () => {
  const control = { commandId: "colony:dig", target: "terrain-area", designation: ["rectangle"] };
  assert.throws(() => terrainAreaCommand(control, [], { start: [0, 1, 0], end: [0, 2, 0] }), /exceeds 256/);
  assert.throws(() => terrainAreaCommand(control, [], { start: [0, 1, 0], end: [16, 1, 16] }), /exceeds 256/);
});
