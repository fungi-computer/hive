import test from "node:test";
import assert from "node:assert/strict";
import { Texture } from "pixi.js";
import { createCutTerrainLayer, waterDrawRecord } from "./cut-terrain-layer.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";

const bounds={minX:0,maxX:16,minY:-8,maxY:8,minZ:0,maxZ:8};
const camera={x:0,y:0,zoom:1},screen={width:640,height:400},view={cutaway:true,level:0};
const grass={kind:"grass",condition:"green",height:"full"};
function frame(world=bounds,surfaces=[]) {return {revision:1,placementRevision:1,verticalMetres:.54,
  baseline:{protocolVersion:4,bounds:world,verticalMetres:.54,materials:[{slot:0,solid:false},{slot:1,solid:true,art:"earth"}]},
  surfaces,structureSurfaces:[],water:[]};}
function patch([x,z],level,world=bounds,cover) {
  const core={minX:Math.max(world.minX,x*8),maxX:Math.min(world.maxX,(x+1)*8),minZ:Math.max(world.minZ,z*8),maxZ:Math.min(world.maxZ,(z+1)*8)};
  const faces=[],surfaces=[];
  for(let cx=core.minX-1;cx<=core.maxX;cx++)for(let cz=core.minZ-1;cz<=core.maxZ;cz++){
    if(cx<world.minX||cx>=world.maxX||cz<world.minZ||cz>=world.maxZ)continue;
    surfaces.push({cell:[cx,0,cz],material:1,generatedTop:0,...(cover?{cover}: {})});
    if(cx>=core.minX&&cx<core.maxX&&cz>=core.minZ&&cz<core.maxZ)
      faces.push({cell:[cx,Math.min(0,level),cz],face:"top",material:1,cap:level<0});
  }
  return {key:[x,z],bounds:core,faces,surfaces};
}
function setup({world=bounds,auto=true,cover,onCoverage}={}) {
  const requests=[];let depth=0,maxDepth=0;
  const runtime={terrainRegions(request,receive){
    const entry={request,cancelled:false,send:event=>receive({...request,...event})};requests.push(entry);
    if(auto)queueMicrotask(()=>{for(const key of request.regions)entry.send({kind:"patch",patch:patch(key,request.level,world,cover)});entry.send({kind:"complete"});});
    return()=>{entry.cancelled=true;};
  }};
  const layer=createCutTerrainLayer({runtime,projection:createOrderingProjection(),onCoverage:event=>{
    depth++;maxDepth=Math.max(maxDepth,depth);try{onCoverage?.(event,layer);}finally{depth--;}
  }});
  const styles=new Map(),hitArea=createVisibleHitArea({width:64,height:64,rows:Array.from({length:65},(_,y)=>y),spans:Array.from({length:64},()=>[24,39]).flat()},{x:.5,y:.5});
  const style=height=>{if(!styles.has(height))styles.set(height,{texture:height==="short"?Texture.EMPTY:Texture.WHITE,uvs:[0,0,0,1,1,1,1,0],hitArea});return styles.get(height);};
  return {layer,requests,maxDepth:()=>maxDepth,install:()=>layer.installArt({body:()=>style("body"),cover:({height})=>style(height),dispose(){}})};
}
async function ready(layer,cam=camera,v=view,size=screen){for(let i=0;i<10;i++){layer.position(cam,v,size);if(layer.coverage.demandComplete)return;await Promise.resolve();await Promise.resolve();}assert.fail("region demand stalled");}

test("live regions paint incrementally, retain body identity and never require all padding",()=>{
  const {layer,requests,install}=setup({auto:false});install();layer.update(frame(),2);layer.position(camera,view,screen);
  assert.equal(requests.length,1);assert.equal(requests[0].request.regions.length,2);
  const [first,second]=requests[0].request.regions;
  requests[0].send({kind:"patch",patch:patch(first,0)});layer.position(camera,view,screen);
  const partial=layer.retainedRecords;assert(partial.records.length>0);assert.equal(layer.coverage.demandComplete,false);
  assert(layer.presentedTerrain.exposedFaces.length>0,"picking is available before completion");
  requests[0].send({kind:"patch",patch:patch(second,0)});layer.position(camera,view,screen);
  assert(layer.retainedRecords.records.length>partial.records.length);
  assert(partial.records.every(record=>layer.retainedRecords.records.includes(record)),"later patches keep existing face identity");
  requests[0].send({kind:"complete"});assert(layer.coverage.demandComplete);layer.dispose();
});

test("camera pan transform and unchanged padded demand do not rebuild terrain",async()=>{
  const {layer,requests,install,maxDepth}=setup({onCoverage:(_,owner)=>owner.position(camera,view,screen)});install();
  const terrain=frame();terrain.water=[{at:[4,0,4],level:4,liquidVolumeM3:.5}];layer.update(terrain,2);await ready(layer);
  const before=layer.retainedRecords,water=before.records.find(record=>record.role==="water");assert(water);
  layer.applyOrder(before.records);layer.position({...camera,x:8,y:4,zoom:2},view,screen);
  assert.equal(layer.container.x,8);assert.equal(layer.container.scale.x,2);
  assert.equal(layer.retainedRecords.revision,before.revision);assert.strictEqual(layer.retainedRecords.records,before.records);
  layer.update({...terrain,water:[{...terrain.water[0],liquidVolumeM3:.8}]},2);layer.position(camera,view,screen);
  assert.strictEqual(layer.retainedRecords.records.find(record=>record.role==="water"),water);
  assert.equal(requests.length,1);assert.equal(maxDepth(),1);layer.dispose();
});

test("cut and epoch changes cancel stale subscriptions and immediately remove old caps",()=>{
  const {layer,requests,install}=setup({auto:false,cover:grass});install();layer.update(frame(),1);layer.position(camera,view,screen);
  const old=requests[0];for(const key of old.request.regions)old.send({kind:"patch",patch:patch(key,0,bounds,grass)});
  layer.position(camera,view,screen);assert(layer.retainedRecords.records.some(record=>record.role==="terrain-cover"));
  layer.position(camera,{...view,level:-1},screen);assert(old.cancelled);assert.equal(layer.retainedRecords.records.length,0);
  old.send({kind:"patch",patch:patch(old.request.regions[0],0,bounds,grass)});assert.equal(layer.retainedRecords.records.length,0);
  const next=requests.at(-1);for(const key of next.request.regions)next.send({kind:"patch",patch:patch(key,-1,bounds,grass)});
  layer.position(camera,{...view,level:-1},screen);assert(layer.retainedRecords.records.every(record=>record.cap));
  layer.update(frame(),2);layer.position(camera,view,screen);assert.equal(layer.retainedRecords.records.length,0);assert(next.cancelled);layer.dispose();
});

test("complete region halos own seam masks and world-min edge blades without duplicates",async()=>{
  const {layer,install}=setup({cover:grass});install();layer.update(frame(),1);await ready(layer);
  const cover=layer.retainedRecords.records.filter(record=>record.role==="terrain-cover");
  assert.equal(new Set(cover.map(record=>record.id)).size,cover.length);
  assert.equal(cover.length,17*9,"every dual-grid root including the outer edges is owned exactly once");
  const seam=cover.find(record=>record.attachment.point.x===7.5&&record.attachment.point.z===3.5);
  assert.equal(seam.mask,15);assert.equal(seam.attachment.supports.length,4);layer.dispose();
});

test("observed full/short cover overrides halo facts without reading terrain or replacing body",async()=>{
  const {layer,install,requests}=setup({cover:grass});install();const terrain=frame();layer.update(terrain,1);await ready(layer);
  const before=layer.retainedRecords.records,body=before.filter(record=>record.role==="terrain"),cover=before.filter(record=>record.role==="terrain-cover");
  layer.update({...terrain,surfaces:[{cell:[7,0,3],material:1,generatedTop:0,cover:{...grass,height:"short"}}]},1);
  layer.position(camera,view,screen);const after=layer.retainedRecords.records;
  assert(body.every(record=>after.includes(record)));assert(after.some(record=>record.terrainBatch.texture===Texture.EMPTY));
  assert(after.some(record=>cover.includes(record)),"unaffected region cover keeps record identity");assert.equal(requests.length,1);layer.dispose();
});

test("surface references survive water updates while replacement cover still publishes",async()=>{
  const {layer,install,requests}=setup({cover:grass});install();
  const terrain=frame(bounds,[{cell:[7,0,3],material:1,generatedTop:0,cover:grass}]);
  try {
    layer.update(terrain,1);await ready(layer);
    const ground=layer.retainedRecords.records;
    const wet={...terrain,water:[{at:[4,0,3],level:3,liquidVolumeM3:.1}]};
    layer.update(wet,1);layer.position(camera,view,screen);
    const firstWater=layer.retainedRecords.records.find(record=>record.role==="water");
    assert(firstWater);assert(ground.every(record=>layer.retainedRecords.records.includes(record)));
    layer.update({...wet,water:[{...wet.water[0],level:5}]},1);layer.position(camera,view,screen);
    assert.notStrictEqual(layer.retainedRecords.records.find(record=>record.role==="water"),firstWater);
    assert(ground.every(record=>layer.retainedRecords.records.includes(record)));
    layer.update({...wet,surfaces:[{...terrain.surfaces[0],cover:{...grass,height:"short"}}]},1);
    layer.position(camera,view,screen);
    assert(layer.retainedRecords.records.some(record=>record.role==="terrain-cover"&&record.id.endsWith(":short")));
    assert.equal(requests.length,1);
  } finally {layer.dispose();}
});

test("patches can arrive before art; empty and oversized demands never preserve stale paint",async()=>{
  const world={...bounds,minX:-512,maxX:512,minZ:-512,maxZ:512};
  const {layer,install}=setup({world});layer.update(frame(world),1);await ready(layer);assert.equal(layer.retainedRecords.records.length,0);
  install();layer.position(camera,view,screen);assert(layer.retainedRecords.records.length>0);
  layer.position(camera,view,{width:40000,height:40000});assert.equal(layer.retainedRecords.records.length,0);
  layer.position(camera,view,screen);assert(layer.retainedRecords.records.length>0);
  layer.position({...camera,x:100000},view,screen);assert.equal(layer.retainedRecords.records.length,0);assert.equal(layer.presentedTerrain.exposedFaces.length,0);
  layer.dispose();assert.equal(layer.coverage.cachedRegions,0);assert.equal(layer.coverage.retainedBytes,0);assert.equal(layer.presentedTerrain,undefined);
});

test("clear and dispose release subscriptions, current records, water and cached world facts",async()=>{
  const {layer,install,requests}=setup();install();layer.update({...frame(),water:[{at:[4,0,4],level:4,liquidVolumeM3:.5}]},1);await ready(layer);
  layer.applyOrder(layer.retainedRecords.records);layer.update(undefined,undefined);
  assert.equal(layer.retainedRecords.records.length,0);assert.equal(layer.coverage.cachedRegions,0);assert.equal(layer.coverage.retainedBytes,0);
  assert(requests.every(request=>request.cancelled));assert.equal(layer.container.children.length,0);layer.dispose();layer.dispose();
});

test("water remains one non-pickable liquid surface at its actual fill height",()=>{
  const record=waterDrawRecord({at:[4,-2,7],level:5,liquidVolumeM3:.5},{verticalMetres:.56});
  assert.equal(record.pickable,false);assert.equal("supports" in record.attachment,false);
  assert(Math.abs(record.footprint[0].y-(-2.5*.56+(5/7)*.56))<1e-12);
});

test("browser patch notifications coalesce until the next animation frame",async()=>{
  const original=globalThis.requestAnimationFrame,cancelOriginal=globalThis.cancelAnimationFrame;
  const callbacks=new Map();let sequence=0,notifications=0;
  globalThis.requestAnimationFrame=callback=>{callbacks.set(++sequence,callback);return sequence;};
  globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
  const {layer,requests,install}=setup({auto:false,onCoverage:()=>notifications++});
  try {
    install();layer.update(frame(),1);layer.position(camera,view,screen);
    for(const key of requests[0].request.regions){requests[0].send({kind:"patch",patch:patch(key,0)});await Promise.resolve();}
    assert.equal(callbacks.size,1);assert.equal(notifications,0);
    const callback=callbacks.values().next().value;callbacks.clear();callback();assert.equal(notifications,1);
    requests[0].send({kind:"complete"});await Promise.resolve();assert.equal(callbacks.size,1);
    layer.dispose();assert.equal(callbacks.size,0);
  } finally {layer.dispose();globalThis.requestAnimationFrame=original;globalThis.cancelAnimationFrame=cancelOriginal;}
});

test("region face facts survive rotation without terrain reads and unknown columns cannot grow observed grass",async()=>{
  const {createCameraGeometryOwner}=await import("./camera-geometry-owner.js");
  const geometry=createCameraGeometryOwner(),{layer,install,requests}=setup({auto:false});
  try {
    install();layer.update(frame(bounds,[{cell:[4,0,4],material:1,generatedTop:0,cover:grass}]),1);layer.position(camera,view,screen);
    const current=requests[0];
    for(const key of current.request.regions)current.send({kind:"patch",patch:{...patch(key,0),surfaces:[]}});
    current.send({kind:"complete"});layer.position(camera,view,screen);
    assert(layer.retainedRecords.records.length>0);assert(layer.retainedRecords.records.every(record=>record.role==="terrain"));
    for(let turn=1;turn<4;turn++){
      layer.setProjection(geometry.rotate(1),turn);layer.position(camera,view,screen);
      assert(layer.retainedRecords.records.length>0);assert.equal(requests.length,1,"all orientations are already resident");
    }
  } finally {layer.dispose();geometry.dispose();}
});

test("prepared viewport culls resident faces and grass, retains small pans, and reculls unchanged region membership",async()=>{
  const world={...bounds,maxX:8,maxZ:8},size={width:20,height:20},startCamera={x:-220,y:-230,zoom:1};
  const {layer,install,requests}=setup({world,cover:grass});install();layer.update(frame(world),1);
  try {
    await ready(layer,startCamera,view,size);
    const before=layer.retainedRecords,prepared=layer.cameraCoverage.prepared;
    assert.equal(layer.coverage.cachedRegions,1);
    const body=before.records.filter(record=>record.role==="terrain");
    const cover=before.records.filter(record=>record.role==="terrain-cover");
    assert(body.length>0 && body.length<64,"resident patch faces outside prepared area are not materialized");
    assert(cover.length>0 && cover.length<81,"resident patch grass outside prepared area is not materialized");
    layer.position({...startCamera,x:-240},view,size);
    assert.strictEqual(layer.retainedRecords.records,before.records);
    assert.equal(layer.retainedRecords.revision,before.revision);
    assert.deepEqual(layer.cameraCoverage.prepared,prepared);
    layer.position({...startCamera,x:-320},view,size);
    const after=layer.retainedRecords;
    assert.notDeepEqual(layer.cameraCoverage.prepared,prepared);
    assert.equal(requests.length,1,"same resident patch supplies the newly prepared area");
    assert(after.records.some(record=>!before.records.some(old=>old.id===record.id)),"replan admits newly covered geometry despite unchanged cache publication");
    const oldById=new Map(before.records.map(record=>[record.id,record]));
    const survivors=after.records.filter(record=>oldById.has(record.id));
    assert(survivors.length>0);
    assert(survivors.every(record=>record===oldById.get(record.id)),"surviving body and cover retain exact picking and ordering identity");
    assert.deepEqual(layer.presentedTerrain.exposedFaces,after.records.filter(record=>record.role==="terrain"));
  } finally {layer.dispose();}
});

test("empty and offscreen patch progress preserves presentation identity while visible arrivals publish",()=>{
  for(const offscreen of [false,true]) for(const emptyFirst of [true,false]) {
    const camera={x:-220,y:-230,zoom:1},screen={width:20,height:20};
    const {layer,requests,install}=setup({auto:false});install();layer.update(frame(),1);layer.position(camera,view,screen);
    try {
      const stream=requests[0], [visibleKey,emptyKey]=stream.request.regions;
      const empty=()=>stream.send({kind:"patch",patch:{...patch(emptyKey,0),faces:offscreen?[{cell:[15,0,0],face:"top",material:1,cap:false}]:[],surfaces:[]}});
      const visible=()=>stream.send({kind:"patch",patch:patch(visibleKey,0)});
      if(!emptyFirst){visible();layer.position(camera,view,screen);}
      const before=layer.retainedRecords,presented=layer.presentedTerrain,readyBefore=layer.coverage.cachedRegions;
      empty();layer.position(camera,view,screen);
      assert.equal(layer.coverage.cachedRegions,readyBefore+1,"cache progress is published independently");
      assert.equal(layer.retainedRecords.revision,before.revision);
      assert.strictEqual(layer.retainedRecords.records,before.records);
      assert.strictEqual(layer.presentedTerrain,presented);
      assert.strictEqual(layer.presentedTerrain.surfaces,presented.surfaces);
      if(emptyFirst){visible();layer.position(camera,view,screen);assert.equal(layer.retainedRecords.revision,before.revision+1);assert(layer.retainedRecords.records.length>0);}
    } finally {layer.dispose();}
  }
});
