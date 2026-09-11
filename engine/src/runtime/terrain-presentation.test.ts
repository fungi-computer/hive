import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EnvironmentDefinition } from "../sdk/environment";
import type { KernelPort, TerrainSurface } from "../contracts";
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
  materials: [],
  water: { id: "water", cells: [], fallMPerS: 0, spreadMPerS: 0 },
};

test("surface sampling is cached and subterranean water stays hidden", () => {
  let revision = 1;
  let surfaceY = 5;
  let surfaceCalls = 0;
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
  });
  const owner = new TerrainPresentationOwner(port, definition);
  const first = owner.read();
  assert.equal(surfaceCalls, 1);
  assert.deepEqual(first.water.map((cell) => cell.at), [[0, 5, 0], [1, -4, 0]]);
  owner.read();
  assert.equal(surfaceCalls, 1);
  revision = 2;
  surfaceY = 3;
  const changed = owner.read();
  assert.equal(surfaceCalls, 2);
  assert.deepEqual(changed.water.map((cell) => cell.at), [[0, 4, 0], [0, 5, 0], [1, -4, 0]]);
  owner.reset();
  owner.read();
  assert.equal(surfaceCalls, 3);
});

function fakePort(
  facts: () => unknown,
  surfaces: (columns: readonly [number, number][]) => readonly (TerrainSurface | null)[],
): KernelPort {
  return {
    routeCosts: () => { throw new Error("unexpected route query"); },
    dispose() {},
    load() {},
    loadEnvironment() {},
    environmentFacts: facts,
    terrainMaterials: () => [],
    terrainSurfaces: surfaces,
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
