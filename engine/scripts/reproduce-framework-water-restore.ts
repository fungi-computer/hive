/** Minimal public-command reproduction of v2's failed water recovery check.
 * No cohort timing, smoke, hauling or record-format changes are needed. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session";
import { wasmKernelPort } from "../src/runtime/wasm-kernel";
import { createColonyPerformancePack } from "../src/games/colony-performance";

const wasm = readFileSync("engine/generated/hive_kernel_bg.wasm");
initSync({ module: wasm });
const pack = createColonyPerformancePack(64, 4);
const port = wasmKernelPort(new WasmKernel()), restoredPort = wasmKernelPort(new WasmKernel());
try {
  const session = new GameSession({ port, pack });
  session.start();
  session.step(.1);
  session.command("requestWater", {});
  session.step(.1);
  const snapshot = session.save();
  console.log(JSON.stringify({ fixture: pack.id, wasmSha256: createHash("sha256").update(wasm).digest("hex"), command: "requestWater", outcomes: snapshot.outcomes, kernelVersion: snapshot.kernel.version }));
  try {
    new GameSession({ port: restoredPort, pack }).restore(snapshot);
    console.log("water request restored successfully");
  } catch (failure) {
    console.error(failure instanceof Error ? failure.stack : new Error(String(failure)).stack);
    process.exitCode = 1;
  }
} finally { port.dispose(); restoredPort.dispose(); }
