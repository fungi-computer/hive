import { test } from "node:test";
import { strict as assert } from "node:assert";
import { colonyBuildCommand } from "./colony-building";
import { entity } from "../sdk/authoring";

test("building command uses physical support and preserves four stair directions", () => {
  for (const orientation of ["north", "east", "south", "west"] as const) {
    const result = colonyBuildCommand.invoke({
      query: () => [],
      physicalContacts: cells => {
        assert.equal(cells.length, 24);
        return cells.map((_, index) => ({ solid: false, sealedTop: index === 0, outside: false }));
      },
    }, { catalog: "timber-stair", orientation, target: { cell: [0, 17, 0] } });
    assert.equal(result.actions.length, 1);
    const action = result.actions[0];
    assert.equal(action.kind, "plan-construction");
    if (action.kind !== "plan-construction") throw new Error("wrong action");
    assert.equal(action.orientation, orientation);
    assert.equal(action.y, 17);
    assert.deepEqual(action.contact, { x: -1, y: 17.5 * 0.54, z: 0, frame: null });
  }
});
test("building without an adjacent working surface rejects without actions", () => {
  assert.throws(() => colonyBuildCommand.invoke({ query: () => [], physicalContacts: cells => cells.map(() => ({ solid: false, sealedTop: false, outside: false })) },
    { catalog: "timber-wall", orientation: "north", target: { cell: [0, 17, 0] } }), /No clear working surface/);
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
  assert.equal(queries, 1);
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

test("building skips an already planned site deterministically and rejects an invalid later cell", () => {
  const duplicate = colonyBuildCommand.invoke({
    query: () => [{ id: entity("colony.build.timber-wall.0.18.0.north") }],
    physicalContacts: (cells: readonly unknown[]) => cells.map(() => ({ solid: true, sealedTop: false, outside: false })),
  } as never, { catalog: "timber-wall", orientation: "north", target: { cell: [0, 17, 0] } });
  assert.deepEqual(duplicate.actions, []);
  let calls = 0;
  assert.throws(() => colonyBuildCommand.invoke({ query: () => [], physicalContacts: (cells: readonly unknown[]) => {
    calls += 1;
    return cells.map(() => ({ solid: calls === 1, sealedTop: false, outside: false }));
  } }, { catalog: "timber-floor", orientation: "north", target: { area: { start: [0, 17, 0], end: [1, 17, 0] } } }), /No clear working surface/);
});


test("published build controls accept actual point and drag bindings", async () => {
  const { colonyPack } = await import("./colony");
  const { terrainPresentationCommand, terrainAreaPresentationCommand } = await import("../presentation");
  const context = {
    query: () => [],
    physicalContacts: (cells: readonly unknown[]) => cells.map((_, index) => ({ solid: index % 2 === 0, sealedTop: false, outside: false })),
  };
  for (const control of colonyPack.presentation?.controls.filter(c => c.command === "build") ?? []) {
    for (const picked of [
      { cell: [0, 13, 0] as const, material: 2 },
      { cell: [0, 13, 0] as const, source: "structure" as const },
      { cell: [0, 13, 0] as const, source: "placement" as const },
    ]) {
      const command = terrainPresentationCommand(control, [], picked);
      assert.equal(colonyBuildCommand.invoke(context, command.input).actions.length, 1);
    }
    if (control.designation?.includes("rectangle")) {
      const command = terrainAreaPresentationCommand(control, [], { start: [0, 13, 0], end: [1, 13, 1] });
      assert.equal(colonyBuildCommand.invoke(context, command.input).actions.length, 4);
    }
  }
});
