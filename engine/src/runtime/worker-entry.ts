import type { GamePack, KernelPort } from "../contracts";
import { WorkerRuntime, type WorkerCommand, type WorkerEvent } from "./worker";

/** Install the thin browser Worker transport around an already initialized WASM kernel. */
export function installWorkerRuntime(scope: { onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null; postMessage(message: WorkerEvent): void }, kernel: KernelPort, packs: Readonly<Record<string, GamePack>>): WorkerRuntime {
  const runtime = new WorkerRuntime(kernel, packs, event => scope.postMessage(event));
  scope.onmessage = event => { void runtime.command(event.data); };
  return runtime;
}
