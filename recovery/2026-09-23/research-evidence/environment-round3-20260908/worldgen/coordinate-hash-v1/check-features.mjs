// Focused coverage gap: the first comparison's cave regions had no added
// capsule feature. Exercise the two pre-existing accepted present regions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as before from '../connected-caves-v1/voxel-world.mjs';
import * as after from './voxel-world.mjs';
const out = new URL('./feature-proof.json',import.meta.url);
assert.ok(!fs.existsSync(out),'preserve earlier proof');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePaths=['./check-features.mjs','./voxel-world.mjs','./features.mjs','./terrain.js','./lattice-hash.mjs',
  '../connected-caves-v1/voxel-world.mjs','../connected-caves-v1/features.mjs','../height-sea/terrain.js'];
const hashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(fs.readFileSync(new URL(p,import.meta.url)))]));
const id=before.worldIdentity({worldId:'connected-cave-fixed-fixture-v1'});
const a=before.createVoxelWorld(id),b=after.createVoxelWorld(id),report={hashes,regions:[]};
try {
  for(const region of [{x:0,z:4},{x:-1,z:4}]) {
    const shape=a.caveFeature(region); assert.equal(shape.present,true);
    assert.deepEqual(b.caveFeature(region),shape,'same nonempty feature descriptor and seed draw');
    const lo=shape.boundsMetres.min.map((n,i)=>Math.floor(n/(i===1?.54:1)/16));
    const hi=shape.boundsMetres.max.map((n,i)=>Math.floor(n/(i===1?.54:1)/16));
    const bricks=[];
    for(let x=lo[0];x<=hi[0];x++) for(let z=lo[2];z<=hi[2];z++) for(let y=lo[1];y<=hi[1];y++) {
      const at={x,y,z},actual=b.readBrick(at),expected=a.readBrick(at);
      assert.deepEqual(actual,expected,'complete feature-footprint material bytes');
      bricks.push({at,sha256:hash(actual.material)});
    }
    assert.ok(b.stats().caveFeatures.membershipQueries>0,'new feature membership was exercised');
    report.regions.push({region,featureId:shape.id,bricks});
    fs.writeFileSync(out,JSON.stringify(report,null,2));
  }
  assert.deepEqual(b.stats(),a.stats(),'same terrain and feature work');
  for(const p of sourcePaths) assert.equal(hash(fs.readFileSync(new URL(p,import.meta.url))),hashes[p]);
  report.status='passed'; report.work=b.stats();
} catch(error) {
  report.status='failed'; report.error={message:error.message,stack:error.stack}; process.exitCode=1;
}
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,regions:report.regions.length,
  bricks:report.regions.reduce((n,r)=>n+r.bricks.length,0),work:report.work,error:report.error}));
