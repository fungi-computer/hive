import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as priorTerrain from '../height-sea/terrain.js';
import * as terrain from './terrain.js';
import * as priorWorld from '../connected-caves-v1/voxel-world.mjs';
import * as world from './voxel-world.mjs';
import { latticeHash2, latticeHash3, hashString } from './lattice-hash.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'fresh explicit proof output');
fs.mkdirSync(output, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const sourceFiles = ['lattice-hash.mjs', 'terrain.js', 'voxel-world.mjs', 'features.mjs', 'qualify.mjs',
  'CONTRACT.md', '../height-sea/terrain.js', '../connected-caves-v1/voxel-world.mjs', '../connected-caves-v1/features.mjs'];
const digest = value => createHash('sha256').update(value).digest('hex');
const inventory = Object.fromEntries(sourceFiles.map(name => {
  const bytes = fs.readFileSync(path.resolve(directory, name));
  const destination = path.join(output, 'sources', name.replaceAll('../', 'parent/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
  return [name, digest(bytes)];
}));
write('source-inventory.json', inventory);
const report = { groups: [], performance: [], inventory };
let assertions = 0;
function equal(actual, expected, label) { assertions++; assert.deepEqual(actual, expected, label); }
function group(name, run) {
  report.active = {group:name}; write('progress.json',report);
  const facts = run(); report.groups.push({ name, facts }); write('progress.json', report);
}

// Independent unchanged predecessor implementation; no helper self-reference.
function oldHash(value, initial = 2166136261) {
  let h = initial;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const brickAddresses = [
  {x:1,y:-4,z:-5}, {x:1,y:-3,z:-5}, {x:1,y:-4,z:-4}, {x:1,y:-3,z:-4},
  {x:-1,y:-1,z:-1}, {x:0,y:-1,z:-1}, {x:-1,y:-1,z:0}, {x:0,y:-1,z:0},
  {x:-1,y:0,z:-1}, {x:0,y:0,z:-1}, {x:-1,y:0,z:0}, {x:0,y:0,z:0},
];
const identityInput = { worldId: 'coordinate-hash-same-world', seed: 'volume-v2-fixed-cave-pocket-v1' };

try {
  group('independent UTF-16 hash identity and coordinate representation', () => {
    const values = [-Infinity, -1e25, -1e21, -Number.MAX_SAFE_INTEGER, -1000000000,
      -999999999, -100000, -10000, -1000, -100, -10, -9, -1, -0, 0, 1, 9, 10, 11,
      99, 100, 101, 999, 1000, 1001, 99999, 100000, 999999999, 1000000000,
      Number.MAX_SAFE_INTEGER, 1e21, 1e25, Infinity, NaN, 0.5, -0.5];
    let state = 123456789;
    for (let i = 0; i < 2048; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      values.push((state % 1999999999) - 999999999);
    }
    for (const salt of ['elevation-broad', 'cave-detail', 'unicode-🍄-毛', ''])
      for (const prefix of [0, 2166136261, 0xffffffff])
        for (let i = 0; i < values.length; i++) {
          const x = values[i], y = values[(i + 7) % values.length], z = values[(i + 17) % values.length];
          equal(latticeHash2(prefix,x,z,salt), oldHash(`${x}|${z}|${salt}`,prefix), 'same two-coordinate characters');
          equal(latticeHash3(prefix,x,y,z,salt), oldHash(`${x}|${y}|${z}|${salt}`,prefix), 'same three-coordinate characters');
        }
    for (const input of ['', 'hive', '🍄-毛', '\ud800']) equal(hashString(input), oldHash(input), 'same seed code units');
    return { coordinateCases: values.length, salts: 4, prefixes: 3 };
  });

  group('complete terrain facts and footprint outputs preserve identity', () => {
    const coordinates = [-2048, -2047, -1024, -129, -128, -17, -16, -1, 0, 1, 15, 16, 127, 128, 2047];
    for (const seed of ['hive-world-lab-seed-20260907', 'volume-v2-fixed-cave-pocket-v1', '🍄-毛']) {
      const a = priorTerrain.createWorldSpec({seed}), b = terrain.createWorldSpec({seed});
      equal(a,b,'same spec and recipe');
      for (const x of coordinates) for (const z of coordinates) for (const footprint of [1, 2, 8, 64, 256])
        equal(terrain.sampleTerrain(b,x,z,footprint), priorTerrain.sampleTerrain(a,x,z,footprint), 'full returned geography');
      equal(terrain.sampleOverview(b,{width:64,height:64}), priorTerrain.sampleOverview(a,{width:64,height:64}), 'same coarse arrays and digests');
    }
    return { seeds:3, coordinatesPerAxis:coordinates.length, footprints:5, overviewDimensions:[64,64] };
  });

  group('actual cave bricks, edits, eviction and both codec directions', () => {
    const id = priorWorld.worldIdentity(identityInput);
    equal(world.worldIdentity(identityInput),id,'same persisted world recipe');
    const a = priorWorld.createVoxelWorld(id), b = world.createVoxelWorld(id);
    for (const address of brickAddresses) equal(b.readBrick(address),a.readBrick(address),'all material bytes');
    const at = {x:19,y:-47,z:-62}, material = a.read(at);
    const edit = {expectedRevision:0,cells:[{...at,expectedMaterial:material,
      material:material === priorWorld.MATERIAL.air ? priorWorld.MATERIAL.stone : priorWorld.MATERIAL.air}]};
    equal(b.edit(edit),a.edit(edit),'same real edit result');
    a.evictAll(); b.evictAll();
    equal(b.read(at),a.read(at),'edited cell after eviction'); equal(b.save(),a.save(),'same canonical save');
    equal(b.stats(),a.stats(),'same counted generation and storage');
    const save = b.save(); write('world.json',save);
    const raw = JSON.parse(fs.readFileSync(path.join(output,'world.json'),'utf8'));
    const oldFromNew = priorWorld.createVoxelWorld(id,{checkpoint:raw,maxResidentBricks:1});
    const newFromOld = world.createVoxelWorld(id,{checkpoint:a.save(),maxResidentBricks:1});
    for (const address of brickAddresses.toReversed()) equal(newFromOld.readBrick(address),oldFromNew.readBrick(address),'reverse-order one-brick reopen');
    equal(newFromOld.save(),oldFromNew.save(),'codec compatible after actual file read');
    return { comparedBricks:brickAddresses.length, decodedCells:brickAddresses.length*4096,
      savedHash:digest(JSON.stringify(save)), work:a.stats() };
  });

  const terrainWork = module => {
    const spec = module.createWorldSpec({seed:identityInput.seed}), values=[];
    for (let row=0;row<64;row++) for (let col=0;col<64;col++)
      values.push(module.sampleTerrain(spec,-1024+col*31,-1000+row*29,1));
    return values;
  };
  const brickWork = module => {
    const owner = module.createVoxelWorld(module.worldIdentity(identityInput));
    return {bricks:brickAddresses.slice(0,8).map(at=>owner.readBrick(at)),stats:owner.stats()};
  };
  function compareCost(name, oldModule, candidateModule, work) {
    report.active = {workload:name,phase:'untimed warmup'}; write('progress.json',report);
    equal(work(candidateModule),work(oldModule),`${name} untimed warmup equality`);
    const samples=[];
    const measurement={name,samples}; report.performance.push(measurement);
    for(let round=0;round<8;round++) {
      const order=round%2 ? ['candidate','old'] : ['old','candidate'], values={}, times={};
      report.active={workload:name,round,order}; write('progress.json',report);
      for(const label of order) {
        const start=performance.now(); values[label]=work(label==='old'?oldModule:candidateModule);
        times[label]=performance.now()-start;
      }
      equal(values.candidate,values.old,`${name} outputs outside timing`);
      samples.push({round,order,...times});
      write('progress.json',report);
    }
    const median=label=>{const v=samples.map(s=>s[label]).sort((a,b)=>a-b);return (v[3]+v[4])/2;};
    Object.assign(measurement,{medianOldMs:median('old'),medianCandidateMs:median('candidate'),
      candidateOverOld:median('candidate')/median('old')});
    write('progress.json',report);
  }
  compareCost('4096 exact terrain queries',priorTerrain,terrain,terrainWork);
  compareCost('8 cold generated volume bricks',priorWorld,world,brickWork);
  for(const name of sourceFiles) equal(digest(fs.readFileSync(path.resolve(directory,name))),inventory[name],'source remains frozen');
  report.assertions=assertions; report.status='passed'; report.runtime={node:process.version,platform:process.platform,
    arch:process.arch,cpuModel:os.cpus()[0]?.model,wholeProcessMemory:process.memoryUsage(),
    scope:'one shared-host Node process; interleaved equal-work observations, no browser/WASM/population guarantee'};
  write('proof.json',report);
  process.stdout.write(JSON.stringify({status:report.status,assertions,performance:report.performance})+'\n');
} catch(error) {
  write('failure.json',{...report,assertions,error:{name:error.name,message:error.message,stack:error.stack}});
  throw error;
}
