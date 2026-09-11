import type { GameId } from "../contracts";
import type { WorkerCommand, WorkerEvent, WorkerTransportEvent } from "./protocol";
import { parseTerrainObservation, type TerrainWireFrame } from "./terrain-wire";

export interface RuntimeConnection {
  send(command: WorkerCommand): void;
  subscribe(listener: (event: WorkerEvent) => void): () => void;
  dispose(): void;
}
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
  let terrainEpoch: number | undefined;
  let cachedTerrain: TerrainWireFrame | undefined;
  let cadence: ReturnType<typeof setInterval> | undefined;
  const onMessage = (event: MessageEvent<WorkerTransportEvent>) => {
    if (disposed) return;
    if (event.data.type === "results" || event.data.type === "error")
      stepping = false;
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
        delivered = { ...event.data, ...(terrain === undefined ? {} : { terrain }) };
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
  };
  return { send, subscribe, dispose };
}

export type GameSelection = Extract<GameId, string>;
