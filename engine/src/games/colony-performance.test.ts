import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { createColonyPerformancePack } from "./colony-performance";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as { initial: { id: string; components: Record<string, unknown> }[]; game: string };

test("performance presets are deterministic and keep a fixed 50-tree workload", () => {
  for (const size of [64, 128, 256, 512] as const) {
    const a = createColonyPerformancePack(size, 200), b = createColonyPerformancePack(size, 200);
    assert.deepEqual([...a.definition], [...b.definition]);
    const scene = decode(a.definition);
    assert.equal(scene.game, `colony-performance-${size}-200`);
    assert.equal(a.id, scene.game);
    assert.equal(scene.initial.filter(record => record.components["colony.worker"]).length, 200);
    assert.equal(scene.initial.filter(record => record.components["colony.tree"]).length, 50);
    assert.deepEqual(a.presentationWindow, { minX: -32, maxX: 32, minZ: -32, maxZ: 32 });
  }
});

test("performance world bounds vary while the presentation window stays bounded", () => {
  const bounds = [64, 128, 256, 512].map(size => {
    const environment = JSON.parse(new TextDecoder().decode(createColonyPerformancePack(size as 64 | 128 | 256 | 512, 4).environmentDefinition!)) as { world: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } } };
    return [environment.world.bounds.maxX - environment.world.bounds.minX, environment.world.bounds.maxZ - environment.world.bounds.minZ];
  });
  assert.deepEqual(bounds, [[64, 64], [128, 128], [256, 256], [512, 512]]);
});

test("performance actors and trees occupy distinct generated columns", () => {
  const pack = createColonyPerformancePack(64, 200);
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition!)) as {
    initialPlacements: Array<{ entity: string; column: [number, number] }>;
  };
  assert.equal(new Set(environment.initialPlacements.map(row => row.column.join(","))).size, environment.initialPlacements.length);
});

test("largest sparse-world preset starts and advances the real Colony systems", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: createColonyPerformancePack(512, 200) });
  try {
    session.start();
    session.step(0.1);
    assert.equal(session.renderFacts().filter(fact => fact.visual === "colony.rowan" || fact.visual === "colony.sedge").length, 200);
  } finally {
    port.dispose();
  }
});

test("32 and 100 worker presets sustain multiple real Colony steps", () => {
  for (const workerCount of [32, 100] as const) {
    const port = wasmKernelPort(new WasmKernel());
    const session = new GameSession({ port, pack: createColonyPerformancePack(128, workerCount) });
    try {
      session.start();
      for (let tick = 0; tick < 3; tick++) session.step(0.1);
      assert.equal(session.renderFacts().filter(fact => fact.visual === "colony.rowan" || fact.visual === "colony.sedge").length, workerCount);
    } finally {
      port.dispose();
    }
  }
});
