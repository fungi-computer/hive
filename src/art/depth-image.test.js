import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeDepth24,
  decodeThreePackedDepth,
  makeLinearDepthImage,
  writeDepth24,
} from "./depth-image.js";

test("24-bit depth encoding is stable at endpoints and sub-pixel precision", () => {
  const bytes = new Uint8ClampedArray(12);
  for (const [index, value] of [0, 0.456789, 1].entries())
    writeDepth24(bytes, index * 4, value);
  assert.equal(decodeDepth24(bytes, 0), 0);
  assert.ok(Math.abs(decodeDepth24(bytes, 4) - 0.456789) <= 1 / 0xffffff);
  assert.equal(decodeDepth24(bytes, 8), 1);
});

test("Three packed depth decoding preserves its documented channel weights", () => {
  assert.equal(decodeThreePackedDepth(new Uint8ClampedArray([0, 0, 0, 0]), 0), 0);
  assert.equal(decodeThreePackedDepth(new Uint8ClampedArray([255, 255, 255, 255]), 0), 1);
});

test("ink coverage inherits an adjacent physical surface depth", () => {
  const sourceColor = new Uint8ClampedArray(3 * 4);
  const finalColor = new Uint8ClampedArray(3 * 4);
  const packedDepth = new Uint8ClampedArray(3 * 4);
  sourceColor[7] = 255;
  finalColor[3] = finalColor[7] = finalColor[11] = 255;
  packedDepth.set([127, 255, 255, 255], 4);
  const output = makeLinearDepthImage({
    sourceColor,
    finalColor,
    packedDepth,
    width: 3,
    height: 1,
    cameraNear: 1,
    cameraFar: 11,
    cameraDepth: 20,
    minDepth: 8,
    maxDepth: 19,
  });
  assert.equal(output[3], 255);
  assert.equal(output[7], 255);
  assert.equal(output[11], 255);
  assert.equal(decodeDepth24(output, 0), decodeDepth24(output, 4));
  assert.equal(decodeDepth24(output, 8), decodeDepth24(output, 4));
});
