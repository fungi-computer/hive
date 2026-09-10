import type { GameId } from "../contracts";
import type { WorkerCommand, WorkerEvent } from "./worker";

export interface RuntimeConnection {
  send(command: WorkerCommand): void;
  subscribe(listener: (event: WorkerEvent) => void): () => void;
  dispose(): void;
}
export interface BrowserConnectionOptions { readonly worker?: Worker; readonly workerUrl?: URL; readonly cadenceMs?: number }

/** Client-side transport. It owns no simulation state and never fabricates frames. */
export function connectBrowserRuntime(options: BrowserConnectionOptions = {}): RuntimeConnection {
  const worker = options.worker ?? new Worker(options.workerUrl ?? new URL("./worker-entry.ts", import.meta.url), { type: "module" });
  const listeners = new Set<(event: WorkerEvent) => void>();
  let disposed = false;
  let stepping = false;
  let cadence: ReturnType<typeof setInterval> | undefined;
  const onMessage = (event: MessageEvent<WorkerEvent>) => { if (!disposed) { if (event.data.type === "results" || event.data.type === "error") stepping = false; for (const listener of listeners) listener(event.data); } };
  worker.addEventListener("message", onMessage);
  const send = (command: WorkerCommand) => { if (disposed) throw new Error("runtime connection disposed"); worker.postMessage(command); };
  const startCadence = (delta: number) => {
    if (cadence !== undefined) clearInterval(cadence);
    const bounded = Math.min(1000, Math.max(16, Math.round(delta * 1000)));
    cadence = setInterval(() => { if (!disposed && !stepping) { stepping = true; send({ type: "step", delta: bounded / 1000 }); } }, bounded);
  };
  const subscribe = (listener: (event: WorkerEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); };
  const dispose = () => { if (disposed) return; disposed = true; if (cadence !== undefined) clearInterval(cadence); worker.removeEventListener("message", onMessage); worker.terminate(); listeners.clear(); };
  return { send(command) { send(command); if (command.type === "start") startCadence(1 / 30); else if (command.type === "pause") { if (cadence !== undefined) clearInterval(cadence); cadence = undefined; } else if (command.type === "resume") startCadence(1 / 30); }, subscribe, dispose };
}

export type GameSelection = Extract<GameId, string>;
