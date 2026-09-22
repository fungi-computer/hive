import { parseTerrainRegionEvent, terrainRegionRequestSchema, type TerrainRegionEvent, type TerrainRegionRequest, type TerrainRegionPatch } from "./terrain-regions";
import type { WorkerTerrainRegionsCommand } from "./protocol";

/** One client terrain read, with checked incremental delivery and disposable
 * reconnect state. Worker and WebSocket transports share the same lifecycle. */
export function createTerrainRegionClient(send: (command: WorkerTerrainRegionsCommand) => void,
  { connected: initiallyConnected = true, idleMs = 15_000 } = {}) {
  type Pending = { request: TerrainRegionRequest; receive: (event: TerrainRegionEvent) => void;
    seen: Map<string, TerrainRegionPatch>; received: number; timer?: ReturnType<typeof setTimeout> };
  let pending: Pending | undefined, connected = initiallyConnected, disposed = false;
  const identity = (request: TerrainRegionRequest) => ({ requestId: request.requestId,
    epoch: request.epoch, terrainRevision: request.terrainRevision });
  function cancel(current: Pending) {
    if (pending !== current) return;
    pending = undefined;
    clearTimeout(current.timer);
    if (connected) { try { send({ type: "terrain-cancel", requestId: current.request.requestId }); } catch {} }
  }
  function fail(current: Pending, reason: string) {
    cancel(current);
    current.receive({ kind: "unavailable", ...identity(current.request), reason: reason.slice(0, 256) });
  }
  function arm(current: Pending) {
    clearTimeout(current.timer);
    current.timer = setTimeout(() => { if (pending === current) fail(current, "terrain stream timed out"); }, idleMs);
  }
  function dispatch(current: Pending) {
    // Resume only missing complete patches after socket reauthentication.
    const regions = current.request.regions.filter(region => !current.seen.has(region.join(",")));
    if (!regions.length) {
      cancel(current);
      current.receive({ kind: "complete", ...identity(current.request) });
      return;
    }
    try { current.received = 0; send({ type: "terrain-regions", ...current.request, regions }); arm(current); }
    catch (error) { fail(current, error instanceof Error ? error.message : String(error)); }
  }
  return Object.freeze({
    request(raw: TerrainRegionRequest, receive: (event: TerrainRegionEvent) => void) {
      if (disposed) throw new Error("terrain connection disposed");
      const request = terrainRegionRequestSchema.parse(raw);
      if (pending) cancel(pending);
      const current: Pending = { request, receive, seen: new Map(), received: 0 };
      pending = current;
      if (connected) dispatch(current); else arm(current);
      return () => cancel(current);
    },
    accept(value: unknown) {
      const current = pending;
      if (!current || !value || typeof value !== "object" ||
        (value as { requestId?: unknown }).requestId !== current.request.requestId) return;
      let event: TerrainRegionEvent;
      try {
        event = parseTerrainRegionEvent(value, current.request);
        if (event.kind === "complete" && current.seen.size !== current.request.regions.length)
          throw new Error("incomplete terrain region stream");
      } catch (error) { fail(current, error instanceof Error ? error.message : String(error)); return; }
      if (event.kind === "patch") {
        const id = event.patch.key.join(",");
        const previous = current.seen.get(id);
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(event.patch)) fail(current, "conflicting duplicate terrain region");
          return;
        }
        arm(current);
        current.seen.set(id, event.patch);
        current.received++;
      } else { pending = undefined; clearTimeout(current.timer); }
      current.receive(event);
      // Keep a bounded pipeline, acknowledging accepted patches in groups rather
      // than making each region wait for a round trip. Reconnect starts a new count.
      if (event.kind === "patch" && pending === current && connected && current.received % 4 === 0) {
        try { send({ type: "terrain-credit", requestId: current.request.requestId, received: current.received }); }
        catch (error) { fail(current, error instanceof Error ? error.message : String(error)); }
      }
    },
    setConnected(next: boolean) {
      if (disposed || connected === next) return;
      connected = next;
      if (pending) {
        if (next) dispatch(pending);
        else arm(pending);
      }
    },
    dispose() {
      if (pending) cancel(pending);
      disposed = true; connected = false;
    },
  });
}
