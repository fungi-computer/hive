import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import type { KernelPort } from "../contracts";
import { survivalPack } from "../games/survival";
import type { WorkerTransportEvent } from "./protocol";
import { wasmKernelPort } from "./wasm-kernel";
import { WorkerRuntime } from "./worker";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("unrecoverable step keeps its first cause until explicit start", () => {
  const events: WorkerTransportEvent[] = [];
  let created = 0;
  const runtime = new WorkerRuntime(
    () => {
      const generation = ++created;
      const inner = wasmKernelPort(new WasmKernel());
      const port: KernelPort = {
        ...inner,
        advance: (...args: Parameters<KernelPort["advance"]>) => {
          if (generation === 1) throw new Error("primary step failure");
          return inner.advance(...args);
        },
        restore: (...args: Parameters<KernelPort["restore"]>) => {
          if (generation === 2) throw new Error("restore failure");
          return inner.restore(...args);
        },
      };
      return port;
    },
    { survival: survivalPack },
    (event) => events.push(event),
  );
  try {
    runtime.command({ type: "start", game: "survival" });
    runtime.command({ type: "step", delta: 0.1 });
    const errorsAfterFailure = events.filter((event) => event.type === "error");
    assert.equal(errorsAfterFailure.length, 1);
    assert.match(errorsAfterFailure[0].message, /primary step failure/);
    assert.match(errorsAfterFailure[0].message, /recovery failed: restore failure/);

    for (let index = 0; index < 8; index++)
      runtime.command({ type: "step", delta: 0.1 });
    assert.equal(events.filter((event) => event.type === "error").length, 1);
    assert.equal(created, 2);

    runtime.command({ type: "save" });
    assert.equal(events.filter((event) => event.type === "error").length, 2);
    assert.match(events.filter((event) => event.type === "error").at(-1)!.message, /primary step failure/);
    assert.match(events.filter((event) => event.type === "error").at(-1)!.message, /recovery failed: restore failure/);
    assert.equal(created, 2);

    runtime.command({ type: "reset" });
    assert.equal(events.filter((event) => event.type === "error").length, 2);
    assert.equal(created, 3);
    runtime.command({ type: "step", delta: 0.1 });
    const framesAfterReset = events.filter((event) => event.type === "frame");
    assert.equal(framesAfterReset.at(-1)?.time, 0.1);

    runtime.command({ type: "start", game: "survival" });
    assert.equal(events.filter((event) => event.type === "ready").length, 2);
    assert.equal(created, 4);
  } finally {
    runtime.dispose();
  }
});
