import test from "node:test";
import assert from "node:assert/strict";
import { createSpatialRenderFixture } from "./spatial-render-fixture.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";

test("original mixed scene orders through four cameras and a complete bed walk", () => {
  for(let turn=0;turn<4;turn++)for(let walk=0;walk<10;walk+=.5) {
    const scene=createSpatialRenderFixture({turn,walk});
    const ordered=compileSpatialDrawOrder(scene.records,{projection:scene.projection});
    assert.equal(ordered.records.length,scene.records.length);
    assert.equal(new Set(ordered.records).size,scene.records.length);
    assert(ordered.relations.length>0);
  }
});

test("declared stair contact places the actor over its support and between rails",()=>{
  for(let turn=0;turn<4;turn++)for(const t of [0,.25,.5,.75,1]) {
    const scene=createSpatialRenderFixture({turn,actorAt:{x:0,y:.27+2.16*t,z:3+2*t},supportPart:{id:"stair",part:"surface"}});
    const {records}=compileSpatialDrawOrder(scene.records,{projection:scene.projection});
    const actor=records.indexOf(scene.actor),surface=scene.stairs.find(p=>p.part==="surface");
    assert(records.indexOf(surface)<actor);
    for(const rail of scene.stairs.filter(p=>p!==surface)) {
      const x=(rail.orderGeometry.min.x+rail.orderGeometry.max.x)/2;
      const railNear=x * -scene.projection.direction.x>0;
      assert.equal(records.indexOf(rail)>actor,railNear);
    }
  }
});

test("short grass preserves ground facts and four-cell dual-grid support",()=>{
  for(let turn=0;turn<4;turn++) {
    const tall=createSpatialRenderFixture({turn}),mown=createSpatialRenderFixture({turn,mown:true});
    const before=JSON.stringify(mown.surfaces);
    const {records}=compileSpatialDrawOrder(mown.records,{projection:mown.projection});
    assert.equal(JSON.stringify(mown.surfaces),before,"ordering must not mutate cover facts");
    assert.deepEqual(tall.terrain.map(r=>r.orderGeometry),mown.terrain.map(r=>r.orderGeometry));
    assert.deepEqual(tall.surfaces.map(s=>s.cell),mown.surfaces.map(s=>s.cell));
    assert(mown.surfaces.some(s=>s.cover.height==="short"));
    assert(mown.surfaces.some(s=>s.cover.height==="full"));
    assert(mown.patches.some(p=>p.mask===15&&p.attachment.supports.length===4));
    for(const piece of mown.cover) {
      assert(records.includes(piece));
      assert(mown.patches.includes(piece), "cover records are used without splitting");
      assert.equal(piece.supportY, piece.attachment.point.y);
      const center = mown.projection.project(piece.attachment.point);
      assert.equal(piece.orderGeometry.kind,"card");
      assert(piece.orderGeometry.shape.points.some(p=>p.y+piece.orderGeometry.offset.y<center.y));
      assert(piece.orderGeometry.shape.points.some(p=>p.y+piece.orderGeometry.offset.y>center.y));
      assert(Math.abs(piece.projected[2].x - piece.projected[0].x - 16) < 1e-10);
      assert(Math.abs(piece.projected[2].y - piece.projected[0].y - 64) < 1e-10);
      assert.deepEqual(piece.terrainBatch.uvs,[.375,0,.375,1,.625,1,.625,0]);
    }
  }
});

import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";
test("study cover retains original image and atlas UVs for full and short four-cell masks", () => {
  const hitArea = createVisibleHitArea({ width: 64, height: 64,
    rows: Array.from({ length: 65 }, (_, y) => y),
    spans: Array.from({ length: 64 }, () => [24, 39]).flat() }, { x: .5, y: .5 });
  for (let turn = 0; turn < 4; turn++) {
    const styles = [], calls = [];
    const pack = { body: () => ({ texture: null, uvs: [0,0,0,1,1,1,1,0] }),
      cover: input => {
        calls.push(input);
        const style = { texture: { label: input.height }, uvs: [.1,.2,.1,.4,.3,.4,.3,.2], hitArea };
        styles.push(style);
        return style;
      } };
    const scene = createSpatialRenderFixture({ turn, mown: true, terrainPack: pack });
    const records = scene.cover;
    assert.equal(records.length, styles.length, "one original image per dual-grid patch");
    assert(calls.some(call => call.height === "full"));
    assert(calls.some(call => call.height === "short"));
    assert(records.some(record => record.mask === 15 && record.attachment.supports.length === 4));
    records.forEach((record, index) => {
      assert.strictEqual(record.terrainBatch.texture, styles[index].texture);
      assert.strictEqual(record.terrainBatch.hitArea, styles[index].hitArea);
      record.terrainBatch.uvs.forEach((value,index) => assert(Math.abs(value - [.175,.2,.175,.4,.225,.4,.225,.2][index]) < 1e-12));
      assert(Math.abs(record.projected[2].x - record.projected[0].x - 16) < 1e-10);
      assert(Math.abs(record.projected[2].y - record.projected[0].y - 64) < 1e-10);
      assert.equal(record.supportY, record.attachment.point.y);
      assert.equal(record.orderGeometry.kind,"card");
      const center = scene.projection.project(record.attachment.point);
      assert(record.orderGeometry.shape.points.some(point => point.y + record.orderGeometry.offset.y < center.y));
      assert(record.contains({ x: center.x, y: center.y - 30 }), "ink above ground support survives");
    });
  }
});
