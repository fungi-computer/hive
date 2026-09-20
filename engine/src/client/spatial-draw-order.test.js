import assert from "node:assert/strict";
import test from "node:test";
import { camera } from "../../../src/art/prop-camera.js";
import { building } from "../../../src/art/home.js";
import { figure } from "../../../src/art/figures.js";
import { captureVisualVolume, translateVisualVolume } from "../../../src/art/ordering-geometry.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { compileSpatialDrawOrder, prepareSpatialDrawScene } from "./spatial-draw-order.js";

function projection(turn = 0, transform) {
  const view = camera(320, 240, 0), [x, z] = [[1,1],[-1,1],[-1,-1],[1,-1]][turn];
  view.position.x *= x; view.position.z *= z; view.lookAt(0, 0, 0);
  return createOrderingProjection(view, 320, 240, transform);
}
const volume = (id, min, max) => ({ id, orderGeometry: { kind: "volume", min, max } });
const top = (id, x, y, z) => ({ id, orderGeometry: { kind: "face", points:
  [[x-.5,y,z-.5],[x+.5,y,z-.5],[x+.5,y,z+.5],[x-.5,y,z+.5]].map(([x,y,z]) => ({x,y,z})) } });
function captured(source) {
  try { return captureVisualVolume(source); }
  finally { source.traverse(object => object.geometry?.dispose()); }
}

test("near raised face covers lower farther volume at the same projected point", () => {
  const a = volume("grass-piece", {x:0,y:.27,z:0}, {x:.48,y:.55,z:.48});
  const b = top("bank", 1, .81, 0);
  const result = compileSpatialDrawOrder([b,a], {projection:projection()});
  assert(result.relations.some(([from,to]) => from.startsWith(a.id) && to.startsWith(b.id)));
  assert.deepEqual(result.records, [a,b]);
});

test("an extended original bed is ordered against actors at sides and ends for every camera", () => {
  const bed = captured(building("bed", "finished", 0));
  const body = captured(figure("goblin-worker", 0, 0, "idle"));
  const origin = {x:0,y:.27,z:0};
  const object = {id:"bed", orderGeometry:translateVisualVolume(bed,origin)};
  const walk = [{x:-1,z:0},{x:-1,z:1},{x:0,z:2},{x:1,z:1},{x:1,z:0},{x:0,z:-1}];
  let constrained = 0;
  for(let turn=0;turn<4;turn++) for(const point of walk) {
    const actor = {id:"actor", orderGeometry:translateVisualVolume(body,{...point,y:.27})};
    const input=[object,actor], options={projection:projection(turn)};
    const forward=compileSpatialDrawOrder(input,options), reverse=compileSpatialDrawOrder([...input].reverse(),options);
    assert.deepEqual(forward.records,reverse.records);
    assert.equal(new Set(forward.records).size,2);
    // Axis separation is an independent necessary order wherever the images
    // overlap. Both actors on either side share the bed's length coordinate.
    if(point.x) for(const [from,to] of forward.relations) {
      constrained++;
      const actorNear = point.x * -options.projection.direction.x > 0;
      assert.equal(from.startsWith("bed"),actorNear,`${turn}/${point.x}/${point.z}: ${from} -> ${to}`);
    }
  }
  assert(constrained>=4,"actual spatial overlaps must exercise both sides");
});

test("own ground and coplanar appearance precede an upright body", () => {
  const ground=top("ground",0,0,0), cover={...top("cover",0,0,0),surfaceOrder:1};
  const actor=volume("actor",{x:-.2,y:0,z:-.2},{x:.2,y:1,z:.2});
  const result=compileSpatialDrawOrder([actor,cover,ground],{projection:projection()});
  assert.deepEqual(result.records,[ground,cover,actor]);
});

test("pan and bin boundaries do not change geometric relations", () => {
  const records=[top("ground",0,0,0),volume("object",{x:-.2,y:0,z:-.2},{x:.2,y:1,z:.2}),top("raised",1,.54,1)];
  const normal=compileSpatialDrawOrder(records,{projection:projection()});
  const moved=compileSpatialDrawOrder(records,{projection:projection(0,{x:127,y:-83,scale:2}),binSize:29});
  assert.deepEqual(moved.records,normal.records);
  assert.deepEqual(moved.relations.toSorted(),normal.relations.toSorted());
});

test("intersecting pictures use a deterministic approximate order without splitting", () => {
  const a=volume("a",{x:0,y:0,z:0},{x:2,y:1,z:1});
  const b=volume("b",{x:1,y:.2,z:-1},{x:1.5,y:2,z:2});
  for (let turn = 0; turn < 4; turn++) {
    const result = compileSpatialDrawOrder([a,b], {projection:projection(turn)});
    assert.equal(result.metrics.approximateOverlaps, 1);
    assert.deepEqual(compileSpatialDrawOrder([b,a], {projection:projection(turn)}).records, result.records);
    assert.deepEqual(compileSpatialDrawOrder([a,b], {projection:projection(turn,{x:39,y:-12,scale:2})}).records, result.records);
    assert.equal(result.records.length, 2);
  }
});

test("distant objects do not cause all-pairs narrow-phase comparisons", () => {
  const records=Array.from({length:200},(_,i)=>top(`tile:${i}`,i*20,0,0));
  const result=compileSpatialDrawOrder(records,{projection:projection()});
  assert.equal(result.metrics.faceComparisons,0);
  assert(result.metrics.candidateVisits<records.length);
  assert.equal(result.records.length,records.length);
});

test("malformed faces and nonfinite bin sizes fail at the geometry boundary",()=>{
  const warped=top("warped",0,0,0);warped.orderGeometry.points[3].y=.1;
  assert.throws(()=>compileSpatialDrawOrder([warped],{projection:projection()}),/planar/);
  const degenerate={id:"line",orderGeometry:{kind:"face",points:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}]}};
  assert.throws(()=>compileSpatialDrawOrder([degenerate],{projection:projection()}),/degenerate/);
  assert.throws(()=>compileSpatialDrawOrder([],{projection:projection(),binSize:Infinity}),/required/);
});

test("support contacts are checked and contradictory support is never silently dropped",()=>{
  const a=top("a",0,0,0),b=top("b",0,0,0),point={x:0,y:0,z:0};
  a.contactSurface=a.orderGeometry.points;b.contactSurface=b.orderGeometry.points;
  a.support={id:"a",point};
  assert.throws(()=>compileSpatialDrawOrder([a],{projection:projection()}),/self-support/);
  a.support={id:"b",point};b.support={id:"a",point};
  assert.throws(()=>compileSpatialDrawOrder([a,b],{projection:projection()}),/explicit support cycle/);
  const retained=prepareSpatialDrawScene([],{projection:projection()});
  assert.throws(()=>retained.compile([a,b]),/explicit support cycle/);
  delete b.support;a.support.point={x:2,y:0,z:0};
  assert.throws(()=>compileSpatialDrawOrder([a,b],{projection:projection()}),/outside/);
});

test("exact coplanar equal-layer faces skip clipping, preserving other plane/layer relations", () => {
  const a=top("a",0,0,0), b=top("b",0,0,0), view=projection();
  b.orderGeometry.points.reverse();
  const equal=compileSpatialDrawOrder([a,b],{projection:view});
  assert.equal(equal.metrics.coplanarSkips,1);
  assert.equal(equal.metrics.faceComparisons,0);
  assert.equal(equal.relations.length,0);
  const layer=compileSpatialDrawOrder([a,{...b,surfaceOrder:1}],{projection:view});
  assert.equal(layer.metrics.coplanarSkips,0);
  assert.equal(layer.relations.length,1);
  const raised=compileSpatialDrawOrder([a,top("raised",0,.01,0)],{projection:view});
  assert.equal(raised.metrics.coplanarSkips,0);
  assert.equal(raised.relations.length,1);
});

const directProjection = {
  direction:{x:0,y:0,z:1}, project:({x,y})=>({x,y}),
  ray:({x,y})=>({origin:{x,y,z:0},direction:{x:0,y:0,z:1}}),
};
const crossingFace = (id, slope = true, rectangles) => ({id,orderGeometry:{kind:"face",
  points:[[-2,-2],[2,-2],[2,2],[-2,2]].map(([x,y])=>({x,y,z:slope?x:0})),
  ...(rectangles?{coverage:{offset:{x:0,y:0},rectangles}}:{})}});

test("opaque rectangles refine transparent hull interleaving over continuous areas",()=>{
  const other=crossingFace("ground",false);
  assert.equal(compileSpatialDrawOrder([crossingFace("art"),other],{projection:directProjection}).metrics.approximateOverlaps,1);
  const art=crossingFace("art",true,[{left:.5,top:-2,right:2,bottom:-1},{left:1,top:1,right:2,bottom:2}]);
  const result=compileSpatialDrawOrder([art,other],{projection:directProjection});
  assert.deepEqual(result.records,[art,other]);
  assert.equal(result.metrics.coverageRefinements,1);
  assert.equal(result.metrics.approximateOverlaps,0);
  assert(result.metrics.coverageFaceComparisons>0);
  const throughZero=crossingFace("art",true,[{left:-1,top:-1,right:1,bottom:1}]);
  assert.equal(compileSpatialDrawOrder([throughZero,other],{projection:directProjection}).metrics.approximateOverlaps,1);
  const islands=crossingFace("art",true,[{left:-2,top:-1,right:-1,bottom:1},{left:1,top:-1,right:2,bottom:1}]);
  assert.equal(compileSpatialDrawOrder([islands,other],{projection:directProjection}).metrics.approximateOverlaps,1);
});

test("refinement honors both images' transparent holes and includes outline coverage beyond the hull",()=>{
  const art=crossingFace("art",true,[{left:-2,top:-2,right:-1,bottom:-1},{left:1,top:1,right:2,bottom:2}]);
  const other=crossingFace("ground",false,[{left:-.5,top:-.5,right:.5,bottom:.5}]);
  const result=compileSpatialDrawOrder([art,other],{projection:directProjection});
  assert.equal(result.relations.length,0);
  const outline=crossingFace("outline",false,[{left:3,top:0,right:4,bottom:1}]);
  const raised={id:"raised",orderGeometry:{kind:"face",points:[{x:3,y:0,z:1},{x:4,y:0,z:1},{x:4,y:1,z:1},{x:3,y:1,z:1}]}};
  assert.equal(compileSpatialDrawOrder([outline,raised],{projection:directProjection}).relations.length,1);
});

test("invalid opaque coverage is rejected at preparation",()=>{
  const valid={offset:{x:0,y:0},rectangles:[{left:0,top:0,right:1,bottom:1}]};
  for(const coverage of [{...valid,offset:{x:Infinity,y:0}},{...valid,offset:{x:Number.MAX_VALUE,y:0}},
    {...valid,rectangles:[]},
    {...valid,rectangles:[{left:0,top:0,right:0,bottom:1}]},
    {...valid,rectangles:[{left:0,top:NaN,right:1,bottom:1}]}]) {
    const art=crossingFace("art");art.orderGeometry.coverage=coverage;
    assert.throws(()=>compileSpatialDrawOrder([art],{projection:directProjection}),/coverage|finite/);
  }
  const body=volume("body",{x:0,y:0,z:0},{x:1,y:1,z:1});body.orderGeometry.coverage=valid;
  assert.throws(()=>compileSpatialDrawOrder([body],{projection:directProjection}),/coverage/);
});


test("retained coverage refinement matches full compiler and invalidates changed coverage",()=>{
  const art=crossingFace("art",true,[{left:.5,top:-2,right:2,bottom:2}]);
  const scene=prepareSpatialDrawScene([art],{projection:directProjection});
  for(const z of [-.5,0,.5]) {
    const other=crossingFace("ground",false);
    other.orderGeometry.points=other.orderGeometry.points.map(point=>({...point,z}));
    const actual=scene.compile([other]), oracle=compileSpatialDrawOrder([art,other],{projection:directProjection});
    assert.deepEqual(actual.records,oracle.records);
    assert.equal(actual.metrics.coverageRefinements,1);
    assert.equal(scene.compile([{...other}]).metrics.topologyReuses,1);
  }
  const changed=crossingFace("art",true,[{left:1,top:-2,right:2,bottom:2}]);
  assert.throws(()=>scene.compile([], [changed]),/without a revision/);
});


test("whole-picture visual cycles recover deterministically in full and retained scenes",()=>{
  const view=createOrderingProjection();
  const records=[
    volume("0",{x:3,y:2,z:4},{x:3.3,y:3.8,z:6.3}),
    volume("1",{x:3.5,y:1,z:2},{x:3.8,y:2.3,z:4.8}),
    volume("2",{x:3,y:1.5,z:3.5},{x:5.3,y:3.3,z:4.3}),
  ];
  const full=compileSpatialDrawOrder(records,{projection:view});
  assert.equal(full.metrics.approximateCycles,1);
  assert.equal(full.metrics.approximateOverlaps,2);
  assert.equal(new Set(full.records).size,3,"no duplicate or missing pictures");
  assert.equal(full.relations.length,3,"retain all visual constraints for successor reuse");
  for(const permutation of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
    assert.deepEqual(compileSpatialDrawOrder(permutation.map(i=>records[i]),{projection:view}).records,full.records);
  }
  for(let moving=0;moving<records.length;moving++){
    const statics=records.filter((_,i)=>i!==moving), scene=prepareSpatialDrawScene(statics,{projection:view});
    const first=scene.compile([records[moving]]);
    assert.deepEqual(first.records,full.records);
    assert.equal(first.metrics.approximateCycles,1);
    assert.deepEqual(scene.compile([records[moving]]).records,full.records,"stationary retained order remains stable");
    const successor=scene.withStaticRecords(records);
    assert.deepEqual(successor.compile().records,full.records,"membership changes retain deterministic recovery");
  }
});

const picture = (id, left, right, depth = 0, ink = [{left, right, top:0, bottom:1}]) => ({
  id, orderGeometry: { kind:"face",
    points:[{x:left,y:0,z:depth},{x:right,y:0,z:depth},{x:right,y:1,z:depth},{x:left,y:1,z:depth}],
    coverage:{offset:{x:0,y:0},rectangles:ink} },
});
test("coplanar opaque picture order survives offscreen predecessors entering and leaving membership", () => {
  for (const depth of [0, 1e-10]) {
    const a=picture("a",0,3), b=picture("b",0,1,depth), offscreen=picture("z",2,3,1);
    let scene=prepareSpatialDrawScene([a,b],{projection:directProjection});
    for (const input of [[a,b],[offscreen,b,a],[b,a],[a,b,offscreen]]) {
      scene=scene.withStaticRecords(input);
      const retained=scene.compile(), full=compileSpatialDrawOrder(input,{projection:directProjection});
      assert.deepEqual(retained.records,full.records);
      assert.deepEqual(full.records.filter(record=>record!==offscreen),[a,b]);
      assert(full.relations.some(([from,to])=>from==="a\u0000"&&to==="b\u0000"));
      assert.equal(full.metrics.approximateCycles,0);
      const dynamic=prepareSpatialDrawScene(input.filter(record=>record!==b),{projection:directProjection}).compile([b]);
      assert.deepEqual(dynamic.records,full.records,"static/dynamic partition does not change the tie");
    }
  }
});

test("coplanar ties preserve transparent holes, touching edges and composite independence", () => {
  const a=picture("a",0,3,0,[{left:0,right:1,top:0,bottom:1},{left:2,right:3,top:0,bottom:1}]);
  const hole=picture("hole",1,2);
  assert.equal(compileSpatialDrawOrder([a,hole],{projection:directProjection}).relations.length,0);
  const b=picture("b",.5,2.5);
  assert.equal(compileSpatialDrawOrder([a,b],{projection:directProjection}).relations.length,1);
  const siblings=[{...a,compositePartition:"piece"},{...b,compositePartition:"piece"}];
  assert.equal(compileSpatialDrawOrder(siblings,{projection:directProjection}).relations.length,0);
});
