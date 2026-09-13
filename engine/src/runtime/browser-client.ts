import type { GameId } from "../contracts";
import type { WorkerCommand, WorkerEvent, WorkerTransportEvent } from "./protocol";
import { parseTerrainObservation, type TerrainWireFrame } from "./terrain-wire";

export interface RuntimeConnection {
  send(command: WorkerCommand): void;
  submit(command: Extract<WorkerCommand, { type: "command" }>): Promise<RuntimeCommandReceipt>;
  subscribe(listener: (event: WorkerEvent) => void): () => void;
  dispose(): void;
  /** Optional recovery control for transports that retain uncertain commands. */
  recovery?: { retry(): void };
}

/** The transport result for accepted intent. Physical work may still be pending. */
export type RuntimeCommandReceipt =
  | Readonly<{
      status: "applied";
      revision?: number;
      result: Readonly<{ results: readonly unknown[] }>;
    }>
  | Readonly<{
      status: "rejected";
      reason: string;
      result?: unknown;
    }>;
export interface BrowserConnectionOptions {
  readonly worker?: Worker;
}

/** Client-side transport. It owns no simulation state and never fabricates frames. */
export function connectBrowserRuntime(
  options: BrowserConnectionOptions = {},
): RuntimeConnection {
  const worker =
    options.worker ??
    new Worker(new URL("./worker-entry.ts", import.meta.url), {
      type: "module",
    });
  const listeners = new Set<(event: WorkerEvent) => void>();
  let disposed = false;
  let stepping = false;
  let invocation = 0;
  const pending = new Map<string, {
    resolve: (value: RuntimeCommandReceipt) => void;
    reject: (error: unknown) => void;
  }>();
  let terrainEpoch: number | undefined;
  let cachedTerrain: TerrainWireFrame | undefined;
  let cadence: ReturnType<typeof setInterval> | undefined;
  const onMessage = (event: MessageEvent<WorkerTransportEvent>) => {
    if (disposed) return;
    if (event.data.type === "results" || event.data.type === "error")
      stepping = false;
    if (event.data.type === "results" && event.data.invocationId) {
      const waiter = pending.get(event.data.invocationId);
      if (waiter) { pending.delete(event.data.invocationId); waiter.resolve({ status: "applied", result: { results: event.data.results } }); }
    }
    if (event.data.type === "error" && event.data.invocationId) {
      const waiter = pending.get(event.data.invocationId);
      if (waiter) { pending.delete(event.data.invocationId); waiter.reject(new Error(event.data.message)); }
    }
    if (event.data.type === "state") {
      if (cadence !== undefined) clearInterval(cadence);
      cadence = undefined;
      if (!event.data.paused) startCadence(1 / 30);
    }
    let delivered: WorkerEvent;
    if (event.data.type !== "frame") delivered = event.data;
    else {
      try {
        if (terrainEpoch !== undefined && event.data.epoch !== terrainEpoch) cachedTerrain = undefined;
        terrainEpoch = event.data.epoch;
        const terrain = parseTerrainObservation(event.data.terrain, cachedTerrain);
        if (terrain !== undefined) cachedTerrain = terrain;
        else cachedTerrain = undefined;
        delivered = { ...event.data, terrain };
      } catch (error) {
        delivered = { type: "error", message: error instanceof Error ? error.message : String(error) };
      }
    }
    for (const listener of listeners) listener(delivered);
  };
  worker.addEventListener("message", onMessage);
  const send = (command: WorkerCommand) => {
    if (disposed) throw new Error("runtime connection disposed");
    worker.postMessage(command);
  };
  const submit = (command: Extract<WorkerCommand, { type: "command" }>) => {
    if (disposed) return Promise.reject(new Error("runtime connection disposed"));
    const invocationId = `browser-${++invocation}`;
    return new Promise<RuntimeCommandReceipt>((resolve, reject) => {
      pending.set(invocationId, { resolve, reject });
      try { send({ ...command, invocationId }); } catch (error) { pending.delete(invocationId); reject(error); }
    });
  };
  const startCadence = (delta: number) => {
    if (cadence !== undefined) clearInterval(cadence);
    const bounded = Math.min(1000, Math.max(16, Math.round(delta * 1000)));
    cadence = setInterval(() => {
      if (!disposed && !stepping) {
        stepping = true;
        send({ type: "step", delta: bounded / 1000 });
      }
    }, bounded);
  };
  const subscribe = (listener: (event: WorkerEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cachedTerrain = undefined;
    terrainEpoch = undefined;
    if (cadence !== undefined) clearInterval(cadence);
    worker.removeEventListener("message", onMessage);
    worker.terminate();
    listeners.clear();
    for (const waiter of pending.values()) waiter.reject(new Error("runtime connection disposed"));
    pending.clear();
  };
  return { send, submit, subscribe, dispose };
}

export type GameSelection = Extract<GameId, string>;
