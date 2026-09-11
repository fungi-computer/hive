import { environmentFixture } from "./fixtures/environment.ts";
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


test("actual WASM captures opaque water records and restores atomically", () => {
  const first = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    first.load(JSON.stringify({ format: "hive-game", version: 1, game: "colony", components: [], initial: [] }));
    first.load_environment(JSON.stringify(environmentFixture));
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

test("actual WASM entity membership is positional and bounded", () => {
  const kernel = new WasmKernel();
  try {
    kernel.load(JSON.stringify({
      format: "hive-game", version: 1, game: "membership", components: [],
      initial: [{ id: "actor", components: {} }],
    }));
    assert.deepEqual(JSON.parse(kernel.entity_membership(JSON.stringify(["actor", "missing"]))), [true, false]);
    assert.throws(() => kernel.entity_membership(JSON.stringify(["bad id"])));
    assert.throws(() => kernel.entity_membership(JSON.stringify(Array.from({ length: 129 }, (_, i) => `id-${i}`))));
  } finally { kernel.free(); }
});
