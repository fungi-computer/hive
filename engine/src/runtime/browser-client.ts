import type { GameId } from "../contracts";
import type { PlacementDecisionQuery, PlacementDecisionResult, WorkerCommand, WorkerEvent, WorkerPlacementCommand, WorkerTerrainChunksCommand, WorkerTransportEvent } from "./protocol";
import { parseTerrainChunkReply, terrainChunkRequestSchema, type TerrainChunkReply, type TerrainChunkRequest } from "./terrain-chunks";
import { parseTerrainObservation, type TerrainWireFrame } from "./terrain-wire";
import { parsePlacementDecisionResult, placementDecisionQuerySchema } from "./placement-decision";

export interface RuntimeConnection {
  send(command: WorkerCommand): void;
  placementDecisions(query: PlacementDecisionQuery): Promise<PlacementDecisionResult>;
  terrainChunks(request: TerrainChunkRequest): Promise<TerrainChunkReply>;
  subscribe(listener: (event: WorkerEvent) => void): () => void;
  dispose(): void;
  /** Optional recovery control for transports that retain uncertain commands. */
  recovery?: { retry(): void };
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
  let requestSequence = 0;
  const placementRequests = new Map<number, { query: PlacementDecisionQuery; resolve(value: PlacementDecisionResult): void; reject(error: Error): void }>();
  const terrainRequests = new Map<number, { request: TerrainChunkRequest; resolve(value: TerrainChunkReply): void; reject(error: Error): void }>();
  const onMessage = (event: MessageEvent<WorkerTransportEvent>) => {
    if (disposed) return;
    if (event.data.type === "placement-decisions") {
      const pending = placementRequests.get(event.data.requestId);
      if (!pending) return;
      placementRequests.delete(event.data.requestId);
      try { pending.resolve(parsePlacementDecisionResult({
        observationRevision: event.data.observationRevision,
        nativeRevision: event.data.nativeRevision,
        placementRevision: event.data.placementRevision,
        decisions: event.data.decisions,
      }, pending.query)); }
      catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))); }
      return;
    }
    if (event.data.type === "terrain-chunks") {
      const pending = terrainRequests.get(event.data.reply.requestId);
      if (!pending) return;
      terrainRequests.delete(event.data.reply.requestId);
      try { pending.resolve(parseTerrainChunkReply(event.data.reply, pending.request)); }
      catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))); }
      return;
    }
    if (event.data.type === "placement-decision-error") {
      const pending = placementRequests.get(event.data.requestId);
      if (!pending) return;
      placementRequests.delete(event.data.requestId);
      pending.reject(new Error(event.data.message));
      return;
    }
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
  const placementDecisions = (query: PlacementDecisionQuery) => new Promise<PlacementDecisionResult>((resolve, reject) => {
    if (disposed) { reject(new Error("runtime connection disposed")); return; }
    const checked = placementDecisionQuerySchema.parse(query);
    if (placementRequests.size >= 8) { reject(new Error("too many placement decisions in flight")); return; }
    const requestId = ++requestSequence;
    placementRequests.set(requestId, { query: checked, resolve, reject });
    worker.postMessage({ type: "placement-decisions", requestId, ...checked } satisfies WorkerPlacementCommand);
  });
  const terrainChunks = (raw: TerrainChunkRequest) => new Promise<TerrainChunkReply>((resolve, reject) => {
    if (disposed) { reject(new Error("runtime connection disposed")); return; }
    const request = terrainChunkRequestSchema.parse(raw);
    if (terrainRequests.size >= 1) { reject(new Error("terrain chunk request already in flight")); return; }
    terrainRequests.set(request.requestId, { request, resolve, reject });
    worker.postMessage({ type: "terrain-chunks", ...request } satisfies WorkerTerrainChunksCommand);
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cachedTerrain = undefined;
    terrainEpoch = undefined;
    if (cadence !== undefined) clearInterval(cadence);
    worker.removeEventListener("message", onMessage);
    worker.terminate();
    for (const pending of placementRequests.values()) pending.reject(new Error("runtime connection disposed"));
    for (const pending of terrainRequests.values()) pending.reject(new Error("runtime connection disposed"));
    placementRequests.clear();
    terrainRequests.clear();
    listeners.clear();
  };
  return { send, placementDecisions, terrainChunks, subscribe, dispose };
}

export type GameSelection = Extract<GameId, string>;
