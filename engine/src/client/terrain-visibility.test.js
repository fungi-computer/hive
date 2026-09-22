import test from "node:test";
import assert from "node:assert/strict";
import { visibleTerrainRegions, prioritizeTerrainRegions, terrainFaceRecords, terrainCoverRecords } from "./terrain-visibility.js";
import { createOrderingProjection } from "./ordering-projection.js";

test("visible center regions precede padding and priority does not mutate the retained plan",()=>{
  const plan={kind:"ready",regions:[[0,0],[1,0],[2,0],[3,0]],projected:[
    {left:-30,right:-20,top:0,bottom:10},{left:0,right:20,top:0,bottom:20},
    {left:40,right:60,top:40,bottom:60},{left:90,right:110,top:0,bottom:20}]};
  const before=JSON.stringify(plan),priority=prioritizeTerrainRegions(plan,{left:0,right:100,top:0,bottom:100});
  assert.deepEqual(priority.regions[0],[2,0]);assert.deepEqual(priority.regions.at(-1),[0,0]);
  assert.deepEqual(priority.visibleRegions,priority.regions.slice(0,3));assert.equal(JSON.stringify(plan),before);
});

test("horizontal demand covers the camera across deep cuts without a vertical request multiplier",()=>{
  const projection=createOrderingProjection(),bounds={minX:-64,maxX:64,minZ:-64,maxZ:64,minY:-72,maxY:24};
  const plan=visibleTerrainRegions({bounds,level:23,verticalMetres:.54,projection,viewport:{left:200,right:440,top:100,bottom:300}});
  assert.equal(plan.kind,"ready");assert(plan.regions.length>0);assert(plan.regions.every(key=>key.length===2));
  assert.equal(new Set(plan.regions.map(key=>key.join(","))).size,plan.regions.length);
  assert(plan.regions.length<=256);assert.equal(plan.projected.length,plan.regions.length);
});

test("checked world faces project directly with no material neighbor queries",()=>{
  const projection=createOrderingProjection();
  const data={faces:[{cell:[0,0,0],face:"top",material:1,cap:true},{cell:[0,0,0],face:"bottom",material:1,cap:false}],
    palette:[{slot:1,solid:true,art:"earth"}],verticalMetres:.54};
  const records=terrainFaceRecords(data,{projection});assert.equal(records.length,1);assert.equal(records[0].cap,true);
  assert.equal(records[0].cell,data.faces[0].cell);assert(records[0].contains(projection.project({x:0,y:.27,z:0})));
});

test("terrain owns deeply frozen ordering geometry without freezing presentation",()=>{
  const texture={},visual={terrainBatch:{texture},projected:[]};
  const [record]=terrainFaceRecords({faces:[{cell:[0,0,0],face:"top",material:1,cap:false}],
    palette:[{slot:1,solid:true}],verticalMetres:.54},{projection:createOrderingProjection(),appearance:{body:()=>visual}});
  assert(Object.isFrozen(record.orderGeometry));assert(Object.isFrozen(record.orderGeometry.points));
  assert(record.orderGeometry.points.every(Object.isFrozen));
  assert(!Object.isFrozen(record));assert(!Object.isFrozen(texture));assert(!Object.isFrozen(record.terrainBatch));
});


test("cover freezes its coverage geometry while atlas texture remains owned separately",()=>{
  const texture={},terrainBatch={texture};
  const geometry={kind:"face",points:[{x:0,y:.27,z:0},{x:1,y:.27,z:0},{x:1,y:.27,z:1},{x:0,y:.27,z:1}],
    coverage:{offset:{x:0,y:0},rectangles:[{left:0,top:0,right:1,bottom:1}]}};
  const records=terrainCoverRecords([{cell:[0,0,0],cover:{kind:"grass",condition:"green",height:"full"}}],
    {level:0,verticalMetres:.54,projection:createOrderingProjection(),appearance:{cover:()=>({orderGeometry:geometry,terrainBatch,projected:[{x:0,y:0},{x:1,y:1}]})}});
  assert(records.length>0);
  for(const value of [geometry,geometry.points,...geometry.points,geometry.coverage,geometry.coverage.offset,geometry.coverage.rectangles,...geometry.coverage.rectangles])assert(Object.isFrozen(value));
  assert(!Object.isFrozen(terrainBatch));assert(!Object.isFrozen(texture));
});

test("face preparation yields even for culled faces and cancellation leaves the rest unread",async()=>{
  const {terrainFaceRecordSteps}=await import("./terrain-visibility.js");
  let reads=0;
  const faces=Array.from({length:1000},()=>({get cell(){reads++;return[0,0,0];},face:"east",material:1,cap:false}));
  const steps=terrainFaceRecordSteps({faces,palette:[{slot:1,solid:true}],verticalMetres:1},
    {projection:{direction:{x:1,y:0,z:0}}});
  assert.deepEqual(steps.next(),{value:null,done:false});
  assert.equal(reads,1,"a skipped face is still a scheduling boundary");
  steps.return();
  assert.equal(reads,1,"cancelled preparation cannot continue visiting faces");
});
