import { strict as assert } from "node:assert";
import { test } from "node:test";
import { wasmKernelPort, type WasmKernelBinding } from "./wasm-kernel";

function port(response: unknown, calls: string[] = []) {
  return wasmKernelPort({
    structure_states(json: string) { calls.push(json); return JSON.stringify(response); },
  } as unknown as WasmKernelBinding);
}

test("structure state observation preserves order, duplicates, and missing IDs", () => {
  const calls: string[] = [];
  const kernel = port([
    { kind: "aperture-wall", id: "door", base: { x: 1, y: -2, z: 3 }, height: 4, openingBottom: 0, openingHeight: 2, open: true },
    null,
    { kind: "aperture-wall", id: "door", base: { x: 1, y: -2, z: 3 }, height: 4, openingBottom: 0, openingHeight: 2, open: false },
  ], calls);
  assert.deepEqual(kernel.structureStates(["door", "missing", "door"]), [
    { kind: "aperture-wall", id: "door", base: { x: 1, y: -2, z: 3 }, height: 4, openingBottom: 0, openingHeight: 2, open: true },
    null,
    { kind: "aperture-wall", id: "door", base: { x: 1, y: -2, z: 3 }, height: 4, openingBottom: 0, openingHeight: 2, open: false },
  ]);
  assert.deepEqual(JSON.parse(calls[0]), ["door", "missing", "door"]);
});

test("structure state observation accepts every static shape", () => {
  const kernel = port([
    { kind: "floor", id: "f", support: { x: 0, y: 0, z: 0 } },
    { kind: "wall", id: "w", base: { x: 0, y: 0, z: 1 }, height: 64 },
    { kind: "stair", id: "s", origin: { x: 0, y: 0, z: 2 }, orientation: "west", run: 1, rise: 64 },
    { kind: "aperture-wall", id: "a", base: { x: 0, y: 0, z: 3 }, height: 64, openingBottom: 1, openingHeight: 2, open: false },
  ]);
  assert.equal(kernel.structureStates(["f", "w", "s", "a"]).length, 4);
});

test("structure state observation rejects invalid input and native shape", () => {
  const kernel = port([]);
  assert.throws(() => kernel.structureStates([]), /1\.\.64/);
  assert.throws(() => kernel.structureStates(["bad id"]), /valid IDs/);
  assert.throws(() => kernel.structureStates(Array.from({ length: 65 }, (_, i) => `s-${i}`)), /1\.\.64/);
  for (const response of [
    [{ kind: "wall", id: "wrong", base: { x: 0, y: 0, z: 0 }, height: 1 }],
    [{ kind: "wall", id: "w", base: { x: 0, y: 0, z: 0 }, height: 1, extra: true }],
    [{ kind: "aperture-wall", id: "a", base: { x: 0, y: 0, z: 0 }, height: 4, openingBottom: 2, openingHeight: 2, open: false }],
  ]) assert.throws(() => port(response).structureStates([response[0].id as string]), /invalid structure state/);
});
