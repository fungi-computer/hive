import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { FiniteResource, MaterialLot } from "../sdk/common";
import { Worker } from "./colony-components";
import { ColonyTree } from "./colony-work";
import { WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";
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

function elapsedMs(run: () => void): number {
  const start = process.hrtime.bigint();
  run();
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

test("sustained Colony workloads measure simulation, save, and observations", () => {
  for (const workerCount of [32, 100] as const) {
    const port = wasmKernelPort(new WasmKernel());
    const session = new GameSession({ port, pack: createColonyPerformancePack(128, workerCount) });
    const stepMs: number[] = [], saveMs: number[] = [], observationMs: number[] = [];
    let recoveryError: string | undefined;
    try {
      session.start();
      const workers = () => session.query(query(Worker));
      const pailWorkers = () => {
        const workerIds = new Set(workers().map(row => row.id));
        return session.query(query(MaterialLot)).filter(row => {
          const lot = row.get(MaterialLot);
          return lot.kind === "pail" && workerIds.has(lot.container);
        }).length;
      };
      const eligiblePails = pailWorkers();
      if (eligiblePails > 16) {
        for (let index = 0; index < eligiblePails; index++)
          session.command("requestWater", {});
      }
      for (let tick = 0; tick < 90; tick++) {
        try {
          stepMs.push(elapsedMs(() => session.step(1)));
          saveMs.push(elapsedMs(() => JSON.stringify(session.save())));
          observationMs.push(elapsedMs(() => session.whistleObservation({ query: spec => session.query(spec) })));
        } catch (error) {
          recoveryError = `tick ${tick}: ${error instanceof Error ? error.message : String(error)}`;
          break;
        }
      }
      assert.equal(recoveryError, undefined, `sustained workload threw during step/save/observation: ${recoveryError}`);
      assert.equal(workers().length, workerCount, "all performance actors remain retained");
      const completedTrees = session.query(query(ColonyTree)).filter(row => row.get(ColonyTree).phase !== "standing").length;
      const woodRemaining = session.query(query(FiniteResource)).filter(row => row.get(FiniteResource).kind === "wood").reduce((sum, row) => sum + row.get(FiniteResource).quantity, 0);
      assert.ok(completedTrees > 0 || woodRemaining < 300, "sustained workload must complete productive tree work");
      const waterDemand = session.query(query(WaterSupplyOrder, WaterSupplyWork));
      if (eligiblePails > 16) assert.ok(waterDemand.length > 16, "active water workload must exceed sixteen pail workers");
      console.log(JSON.stringify({
        workload: `colony-performance-${workerCount}`,
        workers: workers().length,
        productiveTrees: completedTrees,
        eligiblePailWorkers: eligiblePails,
        waterDemandCount: waterDemand.length,
        waterWorkload: eligiblePails > 16 ? "active" : "unsupported-by-pack",
        steps: stepMs.length,
        stepMs: { total: stepMs.reduce((a, b) => a + b, 0), max: Math.max(...stepMs) },
        snapshotSaveMs: { total: saveMs.reduce((a, b) => a + b, 0), max: Math.max(...saveMs) },
        observationMs: { total: observationMs.reduce((a, b) => a + b, 0), max: Math.max(...observationMs) },
        recoveryError: recoveryError ?? null,
      }));
    } finally {
      port.dispose();
    }
  }
});
