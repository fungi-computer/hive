import assert from "node:assert/strict";
import test from "node:test";
import { createMultipartVisualOwner, multipartOverlayZIndex, transformedPartGeometry, transformBakedPartPoint } from "./multipart-visual-owner.js";
import { Vector3 } from "three";
import { building } from "../../../src/art/home.js";

function sprite() {
  return { visible: false, anchor: { set() {} }, position: { set() {} }, scale: { set() {} }, destroy() { this.destroyed = true; } };
}

test("part geometry follows the real authored Three group in all baked facings", () => {
  for (const facing of [0, 1, 2, 3]) {
    const source = building("stair", "finished", facing);
    source.updateMatrixWorld(true);
    for (const part of source.userData.staticParts) {
      for (const [x, y, z] of part.geometry.footprint) {
        const actual = part.group.localToWorld(new Vector3(x, y, z));
        const resolved = transformBakedPartPoint({ x, y, z }, facing, { x: 7, y: 3, z: -5 }, [0.25, -0.5]);
        assert(Math.abs(resolved.x - actual.x - 7.25) < 1e-9);
        assert(Math.abs(resolved.y - actual.y - 3) < 1e-9);
        assert(Math.abs(resolved.z - actual.z + 5.5) < 1e-9);
      }
    }
    source.traverse(object => object.geometry?.dispose());
  }
});

test("multipart owner keeps sibling identities while resolving one entity target", () => {
  const children = [];
  const owner = createMultipartVisualOwner({ parent: { addChild(value) { children.push(value); } }, createSprite: sprite, emptyTexture: {} });
  const parts = [
    { id: "rail.left", role: "upright-boundary", texture: {}, geometry: { footprint: [[-1, 0, 0]], minY: 0, maxY: 2 } },
    { id: "rail.right", role: "upright-boundary", texture: {}, geometry: { footprint: [[1, 0, 0]], minY: 0, maxY: 2 } },
  ];
  const records = owner.sync({ entityId: "stair-1", parts, target: "stair-1", transform: (point) => point });
  assert.deepEqual(records.map(({ id, part, target }) => [id, part, target]), [["stair-1", "rail.left", "stair-1"], ["stair-1", "rail.right", "stair-1"]]);
  assert.equal(children.length, 2);
  assert.equal(transformedPartGeometry(parts[0], (point) => point).length, 2);
  assert.equal(transformedPartGeometry({ geometry: { footprint: [[0, 0, 0], [0, 2, 1]], minY: 0, maxY: 2 } }, (point) => point).length, 2);
  assert.equal(transformedPartGeometry({ geometry: { footprint: [[0, 0, 0]], minY: -1, maxY: 2 } }, (point) => point).length, 3);
  records[0].display.zIndex = 4;
  records[1].display.zIndex = 9;
  assert.equal(multipartOverlayZIndex(records), 9.5);
  owner.sync({ entityId: "stair-1", parts: [parts[1]], transform: (point) => point });
  assert.equal(children[0].destroyed, true);
  owner.dispose();
  assert.equal(children[1].destroyed, true);
  assert.throws(() => owner.sync({ entityId: "stair-1", parts: [] }), /disposed/);
});
