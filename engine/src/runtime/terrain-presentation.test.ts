import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EnvironmentDefinition } from "../sdk/environment";
import type { KernelPort, StructureSurface, TerrainSurface } from "../contracts";
import { TerrainPresentationOwner } from "./terrain-presentation";

const definition: EnvironmentDefinition = {
  world: {
    seed: "surface-test",
    identity: "surface-test",
    bounds: { minX: 0, maxX: 2, minY: -8, maxY: 8, minZ: 0, maxZ: 1 },
    slots: { air: 0, soil: 1, stone: 2 },
    seaLevel: 2,
    verticalMetres: 0.5,
  },
  structures: { maxSpanSteps: 6, catalog: [] },
  materials: [],
  water: { id: "water", cells: [], fallMPerS: 0, spreadMPerS: 0 },
};

test("surface sampling is cached and subterranean water stays hidden", () => {
  let revision = 1;
  let surfaceY = 5;
  let surfaceCalls = 0;
  let structureCalls = 0;
  const port = fakePort(() => ({
    terrainRevision: revision,
    cells: [
      { at: [0, 4, 0], massKg: 1, liquidVolumeM3: 0.001 },
      { at: [0, 5, 0], massKg: 2, liquidVolumeM3: 0.002 },
      { at: [1, -4, 0], massKg: 3, liquidVolumeM3: 0.003 },
    ],
  }), (columns) => {
    surfaceCalls++;
    return columns.map(([x]) => x === 0
      ? { cell: [x, surfaceY, 0] as const, material: 1 }
      : null);
  }, columns => { structureCalls++; return columns.map(() => []); });
  const owner = new TerrainPresentationOwner(port, definition);
  const first = owner.read();
  assert.equal(surfaceCalls, 1);
  assert.equal(structureCalls, 1);
  assert.deepEqual(first.water.map((cell) => cell.at), [[0, 5, 0], [1, -4, 0]]);
  owner.read();
  assert.equal(surfaceCalls, 1);
  assert.equal(structureCalls, 1);
  revision = 2;
  surfaceY = 3;
  const changed = owner.read();
  assert.equal(surfaceCalls, 2);
  assert.equal(structureCalls, 2);
  assert.deepEqual(changed.water.map((cell) => cell.at), [[0, 4, 0], [0, 5, 0], [1, -4, 0]]);
  owner.reset();
  owner.read();
  assert.equal(surfaceCalls, 3);
  assert.equal(structureCalls, 3);
});

test("structure projection preserves multiple authored heights and rejects duplicates", () => {
  const port = fakePort(
    () => ({ terrainRevision: 1, cells: [] }),
    columns => columns.map(([x, z]) => ({ cell: [x, 0, z] as const, material: 1 })),
    columns => columns.map(([x, z]) => [
      { cell: [x, 2, z] as const },
      { cell: [x, 5, z] as const },
    ]),
  );
  const frame = new TerrainPresentationOwner(port, definition).read();
  assert.deepEqual(frame.structureSurfaces[0].map(surface => surface.cell), [[0, 2, 0], [0, 5, 0]]);
  const bad = fakePort(
    () => ({ terrainRevision: 1, cells: [] }),
    columns => columns.map(([x, z]) => ({ cell: [x, 0, z] as const, material: 1 })),
    columns => columns.map(([x, z]) => [{ cell: [x, 2, z] as const }, { cell: [x, 2, z] as const }]),
  );
  assert.throws(() => new TerrainPresentationOwner(bad, definition).read(), /duplicate structure surface/);
});

function fakePort(
  facts: () => unknown,
  surfaces: (columns: readonly [number, number][]) => readonly (TerrainSurface | null)[],
  structures: (columns: readonly [number, number][]) => readonly (readonly StructureSurface[])[] = columns => columns.map(() => []),
): KernelPort {
  return {
    routeCosts: () => { throw new Error("unexpected route query"); },
    dispose() {},
    load() {},
    loadEnvironment() {},
    environmentFacts: facts,
    physicalContacts: () => { throw new Error("unexpected physical contact query in this fixture"); }, terrainMaterials: () => [],
    terrainSurfaces: surfaces,
    structureSurfaces: structures,
    query: () => [],
    entityMembership: () => [],
    advance: () => ({ revision: 0, results: [], impacts: [] }),
    snapshot: () => ({ format: "hive-kernel-records", version: 1, time: 0, revision: 0, records: [] }),
    restore() {},
    renderFacts: () => [],
    worldPoses: () => [],
    assign: () => [],
  };
}
