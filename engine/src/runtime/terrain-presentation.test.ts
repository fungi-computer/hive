import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EnvironmentDefinition } from "../sdk/environment";
import type {
  KernelPort,
  StructureSurface,
  TerrainChangeSet,
  TerrainSurface,
} from "../contracts";
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
  structures: { maxSpanSteps: 6, catalog: [{ id: "fixture-floor", shape: { kind: "floor" }, workReachBelowCells: 0, materials: [{ kind: "stone-spoil", quantity: 1 }], workSeconds: 1 }] },
  materials: [
    { slot: 0, solid: false, diggable: false, water: { kind: "open" } },
    { slot: 1, solid: true, diggable: true, water: { kind: "closed" } },
    { slot: 2, solid: true, diggable: true, water: { kind: "closed" } },
  ],
  water: { id: "water", cells: [], fallMPerS: 0, spreadMPerS: 0 },
};

test("surface sampling is cached and subterranean water remains available for covered cave geometry", () => {
  let revision = 1;
  let surfaceY = 5;
  let surfaceCalls = 0;
  let structureCalls = 0;
  const port = fakePort(
    () => ({
      terrainRevision: revision, placementRevision: revision,
      cells: [
        { at: [0, 4, 0], level: 1, massKg: 1, liquidVolumeM3: 0.001 },
        { at: [0, 5, 0], level: 2, massKg: 2, liquidVolumeM3: 0.002 },
        { at: [1, -4, 0], level: 3, massKg: 3, liquidVolumeM3: 0.003 },
      ],
    }),
    (columns) => {
      surfaceCalls++;
      return columns.map(([x]) =>
        x === 0
          ? { cell: [x, surfaceY, 0] as const, material: 1, generatedTop: 0 }
          : null,
      );
    },
    (columns) => {
      structureCalls++;
      return columns.map(([x, z]) => [{ cell: [x, 2, z] as const }]);
    },
    () => ({ kind: "full-reset", revision, reason: "history" }),
  );
  const owner = new TerrainPresentationOwner(port, definition);
  const first = owner.read();
  assert.equal(surfaceCalls, 1);
  assert.equal(structureCalls, 1);
  assert.deepEqual(
    first.water.map((cell) => cell.at),
    [
      [0, 4, 0],
      [0, 5, 0],
      [1, -4, 0],
    ],
  );
  owner.read();
  assert.equal(surfaceCalls, 1);
  assert.equal(structureCalls, 1);
  revision = 2;
  surfaceY = 3;
  const changed = owner.read();
  assert.equal(surfaceCalls, 2);
  assert.equal(structureCalls, 2);
  assert.deepEqual(
    changed.water.map((cell) => cell.at),
    [
      [0, 4, 0],
      [0, 5, 0],
      [1, -4, 0],
    ],
  );
  owner.reset();
  owner.read();
  assert.equal(surfaceCalls, 3);
  assert.equal(structureCalls, 3);
});

test("material chunks are bounded, complete, coalesced and revision guarded", () => {
  let revision = 7; let calls = 0;
  const owner = new TerrainPresentationOwner(fakePort(
    () => ({ terrainRevision: revision, placementRevision: revision, cells: [] }),
    columns => columns.map(([x, z]) => ({ cell: [x, 0, z], material: 1, generatedTop: 0 })), undefined,
    () => ({ kind: "full-reset", revision, reason: "history" }),
    cells => { calls++; return cells.map(([, y]) => y < 0 ? 2 : y === 0 ? 1 : 0); },
  ), definition);
  const request = { requestId: 3, epoch: 2, terrainRevision: 7, chunks: [[0, -1, 0]] as const };
  const ready = owner.readChunks(request, 2);
  assert.equal(ready.kind, "ready"); if (ready.kind !== "ready") return;
  assert.equal(calls, 1); assert.deepEqual(ready.chunks[0].min, [0, -8, 0]); assert.deepEqual(ready.chunks[0].max, [2, 0, 1]);
  assert.equal(ready.chunks[0].columns.length, 2);
  assert.deepEqual(ready.chunks[0].columns[0], { x: 0, z: 0, runs: [{ minY: -8, maxY: 0, material: 2 }] });
  revision = 8;
  assert.deepEqual(owner.readChunks(request, 2), { kind: "stale", requestId: 3, epoch: 2, terrainRevision: 8 });
  assert.throws(() => owner.readChunks({ ...request, terrainRevision: 8, chunks: [[1, 0, 0]] }, 2), /does not intersect/);
  assert.throws(() => owner.readChunks({ ...request, terrainRevision: 8, chunks: [[0, 0, 0], [0, 0, 0]] }, 2), /duplicate terrain chunk key/);
});

test("game-authored generated cover is checked, deterministic and removed below its supporting surface", () => {
  let revision = 1;
  let surfaceY = 0;
  const seen: string[] = [];
  const port = fakePort(
    () => ({ terrainRevision: revision, placementRevision: revision, cells: [] }),
    columns => columns.map(([x, z]) => ({ cell: [x, surfaceY, z] as const, material: 1, generatedTop: 0 })),
    undefined,
    () => ({ kind: "changed-columns", revision, columns: [[0, 0], [1, 0]] }),
  );
  const owner = new TerrainPresentationOwner(port, definition, undefined, {
    materials: [{ slot: 1, art: "earth" }, { slot: 2, art: "stone" }],
    generatedCover(input) {
      seen.push(`${input.worldIdentity}:${input.worldSeed}:${input.cell.join(",")}`);
      return { kind: "grass", condition: input.cell[0] === 0 ? "green" : "dead", height: input.cell[0] === 0 ? "full" : "short" };
    },
  });
  assert.deepEqual(owner.read().surfaces.map(surface => surface.cover), [
    { kind: "grass", condition: "green", height: "full" },
    { kind: "grass", condition: "dead", height: "short" },
  ]);
  assert.deepEqual(seen, ["surface-test:surface-test:0,0,0", "surface-test:surface-test:1,0,0"]);
  revision = 2;
  surfaceY = -1;
  assert.deepEqual(owner.read().surfaces.map(surface => surface.cover), [undefined, undefined]);
  assert.equal(seen.length, 2, "excavated surfaces cannot regenerate decorative cover");
  surfaceY = 0;
  assert.throws(() => new TerrainPresentationOwner(port, definition, undefined, {
    materials: [{ slot: 1, art: "earth" }],
    generatedCover: () => ({ kind: "grass", condition: "green", height: "" }),
  }).read(), /too[_ ]small/i);
});

test("physical column changes patch terrain and structures in canonical order", () => {
  let revision = 1;
  let surfaceCalls = 0;
  let structureCalls = 0;
  const queried: (readonly [number, number])[][] = [];
  const port = fakePort(
    () => ({ terrainRevision: revision, placementRevision: revision, cells: [] }),
    (columns) => {
      surfaceCalls++;
      queried.push([...columns]);
      return columns.map(([x, z]) => ({
        cell: [x, x === 0 ? revision : 7, z] as const,
        material: x + 1,
        generatedTop: 7,
      }));
    },
    (columns) => {
      structureCalls++;
      return columns.map(([x, z]) => [
        { cell: [x, x === 0 ? revision + 10 : 20, z] as const },
      ]);
    },
    () => ({ kind: "changed-columns", revision: 2, columns: [[0, 0]] }),
  );
  const owner = new TerrainPresentationOwner(port, definition);
  const first = owner.read();
  revision = 2;
  const changed = owner.read();
  assert.equal(surfaceCalls, 2);
  assert.equal(structureCalls, 2);
  assert.deepEqual(queried, [
    [
      [0, 0],
      [1, 0],
    ],
    [[0, 0]],
  ]);
  assert.equal(changed.surfaces[1], first.surfaces[1]);
  assert.equal(changed.structureSurfaces[1], first.structureSurfaces[1]);
  assert.deepEqual(
    changed.surfaces.map((surface) => surface.cell),
    [
      [0, 2, 0],
      [1, 7, 0],
    ],
  );
  assert.deepEqual(
    changed.structureSurfaces.map((surface) => surface.cell),
    [
      [0, 12, 0],
      [1, 20, 0],
    ],
  );
  assert.deepEqual(
    first.surfaces.map((surface) => surface.cell),
    [
      [0, 1, 0],
      [1, 7, 0],
    ],
  );
});

test("structure projection preserves multiple authored heights and rejects duplicates", () => {
  const port = fakePort(
    () => ({ terrainRevision: 1, placementRevision: 1, cells: [] }),
    (columns) =>
      columns.map(([x, z]) => ({
        cell: [x, 0, z] as const,
        material: 1,
        generatedTop: 0,
      })),
    (columns) =>
      columns.map(([x, z]) => [
        { cell: [x, 2, z] as const },
        { cell: [x, 5, z] as const },
      ]),
  );
  const frame = new TerrainPresentationOwner(port, definition).read();
  assert.deepEqual(
    frame.structureSurfaces.map((surface) => surface.cell),
    [
      [0, 2, 0],
      [0, 5, 0],
      [1, 2, 0],
      [1, 5, 0],
    ],
  );
  const bad = fakePort(
    () => ({ terrainRevision: 1, placementRevision: 1, cells: [] }),
    (columns) =>
      columns.map(([x, z]) => ({
        cell: [x, 0, z] as const,
        material: 1,
        generatedTop: 0,
      })),
    (columns) =>
      columns.map(([x, z]) => [
        { cell: [x, 2, z] as const },
        { cell: [x, 2, z] as const },
      ]),
  );
  assert.throws(
    () => new TerrainPresentationOwner(bad, definition).read(),
    /duplicate structure surface/,
  );
});

function fakePort(
  facts: () => unknown,
  surfaces: (
    columns: readonly [number, number][],
  ) => readonly (TerrainSurface | null)[],
  structures: (
    columns: readonly [number, number][],
  ) => readonly (readonly StructureSurface[])[] = (columns) =>
    columns.map(() => []),
  changes: (since: number) => TerrainChangeSet = () => ({
    kind: "full-reset",
    revision: 1,
    reason: "history",
  }),
  materials: (cells: readonly [number, number, number][]) => readonly number[] = () => [],
): KernelPort {
  return {
    routeCosts: () => {
      throw new Error("unexpected route query");
    },
    routeToAny: () => {
      throw new Error("unexpected route query");
    },
    dispose() {},
    load() {},
    loadEnvironment() {},
    environmentFacts: facts,
    physicalContacts: () => {
      throw new Error("unexpected physical contact query in this fixture");
    },
    atmosphereSamples: (cells) => ({
      revision: 0,
      geometryRevision: 0,
      samples: cells.map(() => null),
    }),
    constructionReadiness: (sites) => sites.map((site) => ({ site, status: "ready" })),
    constructionAccess: () => [],
    deconstructionAccess: () => [],
    terrainMaterials: materials,
    terrainSurfaces: surfaces,
    structureSurfaces: structures,
    terrainChanges: changes,
    query: () => [],
    workMaterialFacts: () => ({ version: 1, containers: [], lots: [] }),
    processRequirements: () => { throw new Error("unexpected process requirements query"); },
    entityMembership: () => [],
    advance: () => ({ revision: 0, results: [], impacts: [] }),
    snapshot: () => ({
      format: "hive-kernel-records",
      version: 1,
      time: 0,
      revision: 0,
      records: [],
    }),
    restore() {},
    renderFacts: () => [],
    worldPoses: () => [],
  };
}

test("camera chunks carry surface/cover metadata beyond the central observation window with bounded deduplicated queries", () => {
  const wide = { ...definition, world:{...definition.world,bounds:{minX:-128,maxX:128,minY:-8,maxY:16,minZ:-128,maxZ:128}} };
  const queries: (readonly [number,number][])[] = [];
  let structureCalls=0;
  const owner = new TerrainPresentationOwner(fakePort(
    ()=>({terrainRevision:7,placementRevision:0,cells:[]}),
    columns=>{queries.push(columns);return columns.map(([x,z])=>({cell:[x,9,z] as const,material:1,generatedTop:9}));},
    columns=>{structureCalls++;return columns.map(()=>[]);},
    ()=>({kind:"full-reset",revision:7,reason:"history"}),
    cells=>cells.map(([,y])=>y<=9?1:0),
  ),wide,{minX:-32,maxX:32,minZ:-32,maxZ:32},{materials:[{slot:1,art:"earth"}],
    generatedCover:()=>({kind:"grass",condition:"green",height:"full"})});
  const request={requestId:1,epoch:0,terrainRevision:7,chunks:[[8,0,0],[8,1,0],[9,0,0]] as [number, number, number][]};
  const reply=owner.readChunks(request,0);
  assert.equal(reply.kind,"ready");if(reply.kind!=="ready")return;
  assert.equal(queries.length,2);
  assert(queries.every(batch=>batch.length<=64));
  assert.equal(new Set(queries.flat().map(column=>column.join(","))).size,128);
  assert.equal(structureCalls,0,"camera ground queries do not expand structure observation");
  assert.deepEqual(reply.chunks[0].surfaces,reply.chunks[1].surfaces);
  assert(reply.chunks[0].surfaces.every(surface=>surface.cell[0]>=64 && surface.cell[1]===9 && surface.cover?.height==="full"));
  assert.equal(reply.chunks[0].max[1],8,"column top metadata is retained below the top's chunk");
  assert.equal(owner.baseline().protocolVersion,3);
});

test("chunk and observation projections share current cover overrides and revision invalidation",()=>{
  let revision=1, height="full", surfaceY=0;
  const owner=new TerrainPresentationOwner(fakePort(
    ()=>({terrainRevision:revision,placementRevision:0,cells:[]}),
    columns=>columns.map(([x,z])=>({cell:[x,surfaceY,z] as const,material:1,generatedTop:0,
      ...(x===0?{cover:{kind:"grass",condition:"green",height}}:{})})),
    undefined,()=>({kind:"changed-columns",revision,columns:[[0,0],[1,0]]}),
    cells=>cells.map(([,y])=>y<=surfaceY?1:0),
  ),definition,undefined,{materials:[{slot:1,art:"earth"}],generatedCover:()=>({kind:"grass",condition:"green",height:"full"})});
  const request={requestId:1,epoch:0,terrainRevision:1,chunks:[[0,0,0]] as [number, number, number][]};
  const first=owner.readChunks(request,0);assert.equal(first.kind,"ready");
  if(first.kind!=="ready")return;
  assert.deepEqual(first.chunks[0].surfaces,owner.read().surfaces);
  revision=2;height="short";surfaceY=-1;
  assert.equal(owner.readChunks(request,0).kind,"stale");
  const changed=owner.readChunks({...request,terrainRevision:2},0);assert.equal(changed.kind,"ready");
  if(changed.kind!=="ready")return;
  assert.deepEqual(changed.chunks[0].surfaces,owner.read().surfaces);
  assert.equal(changed.chunks[0].surfaces[0].cover?.height,"short","current authority-provided cover wins over generated decoration");
  assert.equal(changed.chunks[0].surfaces[1].cover,undefined,"dug ground cannot regrow generated cover");
  assert.equal(changed.chunks[0].surfaces[0].generatedTop,0);
});
