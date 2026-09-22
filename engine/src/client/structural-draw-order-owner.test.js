import assert from "node:assert/strict";
import test from "node:test";
import { createStructuralDrawOrderOwner, conservativeStructuralRelation } from "./structural-draw-order-owner.js";

const directions = [
  { x: -1, y: -1.1, z: -1 }, { x: 1, y: -1.1, z: -1 },
  { x: 1, y: -1.1, z: 1 }, { x: -1, y: -1.1, z: 1 },
];
const screenBounds = Object.freeze({ left: -100, right: 100, top: -100, bottom: 100 });

function terrain(id, cell, face = "top", extra = {}) {
  return { id, part: "face", role: "terrain", cell, face, screenBounds, ...extra };
}

function water(id, cell, top = cell[1] + 0.25) {
  const points = [[-.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]].map(([dx,dz]) => ({ x: cell[0]+dx, y: top, z: cell[2]+dz }));
  return { id, part: "surface", role: "water", storeyBand: cell[1],
    attachment: { kind: "liquid-surface", point: { x: cell[0], y: top, z: cell[2] } },
    orderGeometry: { kind: "face", points }, screenBounds, pickable: false };
}

function cover(id, root, height, mask) {
  const nominal = [[0,0],[1,0],[1,1],[0,1]];
  const supports = nominal.flatMap(([dx,dz], index) => mask & (1 << index) ? [[root[0]+dx,height,root[1]+dz]] : []);
  return { id, part: "cover", role: "terrain-cover", storeyBand: height, mask, screenBounds,
    structuralBounds: { min: { x:root[0], y:height+.5, z:root[1] }, max: { x:root[0]+1, y:height+1.25, z:root[1]+1 } },
    attachment: { kind: "surface-root", point: { x: root[0]+.5, y: height+.5, z: root[1]+.5 }, supports } };
}

function subject(id, { role = "structure", moving = role === "actor", min = { x: -.2, y: 0, z: -.2 },
  max = { x: .2, y: 1, z: .2 }, part = "body", partRole, support, contactSurface, display, contains } = {}) {
  const center = { x: (min.x+max.x)/2, y: min.y, z: (min.z+max.z)/2 };
  return { id, part, role, moving, partRole, storeyBand: Math.floor(min.y), footprint: [center], screenBounds,
    orderGeometry: { kind: "volume", min, max }, display, contains,
    ...(support ? { attachment: { kind: "supported", support, feet: center } } : {}),
    ...(contactSurface ? { contactSurface } : {}) };
}

function finish(owner, input, maxOperations = 13) {
  const task = owner.prepare(input);
  while (task.status === "pending") {
    const result = task.advance({ maxOperations });
    assert(result.operations <= maxOperations);
  }
  assert.equal(task.status, "ready");
  return { task, result: owner.publish(task) };
}

function normalized(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x/length, y: vector.y/length, z: vector.z/length };
}

function dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
function add(a, b, scale = 1) { return { x:a.x+b.x*scale, y:a.y+b.y*scale, z:a.z+b.z*scale }; }

function projectedRange(cell, axis) {
  const values = [];
  for (const dx of [-.5,.5]) for (const dy of [-.5,.5]) for (const dz of [-.5,.5])
    values.push(dot({ x:cell[0]+dx, y:cell[1]+dy, z:cell[2]+dz }, axis));
  return { min: Math.min(...values), max: Math.max(...values) };
}

function rayInterval(origin, direction, cell) {
  let low = -Infinity, high = Infinity;
  for (const [axis, center] of [["x",cell[0]],["y",cell[1]],["z",cell[2]]]) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < center-.5 || origin[axis] > center+.5) return null;
      continue;
    }
    const a = (center-.5-origin[axis])/direction[axis], b = (center+.5-origin[axis])/direction[axis];
    low = Math.max(low, Math.min(a,b)); high = Math.min(high, Math.max(a,b));
  }
  return low <= high ? { min:low, max:high } : null;
}

/** Independent orthographic ray oracle. It knows only unit AABBs and camera
 * rays; it does not call or reproduce the structural tuple. */
function rayOrder(left, right, rawDirection) {
  const direction = normalized(rawDirection);
  const horizontal = normalized({ x: direction.z, y: 0, z: -direction.x });
  const vertical = normalized({
    x: direction.y*horizontal.z-direction.z*horizontal.y,
    y: direction.z*horizontal.x-direction.x*horizontal.z,
    z: direction.x*horizontal.y-direction.y*horizontal.x,
  });
  const ah=projectedRange(left,horizontal), bh=projectedRange(right,horizontal);
  const av=projectedRange(left,vertical), bv=projectedRange(right,vertical);
  const horizontalOverlap={min:Math.max(ah.min,bh.min),max:Math.min(ah.max,bh.max)};
  const verticalOverlap={min:Math.max(av.min,bv.min),max:Math.min(av.max,bv.max)};
  if(horizontalOverlap.min>horizontalOverlap.max||verticalOverlap.min>verticalOverlap.max)return null;
  let answer=null;
  for(let ix=0;ix<=8;ix++)for(let iy=0;iy<=8;iy++) {
    const h=horizontalOverlap.min+(horizontalOverlap.max-horizontalOverlap.min)*ix/8;
    const v=verticalOverlap.min+(verticalOverlap.max-verticalOverlap.min)*iy/8;
    let origin=add(add({x:0,y:0,z:0},horizontal,h),vertical,v); origin=add(origin,direction,-100);
    const a=rayInterval(origin,direction,left),b=rayInterval(origin,direction,right);
    if(!a||!b||Math.min(a.max,b.max)>=Math.max(a.min,b.min))continue;
    const current=a.min<b.min?"right-before-left":"left-before-right";
    if(answer&&answer!==current)throw new Error("unit cubes interleave along sampled rays");
    answer=current;
  }
  return answer;
}

test("dense traversal agrees with an independent grid ray oracle in four quadrants", () => {
  const cells=[];
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=0;y<=5;y++)cells.push([x,y,z]);
  for(const direction of directions) {
    const owner=createStructuralDrawOrderOwner({direction});
    const records=cells.map((cell,index)=>terrain(`cell:${index}`,cell));
    const {result}=finish(owner,{terrainRevision:1,terrainRecords:records,subjectRecords:[]},37);
    const positions=new Map(result.records.map((record,index)=>[record.id,index]));
    let witnessed=0;
    for(let a=0;a<cells.length;a++)for(let b=a+1;b<cells.length;b++) {
      const order=rayOrder(cells[a],cells[b],direction); if(!order)continue;
      witnessed++;
      const actual=positions.get(`cell:${a}`)<positions.get(`cell:${b}`)?"left-before-right":"right-before-left";
      assert.equal(actual,order,`ray order mismatch for ${cells[a]} and ${cells[b]} at ${JSON.stringify(direction)}`);
    }
    assert(witnessed>100,"oracle must exercise cliffs and adjacent vertical stacks");
  }
});

test("full dense tuple keeps side, cap, water, and cover phases deterministic", () => {
  for(const direction of directions) {
    const owner=createStructuralDrawOrderOwner({direction});
    const root=[-3,-4], supports=[0,1,2,3].map(index=>terrain(`support:${index}`,
      [[-3,2,-4],[-2,2,-4],[-2,2,-3],[-3,2,-3]][index]));
    const records=[terrain("x-side",[-2,2,-3],direction.x<0?"east":"west"),
      terrain("z-side",[-2,2,-3],direction.z<0?"south":"north"),...supports,
      water("water",[-2,2,-3]),cover("grass",root,2,15)];
    const forward=finish(owner,{terrainRevision:1,terrainRecords:records,subjectRecords:[]}).result.records.map(r=>r.id);
    const reverse=finish(owner,{terrainRevision:2,terrainRecords:[...records].reverse(),subjectRecords:[]}).result.records.map(r=>r.id);
    assert.deepEqual(reverse,forward);
    assert(forward.indexOf("x-side")<forward.indexOf("support:2"));
    assert(forward.indexOf("z-side")<forward.indexOf("support:2"));
    assert(forward.indexOf("support:2")<forward.indexOf("water"));
    assert(forward.indexOf("water")<forward.indexOf("grass"));
  }
});

test("every grass mask uses the same authored 2x2 preferred footprint", () => {
  for(const direction of directions)for(let mask=1;mask<16;mask++) {
    const cells=[[-5,1,-7],[-4,1,-7],[-4,1,-6],[-5,1,-6]];
    const supports=cells.map((cell,index)=>terrain(`support:${index}`,cell));
    const owner=createStructuralDrawOrderOwner({direction});
    const full=finish(owner,{terrainRevision:"full",terrainRecords:[...supports,cover("grass",[-5,-7],1,15)],subjectRecords:[]}).result;
    const changed=finish(owner,{terrainRevision:`mask:${mask}`,terrainRecords:[...supports,cover("grass",[-5,-7],1,mask)],subjectRecords:[]}).result;
    assert.equal(changed.records.findIndex(record=>record.id==="grass"),full.records.findIndex(record=>record.id==="grass"));
    const coverIndex=changed.records.findIndex(record=>record.id==="grass");
    for(const index of [0,1,2,3].filter(index=>mask&(1<<index)))
      assert(changed.records.findIndex(record=>record.id===`support:${index}`)<coverIndex);
  }
});

test("static and moving pictures use deterministic bounded placement with exact hard support", () => {
  const direction=directions[0], surface=subject("stair",{part:"surface",min:{x:0,y:0,z:0},max:{x:2,y:.2,z:2},
    partRole:"supporting-surface",contactSurface:[{x:0,y:0,z:0},{x:2,y:0,z:0},{x:2,y:0,z:2},{x:0,y:0,z:2}]}),
    farRail=subject("stair",{part:"far",partRole:"upright-boundary",min:{x:0,y:0,z:0},max:{x:.1,y:1,z:2}}),
    nearRail=subject("stair",{part:"near",partRole:"upright-boundary",min:{x:1.9,y:0,z:0},max:{x:2,y:1,z:2}}),
    actor=subject("walker",{role:"actor",min:{x:.8,y:0,z:.8},max:{x:1.2,y:1,z:1.2},support:{id:"stair",part:"surface"}}),
    ambiguousA=subject("a",{min:{x:4,y:0,z:4},max:{x:5,y:1,z:5}}),
    ambiguousB=subject("b",{min:{x:4,y:0,z:4},max:{x:5,y:1,z:5}});
  const terrainRecords=[terrain("ground",[0,0,0]),terrain("far-ground",[-8,0,-8])];
  const first=createStructuralDrawOrderOwner({direction});
  const a=finish(first,{terrainRevision:1,terrainRecords,subjectRecords:[nearRail,ambiguousB,actor,surface,farRail,ambiguousA]}).result;
  const second=createStructuralDrawOrderOwner({direction});
  const b=finish(second,{terrainRevision:1,terrainRecords:[...terrainRecords].reverse(),
    subjectRecords:[ambiguousA,farRail,surface,actor,ambiguousB,nearRail]}).result;
  assert.deepEqual(a.records.map(record=>`${record.id}:${record.part}`),b.records.map(record=>`${record.id}:${record.part}`));
  assert(a.records.indexOf(farRail)<a.records.indexOf(surface));
  assert(a.records.indexOf(surface)<a.records.indexOf(actor),"mandatory support paints before its rider");
  assert(a.records.indexOf(actor)<a.records.indexOf(nearRail),"rider paints before the camera-near boundary");
  assert.equal(a.metrics.supportResolutions,1);
  assert(a.metrics.ambiguousRelations>0,"overlapping whole pictures use the admitted stable approximation");
  assert(a.metrics.sparseCandidates<100,"sparse insertion stays inside the local grid query");
  assert.deepEqual([a.metrics.densePairComparisons,a.metrics.alphaComparisons,a.metrics.topologyWork],[0,0,0]);
});

test("owner rejects ambiguous owner-only support and accepts exact multipart support", () => {
  const contact=[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:0,z:1},{x:0,y:0,z:1}];
  const parts=[subject("stairs",{part:"left",contactSurface:contact,min:{x:0,y:0,z:0},max:{x:1,y:.1,z:1}}),
    subject("stairs",{part:"right",contactSurface:contact,min:{x:0,y:0,z:0},max:{x:1,y:.1,z:1}})];
  const ambiguous=subject("actor",{role:"actor",min:{x:.2,y:0,z:.2},max:{x:.4,y:1,z:.4},support:"stairs"});
  const owner=createStructuralDrawOrderOwner({direction:directions[0]});
  const task=owner.prepare({terrainRevision:1,terrainRecords:[],subjectRecords:[...parts,ambiguous]});
  assert.throws(()=>{while(task.status==="pending")task.advance({maxOperations:100});},/ambiguous/);
  const exact={...ambiguous,attachment:{...ambiguous.attachment,support:{id:"stairs",part:"left"}}};
  const accepted=finish(owner,{terrainRevision:1,terrainRecords:[],subjectRecords:[...parts,exact]}).result;
  assert(accepted.records.indexOf(parts[0])<accepted.records.indexOf(exact));
});

test("candidate preparation and cancellation preserve the published draw and pick view", () => {
  const owner=createStructuralDrawOrderOwner({direction:directions[0]});
  const old=terrain("old",[0,0,0],"top",{contains:()=>true,target:"old"});
  finish(owner,{terrainRevision:1,terrainRecords:[old],subjectRecords:[]});
  assert.equal(owner.pick({x:0,y:0}).target,"old");
  const next=terrain("next",[1,0,0],"top",{contains:()=>true,target:"next"});
  const pending=owner.prepare({terrainRevision:2,terrainRecords:Array.from({length:30},(_,index)=>
    terrain(index?`filler:${index}`:"next",[index,0,0],"top",index?{}:{contains:()=>true,target:"next"})),subjectRecords:[]});
  pending.advance({maxOperations:1});
  assert.equal(owner.pick({x:0,y:0}).target,"old");
  assert.equal(pending.cancel(),true); assert.equal(owner.pick({x:0,y:0}).target,"old");
  const ready=owner.prepare({terrainRevision:2,terrainRecords:[next],subjectRecords:[]});
  while(ready.status==="pending")ready.advance({maxOperations:1});
  assert.equal(owner.pick({x:0,y:0}).target,"old","ready candidates remain unpublished");
  const published=owner.publish(ready);
  assert.equal(owner.pick({x:0,y:0}).target,"next");
  assert.equal(owner.records,published.records,"publication adopts the prepared array without copying");
  assert.equal(owner.metrics().cancelled,1);
});

test("same-revision terrain reuses layout, refreshes records, and rejects structural mutation", () => {
  const display={}, owner=createStructuralDrawOrderOwner({direction:directions[0]});
  const original=terrain("ground",[-2,0,-3],"top",{display,contains:()=>true,target:"old"});
  finish(owner,{terrainRevision:"r1",terrainRecords:[original],subjectRecords:[]});
  const refreshed={...original,contains:()=>true,target:"new"};
  const reused=finish(owner,{terrainRevision:"r1",terrainRecords:[refreshed],subjectRecords:[]}).result;
  assert.equal(reused.metrics.denseRebuilds,0); assert.equal(reused.metrics.denseReuses,1);
  assert.equal(reused.applyOrderRequired,false); assert.equal(owner.pick({x:0,y:0}).target,"new");
  const invalid=owner.prepare({terrainRevision:"r1",terrainRecords:[{...refreshed,cell:[-1,0,-3]}],subjectRecords:[]});
  assert.throws(()=>{while(invalid.status==="pending")invalid.advance({maxOperations:100});},/without a terrain revision/);
  const coverOwner=createStructuralDrawOrderOwner({direction:directions[0]});
  finish(coverOwner,{terrainRevision:"cover",terrainRecords:[cover("grass",[0,0],0,15)],subjectRecords:[]});
  const staleMow=coverOwner.prepare({terrainRevision:"cover",terrainRecords:[cover("grass",[0,0],0,7)],subjectRecords:[]});
  assert.throws(()=>{while(staleMow.status==="pending")staleMow.advance({maxOperations:100});},/without a terrain revision/);
});

test("terrain record refresh requests paint without making actor-only refreshes repack terrain", () => {
  const display={}, owner=createStructuralDrawOrderOwner({direction:directions[0]});
  const original=terrain("ground",[0,0,0],"top",{display,projected:[{x:0,y:0}],uvs:[0,0]});
  finish(owner,{terrainRevision:1,terrainRecords:[original],subjectRecords:[]});
  const changed={...original,projected:[{x:1,y:0}],uvs:[1,0]};
  const repaint=finish(owner,{terrainRevision:2,terrainRecords:[changed],subjectRecords:[]}).result;
  assert.equal(repaint.physicalOrderChanged,false); assert.equal(repaint.applyOrderRequired,false);
  assert.equal(repaint.paintRequired,true);
  const retained=finish(owner,{terrainRevision:3,terrainRecords:[changed],subjectRecords:[]}).result;
  assert.equal(retained.paintRequired,false); assert.equal(retained.applyOrderRequired,false);
  const actorDisplay={}, actor=subject("actor",{role:"actor",display:actorDisplay});
  finish(owner,{terrainRevision:3,terrainRecords:[changed],subjectRecords:[actor]});
  const refreshedActor={...actor,contains:()=>true};
  const actorOnly=finish(owner,{terrainRevision:3,terrainRecords:[changed],subjectRecords:[refreshedActor]}).result;
  assert.equal(actorOnly.paintRequired,false); assert.equal(actorOnly.applyOrderRequired,false);
  assert.equal(owner.records.find(record=>record.id==="actor"),refreshedActor);
});

test("sloped support requires coplanarity and dominant-plane containment", () => {
  const slope=[{x:0,y:0,z:0},{x:2,y:1,z:0},{x:2,y:1,z:2},{x:0,y:0,z:2}];
  const deck=subject("slope",{part:"surface",min:{x:0,y:0,z:0},max:{x:2,y:1,z:2},contactSurface:slope});
  const rider=subject("rider",{role:"actor",min:{x:.9,y:.5,z:.9},max:{x:1.1,y:1.5,z:1.1},support:{id:"slope",part:"surface"}});
  const owner=createStructuralDrawOrderOwner({direction:directions[0]});
  const accepted=finish(owner,{terrainRevision:1,terrainRecords:[],subjectRecords:[rider,deck]}).result;
  assert(accepted.records.indexOf(deck)<accepted.records.indexOf(rider));
  const floating={...rider,attachment:{...rider.attachment,feet:{...rider.attachment.feet,y:.6}}};
  const invalid=owner.prepare({terrainRevision:1,terrainRecords:[],subjectRecords:[deck,floating]});
  assert.throws(()=>{while(invalid.status==="pending")invalid.advance({maxOperations:100});},/outside/);
});

test("64 by 64 terrain and eight movers perform no dense pair, alpha, topology, or full-stream mover scan", () => {
  const terrainRecords=[];
  for(let x=-32;x<32;x++)for(let z=-32;z<32;z++)terrainRecords.push(terrain(`ground:${x}:${z}`,[x,0,z]));
  const actors=Array.from({length:8},(_,index)=>subject(`actor:${index}`,{role:"actor",
    min:{x:index*2-.2,y:.5,z:index%2-.2},max:{x:index*2+.2,y:1.5,z:index%2+.2}}));
  const station=subject("station",{min:{x:10,y:.5,z:10},max:{x:11,y:1.5,z:11}});
  const owner=createStructuralDrawOrderOwner({direction:directions[0]});
  const first=finish(owner,{terrainRevision:"64x64",terrainRecords,subjectRecords:[station,...actors]},1000).result;
  assert.deepEqual([first.metrics.densePairComparisons,first.metrics.alphaComparisons,first.metrics.topologyWork],[0,0,0]);
  assert(first.metrics.sparseCandidates<300,"movers inspect local terrain only");
  assert(first.metrics.keySearches<200,"preferred mover slots use logarithmic dense lookup");
  const moved=actors.map((actor,index)=>index?actor:subject("actor:0",{role:"actor",
    min:{x:.05,y:.5,z:.05},max:{x:.45,y:1.5,z:.45}}));
  const next=finish(owner,{terrainRevision:"64x64",terrainRecords:[...terrainRecords].reverse(),subjectRecords:[...moved,station].reverse()},1000).result;
  assert.equal(next.metrics.denseReuses,4096);
  assert.equal(next.metrics.staticReuses,1); assert.equal(next.metrics.staticRebuilds,0);
  assert.equal(next.metrics.staticIndexReuses,1); assert.equal(next.metrics.indexWrites,0);
  assert(next.metrics.sparseCandidates<300); assert(next.metrics.keySearches<200);
  assert.deepEqual([next.metrics.densePairComparisons,next.metrics.alphaComparisons,next.metrics.topologyWork],[0,0,0]);
  const changedStation=subject("station",{min:{x:11,y:.5,z:10},max:{x:12,y:1.5,z:11}});
  const invalidated=finish(owner,{terrainRevision:"64x64",terrainRecords,subjectRecords:[changedStation,...moved]},1000).result;
  assert.equal(invalidated.metrics.staticRebuilds,1); assert.equal(invalidated.metrics.staticReuses,0);
  assert(invalidated.metrics.indexWrites>0,"the owner rebuilds its static/base index only after a static fact changes");
});

test("conservative sparse relation records ambiguity instead of inventing geometry", () => {
  const common={screenBounds,worldBounds:{min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}}};
  assert.equal(conservativeStructuralRelation(common,common,directions[0]),null);
  const behind={screenBounds,worldBounds:{min:{x:-4,y:0,z:-4},max:{x:-3,y:1,z:-3}}};
  const front={screenBounds,worldBounds:{min:{x:3,y:0,z:3},max:{x:4,y:1,z:4}}};
  assert.equal(conservativeStructuralRelation(behind,front,directions[0]),"before");
  assert.equal(conservativeStructuralRelation(front,behind,directions[0]),"after");
  const diagonal={screenBounds,worldBounds:{min:{x:-4,y:0,z:3},max:{x:-3,y:1,z:4}}};
  assert.equal(conservativeStructuralRelation(diagonal,common,directions[0]),null);
});
