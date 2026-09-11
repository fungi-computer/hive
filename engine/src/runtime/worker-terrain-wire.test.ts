import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack } from "../games/colony";
import { wasmKernelPort } from "./wasm-kernel";
import { WorkerRuntime } from "./worker";
import type { WorkerTransportEvent } from "./protocol";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony local worker sends baseline then same-revision terrain reference and resets baseline", () => {
  const events: WorkerTransportEvent[] = [];
  const runtime = new WorkerRuntime(() => wasmKernelPort(new WasmKernel()), { colony: colonyPack }, event => events.push(event));
  try {
    runtime.command({ type: "start", game: "colony" });
    runtime.command({ type: "step", delta: 0.1 });
    const frames = events.filter((event): event is Extract<WorkerTransportEvent, { type: "frame" }> => event.type === "frame");
    assert.equal(Boolean(frames[0].terrain && "surfaces" in frames[0].terrain), true);
    assert.equal(Boolean(frames[1].terrain && "surfaces" in frames[1].terrain), false);
    runtime.command({ type: "reset" });
    const afterReset = events.filter((event): event is Extract<WorkerTransportEvent, { type: "frame" }> => event.type === "frame").at(-1);
    assert.equal(Boolean(afterReset?.terrain && "surfaces" in afterReset.terrain), true);
  } finally { runtime.dispose(); }
});
