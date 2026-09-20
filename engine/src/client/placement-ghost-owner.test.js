import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlacementGhostOwner } from "./placement-ghost-owner.js";
import { compileSpatialDrawOrder } from "./spatial-draw-order.js";
import { createOrderingProjection } from "./ordering-projection.js";

test("placement ghost owner reuses world sprites and contributes only non-pickable moving records", () => {
  const sprites = [];
  const parent = { addChild(sprite) { sprites.push(sprite); } };
  const createSprite = () => ({
    anchor: { set() {} }, position: { set(x, y) { this.x = x; this.y = y; } }, scale: { set() {} },
    destroy(options) { this.destroyed = options.texture === false && options.textureSource === false; },
  });
  const owner = createPlacementGhostOwner({ parent, project: (x, y, z) => ({ x: x - z, y: x + z - y }),
    bindings: { stair: {} }, resolve: (_art, _binding, facing) => ({ texture: `turn:${facing}`, anchor: { x: 0.5, y: 1 } }), createSprite });
  const art = { orderingByTexture: new Map([1,3].map(turn => [`turn:${turn}`, {kind:"volume",min:{x:-.4,y:0,z:-.4},max:{x:.4,y:1,z:.4}}])) };
  const initial = owner.update({ visual: "stair", facing: 1, cells: [[2, 4, 3], [3, 4, 3]] },
    { art, verticalMetres: 0.5, cameraTurn: 2 });
  assert.equal(sprites.length, 2);
  assert.equal(initial[0].display.texture, "turn:3");
  assert.deepEqual(initial[0].attachment.feet, { x: 2, y: 2.25, z: 3 });
  assert.equal(initial[0].contains({ x: 0, y: 0 }), false);
  assert.equal(initial[0].display.position.x, -1);
  assert.deepEqual(compileSpatialDrawOrder(initial, { projection: createOrderingProjection() }).records.length, 2);
  const next = owner.update({ visual: "stair", facing: 1, cells: [[2, 4, 3]] },
    { art, verticalMetres: 0.5 });
  assert.equal(next[0].display, sprites[0]);
  assert.equal(sprites[1].visible, false);
  owner.clear();
  assert.equal(sprites[0].visible, false);
  owner.dispose();
  assert(sprites.every(sprite => sprite.destroyed));
});
