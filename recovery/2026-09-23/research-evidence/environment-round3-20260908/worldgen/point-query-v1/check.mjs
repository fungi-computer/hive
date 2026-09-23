import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createVoxelWorld as oldWorld } from '../coordinate-hash-v1/voxel-world.mjs';
import { createVoxelWorld, MATERIAL } from './voxel-world.mjs';

const out = process.argv[2];
assert.ok(out && !fs.existsSync(out), 'fresh evidence file');
const state = JSON.parse(fs.readFileSync(new URL('../../soil-water-v1/excavation-v1/run-v1/excavated.json', import.meta.url)));
const identity = state.world.identity;
const at = ([x,y,z]) => ({x,y,z});
const queryCells = state.soilGeometry.cells.map(c => at(c.at));
const [x,y,z] = state.pit.at;
for (let level = y+1; level < identity.base.bounds.maxY; level++) queryCells.push({x,y:level,z});
for (const axis of ['x','y','z']) for (const sign of [-1,1]) queryCells.push({...{x,y,z},[axis]:({x,y,z})[axis]+sign});

function timed(fn) {
  const start=performance.now(), cpu=process.cpuUsage();
  const value=fn();
  return {value,wallMs:performance.now()-start,cpuMicros:process.cpuUsage(cpu)};
}
const original=oldWorld(identity,{checkpoint:state.world});
const candidate=createVoxelWorld(identity,{checkpoint:state.world});
const before=candidate.save();
const oldReads=timed(()=>queryCells.map(q=>original.read(q)));
const newReads=timed(()=>queryCells.map(q=>candidate.readPoint(q)));
assert.deepEqual(newReads.value,oldReads.value,'actual excavation validation queries preserve material');
assert.deepEqual(candidate.save(),before,'point queries never mutate world/edits');
assert.equal(candidate.stats().generatedBricks,0,'sparse queries decode no brick');
assert.equal(candidate.stats().residentBytes,0,'sparse queries allocate no brick cache');
assert.equal(candidate.stats().pointReads,queryCells.length);
const sparseStats={old:original.stats(),candidate:candidate.stats()};

// Exercise signed brick boundaries and vertical/world extremes through the same
// old canonical owner, including generated cave and surface material queries.
const probes=[[-2048,-64,-2048],[2047,63,2047],[-1,-1,-1],[0,0,0],
  [-17,-16,15],[-16,15,16],[15,16,-16],[16,-32,-17],[127,-20,128],
  [128,4,127],[-129,-22,255],[511,-48,-513],state.pit.at];
for (const xyz of probes) assert.equal(candidate.readPoint(at(xyz)),original.read(at(xyz)));

const target={x,y,z};
const brick={x:Math.floor(x/16),y:Math.floor(y/16),z:Math.floor(z/16)};
const snapshot=candidate.readBrick(brick), oldSnapshot=original.readBrick(brick);
assert.deepEqual(snapshot,oldSnapshot,'bulk snapshot API remains byte-identical');
const warmBefore=candidate.stats();
assert.equal(candidate.readPoint(target),MATERIAL.air);
assert.equal(candidate.stats().heightSamples,warmBefore.heightSamples,'resident point uses existing bytes');
snapshot.material.fill(255);
assert.equal(candidate.readPoint(target),MATERIAL.air,'caller snapshot cannot corrupt point truth');

for (const [from,to] of [[MATERIAL.air,MATERIAL.soil],[MATERIAL.soil,MATERIAL.air]]) {
  const command={expectedRevision:candidate.save().revision,cells:[{...target,expectedMaterial:from,material:to}]};
  assert.deepEqual(candidate.edit(command),original.edit(command),'same admission and changed-brick result');
  assert.deepEqual(candidate.save(),original.save(),'exact canonical edit checkpoint');
  assert.equal(candidate.readPoint(target),to,'resident point sees committed change');
  candidate.evictAll();original.evictAll();
  assert.equal(candidate.readPoint(target),original.read(target),'eviction cannot regenerate deleted material');
  assert.equal(candidate.stats().residentBricks,0,'evicted point does not rebuild projection');
}
const saved=JSON.stringify(candidate.save());
const fresh=createVoxelWorld(identity,{checkpoint:JSON.parse(saved)});
assert.equal(JSON.stringify(fresh.save()),saved);
assert.deepEqual(queryCells.map(q=>fresh.readPoint(q)),queryCells.map(q=>candidate.readPoint(q)));
assert.equal(fresh.stats().residentBricks,0,'fresh checkpoint supports bounded sparse reads');
const invalid=[{x:2048,y:0,z:0},{x:0,y:-65,z:0},{x:.5,y:0,z:0},{x:0,y:0,z:NaN}];
for (const q of invalid) assert.throws(()=>candidate.readPoint(q));
assert.equal(JSON.stringify(candidate.save()),saved,'rejected input preserves save');

const sourceFiles=['voxel-world.mjs','check.mjs','../coordinate-hash-v1/voxel-world.mjs',
  '../coordinate-hash-v1/terrain.js','../coordinate-hash-v1/features.mjs','../coordinate-hash-v1/lattice-hash.mjs'];
const hashes=Object.fromEntries(sourceFiles.map(name=>[name,createHash('sha256')
  .update(fs.readFileSync(new URL(name,import.meta.url))).digest('hex')]));
const proof={status:'passed',actualValidationQueries:queryCells.length,additionalProbeCells:probes.length,
  scope:'one fixed validation query set; exact point/brick/edit/eviction/restore laws, not world capacity',
  timing:{original:{wallMs:oldReads.wallMs,cpuMicros:oldReads.cpuMicros},
    candidate:{wallMs:newReads.wallMs,cpuMicros:newReads.cpuMicros}},sparseStats,hashes};
fs.writeFileSync(out,JSON.stringify(proof,null,2));
process.stdout.write(JSON.stringify(proof)+'\n');
