import type { GamePack, KernelPort } from "../contracts";
import { WorkerRuntime, type WorkerCommand, type WorkerEvent } from "./worker";
import { wasmKernelPort, type WasmKernelBinding } from "./wasm-kernel";
import { colonyPack } from "../games/colony";
import { survivalPack } from "../games/survival";
import { formationsPack } from "../games/formations";
import * as generated from "../../generated/hive_kernel.js";

/** Install the thin browser Worker transport around an already initialized WASM kernel. */
export function installWorkerRuntime(scope: { onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null; postMessage(message: WorkerEvent): void }, kernel: KernelPort, packs: Readonly<Record<string, GamePack>>): WorkerRuntime {
  const runtime = new WorkerRuntime(kernel, packs, event => scope.postMessage(event));
  scope.onmessage = event => { void runtime.command(event.data).then(async () => {
    if (event.data.type === "start" || event.data.type === "reset" || event.data.type === "restore") scope.postMessage({ type: "frame", facts: kernel.renderFacts() });
  }); };
  return runtime;
}

/** Browser Worker entry. The generated binding is the only simulation implementation. */
export async function bootGeneratedWorker(scope: { onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null; postMessage(message: WorkerEvent): void }, binding: WasmKernelBinding): Promise<WorkerRuntime> {
  const kernel = wasmKernelPort(binding);
  return installWorkerRuntime(scope, kernel, { colony: colonyPack, survival: survivalPack, formations: formationsPack });
}

export async function bootBundledGeneratedWorker(scope: { onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null; postMessage(message: WorkerEvent): void }): Promise<WorkerRuntime> {
  const initializer = (generated as unknown as { initSync?: (input?: unknown) => void; default?: (input?: unknown) => Promise<unknown> }).initSync ?? (generated as unknown as { default?: (input?: unknown) => Promise<unknown> }).default;
  if (initializer) await initializer();
  const binding = new (generated as unknown as { WasmKernel: new () => WasmKernelBinding }).WasmKernel();
  return bootGeneratedWorker(scope, binding);
}
