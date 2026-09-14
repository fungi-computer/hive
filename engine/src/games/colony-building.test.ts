import { test } from "node:test";
import { strict as assert } from "node:assert";
import { colonyBuildBindingDetail, colonyBuildCommand } from "./colony-building";
import { entity } from "../sdk/authoring";

test("building command preserves four stair directions without selecting a contact", () => {
  for (const orientation of ["north", "east", "south", "west"] as const) {
    const result = colonyBuildCommand.invoke({
      scope: { kind: "player" as const, player: "player", party: entity("party") },
      query: () => [],
      floorOperations: (cells: readonly unknown[]) => cells.map(() => ({ kind: "build" as const })),
      physicalContacts: () => [],
      terrainMaterials: () => [], terrainSurfaces: () => [],
    }, { catalog: "timber-stair", orientation, target: { cell: [0, 17, 0] } });
    assert.equal(result.actions.length, 1);
    const action = result.actions[0];
    assert.equal(action.kind, "plan-construction");
    if (action.kind !== "plan-construction") throw new Error("wrong action");
    assert.deepEqual(action.target, { kind: "cell", cell: { x: 0, y: 17, z: 0 }, orientation });
  }
});

test("local build detail follows the authoritative definition supplied at composition time", () => {
  const environment = { structures: { catalog: [
    { id: "thing", materials: [{ kind: "wood", quantity: 3 }], shape: { kind: "fixture", footprint: [[0, 0], [1, 0], [0, 1]] } },
  ] } } as any;
  const placement = { thing: { alignment: "fixed", facing: {} } } as any;
  assert.equal(colonyBuildBindingDetail("thing", "north", environment, placement), "3 wood · 2×2 · click point · north");
  environment.structures.catalog[0].materials[0].quantity = 7;
  assert.equal(colonyBuildBindingDetail("thing", "north", environment, placement), "7 wood · 2×2 · click point · north");
});
test("building designation leaves support and access to native staging", () => {
  assert.equal(colonyBuildCommand.invoke({ scope: { kind: "player", player: "player", party: entity("party") }, query: () => [], physicalContacts: () => [], terrainMaterials: () => [], terrainSurfaces: () => [] } as never,
    { catalog: "timber-wall", target: { edges: [{ cell: [0, 17, 0], axis: "x" }] } }).actions.length, 1);
});
test("structures use one shape-owned support-to-origin convention", () => {
  const context = { scope: { kind: "player" as const, player: "player", party: entity("party") }, query: () => [], floorOperations: (cells: readonly unknown[]) => cells.map(() => ({ kind: "build" as const })), physicalContacts: () => [], terrainMaterials: () => [], terrainSurfaces: () => [] };
  for (const [catalog, expectedY] of [
    ["timber-floor", 17], ["timber-roof", 17], ["timber-stair", 17],
    ["timber-bed", 18], ["timber-shelf", 18],
  ] as const) {
    const result = colonyBuildCommand.invoke(context, { catalog, orientation: "east", target: { cell: [2, 17, 3] } });
    const action = result.actions[0];
    assert.equal(action.kind, "plan-construction");
    if (action.kind !== "plan-construction") throw new Error("wrong action");
    assert.deepEqual(action.target, { kind: "cell", cell: { x: 2, y: expectedY, z: 3 }, orientation: "east" });
  }
});

test("oversized build area rejects before terrain queries and leaves subsequent orders usable", () => {
  let queries = 0;
  const context = {
    scope: { kind: "player" as const, player: "player", party: entity("party") },
    query: () => [],
    floorOperations: (cells: readonly unknown[]) => {
      queries += 1;
      return cells.map(() => ({ kind: "build" as const }));
    },
    physicalContacts: (cells: readonly unknown[]) => {
      return cells.map((_, index) => ({ solid: index === 0, sealedTop: false, outside: false }));
    },
    terrainMaterials: () => [], terrainSurfaces: () => [],
  };
  assert.throws(() => colonyBuildCommand.invoke(context, {
    catalog: "timber-floor",
    target: { area: { start: [-1_000_000, 17, -1_000_000], end: [1_000_000, 17, 1_000_000] } },
  }), /Build area exceeds 256 cells/);
  assert.equal(queries, 0);
  assert.equal(colonyBuildCommand.invoke(context, {
    catalog: "timber-floor", target: { cell: [0, 17, 0] },
  }).actions.length, 1);
  assert.equal(queries, 1);
});

test("building expands deterministic point, line and rectangle designations without workers", () => {
  const context = {
    scope: { kind: "player" as const, player: "player", party: entity("party") },
    query: () => [],
    floorOperations: (cells: readonly unknown[]) => cells.map(() => ({ kind: "build" as const })),
    physicalContacts: (cells: readonly unknown[]) => cells.map((_, index) => ({ solid: index === 0, sealedTop: false, outside: false })),
    terrainMaterials: () => [], terrainSurfaces: () => [],
  };
  const point = colonyBuildCommand.invoke(context, { catalog: "timber-floor", orientation: "north", target: { cell: [0, 17, 0] } });
  assert.equal(point.actions.length, 1);
  assert.equal(point.actions[0].kind, "plan-construction");
  const line = colonyBuildCommand.invoke(context, { catalog: "timber-wall", target: { edges: [
    { cell: [0, 17, 0], axis: "z" }, { cell: [1, 17, 0], axis: "z" }, { cell: [2, 17, 0], axis: "z" },
  ] } });
  assert.deepEqual(line.actions.map(action => action.kind === "plan-construction" ? action.target : null), [
    { kind: "edge", edge: { cell: { x: 0, y: 18, z: 0 }, axis: "z" } },
    { kind: "edge", edge: { cell: { x: 1, y: 18, z: 0 }, axis: "z" } },
    { kind: "edge", edge: { cell: { x: 2, y: 18, z: 0 }, axis: "z" } },
  ]);
  const rectangle = colonyBuildCommand.invoke(context, { catalog: "timber-floor", orientation: "north", target: { area: { start: [0, 17, 0], end: [1, 17, 1] } } });
  assert.equal(rectangle.actions.length, 4);
});

test("building skips an already planned site deterministically", () => {
  const duplicate = colonyBuildCommand.invoke({
    scope: { kind: "player", player: "player", party: entity("party") },
    query: () => [{ id: entity("colony.build.timber-wall.edge.0.18.0.x") }],
    physicalContacts: (cells: readonly unknown[]) => cells.map(() => ({ solid: true, sealedTop: false, outside: false })),
    terrainMaterials: () => [], terrainSurfaces: () => [],
  } as never, { catalog: "timber-wall", target: { edges: [{ cell: [0, 17, 0], axis: "x" }] } });
  assert.deepEqual(duplicate.actions, []);
});

test("wall edge designation deduplicates and sorts before native planning", () => {
  const context = {
    scope: { kind: "player" as const, player: "player", party: entity("party") },
    query: () => [], physicalContacts: () => [], terrainMaterials: () => [], terrainSurfaces: () => [],
  };
  const result = colonyBuildCommand.invoke(context, { catalog: "timber-wall", target: { edges: [
    { cell: [2, 17, -1], axis: "z" },
    { cell: [-3, 17, 4], axis: "x" },
    { cell: [2, 17, -1], axis: "z" },
  ] } });
  assert.deepEqual(result.actions.map(action => action.kind === "plan-construction" ? action.target : null), [
    { kind: "edge", edge: { cell: { x: -3, y: 18, z: 4 }, axis: "x" } },
    { kind: "edge", edge: { cell: { x: 2, y: 18, z: -1 }, axis: "z" } },
  ]);
});
