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
      assert(piece.attachment.supports.some(cell=>piece.part===`surface:${cell.join(",")}`));
      assert(piece.orderGeometry.points.every(p=>p.y===piece.attachment.point.y));
    }
  }
});
