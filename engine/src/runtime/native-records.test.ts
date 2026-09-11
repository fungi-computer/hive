import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel, WasmKernelRecords } from "../../generated/hive_kernel.js";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

type RecordPart = { key: string; bytes: Uint8Array };
function capture(kernel: WasmKernel): RecordPart[] {
  const handle = kernel.capture_records();
  try {
    return (JSON.parse(handle.keys()) as string[]).map((key) => ({ key, bytes: handle.read(key) }));
  } finally { handle.free(); }
}
function restore(kernel: WasmKernel, parts: readonly RecordPart[]) {
  const handle = new WasmKernelRecords();
  try {
    for (const { key, bytes } of parts) handle.insert(key, bytes);
  } catch (error) {
    handle.free();
    throw error;
  }
  // wasm-bindgen consumes this detached handle on both success and rejection.
  kernel.restore_records(handle);
}
const definition = {
  world: { seed: "seed-a", identity: "demo", bounds: { minX: -8, maxX: 8, minY: -8, maxY: 40, minZ: -8, maxZ: 8 },
    slots: { air: 0, soil: 1, stone: 2 }, seaLevel: 12, verticalMetres: 0.54 },
  materials: [
    { slot: 0, solid: false, diggable: false, water: { kind: "open" } },
    { slot: 1, solid: true, diggable: true, water: { kind: "porous", rule: {
      id: "soil", porosity: 0.4, retention: 0.1, absorbMPerS: 0.1, seepMPerS: 0.1 } } },
    { slot: 2, solid: true, diggable: true, water: { kind: "closed" } },
  ],
  water: { id: "w", cells: [[0, -7, 0], [0, -6, 0], [0, 39, 0]], fallMPerS: 0.1, spreadMPerS: 0.1 },
};

test("actual WASM captures opaque water records and restores atomically", () => {
  const first = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    first.load(JSON.stringify({ format: "hive-game", version: 1, game: "colony", components: [], initial: [] }));
    first.load_environment(JSON.stringify(definition));
    const step = JSON.stringify({ delta: 0.2, writes: [], actions: [] });
    const advanced = JSON.parse(first.advance(step));
    assert.ok(advanced.environmentWork.faces > 0);
    const saved = capture(first);
    assert.ok(saved.every(({ bytes }) => bytes instanceof Uint8Array && bytes.length <= 256 * 1024));
    assert.ok(saved.some(({ key }) => key === "kernel/environment/water"));
    restore(recovered, structuredClone(saved));
    assert.equal(recovered.environment_facts(), first.environment_facts());
    first.advance(step);
    recovered.advance(step);
    assert.deepEqual(capture(recovered), capture(first));

    const before = capture(recovered);
    const corrupt = before.map(({ key, bytes }) => ({ key, bytes: key === "kernel/environment/water"
      ? Uint8Array.from([...bytes, 0]) : bytes }));
    assert.throws(() => restore(recovered, corrupt));
    assert.deepEqual(capture(recovered), before);
    assert.throws(() => restore(recovered, before.filter(({ key }) => key !== "kernel/environment/terrain")));
    assert.deepEqual(capture(recovered), before);
  } finally { first.free(); recovered.free(); }
});
