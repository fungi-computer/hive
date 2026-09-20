import { terrainRegionRequestSchema, type TerrainRegionEvent, type TerrainRegionRead, type TerrainRegionRequest } from "./terrain-regions";

/** One disposable read request, shared by Worker and DO hosts. A yield between
 * regions admits commands/cancellation; no client acknowledgement gates delivery.
 * The host reads each region against committed authority and owns socket auth. */
export function startTerrainRegionStream(
  raw: TerrainRegionRequest,
  read: (region: [number, number]) => TerrainRegionRead | Promise<TerrainRegionRead>,
  deliver: (event: TerrainRegionEvent) => void,
  yieldWork: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0)),
) {
  const request = terrainRegionRequestSchema.parse(raw);
  const identity = { requestId: request.requestId, epoch: request.epoch,
    terrainRevision: request.terrainRevision, level: request.level };
  let canceled = false;
  const done = (async () => {
    // Let the caller install its cancellation handle before the first delivery.
    await Promise.resolve();
    try {
      for (const region of request.regions) {
        if (canceled) return;
        const event = await read(region);
        if (canceled) return;
        deliver(event);
        if (event.kind !== "patch") return;
        await yieldWork();
      }
      if (!canceled) deliver({ kind: "complete", ...identity });
    } catch (error) {
      if (!canceled) {
        try { deliver({ kind: "unavailable", ...identity,
          reason: (error instanceof Error ? error.message : String(error)).slice(0, 256) || "terrain region stream failed" }); }
        catch { /* A closed receiver no longer owns this disposable request. */ }
      }
    }
  })();
  return Object.freeze({ requestId: request.requestId, done, cancel() { canceled = true; } });
}
