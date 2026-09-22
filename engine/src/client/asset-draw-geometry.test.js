import test from "node:test";
import assert from "node:assert/strict";
import { camera } from "../../../src/art/prop-camera.js";
import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { uprightImageGeometry } from "./asset-draw-geometry.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";

const hitArea = createVisibleHitArea({ width: 8, height: 8,
  rows: Array.from({ length: 9 }, (_, y) => y),
  spans: Array.from({ length: 8 }, (_, y) => y < 4 ? [1, 5] : [2, 6]).flat(),
}, { x: .5, y: .5 });

// Independent old representation, retained only as a geometric parity oracle.
function liftedFace(card, projection) {
  const { normal, constant } = card.plane;
  const points = card.shape.points.map(pixel => {
    const { origin, direction } = projection.ray({ x: card.offset.x + pixel.x, y: card.offset.y + pixel.y });
    const t = (constant - normal.x * origin.x - normal.z * origin.z) /
      (normal.x * direction.x + normal.z * direction.z);
    return { x: origin.x + t * direction.x, y: origin.y + t * direction.y, z: origin.z + t * direction.z };
  });
  return { kind: "face", points, coverage: { rectangles: card.shape.rectangles, offset: card.offset } };
}

test("upright pictures retain shared immutable pixel geometry without lifting or projecting it", () => {
  const view = createOrderingProjection(), feet = { x: .1, y: .27, z: .2 };
  const screen = view.project(feet);
  const projection = { ...view, project() { throw Error("unnecessary projection"); }, ray() { throw Error("unnecessary lifting"); } };
  const first = uprightImageGeometry(hitArea, screen, feet, projection);
  const second = uprightImageGeometry(hitArea, { x: screen.x + 1, y: screen.y }, feet, projection);
  assert.equal(first.kind, "card");
  assert.equal(first.shape, second.shape);
  assert(Object.isFrozen(first.shape));
  assert(Object.isFrozen(first.shape.points));
  assert(first.shape.points.every(Object.isFrozen));
  assert(Object.isFrozen(first.shape.rectangles));
  assert(first.shape.rectangles.every(Object.isFrozen));
  assert.deepEqual(first.plane, second.plane, "screen placement cannot invent a different support plane");
  assert.equal(first.plane.normal, second.plane.normal, "one immutable normal is shared by the view");
  assert.equal(compileSpatialDrawOrder([{ id: "picture", orderGeometry: first }], { projection }).records.length, 1);
});

test("a narrow real picture overlap survives without a round-trip hull collapsing to a diagonal", () => {
  // Independent review reduced a legacy false-disjoint result to these two
  // rectangles. Reprojected corners differed from exact ink by about 1e-14;
  // rehulling both sets discarded two corners. Pixel geometry has no such drift.
  const ink=createVisibleHitArea({width:16,height:24,rows:Array.from({length:25},(_,y)=>y),
    spans:Array.from({length:24},()=>[3,12]).flat()},{x:.5,y:1});
  const view=camera(320,240,0); view.lookAt(0,0,0);
  const projection=createOrderingProjection(view,320,240);
  const feet=[{x:.8575181197375059,y:.6236799854785204,z:2.3751225932501256},
    {x:.5950835663825274,y:.13618766590952874,z:2.7258932744152844}];
  const records=feet.map((point,index)=>({id:["d1","d7"][index],
    orderGeometry:uprightImageGeometry(ink,projection.project(point),point,projection)}));
  const [a,b]=records.map(record=>record.orderGeometry);
  const left=Math.max(a.offset.x+3,b.offset.x+3),right=Math.min(a.offset.x+13,b.offset.x+13);
  const top=Math.max(a.offset.y,b.offset.y),bottom=Math.min(a.offset.y+24,b.offset.y+24);
  assert(right-left>.18 && bottom-top>13,"the overlap has positive area, not a touching edge");
  const ray=projection.ray({x:(left+right)/2,y:(top+bottom)/2});
  const depth=card=>(card.plane.constant-card.plane.normal.x*ray.origin.x-card.plane.normal.z*ray.origin.z)/
    (card.plane.normal.x*ray.direction.x+card.plane.normal.z*ray.direction.z);
  assert(depth(a)>depth(b),"d1 is behind d7 across their parallel planes");
  assert.deepEqual(compileSpatialDrawOrder(records,{projection}).relations,[["d1\u0000","d7\u0000"]]);
});

test("direct cards preserve lifted-face relations with banks, pictures and coplanar ink in all views", () => {
  for (let turn = 0; turn < 4; turn++) {
    const view = camera(320, 240, 0), [x, z] = [[1,1],[-1,1],[-1,-1],[1,-1]][turn];
    view.position.x *= x; view.position.z *= z; view.lookAt(0, 0, 0);
    const projection = createOrderingProjection(view, 320, 240);
    for (const distance of [-.2, 0, .2]) {
      const records = [["a", 0], ["b", distance]].map(([id, x]) => {
        const feet = { x, y: .27, z: .05 };
        return { id, supportY: feet.y, orderGeometry: uprightImageGeometry(hitArea, projection.project(feet), feet, projection) };
      });
      const bank = { id: "bank", orderGeometry: { kind: "face", points: [
        { x: -.1, y: -.3, z: -.2 }, { x: -.1, y: .7, z: -.2 },
        { x: -.1, y: .7, z: .2 }, { x: -.1, y: -.3, z: .2 },
      ] } };
      const direct = compileSpatialDrawOrder([...records, bank], { projection });
      const lifted = compileSpatialDrawOrder([...records.map(record => ({ ...record, orderGeometry: liftedFace(record.orderGeometry, projection) })), bank], { projection });
      assert.deepEqual(direct.records.map(record => record.id), lifted.records.map(record => record.id));
      assert.deepEqual(direct.relations.toSorted(), lifted.relations.toSorted());
      assert.equal(direct.metrics.approximateOverlaps, lifted.metrics.approximateOverlaps);
    }
  }
});

test("card admission rejects mismatched planes and opaque coverage outside its checked silhouette", () => {
  const projection = createOrderingProjection(), feet = { x: 0, y: .27, z: 0 };
  const card = uprightImageGeometry(hitArea, projection.project(feet), feet, projection);
  const compile = orderGeometry => compileSpatialDrawOrder([{ id: "card", orderGeometry }], { projection });
  assert.throws(() => compile({ ...card, plane: { ...card.plane, normal: { x: 1, y: 0, z: 0 } } }), /match its view/);
  assert.throws(() => compile({ ...card, shape: { ...card.shape, rectangles: [{ left: -100, top: 0, right: -99, bottom: 1 }] } }), /inside its silhouette/);
  assert.throws(() => compile({ ...card, shape: { ...card.shape, points: [{ x: NaN, y: 0 }, ...card.shape.points] } }), /silhouette|finite/);
});
