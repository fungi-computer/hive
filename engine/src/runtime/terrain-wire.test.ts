import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTerrainFrame, parseTerrainObservation, terrainWireForRevision } from "./terrain-wire";
import { connectRemoteRuntime } from "./remote-client";
import type { WorkerEvent } from "./protocol";

test("terrain wire parser bounds and sanitizes an optional frame", () => {
  const frame = parseTerrainFrame({
    revision: 4,
    verticalMetres: 0.54,
    surfaces: [{ cell: [2, 8, -3], material: 1, ignored: { unbounded: true } }],
    water: [{ at: [2, 9, -3], massKg: 2, liquidVolumeM3: 0.002, extra: [1, 2, 3] }],
  });
  assert.deepEqual(frame, {
    revision: 4,
    verticalMetres: 0.54,
    surfaces: [{ cell: [2, 8, -3], material: 1 }],
    water: [{ at: [2, 9, -3], massKg: 2, liquidVolumeM3: 0.002 }],
  });
  assert.equal(parseTerrainFrame(undefined), undefined);
  assert.throws(() => parseTerrainFrame({
    revision: 0, verticalMetres: 1, surfaces: Array.from({ length: 4097 }, () => null), water: [],
  }), /invalid terrain observation/);
  assert.throws(() => parseTerrainFrame({
    revision: 0, verticalMetres: 1, surfaces: [], water: [{ at: [0, 0, 0], massKg: Infinity, liquidVolumeM3: 0 }],
  }), /invalid terrain observation/);
});

test("terrain surface references retain only a connection's baseline surfaces", () => {
  const baseline = parseTerrainFrame({
    revision: 7,
    verticalMetres: 0.5,
    surfaces: [{ cell: [1, 2, 3], material: 4 }],
    water: [],
  });
  assert(baseline);
  const wire = terrainWireForRevision(baseline, baseline.revision);
  assert.deepEqual(wire, {
    revision: 7,
    verticalMetres: 0.5,
    surfacesRevision: 7,
    water: [],
  });
  assert.deepEqual(parseTerrainObservation({
    ...wire,
    water: [{ at: [1, 3, 3], massKg: 1, liquidVolumeM3: 0.001 }],
  }, baseline), {
    revision: 7,
    verticalMetres: 0.5,
    surfaces: [{ cell: [1, 2, 3], material: 4 }],
    water: [{ at: [1, 3, 3], massKg: 1, liquidVolumeM3: 0.001 }],
  });
  assert.throws(() => parseTerrainObservation(wire, undefined), /surface reference is unavailable/);
  assert.throws(() => parseTerrainObservation({ ...wire, surfacesRevision: 8 }, baseline), /surface reference is unavailable/);
  assert.throws(() => parseTerrainObservation({ ...wire, verticalMetres: 0.51 }, baseline), /surface reference is unavailable/);
});

test("remote observations forward a parsed terrain capability", async (t) => {
  const socket = new TestSocket();
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/runtime",
    game: "terrain-test",
    token: "token",
    fetch: async () => Response.json({ handle: "h" }),
    createSocket: () => {
      queueMicrotask(() => socket.emit("open", {}));
      return socket;
    },
  });
  t.after(() => runtime.dispose());
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "terrain-test" });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 1,
    observation: {
      time: 0, paused: false, epoch: 0, sequence: 1, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 2, verticalMetres: 0.5, surfaces: [{ cell: [1, 2, 3], material: 4 }], water: [], ignored: true },
    },
  }) });
  const frame = events.find((event): event is Extract<WorkerEvent, { type: "frame" }> => event.type === "frame");
  assert.deepEqual(frame?.terrain, { revision: 2, verticalMetres: 0.5, surfaces: [{ cell: [1, 2, 3], material: 4 }], water: [] });
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 2,
    observation: {
      time: 1, paused: false, epoch: 0, sequence: 2, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 2, verticalMetres: 0.5, surfacesRevision: 2, water: [
        { at: [0, 1, 0], massKg: 1, liquidVolumeM3: 0.001 },
      ] },
    },
  }) });
  const hydrated = events.filter((event): event is Extract<WorkerEvent, { type: "frame" }> => event.type === "frame").at(-1);
  assert.deepEqual(hydrated?.terrain, {
    revision: 2,
    verticalMetres: 0.5,
    surfaces: [{ cell: [1, 2, 3], material: 4 }],
    water: [{ at: [0, 1, 0], massKg: 1, liquidVolumeM3: 0.001 }],
  });
  // Reconnect receives a complete baseline at the same committed revision.
  // It is stale for presentation, but must repopulate the new connection cache.
  socket.emit("open", {});
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 1,
    observation: {
      time: 1, paused: false, epoch: 0, sequence: 1, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 1, verticalMetres: 0.5, surfaces: [{ cell: [9, 9, 9], material: 9 }], water: [] },
    },
  }) });
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 3,
    observation: {
      time: 3, paused: false, epoch: 0, sequence: 4, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 1, verticalMetres: 0.5, surfacesRevision: 1, water: [] },
    },
  }) });
  assert.equal(socket.reconnectCalls, 1);
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 2,
    observation: {
      time: 2, paused: false, epoch: 0, sequence: 3, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 2, verticalMetres: 0.5, surfaces: [{ cell: [1, 2, 3], material: 4 }], water: [] },
    },
  }) });
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 3,
    observation: {
      time: 3, paused: false, epoch: 0, sequence: 4, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 2, verticalMetres: 0.5, surfacesRevision: 2, water: [] },
    },
  }) });
  const afterReconnect = events.filter((event): event is Extract<WorkerEvent, { type: "frame" }> => event.type === "frame").at(-1);
  assert.deepEqual(afterReconnect?.terrain, {
    revision: 2,
    verticalMetres: 0.5,
    surfaces: [{ cell: [1, 2, 3], material: 4 }],
    water: [],
  });
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 4,
    observation: {
      time: 4, paused: false, epoch: 0, sequence: 5, facts: [], cues: [],
      presentationFacts: [], presentationControls: [], terrainMarks: [],
      terrain: { revision: 99, verticalMetres: 0.5, surfacesRevision: 99, water: [] },
    },
  }) });
  assert.equal(socket.reconnectCalls, 2);
  runtime.dispose();
});

class TestSocket {
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  reconnectCalls = 0;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(): void {}
  close(): void {}
  reconnect(): void { this.reconnectCalls += 1; }
  emit(type: string, event: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
