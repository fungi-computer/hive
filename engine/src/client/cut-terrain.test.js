import { materialCoverage, fixtureTerrainFaces } from "./terrain-fixture-coverage.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Texture } from "pixi.js";
import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";
import { stableKey } from "./draw-record-facts.js";
import { terrainCoverRecords, terrainFaceRecords, visibleTerrainRegions, projectedBounds } from "./terrain-visibility.js";
import { terrainBatchPlan, createTerrainBatchMeshes } from "./terrain-face-batches.js";

const h = 0.54;
const bounds = { minX: -3, maxX: 4, minY: -8, maxY: 5, minZ: -3, maxZ: 4 };
const palette = [{slot:7,solid:false}, {slot:12,solid:true}, {slot:0,solid:true}];
const projection = createOrderingProjection();
const appearance = { body: () => ({ terrainBatch: {texture:Texture.WHITE,uvs:[0,0,0,1,1,1,1,0],blendMode:"normal"} }) };
function fixture(sample, selectedBounds = bounds) {
  const chunks = new Map();
  for(let x=selectedBounds.minX;x<selectedBounds.maxX;x++) for(let z=selectedBounds.minZ;z<selectedBounds.maxZ;z++) for(let y=selectedBounds.minY;y<selectedBounds.maxY;y++) {
    const key=[Math.floor(x/8),Math.floor(y/8),Math.floor(z/8)], id=key.join(",");
    let chunk=chunks.get(id);
    if(!chunk) {chunk={key,min:[Math.max(selectedBounds.minX,key[0]*8),Math.max(selectedBounds.minY,key[1]*8),Math.max(selectedBounds.minZ,key[2]*8)],max:[Math.min(selectedBounds.maxX,(key[0]+1)*8),Math.min(selectedBounds.maxY,(key[1]+1)*8),Math.min(selectedBounds.maxZ,(key[2]+1)*8)],columns:[]};chunks.set(id,chunk);}
    let column=chunk.columns.find(c=>c.x===x&&c.z===z);
    if(!column) {column={x,z,runs:[]};chunk.columns.push(column);}
    const material=sample(x,y,z),last=column.runs.at(-1);
    if(last?.material===material)last.maxY=y+1;else column.runs.push({minY:y,maxY:y+1,material});
  }
  return {chunks:[...chunks.values()],palette,bounds:selectedBounds,verticalMetres:h,epoch:1,terrainRevision:2};
}
const faces = (data, level, view=projection) => terrainFaceRecords(fixtureTerrainFaces(data,level),{projection:view,appearance})
  .map(record=>({...record,orderGeometry:{kind:"face",points:record.planarCorners}}));
const has = (records,cell,face) => records.find(record=>record.cell.join(",")===cell.join(",")&&record.face===face);
function actor(id,x,y,z,height=32) {
  const p=projection.project({x,y,z});
  return {id,orderGeometry:{kind:"volume",min:{x:x-.15,y,z:z-.15},max:{x:x+.15,y:y+height/32,z:z+.15}},supportY:y,role:"actor",orderingKind:"compact",footprint:[{x,y,z}],screenBounds:{left:p.x-5,right:p.x+5,top:p.y-height,bottom:p.y},moving:true,pickable:true,contains:point=>point.x>=p.x-5&&point.x<=p.x+5&&point.y>=p.y-height&&point.y<=p.y};
}

test("flat, deep pit, cave cap, lake bed, material palette and unknown halo share cell faces",()=>{
  const flat=fixture((x,y,z)=>y<=0?12:7);
  const flatFaces=faces(flat,2);
  assert(has(flatFaces,[0,0,0],"top"));
  assert.equal(has(flatFaces,[0,0,0],"top").attachment.kind,"cell-face");
  assert.equal(has(flatFaces,[0,0,0],"top").renderPass,"opaque");
  assert(!has(flatFaces,[0,-1,0],"top"));
  assert(!has(flatFaces,[0,0,0],"south"));
  const pit=fixture((x,y,z)=>y<=(x===0&&z===0?-7:0)?12:7);
  assert(has(faces(pit,1),[0,-7,0],"top"),"seven-level-deep pit bottom is retained");
  const cave=fixture((x,y,z)=>y<=2&&!(y>=-2&&y<=0&&Math.abs(x)<2&&Math.abs(z)<2)?0:7);
  assert(has(faces(cave,0),[0,-3,0],"top"),"solid slot zero is not air");
  const cap=has(faces(cave,1),[0,1,0],"top");
  assert(cap.cap); assert.equal(cap.material,0); assert.equal(cap.pickable,false);
  assert(!("standingPoint" in cap),"cut cap grants no support");
  const lake=faces(pit,1);
  assert(has(lake,[0,-7,0],"top"),"water does not erase bed eligibility");
  const partial={...flat,chunks:flat.chunks.filter(chunk=>chunk.key[0]<0)};
  const unknown=faces(partial,1);
  assert(!has(unknown,[-1,0,0],"east"),"missing adjacent chunk is not empty");
  assert.equal(materialCoverage(partial).sample([0,0,0]).kind,"unknown");
  assert.equal(materialCoverage(partial).sample([100,0,0]).kind,"outside");
});

test("canonical camera projects face corners and rotates visibility without a second isometric formula",()=>{
  const data=fixture((x,y,z)=>x===0&&z===0&&y===0?12:7);
  for(const [sx,sz] of [[1,1],[-1,1],[-1,-1],[1,-1]]) {
    const camera=artCamera(640,400,1.03,256);
    camera.position.x=Math.abs(camera.position.x)*sx;camera.position.z=Math.abs(camera.position.z)*sz;camera.lookAt(0,1.03,0);
    const view=createOrderingProjection(camera);
    const records=faces(data,1,view);
    assert.equal(records.length,3);
    assert(has(records,[0,0,0],sx>0?"east":"west"));
    assert(has(records,[0,0,0],sz>0?"south":"north"));
    for(const face of records) assert.deepEqual(face.screenBounds,projectedBounds(face.planarCorners.map(p=>view.project(p))));
  }
});

test("ray ordering ignores terrain role/storey precedence and shares logical face picking",()=>{
  const data=fixture((x,y,z)=>y<=-1?12:7);
  const ground=has(faces(data,0),[0,-1,0],"top");
  const tall=actor("tall",0,-0.5*h,0,48),short=actor("short",2,-0.5*h,2,24);
  const order=records=>compileSpatialDrawOrder(records,{projection}).records;
  const ordered=order([tall,ground,short]);
  assert(ordered.indexOf(ordered.find(r=>r.id===ground.id))<ordered.indexOf(ordered.find(r=>r.id==="tall")));
  const behind=actor("buried",-1,-2,-1,4);
  // A nearer face occludes an actor even when that actor advertises a high band.
  const plane=has(faces(fixture((x,y,z)=>y<=0?12:7),1),[0,0,0],"top");
  const center=projection.project({x:0,y:0.5*h,z:0});
  const buried={...behind,storeyBand:100,screenBounds:{left:center.x-2,right:center.x+2,top:center.y-2,bottom:center.y+2}};
  const occlusion=order([plane,buried]);
  assert.equal(occlusion.at(-1).id,plane.id);
  assert.equal(pickVoxelDrawRecord(occlusion,center,record=>record.contains?.(center)||record.id==="buried").occluded,true);
  const first=order([ground,tall]).map(stableKey);
  assert.deepEqual(order([tall,ground]).map(stableKey),first);
});

test("separate rail curtains order a body between them; intersecting planes stay deterministic",()=>{
  const order=records=>compileSpatialDrawOrder(records,{projection}).records;
  const curtain=(id,start,end)=>({id,orderGeometry:{kind:"face",points:[
    {x:start[0],y:0,z:start[1]},{x:end[0],y:0,z:end[1]},
    {x:end[0],y:2,z:end[1]},{x:start[0],y:2,z:start[1]}]}});
  const back=curtain("back",[-2,-1],[2,-1]), front=curtain("front",[-2,1],[2,1]);
  assert.deepEqual(order([front,actor("body",0,0,0),back]).map(record=>record.id),["back","body","front"]);
  const crossing=[curtain("cross-a",[-2,-1],[2,1]),curtain("cross-b",[-2,1],[2,-1])];
  const result=compileSpatialDrawOrder(crossing,{projection});
  assert.equal(result.metrics.approximateOverlaps,1);
  assert.deepEqual(order([...crossing].reverse()),result.records);
});

test("consecutive batches preserve IDs across actors, rails, state/texture changes and 16-bit splits",()=>{
  const record=faces(fixture((x,y,z)=>y<=0?12:7),1)[0];
  const f=id=>({...record,id});
  const texture={source:{}};
  const changed={...f("texture"),terrainBatch:{...record.terrainBatch,texture}};
  const state={...f("state"),terrainBatch:{...record.terrainBatch,blendMode:"add"}};
  const ordered=[f("one"),f("two"),{id:"actor"},f("three"),{id:"rail"},changed,state,f("four"),f("five"),f("six")];
  const plan=terrainBatchPlan(ordered,2);
  assert.deepEqual(plan.flatMap(batch=>batch.records.map(r=>r.id)),ordered.map(r=>r.id));
  assert.deepEqual(plan.map(batch=>batch.records.length),[2,1,1,1,1,1,2,1]);
  const owner=createTerrainBatchMeshes({maxMeshes:4});
  const small=[f("a"),f("b")];
  const initial=owner.update(small),mesh=initial[0].display,geometry=mesh.geometry;
  assert(geometry.indexBuffer.data instanceof Uint16Array);
  assert.equal(owner.update(small)[0].display,mesh);
  assert.equal(owner.update(small)[0].display.geometry.positions,geometry.positions);
  const newGeometry = [{ ...small[0], projected: small[0].projected.map((point, index) =>
    index === 0 ? { ...point, x: point.x + 1 } : point) }, small[1]];
  assert.equal(owner.update(newGeometry)[0].display, mesh);
  const changedPositions = geometry.positions;
  assert(Math.abs(changedPositions[0] - small[0].projected[0].x - 1) < 0.001);
  owner.update(small);
  assert.notStrictEqual(geometry.positions, changedPositions,
    "changing a run's prepared geometry uploads replacement vertices");
  const many=Array.from({length:16001},(_,i)=>f(`face-${i}`));
  const split=owner.update(many);
  assert.deepEqual(split.map(batch=>batch.records.length),[16000,1]);
  assert.equal(split[0].display.geometry.indices.at(-1),63999);
  assert.deepEqual(split.flatMap(batch=>batch.records.map(r=>r.id)),many.map(r=>r.id));
  assert.throws(()=>owner.update(Array.from({length:5},(_,i)=>[f(`f${i}`),{id:`actor${i}`}]).flat()),/view-budget/);
  assert.equal(owner.size,2,"over-budget update preserves accepted meshes");
  owner.dispose();owner.dispose();assert.equal(owner.size,0);
  assert.throws(()=>owner.update([]),/disposed/);
});

test("dual-grid covers derive stable masks from explicit same-level surface facts",()=>{
  const surfaces = [[0,0],[1,0],[1,1],[0,1]].map(([x,z]) => ({ cell:[x,0,z], material:12, generatedTop:0,
    cover:{kind:"grass",condition:"green",height:"full"} }));
  const coverAppearance = { cover: input => { const p=projection.project({x:input.root[0]+.5,y:.27,z:input.root[1]+.5});
    return { terrainBatch:{texture:Texture.WHITE,uvs:[0,0,0,1,1,1,1,0]}, projected:[{x:p.x-32,y:p.y-32},{x:p.x-32,y:p.y+32},{x:p.x+32,y:p.y+32},{x:p.x+32,y:p.y-32}] }; } };
  const first=terrainCoverRecords(surfaces,{level:0,projection,appearance:coverAppearance,verticalMetres:h,variantSeed:9});
  const shuffled=terrainCoverRecords([...surfaces].reverse(),{level:0,projection,appearance:coverAppearance,verticalMetres:h,variantSeed:9});
  const center=first.find(record=>record.id.startsWith("cover:0:0:0:"));
  assert.equal(center.mask,15);
  assert.deepEqual(first.map(record=>[record.id,record.mask]).sort(),shuffled.map(record=>[record.id,record.mask]).sort());
  assert(first.every(record=>record.role==="terrain-cover"&&record.footprint.length===1));
  assert(first.every(record=>record.attachment.kind==="surface-root"&&record.renderPass==="opaque"));
  const culled = terrainCoverRecords(surfaces,{level:0,projection,appearance:coverAppearance,verticalMetres:h,variantSeed:9,
    viewport:center.screenBounds}).find(record=>record.id===center.id);
  assert.deepEqual(culled.attachment.supports, [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
    "cover order retains canonical support cells independent of face culling");
});

test("region demand covers deep world prisms without vertical keys and rejects oversized views",()=>{
  const request={bounds:{minX:-32,maxX:32,minY:-72,maxY:8,minZ:-32,maxZ:32},level:0,verticalMetres:h,projection,viewport:{left:200,right:440,top:100,bottom:300},padding:16};
  const result=visibleTerrainRegions(request);
  assert.equal(result.kind,"ready");
  assert(result.regions.length>0);
  assert(result.regions.every(key=>key.length===2),"no vertical request keys");
  assert.deepEqual(visibleTerrainRegions({...request,limit:1}),{kind:"view-budget",limit:1});
});
