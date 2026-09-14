import assert from "node:assert/strict";
import test from "node:test";
import { parsePartGeometry, partitionCompositePixels, partIdCodes, partOwnerKey, renderPartIdPass } from "./parts.js";
import { building } from "./home.js";

test("part geometry is detached and bounds are ordered", () => {
  const input = { footprint: [[0, 0, 0], [1, 2, 3]], minY: 0, maxY: 2 };
  const result = parsePartGeometry(input);
  input.footprint[0][0] = 9;
  assert.deepEqual(result.footprint[0], [0, 0, 0]);
  assert.throws(() => parsePartGeometry({ ...input, minY: 3 }), /inverted-height/);
  assert.equal(partOwnerKey(["buildings", "stair", "finished", 0]), '["buildings","stair","finished",0]');
});

test("depth ID ownership assigns each visible pixel once and is declaration-order independent", () => {
  const composite = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
  ]);
  const codes = partIdCodes(["rail.left", "surface"]);
  const ownership = new Uint32Array([codes.find((entry) => entry.id === "rail.left").code, codes.find((entry) => entry.id === "surface").code, 0]);
  const [a, b] = partitionCompositePixels({ width: 3, height: 1, composite, partIds: ownership, parts: ["rail.left", "surface"], partCodes: codes });
  assert.deepEqual([...a], [10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...b], [0, 0, 0, 0, 40, 50, 60, 255, 70, 80, 90, 255]);
  assert.equal(a[3] + a[7] + b[3] + b[7] + b[11], 765);
  const [surface, rail] = partitionCompositePixels({ width: 3, height: 1, composite, partIds: ownership, parts: ["surface", "rail.left"], partCodes: codes });
  assert.deepEqual([...surface], [...b]);
  assert.deepEqual([...rail], [...a]);
});

test("part ownership rejects malformed RGBA masks", () => {
  assert.throws(() => partitionCompositePixels({ width: 1, height: 1, composite: new Uint8ClampedArray(4), partIds: new Uint32Array([99]), parts: ["surface"], partCodes: [{ id: "surface", code: 1 }] }), /unknown-id/);
});

test("export ID pass restores source materials and visibility", () => {
  const makeGroup = () => ({ visible: false, traverse(callback) { callback(this); }, addChild() {} });
  const left = makeGroup(), right = makeGroup();
  const leftMesh = { isMesh: true, visible: true, material: "left-material", parent: left };
  const rightMesh = { isMesh: true, visible: true, material: "right-material", parent: right };
  const source = { traverse(callback) { [this, left, right, leftMesh, rightMesh].forEach(callback); } };
  const gl = { RGBA: 1, UNSIGNED_BYTE: 2, readPixels(x, y, width, height, format, type, output) { output[0] = 1; output[3] = 255; } };
  const renderer = { autoClear: false, getSize(target) { return target.set(8, 8); }, setSize() {}, render() {}, getContext() { return gl; } };
  const materials = [];
  const result = renderPartIdPass(renderer, source, {}, 1, 1, [
    { id: "rail.left", group: left }, { id: "rail.right", group: right },
  ], { createMaterial() { const material = { color: { setRGB() {} }, dispose() { materials.push("disposed"); } }; materials.push(material); return material; } });
  assert.equal(result.pixels[0], 1);
  assert.equal(leftMesh.material, "left-material");
  assert.equal(rightMesh.material, "right-material");
  assert.equal(left.visible, false);
  assert.equal(right.visible, false);
  assert.equal(materials.filter((value) => value === "disposed").length, 2);
});

test("256x256 ownership propagation stays linear in the export pixel count", () => {
  const width = 256, height = 256, pixels = width * height;
  const composite = new Uint8ClampedArray(pixels * 4);
  for (let index = 3; index < composite.length; index += 4) composite[index] = 255;
  const codes = partIdCodes(["rail.left", "rail.right"]);
  const partIds = new Uint32Array(pixels);
  partIds[0] = codes.find(({ id }) => id === "rail.left").code;
  partIds[pixels - 1] = codes.find(({ id }) => id === "rail.right").code;
  const stats = {};
  const output = partitionCompositePixels({ width, height, composite, partIds, parts: ["rail.left", "rail.right"], partCodes: codes, stats });
  assert.equal(stats.visited, pixels);
  assert(stats.operations <= pixels * 8);
  const assignedAlpha = output.reduce((total, image) => total + image.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0), 0);
  assert.equal(assignedAlpha, 255 * pixels);
});

test("the public stair scene exposes its checked multipart declarations", () => {
  for (const stage of ["stakes", "frame", "finished"])
    for (const facing of [0, 1, 2, 3]) {
      const authored = building("stair", stage, facing);
      assert.deepEqual(authored.userData.staticParts.map(({ id }) => id), ["surface", "rail.left", "rail.right"]);
      for (const part of authored.userData.staticParts) assert.notEqual(part.group.parent, null);
    }
});
