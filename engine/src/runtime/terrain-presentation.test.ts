import {exposeTerrainPatch} from "./terrain-region-exposure.js";
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
    partyJoinIdentity: () => { throw new Error("unexpected party query"); },
    floorOperations: () => [],
    transferContacts: () => { throw new Error("unexpected transfer query"); },
    placementDecisions: () => { throw new Error("unexpected placement query"); },
    waterContacts: () => [],
    workAttempts: () => [],
    workAttemptForWorker: () => null,
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
    acceptCapture: () => { throw new Error("unexpected capture acknowledgement in terrain fixture"); },
    capture: () => { throw new Error("unexpected resident capture in terrain fixture"); },
    snapshot: () => ({
      format: "hive-kernel-records",
      version: 3,
      time: 0,
      revision: 0,
      records: [],
    }),
    restore() {},
    renderFacts: () => [],
    worldPoses: () => [],
  };
}


const regionRequest = (terrainRevision=1) => ({requestId:1,epoch:0,terrainRevision,regions:[[0,0,0]] as [number,number,number][]});

test("region reads guard revisions before sampling, preserve caps and cache immutable complete patches",()=>{
 let revision=1, calls=0, surfaceCalls=0;
 const owner=new TerrainPresentationOwner(fakePort(
  ()=>({terrainRevision:revision,placementRevision:0,cells:[]}),
  columns=>{surfaceCalls++;return columns.map(([x,z])=>({cell:[x,3,z] as const,material:1,generatedTop:3}));},
  undefined,undefined,cells=>{calls++;assert(cells.length<=256);return cells.map(([,y])=>y<=3?1:0);}
 ),definition);
 const request=regionRequest(1);
 assert.equal(owner.readRegion({...request,epoch:9},[0,0,0],0).kind,'stale');
 assert.equal(calls,0);assert.equal(surfaceCalls,0);
 const first=owner.readRegion(request,[0,0,0],0);assert.equal(first.kind,'patch');if(first.kind!=='patch')return;
 assert.deepEqual(exposeTerrainPatch({patch:first.patch,baseline:owner.baseline(),level:1}).map(face=>[face.cell,face.face,face.cap]),[[[0,1,0],'top',true],[[1,1,0],'top',true]]);
 assert(first.patch.surfaces.every(s=>s.cell[1]===3&&s.generatedTop===3));
 const count=calls,again=owner.readRegion({...request,requestId:2},[0,0,0],0);assert.equal(again.kind,'patch');if(again.kind!=='patch')return;
 assert.strictEqual(first.patch,again.patch);assert.equal(calls,count);assert.equal(again.requestId,2);
 assert.throws(()=>{first.patch.columns[0].runs[0][0]=99;},TypeError);
 owner.reset();owner.readRegion(request,[0,0,0],0);assert(calls>count);
 revision=2;const before=calls;
 assert.equal(owner.readRegion(request,[0,0,0],0).kind,'stale');assert.equal(calls,before);
 assert.equal(owner.readRegion({...request,terrainRevision:2},[0,0,0],0).kind,'patch');assert(calls>before);
 assert.equal(owner.readRegion({...request,terrainRevision:2,regions:[[1,0,0]]},[1,0,0],0).kind,'unavailable');
 assert.throws(()=>owner.readRegion({...request,terrainRevision:2},[1,0,0],0),/unrequested/);
});

test("regions include the full exterior support halo beyond observation, with natural cover above a cut",()=>{
 const wide={...definition,world:{...definition.world,bounds:{minX:-128,maxX:128,minY:-8,maxY:16,minZ:-128,maxZ:128}}};
 const queries:(readonly [number,number][])[]=[];let materialSamples=0;
 const owner=new TerrainPresentationOwner(fakePort(
 ()=>({terrainRevision:1,placementRevision:0,cells:[]}),
 columns=>{queries.push(columns);return columns.map(([x,z])=>({cell:[x,9,z] as const,material:1,generatedTop:9}));},
 ()=>{throw new Error('region cannot expand structure observation');},undefined,
 cells=>{assert(cells.length<=256);materialSamples+=cells.length;return cells.map(([,y])=>y<=9?1:0);}),
 wide,{minX:-32,maxX:32,minZ:-32,maxZ:32},{materials:[{slot:1,art:'earth'}],generatedCover:()=>({kind:'grass',condition:'green',height:'full'})});
 const result=owner.readRegion({...regionRequest(1),regions:[[8,0,0]]},[8,0,0],0);
 assert.equal(result.kind,'patch');if(result.kind!=='patch')return;
 assert.equal(result.patch.surfaces.length,100);assert.equal(queries.length,2);assert(queries.every(q=>q.length<=64));
 const faces=exposeTerrainPatch({patch:result.patch,baseline:owner.baseline(),level:5});assert.equal(faces.length,64);assert(faces.every(f=>f.face==='top'&&f.cap&&f.cell[1]===5));
 assert(result.patch.surfaces.some(s=>s.cell[0]===63&&s.cell[2]===-1));
 assert(result.patch.surfaces.some(s=>s.cell[0]===72&&s.cell[2]===8));
 assert(result.patch.surfaces.every(s=>s.cell[1]===9&&s.cover?.height==='full'));
 assert.equal(materialSamples,2400,'the entire 24-level world is queried once independently of cuts');
});

test("region and observation cover share current overrides and removal after excavation",()=>{
 let revision=1,surfaceY=0,height='full';
 const owner=new TerrainPresentationOwner(fakePort(
 ()=>({terrainRevision:revision,placementRevision:0,cells:[]}),
 columns=>columns.map(([x,z])=>({cell:[x,surfaceY,z] as const,material:1,generatedTop:0,...(x===0?{cover:{kind:'grass',condition:'green',height}}:{})})),
 undefined,()=>({kind:'changed-columns',revision,columns:[[0,0],[1,0]]}),cells=>cells.map(([,y])=>y<=surfaceY?1:0)),
 definition,undefined,{materials:[{slot:1,art:'earth'}],generatedCover:()=>({kind:'grass',condition:'green',height:'full'})});
 const first=owner.readRegion(regionRequest(),[0,0,0],0);assert.equal(first.kind,'patch');if(first.kind!=='patch')return;
 assert.deepEqual(first.patch.surfaces,owner.read().surfaces);
 revision=2;surfaceY=-1;height='short';
 const second=owner.readRegion(regionRequest(2),[0,0,0],0);assert.equal(second.kind,'patch');if(second.kind!=='patch')return;
 assert.deepEqual(second.patch.surfaces,owner.read().surfaces);
 assert.equal(second.patch.surfaces[0].cover?.height,'short');assert.equal(second.patch.surfaces[1].cover,undefined);
 assert(exposeTerrainPatch({patch:second.patch,baseline:owner.baseline(),level:7}).every(face=>!face.cap));
});

test("region cache evicts old horizontal patches and resets on epoch even at the same revision",()=>{
 let calls=0;
 const wide={...definition,world:{...definition.world,bounds:{minX:0,maxX:1040,minY:0,maxY:2,minZ:0,maxZ:1}}};
 const owner=new TerrainPresentationOwner(fakePort(()=>({terrainRevision:1,placementRevision:0,cells:[]}),
 columns=>columns.map(([x,z])=>({cell:[x,0,z] as const,material:1,generatedTop:0})),undefined,undefined,
 cells=>{calls++;return cells.map(()=>1);}),wide,{minX:0,maxX:8,minZ:0,maxZ:1});
 for(let x=0;x<129;x++) assert.equal(owner.readRegion({...regionRequest(),regions:[[x,0,0]]},[x,0,0],0).kind,'patch');
 const before=calls;owner.readRegion(regionRequest(),[0,0,0],0);assert(calls>before,'oldest patch evicted at 128');
 const next=calls;owner.readRegion({...regionRequest(),epoch:1},[0,0,0],1);assert(calls>next,'epoch invalidates all cached patches');
});

test("tall worlds produce bounded reusable slabs instead of rejecting the whole height",()=>{
 let samples=0,maxBatch=0;
 const world={...definition,world:{...definition.world,bounds:{minX:-1,maxX:9,minY:0,maxY:2048,minZ:-1,maxZ:9}}};
 const owner=new TerrainPresentationOwner(fakePort(()=>({terrainRevision:1,placementRevision:0,cells:[]}),
 columns=>columns.map(([x,z])=>({cell:[x,2047,z] as const,material:1,generatedTop:2047})),undefined,undefined,
 cells=>{samples+=cells.length;maxBatch=Math.max(maxBatch,cells.length);return cells.map(([x,y,z])=>(x+y+z)%2===0?1:0);}),world);
 for(const slab of [0,1,15]) {
  const result=owner.readRegion({...regionRequest(),regions:[[0,0,slab]]},[0,0,slab],0);
  assert.equal(result.kind,"patch");if(result.kind!=="patch")return;
  assert.equal(result.patch.bounds.maxY-result.patch.bounds.minY,128);
  assert(result.patch.coverage.maxY-result.patch.coverage.minY<=130);
  assert(new TextEncoder().encode(JSON.stringify(result)).byteLength<512*1024);
 }
 assert(samples<=3*13000);assert(maxBatch<=256);
 assert.equal(owner.readRegion({...regionRequest(),regions:[[0,0,16]]},[0,0,16],0).kind,"unavailable");
});

test("real WASM region faces match authoritative materials across natural surfaces and cuts",async()=>{
 const {readFileSync}=await import('node:fs');
 const {initSync,WasmKernel}=await import('../../generated/hive_kernel.js');
 const {wasmKernelPort}=await import('./wasm-kernel');
 const {encodeEnvironmentDefinition}=await import('../sdk/environment');
 const {colonyEnvironment}=await import('../games/colony-environment');
 const {colonyPack}=await import('../games/colony');
 initSync({module:readFileSync('engine/generated/hive_kernel_bg.wasm')});
 const port=wasmKernelPort(new WasmKernel());
 try {
  port.load(colonyPack.definition);
  port.loadEnvironment(encodeEnvironmentDefinition(colonyEnvironment));
  const owner=new TerrainPresentationOwner(port,colonyEnvironment);
  const facts=port.environmentFacts() as {terrainRevision:number};
  const directions={top:[0,1,0],bottom:[0,-1,0],east:[1,0,0],west:[-1,0,0],south:[0,0,1],north:[0,0,-1]};
  const palette=new Map(colonyEnvironment.materials.map(m=>[m.slot,m.solid]));
  for(const level of [39,5]) {
   const result=owner.readRegion(regionRequest(facts.terrainRevision),[0,0,0],0);
   assert.equal(result.kind,'patch');if(result.kind!=='patch')continue;
   assert.equal(result.patch.surfaces.length,100);
   const faces=exposeTerrainPatch({patch:result.patch,baseline:owner.baseline(),level});
   assert(faces.length>=64);
   const cells:[number,number,number][]=faces.flatMap(face=>{
    const d=directions[face.face];return [[...face.cell] as [number,number,number],face.cell.map((v,i)=>v+d[i]) as [number,number,number]];
   });
   const sampled:number[]=[];
   for(let i=0;i<cells.length;i+=256)sampled.push(...port.terrainMaterials(cells.slice(i,i+256)));
   faces.forEach((face,i)=>{
    assert.equal(sampled[i*2],face.material);assert.equal(palette.get(face.material),true);
    assert.equal(palette.get(sampled[i*2+1]),face.cap,'only artificial cut caps border solid neighbors');
   });
   if(level===5)assert(faces.some(face=>face.cap));
   else assert(faces.every(face=>!face.cap));
  }
 } finally {port.dispose();}
});

test("material coverage retains caves and complete known air columns",()=>{
 const cave={...definition,world:{...definition.world,bounds:{minX:0,maxX:3,minY:0,maxY:8,minZ:0,maxZ:3}}};
 const owner=new TerrainPresentationOwner(fakePort(()=>({terrainRevision:1,placementRevision:0,cells:[]}),
 columns=>columns.map(([x,z])=>x===1&&z===1?{cell:[x,3,z] as const,material:1,generatedTop:3}:null),undefined,undefined,
 cells=>cells.map(([x,y,z])=>x===1&&z===1&&(y===0||y===3)?1:0)),cave);
 const result=owner.readRegion(regionRequest(),[0,0,0],0);assert.equal(result.kind,'patch');if(result.kind!=='patch')return;
 const faces=exposeTerrainPatch({patch:result.patch,baseline:owner.baseline(),level:7});
 assert.equal(faces.length,11);
 assert.deepEqual(faces.filter(f=>f.face==='top').map(f=>f.cell[1]),[0,3]);
 assert(faces.some(f=>f.face==='bottom'&&f.cell[1]===3));
 assert.equal(result.patch.columns.length,9);
 assert(result.patch.columns.some(column=>column.runs.length===1&&column.runs[0][1]===0));
});

test("serialized patch bytes evict cache entries before its count limit",()=>{
 let materialCalls=0;
 const wide={...definition,world:{...definition.world,bounds:{minX:0,maxX:1024,minY:0,maxY:128,minZ:0,maxZ:8}}};
 const owner=new TerrainPresentationOwner(fakePort(()=>({terrainRevision:1,placementRevision:0,cells:[]}),
 columns=>columns.map(([x,z])=>({cell:[x,127-((x+z+127)%2),z] as const,material:1,generatedTop:127})),undefined,undefined,
 cells=>{materialCalls++;return cells.map(([x,y,z])=>(x+y+z)%2===0?1:0);}),wide,{minX:0,maxX:8,minZ:0,maxZ:8});
 let bytes=0,regions=0;
 while(bytes<=4*1024*1024) {
  const reply=owner.readRegion({...regionRequest(1),regions:[[regions,0,0]]},[regions,0,0],0);
  assert.equal(reply.kind,'patch');if(reply.kind!=='patch')return;
  bytes+=new TextEncoder().encode(JSON.stringify(reply.patch)).byteLength;regions++;
 }
 assert(regions<128);const before=materialCalls;
 owner.readRegion(regionRequest(1),[0,0,0],0);
 assert(materialCalls>before,'first patch evicted by retained byte budget');
});

test("dense material indexing preserves clipped signed halos, air columns and the highest material slot",async()=>{
 const {exposeTerrainFaces}=await import('./terrain-region-exposure.js');
 const bounds={minX:-3,maxX:0,minY:-2,maxY:4,minZ:-5,maxZ:-1};
 const top=(x:number,z:number)=>x===-2&&z===-4?null:(x+z)%2===0?2:0;
 const material=([x,y,z]:readonly number[])=>top(x,z)!==null&&y<=top(x,z)!&&y!==-1?65535:0;
 const world={...definition,world:{...definition.world,bounds},materials:[...definition.materials,{slot:65535,solid:true,diggable:true,water:{kind:'closed' as const}}]};
 const owner=new TerrainPresentationOwner(fakePort(()=>({terrainRevision:1,placementRevision:0,cells:[]}),
 columns=>columns.map(([x,z])=>top(x,z)===null?null:{cell:[x,top(x,z)!,z] as const,material:65535,generatedTop:2}),undefined,undefined,
 cells=>cells.map(material)),world);
 const result=owner.readRegion({...regionRequest(1),regions:[[-1,-1,0]]},[-1,-1,0],0);
 assert.equal(result.kind,'patch');if(result.kind!=='patch')return;
 const expected=exposeTerrainFaces({bounds,core:{minX:-3,maxX:0,minZ:-5,maxZ:-1},level:2,
 sample:cell=>({kind:'known',solid:material(cell)!==0,material:material(cell)})});
 const faces=exposeTerrainPatch({patch:result.patch,baseline:owner.baseline(),level:2});
 assert.deepEqual(faces,expected);
 assert(faces.some(face=>face.face==='bottom'));
 assert(faces.every(face=>face.material===65535));
});
