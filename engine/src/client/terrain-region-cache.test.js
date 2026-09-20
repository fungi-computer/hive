import assert from "node:assert/strict";
import test from "node:test";
import { createTerrainRegionCache } from "./terrain-region-cache.js";
const baseline={protocolVersion:4,bounds:{minX:-32,maxX:32,minY:-32,maxY:32,minZ:-32,maxZ:32},verticalMetres:.54,materials:[{slot:0,solid:false},{slot:1,solid:true}]};
const frame=(epoch,revision,changes)=>({epoch,terrain:{baseline,revision,changes}});
const patch=([x,z])=>({key:[x,z],bounds:{minX:x*8,maxX:x*8+8,minZ:z*8,maxZ:z*8+8},faces:[],surfaces:[]});
function runtime() {
  const requests=[];
  return {requests,terrainRegions(request,receive){const entry={request,cancelled:false,send:event=>receive({...request,...event})};requests.push(entry);return()=>{entry.cancelled=true;};}};
}
function demand(owner,regions,visibleRegions=regions,level=0){owner.updateDemand({regions,visibleRegions,level});}
function fill(request){for(const key of request.request.regions)request.send({kind:"patch",patch:patch(key)});request.send({kind:"complete"});}

test("one ordered subscription publishes complete visible patches before padding completes",async()=>{
  const io=runtime();let notifications=0;
  const owner=createTerrainRegionCache({runtime:io,onChange:()=>notifications++});owner.updateFrame(frame(1,2));
  demand(owner,[[0,0],[1,0],[2,0]],[[0,0]]);
  assert.deepEqual(io.requests[0].request.regions,[[0,0],[1,0],[2,0]]);
  io.requests[0].send({kind:"patch",patch:patch([0,0])});
  assert.equal(owner.snapshot().patches.length,1);assert.equal(owner.snapshot().visibleComplete,true);
  assert.equal(owner.snapshot().demandComplete,false);assert.equal(owner.snapshot().pending,true);
  io.requests[0].send({kind:"patch",patch:patch([0,0])});
  assert.equal(owner.snapshot().loading.receivedPatches,1,"identical replay is idempotent");
  for(const key of [[1,0],[2,0]])io.requests[0].send({kind:"patch",patch:patch(key)});
  io.requests[0].send({kind:"complete"});await Promise.resolve();
  assert.equal(notifications,1,"synchronous deliveries coalesce without recursive publication");
  assert.equal(owner.snapshot().pending,false);assert.equal(owner.snapshot().demandComplete,true);
  const publication=owner.snapshot().publication;
  demand(owner,[[2,0],[0,0],[1,0]],[[2,0]]);
  assert.equal(owner.snapshot().publication,publication,"priority alone does not rebuild geometry");assert.equal(io.requests.length,1);
  owner.dispose();assert.equal(owner.snapshot().retainedBytes,0);
});

test("pan supersession, cut and epoch cancel old streams and reject late results",()=>{
  const io=runtime(),owner=createTerrainRegionCache({runtime:io});owner.updateFrame(frame(1,1));demand(owner,[[0,0],[1,0]]);
  const old=io.requests[0];old.send({kind:"patch",patch:patch([0,0])});
  demand(owner,[[0,0],[2,0]]);assert(old.cancelled);assert.deepEqual(io.requests[1].request.regions,[[2,0]]);
  old.send({kind:"patch",patch:patch([1,0])});assert.equal(owner.snapshot().patches.length,1);
  demand(owner,[[0,0],[2,0]],undefined,3);assert(io.requests[1].cancelled);assert.equal(owner.snapshot().patches.length,0);
  fill(io.requests.at(-1));assert.equal(owner.snapshot().patches.length,2);
  owner.updateFrame(frame(2,8));demand(owner,[[0,0]],undefined,3);
  old.send({kind:"stale",epoch:1,terrainRevision:2});assert.equal(owner.snapshot().epoch,2);assert.equal(owner.snapshot().terrainRevision,8);
  fill(io.requests.at(-1));owner.dispose();assert(io.requests.every(request=>request.cancelled));
});

test("changed columns invalidate halo regions but preserve unaffected patch identity",()=>{
  const io=runtime(),owner=createTerrainRegionCache({runtime:io});owner.updateFrame(frame(1,1));
  const keys=[[0,0],[1,0],[0,1],[1,1],[2,0]];demand(owner,keys);fill(io.requests[0]);
  const unaffected=owner.snapshot().patches.find(item=>item.key[0]===2);
  owner.updateFrame(frame(1,2,{kind:"changed-columns",revision:2,columns:[[7,7]]}));demand(owner,keys);
  assert.deepEqual(io.requests[1].request.regions,keys.slice(0,4));assert.deepEqual(owner.snapshot().patches,[unaffected]);
  owner.dispose();
});

test("cache limits count and bytes independent of visited regions and reports terminal budget",()=>{
  const io=runtime(),owner=createTerrainRegionCache({runtime:io,capacity:2,maxBytes:1000});owner.updateFrame(frame(1,1));
  for(let i=0;i<20;i++){demand(owner,[[i,0]]);fill(io.requests.at(-1));assert(owner.snapshot().cachedRegions<=2);assert(owner.snapshot().retainedBytes<=1000);}
  owner.clear();assert.equal(owner.snapshot().cachedRegions,0);assert.equal(owner.snapshot().retainedBytes,0);
  const tiny=createTerrainRegionCache({runtime:io,maxBytes:10});tiny.updateFrame(frame(1,1));demand(tiny,[[0,0]]);
  io.requests.at(-1).send({kind:"patch",patch:patch([0,0])});assert.equal(tiny.snapshot().viewBudget,true);assert.equal(tiny.snapshot().cachedRegions,0);
  const count=io.requests.length;demand(tiny,[[0,0]]);assert.equal(io.requests.length,count,"budget failure never loops requests");
  tiny.dispose();owner.dispose();
});

test("conflicting duplicates and incomplete completion fail without replacing accepted patches",()=>{
  const io=runtime(),owner=createTerrainRegionCache({runtime:io});owner.updateFrame(frame(1,1));demand(owner,[[0,0],[1,0]]);
  const original=patch([0,0]);io.requests[0].send({kind:"patch",patch:original});
  io.requests[0].send({kind:"patch",patch:{...original,surfaces:[{cell:[0,0,0],material:1,generatedTop:0}]}});
  assert.match(owner.snapshot().error,/conflicting/);assert.strictEqual(owner.snapshot().patches[0],original);
  demand(owner,[[0,0],[2,0]]);io.requests[1].send({kind:"complete"});assert.match(owner.snapshot().error,/incomplete/);
  owner.dispose();
});

test("stale streams wait for an authoritative observation and synchronous runtimes cancel safely",()=>{
  const io=runtime(),owner=createTerrainRegionCache({runtime:io});owner.updateFrame(frame(1,1));demand(owner,[[0,0]]);
  io.requests[0].send({kind:"stale",terrainRevision:2});demand(owner,[[0,0]]);
  assert.equal(io.requests.length,1);assert.equal(owner.snapshot().terrainRevision,1);
  owner.updateFrame(frame(1,2));demand(owner,[[0,0]]);fill(io.requests[1]);assert(owner.snapshot().demandComplete);owner.dispose();
  let cancelled=0;const sync=createTerrainRegionCache({runtime:{terrainRegions(request,receive){receive({...request,kind:"patch",patch:patch(request.regions[0])});receive({...request,kind:"complete"});return()=>cancelled++;}}});
  sync.updateFrame(frame(1,1));demand(sync,[[0,0]]);assert(sync.snapshot().demandComplete);assert.equal(cancelled,1);sync.dispose();
});

test("unavailable streams retry missing regions with bounded backoff while preserving painted patches",()=>{
  let now=0;const io=runtime(),owner=createTerrainRegionCache({runtime:io,clock:()=>now});owner.updateFrame(frame(1,1));demand(owner,[[0,0],[1,0]]);
  io.requests[0].send({kind:"patch",patch:patch([0,0])});
  for(let attempt=0;attempt<4;attempt++){
    io.requests.at(-1).send({kind:"unavailable",reason:"stream disconnected"});
    const count=io.requests.length;demand(owner,[[0,0],[1,0]]);assert.equal(io.requests.length,count);
    now+=10000;demand(owner,[[0,0],[1,0]]);
    assert.equal(io.requests.length,count+Number(attempt<3));assert.equal(owner.snapshot().patches.length,1);
    if(attempt<3)assert.deepEqual(io.requests.at(-1).request.regions,[[1,0]]);
  }
  assert.match(owner.snapshot().error,/disconnected/);owner.dispose();
});
