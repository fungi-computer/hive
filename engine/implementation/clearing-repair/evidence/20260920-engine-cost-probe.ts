import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { initSync, WasmKernel } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/generated/hive_kernel.js';
import { GameSession } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/runtime/session.ts';
import { wasmKernelPort } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/runtime/wasm-kernel.ts';
import { buildObservation } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/runtime/observation.ts';
import { readKernelEntities } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/runtime/kernel-records.ts';
import { changedSessionRecords } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/runtime/session-record-store.ts';
import { createColonyPerformancePack } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/games/colony-performance.ts';
import { query } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/sdk/authoring.ts';
import { FiniteResource, MaterialLot } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/sdk/common.ts';
import { Worker } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/games/colony-components.ts';
import { ColonyTree } from '/home/levi/src/hive-worktrees/living-terrain-integration/engine/src/games/colony-work.ts';
const wasm = readFileSync('engine/generated/hive_kernel_bg.wasm');
initSync({module: wasm});
let stage = 'start';
const methods: Record<string, number[]> = {};
const timings: Record<string, number[]> = {};
const samples: any[] = [];
const recordBytes: number[] = [], changedBytes: number[] = [], activeWorkers: number[] = [];
const querySizes: Record<string, {calls:number,bytes:number,rows:number}> = {};
function instrument<T extends object>(owner:T, prefix:string):T {
  return new Proxy(owner, {get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== 'function') return value;
    return (...args: any[]) => {
      const label = `${stage}:${prefix}.${String(key)}`;
      const start = performance.now();
      try {
        const result = value.apply(target, args);
        if (prefix === 'native' && key === 'query') {
          const id = `${stage}:${args[0]}`;
          const stats = querySizes[id] ??= {calls:0,bytes:0,rows:0};
          stats.calls++; stats.bytes += result.length; stats.rows += JSON.parse(result).length;
        }
        return result;
      } finally { (methods[label] ??= []).push(performance.now()-start); }
    };
  }});
}
function measured(name:string, f:()=>any) {
  const before = performance.now();
  const result = f();
  (timings[name] ??= []).push(performance.now()-before);
  return result;
}
function summary(values:number[]) {
  const sorted = [...values].sort((a,b)=>a-b);
  return {count:values.length,total:values.reduce((a,b)=>a+b,0),median:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};
}
const pack = createColonyPerformancePack(128,32);
const native = new WasmKernel();
const port = instrument(wasmKernelPort(instrument(native,'native')),'port');
const session = new GameSession({port,pack});
let report: any;
try {
  measured('start',()=>session.start());
  let last = session.save();
  let midway: ReturnType<GameSession['save']>|undefined;
  const initialWood = session.query(query(FiniteResource)).filter(row=>row.get(FiniteResource).kind==='wood').reduce((s,row)=>s+row.get(FiniteResource).quantity,0);
  for(let tick=0;tick<90;tick++) {
    stage='step'; measured('step',()=>session.step(1));
    stage='save'; const saved = measured('save',()=>session.save());
    stage='recordDiff'; const diff = measured('recordDiff',()=>changedSessionRecords(last.kernel,saved.kernel));
    recordBytes.push(saved.kernel.records.reduce((s,r)=>s+r.bytes.byteLength,0));
    changedBytes.push(diff.puts.reduce((s,r)=>s+r.bytes.byteLength,0));
    stage='observation'; measured('observation',()=>buildObservation(session,{epoch:0,sequence:tick+1}));
    stage='diagnostic';
    const attempts = readKernelEntities(saved.kernel).work_attempts as any[];
    activeWorkers.push(new Set(attempts.map((row:any)=>row.worker)).size);
    const original = readKernelEntities(saved.kernel) as any;
    const timber = original.scene.initial.filter((row:any)=>row.components['hive.finite-resource']?.kind==='wood').reduce((n:number,row:any)=>n+row.components['hive.finite-resource'].quantity,0);
    const wood=original.scene.initial.filter((row:any)=>row.components['hive.lot']?.kind==='wood').reduce((n:number,row:any)=>n+row.components['hive.lot'].quantity,0);
    samples.push({tick:tick+1,heldWorkers:activeWorkers.at(-1),executingWorkers:attempts.filter((a:any)=>a.phase.kind==='executing').length,routeWorkers:attempts.filter((a:any)=>a.phase.kind==='executing'&&a.phase.activity.kind==='route').length,laborWorkers:attempts.filter((a:any)=>a.phase.kind==='executing'&&a.phase.activity.kind==='job-transform').length,pendingOutcomes:attempts.filter((a:any)=>a.phase.kind==='outcome').length,remainingResourceWood:timber,outputWood:wood,stepMs:timings.step.at(-1),saveMs:timings.save.at(-1),observationMs:timings.observation.at(-1),recordBytes:recordBytes.at(-1),changedRecords:diff.puts.map(r=>({key:r.key,bytes:r.bytes.byteLength})),recordSizes:saved.kernel.records.map(r=>({key:r.key,bytes:r.bytes.byteLength}))});
    if(tick===44) midway=saved;
    last=saved;
    if((tick+1)%30===0) console.log(JSON.stringify({progress:tick+1,activeWorkers:activeWorkers.at(-1)}));
  }
  stage='diagnostic';
  const productiveTrees=session.query(query(ColonyTree,FiniteResource)).filter(row=>row.get(FiniteResource).quantity===0).length;
  const remainingWood=session.query(query(FiniteResource)).filter(row=>row.get(FiniteResource).kind==='wood').reduce((s,row)=>s+row.get(FiniteResource).quantity,0);
  const woodLots=session.query(query(MaterialLot)).filter(row=>['wood','logs','felled-trunk'].includes(row.get(MaterialLot).kind)).map(row=>({id:row.id,...row.get(MaterialLot)}));
  assert.equal(session.query(query(Worker)).length,32);
  assert.ok(productiveTrees>0 || remainingWood<initialWood);
  const beforeNext=session.save();
  const recoveryPort=wasmKernelPort(new WasmKernel());
  const recovery = new GameSession({port:recoveryPort,pack});
  let recoveryPassed=false;
  let midWorkReplayPassed=false;
  try {
    assert.ok(midway && ((readKernelEntities(midway.kernel).work_attempts as any[]).length>0),'midpoint must own in-flight work');
    recovery.restore(midway!);
    assert.deepEqual(recovery.save(),midway);
    for(let i=45;i<90;i++) recovery.step(1);
    assert.deepEqual(recovery.save(),beforeNext);
    midWorkReplayPassed=true;
    recovery.restore(beforeNext);
    assert.deepEqual(recovery.save(),beforeNext);
    session.step(1); recovery.step(1);
    assert.deepEqual(recovery.save(),session.save());
    recoveryPassed=true;
  } finally { recoveryPort.dispose(); }
  report={source:'cf9c7854a401cbb245d4b98bf0a32aa2515f81ae',date:new Date().toISOString(),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,cpus:os.cpus().length,loadavg:os.loadavg(),wasmSha256:createHash('sha256').update(wasm).digest('hex'),workload:{worldSize:128,workers:32,trees:50,steps:90,delta:1,initialWood,remainingWood,productiveTrees,activeWorkers:summary(activeWorkers),woodLots},timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summary(v)])),methodTimings:Object.fromEntries(Object.entries(methods).map(([k,v])=>[k,summary(v)])),samples,midWorkReplayPassed,querySizes,recordBytes:summary(recordBytes),changedBytes:summary(changedBytes),recoveryPassed,notes:['Node headless existing generated WASM, no rendering, Worker messaging, SQL/DO or network.','step/save/recordDiff/observation outer timings are sequential; port/native methods are nested within these and must not be added to them.','Query instrumentation parses returned JSON a second time to count rows; method and outer timings include that diagnostic overhead.','1-second delta follows existing productive benchmark, not production frame cadence; activeWorkers is held attempt count, not utilization.','Native source last changed 02223655, artifact pinned by hash.']};
  writeFileSync('/tmp/hive-engine-study-cost-20260920/result.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:'/tmp/hive-engine-study-cost-20260920/result.json',timings:report.timings,productiveTrees,remainingWood,activeWorkers:report.workload.activeWorkers,recordBytes:report.recordBytes,changedBytes:report.changedBytes,recoveryPassed,midWorkReplayPassed},null,2));
} finally { port.dispose(); }
