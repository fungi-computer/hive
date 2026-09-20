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
 for(let i=0;i<500;i++){now+=100;owner.event(frame(i,i/10));owner.transport({kind:'http',operation:'terrain',durationMs:25,receivedBytes:100,status:200});}
 owner.transport({kind:'socket',receivedBytes:15});
 const s=owner.snapshot();assert.equal(s.receivedBytes,50015);assert.equal(s.requests,500);
 assert.deepEqual(s.retainedSamples,{observations:120,progression:120,http:120,terrain:120});
 assert.equal(s.terrainRoundTrip.p95,25);
 owner.transport({kind:'http',operation:'terrain',durationMs:5000,receivedBytes:0,status:null});
 assert.equal(owner.snapshot().failedRequests,1);assert.equal(owner.snapshot().requests,501);
 owner.event({type:'ready'});assert.equal(owner.snapshot().sequence,null);assert.equal(owner.snapshot().observedWorkers,0);
});
