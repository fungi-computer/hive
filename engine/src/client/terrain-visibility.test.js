import test from "node:test";
import assert from "node:assert/strict";
import { visibleTerrainRegions, prioritizeTerrainRegions, terrainFaceRecords } from "./terrain-visibility.js";
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
