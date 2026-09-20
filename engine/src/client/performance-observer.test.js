import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceObserver } from './performance-observer.js';
const frame = (sequence,time,x=0,epoch=1) => ({type:'frame',sequence,time,epoch,facts:[{id:'worker',visual:'colony.rowan',pose:{position:{x,y:0,z:0},facing:0},inventory:{items:[{kind:'wood',quantity:6}]}}]});
test('measures authoritative progress, excludes duplicates and paused gaps, never invents CPU',()=>{
 let now=0;const owner=createPerformanceObserver({clock:()=>now});
 owner.event(frame(1,0));now=200;owner.event(frame(2,.1,1));
 assert.equal(owner.snapshot().simulationRate,.5);assert.equal(owner.snapshot().movingWorkers,1);
 now=300;owner.event(frame(2,.1,1));assert.equal(owner.snapshot().frames,2);
 owner.event({type:'state',paused:true});now=10000;owner.event(frame(3,.1,1));
 owner.event({type:'state',paused:false});now=11000;owner.event(frame(4,.2,1));
 now=11200;owner.event(frame(5,.3,2));assert(Math.abs(owner.snapshot().simulationRate-.5)<1e-8);
 assert.equal(owner.snapshot().wood,6);assert(!('stepCpuMs' in owner.snapshot()));
});
test('transport counts actual payload bytes and bounds samples during long sessions',()=>{
 let now=0;const owner=createPerformanceObserver({clock:()=>now});
 for(let i=0;i<500;i++){now+=100;owner.event(frame(i,i/10));owner.transport({kind:'http',operation:'command',durationMs:25,receivedBytes:100,status:200});}
 owner.transport({kind:'socket',receivedBytes:15});
 const s=owner.snapshot();assert.equal(s.receivedBytes,50015);assert.equal(s.requests,500);
 assert.deepEqual(s.retainedSamples,{observations:120,progression:120,http:120});
 assert.equal(s.httpRoundTrip.p95,25);assert.equal(s.terrainStream,null);
 owner.transport({kind:'http',operation:'command',durationMs:5000,receivedBytes:0,status:null});
 assert.equal(owner.snapshot().failedRequests,1);assert.equal(owner.snapshot().requests,501);
 owner.event({type:'ready'});assert.equal(owner.snapshot().sequence,null);assert.equal(owner.snapshot().observedWorkers,0);
});

test('terrain stream diagnostics come from the region owner without inventing network timing samples',()=>{
 const owner=createPerformanceObserver();
 owner.transport({kind:'socket',receivedBytes:3000});
 owner.transport({kind:'http',operation:'command',durationMs:1500,receivedBytes:100,status:200});
 const coverage={loading:{requests:1,cancelled:0,retries:0,receivedPatches:3,receivedBytes:2400,firstPatchMs:42},
  pending:true,visibleComplete:true,demandComplete:false,visibleRegions:3,readyVisibleRegions:3,
  requestedRegions:5,readyRegions:3,cachedRegions:3,capacity:256,retainedBytes:2400,maxBytes:33554432};
 const first=owner.snapshot(coverage);
 assert.equal(first.terrainStream.firstPatchMs,42);assert.equal(first.terrainStream.receivedBytes,2400);
 assert.equal(first.receivedBytes,3100,'wire total remains separate from decoded patch payload');
 assert.equal(first.httpRoundTrip.median,1500);assert.equal(first.terrainStream.visibleComplete,true);
 assert.equal(first.terrainStream.demandComplete,false);assert.equal('terrainRoundTrip' in first,false);
 coverage.loading.receivedPatches=4;coverage.pending=false;
 assert.equal(first.terrainStream.receivedPatches,3,'snapshot detaches loading counters');
 assert.equal(owner.snapshot(coverage).terrainStream.receivedPatches,4);
 assert.equal(owner.snapshot({...coverage,loading:{...coverage.loading,firstPatchMs:null}}).terrainStream.firstPatchMs,null,'waiting stays unknown');
});
