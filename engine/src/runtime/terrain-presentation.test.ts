import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EnvironmentDefinition } from "../sdk/environment";
import type { KernelPort, StructureSurface, TerrainChangeSet, TerrainSurface } from "../contracts";
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
      ? { cell: [x, surfaceY, 0] as const, material: 1, generatedTop: 0 }
      : null);
  }, columns => { structureCalls++; return columns.map(([x, z]) => [{ cell: [x, 2, z] as const }]); },
  () => ({ kind: "full-reset", revision, reason: "history" }));
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

test("physical column changes patch terrain and structures in canonical order", () => {
  let revision = 1;
  let surfaceCalls = 0;
  let structureCalls = 0;
  const queried: (readonly [number, number])[][] = [];
  const port = fakePort(
    () => ({ terrainRevision: revision, cells: [] }),
    columns => {
      surfaceCalls++;
      queried.push([...columns]);
      return columns.map(([x, z]) => ({ cell: [x, x === 0 ? revision : 7, z] as const, material: x + 1, generatedTop: 7 }));
    },
    columns => {
      structureCalls++;
      return columns.map(([x, z]) => [{ cell: [x, x === 0 ? revision + 10 : 20, z] as const }]);
    },
    () => ({ kind: "changed-columns", revision: 2, columns: [[0, 0]] }),
  );
  const owner = new TerrainPresentationOwner(port, definition);
  const first = owner.read();
  revision = 2;
  const changed = owner.read();
  assert.equal(surfaceCalls, 2);
  assert.equal(structureCalls, 2);
  assert.deepEqual(queried, [[[0, 0], [1, 0]], [[0, 0]]]);
  assert.equal(changed.surfaces[1], first.surfaces[1]);
  assert.equal(changed.structureSurfaces[1], first.structureSurfaces[1]);
  assert.deepEqual(changed.surfaces.map(surface => surface.cell), [[0, 2, 0], [1, 7, 0]]);
  assert.deepEqual(changed.structureSurfaces.map(surface => surface.cell), [[0, 12, 0], [1, 20, 0]]);
  assert.deepEqual(first.surfaces.map(surface => surface.cell), [[0, 1, 0], [1, 7, 0]]);
});

test("structure projection preserves multiple authored heights and rejects duplicates", () => {
  const port = fakePort(
    () => ({ terrainRevision: 1, cells: [] }),
    columns => columns.map(([x, z]) => ({ cell: [x, 0, z] as const, material: 1, generatedTop: 0 })),
    columns => columns.map(([x, z]) => [
      { cell: [x, 2, z] as const },
      { cell: [x, 5, z] as const },
    ]),
  );
  const frame = new TerrainPresentationOwner(port, definition).read();
  assert.deepEqual(frame.structureSurfaces.map(surface => surface.cell), [[0, 2, 0], [0, 5, 0], [1, 2, 0], [1, 5, 0]]);
  const bad = fakePort(
    () => ({ terrainRevision: 1, cells: [] }),
    columns => columns.map(([x, z]) => ({ cell: [x, 0, z] as const, material: 1, generatedTop: 0 })),
    columns => columns.map(([x, z]) => [{ cell: [x, 2, z] as const }, { cell: [x, 2, z] as const }]),
  );
  assert.throws(() => new TerrainPresentationOwner(bad, definition).read(), /duplicate structure surface/);
});

function fakePort(
  facts: () => unknown,
  surfaces: (columns: readonly [number, number][]) => readonly (TerrainSurface | null)[],
  structures: (columns: readonly [number, number][]) => readonly (readonly StructureSurface[])[] = columns => columns.map(() => []),
  changes: (since: number) => TerrainChangeSet = () => ({ kind: "full-reset", revision: 1, reason: "history" }),
): KernelPort {
  return {
    routeCosts: () => { throw new Error("unexpected route query"); },
    dispose() {},
    load() {},
    loadEnvironment() {},
    environmentFacts: facts,
    physicalContacts: () => { throw new Error("unexpected physical contact query in this fixture"); },
    atmosphereSamples: cells => ({ revision: 0, geometryRevision: 0, samples: cells.map(() => null) }),
    terrainMaterials: () => [],
    terrainSurfaces: surfaces,
    structureSurfaces: structures,
    terrainChanges: changes,
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
