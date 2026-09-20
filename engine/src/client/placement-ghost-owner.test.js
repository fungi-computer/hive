import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlacementGhostOwner } from "./placement-ghost-owner.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";

function harness() {
  const sprites = [], children = new Set(), resolvedFacings = [];
  const parent = { addChild(sprite) { children.add(sprite); } };
  const createSprite = () => {
    const sprite = {
      anchor: { set() {} }, position: { set(x, y) { this.x = x; this.y = y; } }, scale: { set() {} },
      destroy(options) {
        this.destroyCount = (this.destroyCount ?? 0) + 1;
        this.destroyed = options.texture === false && options.textureSource === false;
        children.delete(this);
      },
    };
    sprites.push(sprite); return sprite;
  };
  const owner = createPlacementGhostOwner({ parent, project: (x, y, z) => ({ x: x - z, y: x + z - y }),
    bindings: { stair: {} }, resolve: (_art, _binding, facing) => {
      resolvedFacings.push(facing); return { texture: `turn:${facing}`, anchor: { x: 0.5, y: 1 } };
    }, createSprite });
  return { owner, sprites, children, resolvedFacings };
}

function assertOverlay(record) {
  assert.equal(record.presentation, "overlay");
  assert.equal(record.pickable, false);
  assert.equal(record.contains({ x: 0, y: 0 }), false);
  assert.equal(record.display.eventMode, "none");
  for (const field of ["orderGeometry", "attachment", "supportY", "moving"])
    assert.equal(Object.hasOwn(record, field), false, `${field} must not claim physical scene membership`);
}

test("all placement validity states use the same non-pickable overlay contract", () => {
  const { owner, sprites, resolvedFacings } = harness();
  // Preview art intentionally needs no physical ordering metadata.
  const art = {};
  for (const [status, tint, alpha] of [[undefined, 0xffffff, .45], ["ready", 0xbde6a3, .45], ["rejected", 0xe47c72, .62]]) {
    const records = owner.update({ visual: "stair", facing: 1, cells: [[2, 4, 3]] },
      { art, verticalMetres: .5, cameraTurn: 2, status });
    assert.equal(records.length, 1);
    assertOverlay(records[0]);
    assert.equal(records[0].display, sprites[0]);
    assert.equal(sprites[0].texture, "turn:3");
    assert.equal(sprites[0].tint, tint); assert.equal(sprites[0].alpha, alpha);
    assert.equal(sprites[0].position.x, -1); assert.equal(sprites[0].position.y, 2.75);
  }
  assert.equal(sprites.length, 1);
  assert.deepEqual(resolvedFacings, [3, 3, 3]);
  owner.dispose();
});

test("rejected previews can overlap occupied world without physical graph or picking admission", () => {
  const { owner } = harness();
  const occupied = { id:"occupied", contains:()=>true, orderGeometry:{kind:"volume",
    min:{x:1.5,y:2,z:2.5}, max:{x:3.5,y:4,z:3.5} } };
  const world = compileSpatialDrawOrder([occupied], { projection:createOrderingProjection() }).records;
  const overlays = owner.update({ visual:"stair", cells:[[2,4,3],[3,4,3]] },
    { art:{}, verticalMetres:.5, status:"rejected" });
  assert.equal(overlays.length, 2);
  overlays.forEach(assertOverlay);
  assert.equal(overlays[0].display.tint, 0xe47c72);
  // The scene joins these independent passes for painting; its physical stream
  // remains exactly the occupied world, even for mutually overlapping ghosts.
  assert.deepEqual(world.map(record=>record.id), ["occupied"]);
  assert.equal(pickVoxelDrawRecord(world, {x:0,y:0}).record, occupied);
  owner.dispose();
});

test("sparse preview items, shrink, clear and disposal retain only owner sprites and preserve shared textures", () => {
  const { owner, sprites, children } = harness(), options = { art:{}, verticalMetres:.5 };
  const sparse = owner.update({ visual:["missing", "stair"], cells:[[1,0,0],[2,0,0]] }, options);
  assert.equal(sparse.length, 1); assert.equal(sparse[0].id, "placement-ghost:1");
  assert.equal(sprites.length, 1);
  owner.clear(); assert.equal(sprites[0].visible, false);
  const expanded = owner.update({ visual:"stair", cells:[[1,0,0],[2,0,0]] }, options);
  assert.equal(expanded.length, 2); assert.equal(sprites.length, 2);
  assert.equal(expanded[1].display, sprites[0]);
  const shrunk = owner.update({ visual:"stair", cells:[[1,0,0]] }, options);
  assert.equal(shrunk[0].display, sprites[1]); assert.equal(sprites[0].visible, false);
  owner.update({ visual:"missing", cells:[[1,0,0]] }, options);
  assert(sprites.every(sprite=>sprite.visible === false));
  owner.dispose(); owner.dispose(); owner.clear();
  assert.equal(children.size, 0);
  assert(sprites.every(sprite=>sprite.destroyed && sprite.destroyCount === 1));
  assert.throws(()=>owner.update({}, options), /disposed/);
});

test("placement datum alignment remains applied before projecting overlay art", () => {
  const { owner, sprites } = harness();
  const art = { placementByTexture:new Map([["turn:0", {kind:"footprint",bakedFootprint:[[0,0],[0,1]],rotationPivot:[0,0]}]]) };
  owner.update({visual:"stair",items:[{visual:"stair",point:[4,1,5],placement:{kind:"footprint",orientation:0,footprint:[[1,0],[1,1]]}}]},
    {art,verticalMetres:.5,status:"ready"});
  assert.equal(sprites[0].position.x, 0);
  assert.equal(sprites[0].position.y, 9);
  owner.dispose();
});

test("invalid world points create no visible or leaked preview sprites", () => {
  const { owner, sprites } = harness();
  assert.throws(()=>owner.update({items:[{visual:"stair",point:[Infinity,0,0]}]}, {art:{},verticalMetres:.5}), /finite/);
  assert.equal(sprites.length, 0);
  owner.dispose();
});
