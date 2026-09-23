import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createWorldSpec, sampleCell, chunkOf, generateChunk, createResidency, sampleOverview } from './reference/terrain.js';
import { generateOverview } from './reference/worker.js';
import { createVoxelWorld, worldIdentity, MATERIAL } from './voxel-world.mjs';

const directory = new URL('./run-v1/',import.meta.url);
await mkdir(directory,{ recursive:true });
const report = { scope:'Node actual generator and isolated voxel-change owner; no game/page storage or physics integration',
  node:process.version, checks:[], errors:[], timing:{}, hashes:{} };
const begun=performance.now();
async function check(name, fn) {
  const start=performance.now();
  await fn(); report.checks.push({ name, ms:performance.now()-start });
}
try {
  const spec=createWorldSpec();
  await check('signed chunk/local identity and integer physical surface candidate',()=>{
    for (const x of [-2048,-17,-16,-1,0,15,16,2047]) for (const z of [-2048,-1,0,16,2047]) {
      const c=chunkOf(spec,x,z), sample=sampleCell(spec,x,z);
      assert.equal(c.chunkX*16+c.localX,x); assert.equal(c.chunkZ*16+c.localZ,z);
      assert(c.localX>=0 && c.localX<16 && c.localZ>=0 && c.localZ<16);
      assert(Number.isInteger(sample.surfaceLevel));
      const chunk=generateChunk(spec,c.chunkX,c.chunkZ), index=c.localZ*16+c.localX;
      assert.equal(chunk.surfaceLevels[index],sample.surfaceLevel);
    }
  });
  await check('full decoded chunk bytes independent of neighboring request order',()=>{
    const addresses=[[-1,-1],[0,-1],[-1,0],[0,0],[31,-32]];
    const forward=new Map(addresses.map(([x,z])=>[`${x},${z}`,generateChunk(spec,x,z)]));
    for (const [x,z] of [...addresses].reverse()) {
      const actual=generateChunk(spec,x,z), expected=forward.get(`${x},${z}`);
      for (const field of ['terrain','elevation','surfaceLevels','moisture']) assert.deepEqual(actual[field],expected[field]);
    }
  });
  await check('fixed map sample work across different physical extents',()=>{
    const samples=[];
    for (const span of [1024,4096]) {
      const t=performance.now();
      const map=sampleOverview(spec,{width:32,height:32,bounds:{minX:-span/2,minZ:-span/2,maxXExclusive:span/2,maxZExclusive:span/2}});
      assert.equal(map.sampleCount,1024);
      const bytes=map.terrain.byteLength+map.features.byteLength+map.elevation.byteLength+map.moisture.byteLength;
      assert.equal(bytes,4096); samples.push({span,sampleCount:map.sampleCount,bytes,ms:performance.now()-t,footprint:map.footprint});
    }
    report.overviews=samples;
  });
  await check('worker helper cancellation stops before next row batch',async()=>{
    let yields=0;
    const result=await generateOverview({requestId:7,options:{width:64,height:64}},
      { shouldCancel:()=>yields>0, yieldControl:async()=>{yields++;} });
    assert.deepEqual(result,{type:'canceled',requestId:7}); assert.equal(yields,1);
  });
  await check('baseline cache mutation is discarded: no durable-edit API exists',()=>{
    const cache=createResidency(spec,{maxResidentChunks:1,radiusChunks:0});
    const a=cache.get(-1,0), original=a.surfaceLevels[0]; a.surfaceLevels[0]=original+1;
    cache.get(2,2); const regenerated=cache.get(-1,0);
    assert.notEqual(a,regenerated); assert.equal(regenerated.surfaceLevels[0],original);
    report.baselineGap='Mutating a returned render/cache buffer is lost on eviction; no canonical edit record.';
  });

  const identity=worldIdentity({worldId:'round3-edited-world',seed:'round3-cross-boundary'});
  const world=createVoxelWorld(identity,{maxResidentBricks:2});
  const soilTop=sampleCell(createWorldSpec({seed:identity.base.seed}),-1,0).surfaceLevel;
  const cave={x:-1,y:soilTop-5,z:0}, other={x:0,y:soilTop-5,z:0};
  await check('excavation under intact surface and across signed chunk seam',()=>{
    assert.equal(world.read(cave),MATERIAL.stone); assert.equal(world.read(other),MATERIAL.stone);
    const result=world.edit({expectedRevision:0,cells:[{...cave,expectedMaterial:MATERIAL.stone,material:MATERIAL.air},
      {...other,expectedMaterial:MATERIAL.stone,material:MATERIAL.air}]});
    assert(result.ok); assert.equal(result.changedBricks.length,2);
    assert.equal(world.read(cave),MATERIAL.air); assert.equal(world.read({...cave,y:soilTop-1}),MATERIAL.soil);
    assert.equal(world.read({...cave,y:soilTop}),MATERIAL.air);
  });
  await check('batch conflicts and stale revisions never partly change terrain',()=>{
    const before=world.save();
    const conflict=world.edit({expectedRevision:1,cells:[{...cave,expectedMaterial:MATERIAL.air,material:MATERIAL.stone},
      {...other,expectedMaterial:MATERIAL.stone,material:MATERIAL.soil}]});
    assert.equal(conflict.reason,'cell-changed'); assert.deepEqual(world.save(),before);
    assert.equal(world.edit({expectedRevision:0,cells:[{...cave,expectedMaterial:0,material:2}]}).reason,'stale-revision');
    assert.deepEqual(world.save(),before);
  });
  await check('actual decoded voxel eviction, regeneration and durable file reload',async()=>{
    for (let i=0;i<12;i++) world.read({x:i*16,y:-33,z:32});
    assert.equal(world.stats().residentBricks,2); assert(world.stats().evictions>=10);
    world.evictAll(); assert.equal(world.stats().residentBytes,0);
    assert.equal(world.read(cave),MATERIAL.air); assert.equal(world.read(other),MATERIAL.air);
    await writeFile(new URL('checkpoint.tmp',directory),JSON.stringify(world.save()));
    await rename(new URL('checkpoint.tmp',directory),new URL('checkpoint.json',directory));
    const checkpoint=JSON.parse(await readFile(new URL('checkpoint.json',directory),'utf8'));
    const restored=createVoxelWorld(identity,{checkpoint,maxResidentBricks:2});
    assert.deepEqual(restored.save(),world.save()); assert.equal(restored.read(cave),MATERIAL.air);
    assert.equal(restored.read(other),MATERIAL.air); assert.equal(restored.read({...cave,y:soilTop-1}),MATERIAL.soil);
    const refilled=restored.edit({expectedRevision:1,cells:[{...cave,expectedMaterial:0,material:2}]}); assert(refilled.ok);
    restored.evictAll(); assert.equal(restored.read(cave),MATERIAL.stone);
    assert.equal(world.read(cave),MATERIAL.air); // No cross-instance shared mutable truth.
    report.residency=world.stats();
  });
  await check('world, source recipe and unit mismatches reject restore',()=>{
    const checkpoint=world.save();
    assert.throws(()=>createVoxelWorld(worldIdentity({worldId:'different',seed:identity.base.seed}),{checkpoint}),/mismatch/);
    for (const edit of [s=>s.identity.base.generatorSource='changed',s=>s.identity.base.units.verticalMetres=1,
      s=>s.changes.push({...s.changes[0]}),s=>s.changes[0].revision=99]) {
      const corrupt=structuredClone(checkpoint); edit(corrupt); assert.throws(()=>createVoxelWorld(identity,{checkpoint:corrupt}));
    }
    const returned=world.save(); returned.changes[0].material=9;
    assert.equal(world.read(cave),MATERIAL.air);
    assert.throws(()=>world.read({x:Number.MAX_SAFE_INTEGER+1,y:0,z:0}));
    assert.throws(()=>world.read({x:2048,y:0,z:0}));
  });
  report.geometry={...identity.base.units,storeyMetres:identity.base.units.verticalMetres*identity.base.units.voxelsPerStorey,
    limits:identity.base.bounds,scope:'proposed study geometry; no migration of existing logical levels'};
  report.limitations=['No page/IndexedDB save, failed-write recovery or stale async worker-result proof.',
    'Two-soil-layer surface extrusion is a base ownership reference, not a cave/biome/drainage generator.',
    'Changes persist only when the host writes the checkpoint; in-memory edit is not a durable receipt.',
    'No actor, support, water-volume, gas-volume, physical feature tombstone or live-world integration.',
    'Map count comes from inspected bounded sampler; it is not a target-browser capacity benchmark.'];
} catch (error) { report.errors.push(error.stack); process.exitCode=1; }
report.timing.totalMs=performance.now()-begun;
for (const file of ['voxel-world.mjs','probe.mjs','reference/terrain.js','reference/worker.js']) {
  report.hashes[file]=createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex');
}
await writeFile(new URL('proof.json',directory),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,totalMs:report.timing.totalMs,residency:report.residency}));
