import { materialPatch } from "./terrain-region-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";
import {startTerrainRegionStream} from "./terrain-region-stream";
import type {TerrainRegionEvent,TerrainRegionRequest} from "./terrain-regions";
const identity={requestId:1,epoch:0,terrainRevision:1};
const request=(count:number):TerrainRegionRequest=>({...identity,regions:Array.from({length:count},(_,x)=>[x,0,0])});
const patch=(key:[number,number,number])=>({kind:"patch" as const,...identity,patch:materialPatch(key)});
const drain=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(count:number) {
 const reads:[number,number,number][]=[],events:TerrainRegionEvent[]=[];
 const stream=startTerrainRegionStream(request(count),key=>{reads.push(key);return patch(key);},event=>events.push(event),async()=>{});
 return {stream,reads,events};
}

test("eight patches fill the window; cumulative credit four admits exactly four more reads",async()=>{
 const {stream,reads,events}=fixture(20);
 await drain();assert.equal(reads.length,8);assert.equal(events.length,8);
 stream.acknowledge(4);await drain();assert.equal(reads.length,12);
 stream.acknowledge(4);stream.acknowledge(2);await drain();assert.equal(reads.length,12,"duplicate/lower credit cannot refill the window");
 stream.acknowledge(8);await drain();assert.equal(reads.length,16);
 stream.acknowledge(12);await stream.done;
 assert.equal(reads.length,20);assert.equal(events.at(-1)?.kind,"complete","last eight need no acknowledgement to finish");
});

test("cancel releases a stalled window and late credit cannot restart a superseded stream",async()=>{
 const old=fixture(256);await drain();assert.equal(old.reads.length,8);
 old.stream.cancel();await old.stream.done;
 old.stream.acknowledge(8);await drain();assert.equal(old.reads.length,8);
 assert(old.events.every(event=>event.kind==="patch"),"canceled stream sends no terminal or further patch");
 const next=fixture(2);await next.stream.done;
 assert.equal(next.reads.length,2);assert.equal(next.events.at(-1)?.kind,"complete");
 assert.equal(old.reads.length,8);
});

test("bad credit is bounded and cannot manufacture unsent work",async()=>{
 const {stream,reads}=fixture(12);
 for(const value of [-1,1,.5,NaN,Infinity])assert.throws(()=>stream.acknowledge(value),/invalid terrain stream credit/);
 await drain();assert.equal(reads.length,8);
 for(const value of [9,256,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>stream.acknowledge(value),/invalid terrain stream credit/);
 await drain();assert.equal(reads.length,8);
 stream.acknowledge(4);await stream.done;assert.equal(reads.length,12);
});

test("synchronous cumulative acknowledgements support all 256 patches with one yield between reads",async()=>{
 const events:TerrainRegionEvent[]=[];let yields=0;
 const stream=startTerrainRegionStream(request(256),key=>patch(key),event=>{
  events.push(event);
  if(event.kind==="patch"&&events.length%4===0)stream.acknowledge(events.length);
 },async()=>{yields++;});
 await stream.done;assert.equal(events.length,257);assert.equal(yields,255);assert.equal(events.at(-1)?.kind,"complete");
});

test("terminal responses need no credit and cancellation during a read suppresses delivery",async()=>{
 const events:TerrainRegionEvent[]=[];
 const stale=startTerrainRegionStream(request(10),()=>({kind:"stale",...identity,terrainRevision:2}),event=>events.push(event));
 await stale.done;assert.deepEqual(events.map(event=>event.kind),["stale"]);
 let resolve!: (event:ReturnType<typeof patch>)=>void;
 const delayed=startTerrainRegionStream(request(10),()=>new Promise(done=>{resolve=done;}),event=>events.push(event));
 await Promise.resolve();delayed.cancel();resolve(patch([0,0,0]));await delayed.done;
 assert.equal(events.length,1);
});
