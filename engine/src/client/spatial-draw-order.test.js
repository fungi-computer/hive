import assert from "node:assert/strict";
import test from "node:test";
import { camera } from "../../../src/art/prop-camera.js";
import { building } from "../../../src/art/home.js";
import { figure } from "../../../src/art/figures.js";
import { captureVisualVolume, translateVisualVolume } from "../../../src/art/ordering-geometry.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";

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

test("geometry that interleaves is reported instead of silently sorting one piece wrongly", () => {
  const a=volume("a",{x:0,y:0,z:0},{x:2,y:1,z:1});
  const b=volume("b",{x:1,y:.2,z:-1},{x:1.5,y:2,z:2});
  assert.throws(()=>compileSpatialDrawOrder([a,b],{projection:projection()}),/interleave/);
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
  assert.throws(()=>compileSpatialDrawOrder([a,b],{projection:projection()}),/cycle/);
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
