import type { GamePack, KernelPort } from "../contracts";
import { WorkerRuntime, type WorkerCommand, type WorkerEvent } from "./worker";
import { wasmKernelPort, type WasmKernelBinding } from "./wasm-kernel";
import { piratesPack } from "../games/pirates";
import { colonyPack } from "../games/colony";
import { survivalPack } from "../games/survival";
import { formationsPack } from "../games/formations";
import * as generated from "../../generated/hive_kernel.js";

/** Install the thin browser Worker transport around an already initialized WASM kernel. */
export function installWorkerRuntime(
  scope: {
    onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
    postMessage(message: WorkerEvent): void;
  },
  kernel: KernelPort,
  packs: Readonly<Record<string, GamePack>>,
): WorkerRuntime {
  const runtime = new WorkerRuntime(kernel, packs, (event) =>
    scope.postMessage(event),
  );
  scope.onmessage = (event) => runtime.command(event.data);
  return runtime;
}

/** Browser Worker entry. The generated binding is the only simulation implementation. */
export async function bootGeneratedWorker(
  scope: {
    onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
    postMessage(message: WorkerEvent): void;
  },
  binding: WasmKernelBinding,
): Promise<WorkerRuntime> {
  const kernel = wasmKernelPort(binding);
  return installWorkerRuntime(scope, kernel, {
    pirates: piratesPack,
    colony: colonyPack,
    survival: survivalPack,
    formations: formationsPack,
  });
}

export async function bootBundledGeneratedWorker(scope: {
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
  postMessage(message: WorkerEvent): void;
}): Promise<WorkerRuntime> {
  await generated.default();
  const binding = new (
    generated as unknown as { WasmKernel: new () => WasmKernelBinding }
  ).WasmKernel();
  return bootGeneratedWorker(scope, binding);
}

// This module is the browser Worker entry, not a second simulation host.
const early: MessageEvent<WorkerCommand>[] = [];
self.onmessage = (event) => {
  if (early.length >= 128) {
    self.postMessage({ type: "error", message: "worker startup queue full" });
    return;
  }
  early.push(event);
};
void bootBundledGeneratedWorker(self)
  .then(() => {
    for (const event of early) self.onmessage?.call(self, event);
    early.length = 0;
  })
  .catch((error) =>
    self.postMessage({ type: "error", message: String(error) }),
  );
