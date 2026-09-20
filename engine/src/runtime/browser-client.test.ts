import { strict as assert } from "node:assert";
import { test } from "node:test";
import { connectBrowserRuntime } from "./browser-client";
import type { WorkerEvent, WorkerTransportEvent } from "./protocol";

class FakeWorker {
  private listener?: (event: MessageEvent<WorkerTransportEvent>) => void;
  posted: unknown[] = [];
  addEventListener(_type: string, listener: (event: MessageEvent<WorkerTransportEvent>) => void): void { this.listener = listener; }
  removeEventListener(): void { this.listener = undefined; }
  postMessage(value: unknown): void { this.posted.push(value); }
  terminate(): void { this.listener = undefined; }
  emit(value: WorkerTransportEvent): void { this.listener?.({ data: value } as MessageEvent<WorkerTransportEvent>); }
}

const frame = (epoch: number, terrain?: unknown): WorkerTransportEvent => ({
  type: "frame", time: 0, epoch, sequence: epoch + 1, facts: [], cues: [], terrain: terrain as never,
});
const baseline = {
  revision: 4, placementRevision: 4, verticalMetres: 0.5,
  baseline: { protocolVersion: 3, bounds: { minX: -8, maxX: 8, minY: -8, maxY: 8, minZ: -8, maxZ: 8 }, verticalMetres: 0.5,
    materials: [{ slot: 0, solid: false }, { slot: 1, solid: true }] },
  surfaces: [{ cell: [0, 2, 0], material: 1, generatedTop: 2 }],
  structureSurfaces: [{ cell: [0, 4, 0] }], water: [],
};

test("local terrain references hydrate geometry and replace it after an epoch", () => {
  const worker = new FakeWorker();
  const runtime = connectBrowserRuntime({ worker: worker as unknown as Worker });
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  worker.emit(frame(1, baseline));
  const first = events.at(-1);
  assert(first?.type === "frame" && first.terrain);
  worker.emit(frame(1, { revision: 4, placementRevision: 4, verticalMetres: 0.5, surfacesRevision: 4, water: [{ at: [0, 4, 0], level: 1, massKg: 1, liquidVolumeM3: 0.001 }] }));
  const reference = events.at(-1);
  assert(reference?.type === "frame" && reference.terrain);
  assert.equal(reference.terrain.surfaces, first.terrain.surfaces);
  assert.equal(reference.terrain.structureSurfaces, first.terrain.structureSurfaces);
  assert.notEqual(reference.terrain.water, first.terrain.water);
  worker.emit(frame(2, baseline));
  const replacement = events.at(-1);
  assert(replacement?.type === "frame" && replacement.terrain);
  assert.notEqual(replacement.terrain.surfaces, first.terrain.surfaces);
  runtime.dispose();
});

test("local material chunk reads allow one checked correlated request", async () => {
  const worker = new FakeWorker(); const runtime = connectBrowserRuntime({ worker: worker as unknown as Worker });
  const request = { requestId: 11, epoch: 2, terrainRevision: 4, chunks: [[0, 0, 0]] as const };
  const pending = runtime.terrainChunks(request);
  assert.deepEqual(worker.posted.at(-1), { type: "terrain-chunks", ...request });
  await assert.rejects(runtime.terrainChunks({ ...request, requestId: 12 }), /already in flight/);
  worker.emit({ type: "terrain-chunks", reply: { kind: "ready", requestId: 11, epoch: 2, terrainRevision: 4, chunks: [{
    key: [0, 0, 0], min: [0, 0, 0], max: [1, 2, 1], columns: [{ x: 0, z: 0, runs: [
      { minY: 0, maxY: 1, material: 1 }, { minY: 1, maxY: 2, material: 0 },
    ] }], surfaces: [{ cell: [0,0,0], material: 1, generatedTop: 0 }],
  }] } });
  assert.equal((await pending).kind, "ready"); runtime.dispose();
});

test("absent terrain clears local cache and malformed references become errors", () => {
  const worker = new FakeWorker();
  const runtime = connectBrowserRuntime({ worker: worker as unknown as Worker });
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  worker.emit(frame(1, baseline));
  worker.emit(frame(1, undefined));
  worker.emit(frame(1, { revision: 4, placementRevision: 4, verticalMetres: 0.5, surfacesRevision: 4, water: [] }));
  assert.equal(events.at(-1)?.type, "error");
  worker.emit(frame(3, baseline));
  worker.emit(frame(3, { revision: 4, placementRevision: 4, verticalMetres: 0.5, surfacesRevision: 4, water: [{ at: [0, 0, 0], level: 1, massKg: Infinity, liquidVolumeM3: 0 }] }));
  assert.equal(events.at(-1)?.type, "error");
  runtime.dispose();
});

test("local placement decisions are correlated and query failures stay advisory", async () => {
  const worker = new FakeWorker();
  const runtime = connectBrowserRuntime({ worker: worker as unknown as Worker });
  const candidate = { site: "site:a" as never, catalog: "floor" as never, target: { kind: "cell" as const, cell: { x: 0, y: 0, z: 0 }, orientation: "north" as const } };
  const first = runtime.placementDecisions({ party: "party" as never, candidates: [candidate] });
  const request = worker.posted.at(-1) as { requestId: number };
  worker.emit({ type: "placement-decisions", requestId: request.requestId, observationRevision: 3, nativeRevision: 4, placementRevision: 2, decisions: [{ site: candidate.site, status: "ready" }] });
  assert.equal((await first).decisions[0]?.status, "ready");
  const second = runtime.placementDecisions({ party: "party" as never, candidates: [candidate] });
  const rejected = worker.posted.at(-1) as { requestId: number };
  worker.emit({ type: "placement-decision-error", requestId: rejected.requestId, message: "unknown construction catalog" });
  await assert.rejects(second, /unknown construction catalog/);
  runtime.dispose();
});
