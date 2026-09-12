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
  revision: 4, verticalMetres: 0.5,
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
  worker.emit(frame(1, { revision: 4, verticalMetres: 0.5, surfacesRevision: 4, water: [{ at: [0, 4, 0], massKg: 1, liquidVolumeM3: 0.001 }] }));
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

test("absent terrain clears local cache and malformed references become errors", () => {
  const worker = new FakeWorker();
  const runtime = connectBrowserRuntime({ worker: worker as unknown as Worker });
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  worker.emit(frame(1, baseline));
  worker.emit(frame(1, undefined));
  worker.emit(frame(1, { revision: 4, verticalMetres: 0.5, surfacesRevision: 4, water: [] }));
  assert.equal(events.at(-1)?.type, "error");
  worker.emit(frame(3, baseline));
  worker.emit(frame(3, { revision: 4, verticalMetres: 0.5, surfacesRevision: 4, water: [{ at: [0, 0, 0], massKg: Infinity, liquidVolumeM3: 0 }] }));
  assert.equal(events.at(-1)?.type, "error");
  runtime.dispose();
});
