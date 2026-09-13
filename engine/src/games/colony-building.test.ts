import { test } from "node:test";
import { strict as assert } from "node:assert";
import { colonyBuildBindingDetail, colonyBuildCommand } from "./colony-building";
import { entity } from "../sdk/authoring";

test("building command preserves four stair directions without selecting a contact", () => {
  for (const orientation of ["north", "east", "south", "west"] as const) {
    const result = colonyBuildCommand.invoke({
      query: () => [],
      physicalContacts: () => [],
    }, { catalog: "timber-stair", orientation, target: { cell: [0, 17, 0] } });
    assert.equal(result.actions.length, 1);
    const action = result.actions[0];
    assert.equal(action.kind, "plan-construction");
    if (action.kind !== "plan-construction") throw new Error("wrong action");
    assert.equal(action.orientation, orientation);
    assert.equal(action.y, 17);
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
  assert.equal(colonyBuildCommand.invoke({ query: () => [], physicalContacts: () => [] },
    { catalog: "timber-wall", orientation: "north", target: { cell: [0, 17, 0] } }).actions.length, 1);
});
test("structures use one shape-owned support-to-origin convention", () => {
  const context = { query: () => [], physicalContacts: () => [] };
  for (const [catalog, expectedY] of [
    ["timber-floor", 17], ["timber-roof", 17], ["timber-stair", 17],
    ["timber-wall", 18], ["timber-bed", 18], ["timber-shelf", 18],
  ] as const) {
    const result = colonyBuildCommand.invoke(context, { catalog, orientation: "east", target: { cell: [2, 17, 3] } });
    const action = result.actions[0];
    assert.equal(action.kind, "plan-construction");
    if (action.kind !== "plan-construction") throw new Error("wrong action");
    assert.deepEqual([action.x, action.y, action.z], [2, expectedY, 3]);
  }
});

test("oversized build area rejects before terrain queries and leaves subsequent orders usable", () => {
  let queries = 0;
  const context = {
    query: () => [],
    physicalContacts: (cells: readonly unknown[]) => {
      queries += 1;
      return cells.map((_, index) => ({ solid: index === 0, sealedTop: false, outside: false }));
    },
  };
  assert.throws(() => colonyBuildCommand.invoke(context, {
    catalog: "timber-floor",
    target: { area: { start: [-1_000_000, 17, -1_000_000], end: [1_000_000, 17, 1_000_000] } },
  }), /Build area exceeds 256 cells/);
  assert.equal(queries, 0);
  assert.equal(colonyBuildCommand.invoke(context, {
    catalog: "timber-floor", target: { cell: [0, 17, 0] },
  }).actions.length, 1);
  assert.equal(queries, 0);
});

test("building expands deterministic point, line and rectangle designations without workers", () => {
  const context = {
    query: () => [],
    physicalContacts: (cells: readonly unknown[]) => cells.map((_, index) => ({ solid: index === 0, sealedTop: false, outside: false })),
  };
  const point = colonyBuildCommand.invoke(context, { catalog: "timber-floor", orientation: "north", target: { cell: [0, 17, 0] } });
  assert.equal(point.actions.length, 1);
  assert.equal(point.actions[0].kind, "plan-construction");
  const line = colonyBuildCommand.invoke(context, { catalog: "timber-wall", target: { area: { start: [0, 17, 0], end: [2, 17, 0] } } });
  assert.deepEqual(line.actions.map(action => action.kind === "plan-construction" ? [action.x, action.z, action.orientation] : null), [
    [0, 0, "east"], [1, 0, "east"], [2, 0, "east"],
  ]);
  const rectangle = colonyBuildCommand.invoke(context, { catalog: "timber-floor", orientation: "north", target: { area: { start: [0, 17, 0], end: [1, 17, 1] } } });
  assert.equal(rectangle.actions.length, 4);
});

test("building skips an already planned site deterministically", () => {
  const duplicate = colonyBuildCommand.invoke({
    query: () => [{ id: entity("colony.build.timber-wall.0.18.0.north") }],
    physicalContacts: (cells: readonly unknown[]) => cells.map(() => ({ solid: true, sealedTop: false, outside: false })),
  } as never, { catalog: "timber-wall", orientation: "north", target: { cell: [0, 17, 0] } });
  assert.deepEqual(duplicate.actions, []);
});
