import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTerrainFrame } from "./terrain-wire";
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

test("remote observations forward a parsed terrain capability", async () => {
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
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "terrain-test" });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  socket.emit("message", { data: JSON.stringify({
    type: "observation",
    revision: 1,
    observation: {
      time: 0, paused: false, epoch: 0, sequence: 1, facts: [], cues: [],
      presentationFacts: [], presentationControls: [],
      terrain: { revision: 2, verticalMetres: 0.5, surfaces: [], water: [], ignored: true },
    },
  }) });
  const frame = events.find((event): event is Extract<WorkerEvent, { type: "frame" }> => event.type === "frame");
  assert.deepEqual(frame?.terrain, { revision: 2, verticalMetres: 0.5, surfaces: [], water: [] });
  runtime.dispose();
});

class TestSocket {
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(): void {}
  close(): void {}
  emit(type: string, event: { data?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
