import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBakedDepth, outlineBakedPixels } from './baked-depth.js';
const camera = { near: 2, far: 10, originProjection: 6, axis: { x: 0, y: 0, z: 1 } };

test('depth is local toward-camera distance, flipped from GPU rows; empty is explicit', () => {
  const color = new Uint8Array([0,0,0,255, 0,0,0,0, 0,0,0,255, 0,0,0,255]);
  const gpu = new Uint8Array([128,0,0,255, 0,0,0,255, 64,0,0,255, 0,0,0,0]);
  const result = decodeBakedDepth(gpu, color, 2, 2, camera);
  assert.equal(result.schema, 'hive.baked-depth/1');
  assert.deepEqual(Array.from(result.coverage), [1,0,1,1]);
  assert.deepEqual(Array.from(result.values), [2,NaN,0,4]);
  const movedCamera = { ...camera, near: 12, far: 20, originProjection: 16 };
  assert.deepEqual(decodeBakedDepth(gpu, color, 2, 2, movedCamera).values, result.values);
});

test('reject color surfaces absent from depth pass', () => {
  assert.throws(() => decodeBakedDepth(new Uint8Array(4), new Uint8Array([0,0,0,255]), 1, 1, camera), /coverage mismatch/);
});

test('reject depth-only and fractional color coverage', () => {
  assert.throws(() => decodeBakedDepth(new Uint8Array([0,0,0,255]), new Uint8Array(4), 1, 1, camera), /coverage mismatch/);
  assert.throws(() => decodeBakedDepth(new Uint8Array([0,0,0,255]), new Uint8Array([0,0,0,128]), 1, 1, camera), /binary color coverage/);
});

test('reject malformed buffers and a non-unit camera axis', () => {
  assert.throws(() => decodeBakedDepth(new Uint8Array(3), new Uint8Array(4), 1, 1, camera), /buffers/);
  assert.throws(() => decodeBakedDepth(new Uint8Array(4), new Uint8Array(4), 1, 1, { ...camera, axis: { x: 0, y: 0, z: 2 } }), /normalized/);
});

test('outline color and depth share deterministic left-first neighbor without expansion', () => {
  const source = new Uint8ClampedArray(7 * 5 * 4);
  const left = 2 * 7 + 2, right = left + 2, middle = left + 1;
  source.set([200,100,50,255], left * 4);
  source.set([50,100,200,255], right * 4);
  const values = new Float32Array(35).fill(NaN), coverage = new Uint8Array(35);
  values[left] = -2; values[right] = 3; coverage[left] = coverage[right] = 1;
  const outlined = outlineBakedPixels(source, 7, 5, { values, coverage });
  assert.deepEqual(Array.from(outlined.slice(middle * 4, middle * 4 + 4)), [43,48,38,255]);
  assert.equal(values[middle], -2);
  assert.equal(coverage[middle], 2);
  assert.equal(coverage[left], 1);
  assert.equal(source[middle * 4 + 3], 0);
  assert.equal(outlined[(0 * 7 + 2) * 4 + 3], 0);
  for (let i = 0; i < 35; i++) {
    assert.equal(Boolean(outlined[i * 4 + 3]), Boolean(coverage[i]));
    assert.equal(Number.isFinite(values[i]), Boolean(coverage[i]));
  }
});
