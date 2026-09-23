import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { buildObservation } from "../runtime/observation";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { FiniteResource, MaterialLot } from "../sdk/common";
import { Worker } from "./colony-components";
import { ColonyTree } from "./colony-work";
import { FieldWaterWork } from "../sdk/process-supply";
import { createColonyFrameworkProofPack, createColonyPerformancePack } from "./colony-performance";
import { treeJob } from "./colony";
import type { GamePack } from "../contracts";

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

test("versioned framework workload occupies distant parts of one Region with 128 real jobs", () => {
  const pack = createColonyFrameworkProofPack();
  const again = createColonyFrameworkProofPack();
  assert.deepEqual([...pack.definition], [...again.definition]);
  const definition = decode(pack.definition);
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition!)) as {
    world: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } };
    initialPlacements: Array<{ entity: string; column: [number, number] }>;
  };
  assert.equal(definition.game, pack.id);
  assert.equal(environment.world.bounds.maxX - environment.world.bounds.minX, 256);
  assert.equal(definition.initial.filter(row => row.components["colony.worker"]).length, 100);
  assert.equal(definition.initial.filter(row => row.components["colony.tree"]).length, 128);
  assert.equal(pack.initialActions?.filter(action => action.kind === "create-job").length, 128);
  const columns = environment.initialPlacements.map(row => row.column);
  assert.equal(new Set(columns.map(column => column.join(","))).size, columns.length);
  const active = environment.initialPlacements.filter(row => row.entity.startsWith("colony.worker.") || row.entity.startsWith("party:1.person.") || row.entity.startsWith("colony.tree."));
  assert.ok(Math.min(...active.map(row => row.column[0])) < -80);
  assert.ok(Math.max(...active.map(row => row.column[0])) > 80);
  assert.ok(Math.min(...active.map(row => row.column[1])) < -80);
  assert.ok(Math.max(...active.map(row => row.column[1])) > 80);
});

test("distributed framework workload gives 100 workers distinct native work attempts", () => {
  const port = wasmKernelPort(new WasmKernel());
  const pack = createColonyFrameworkProofPack();
  const session = new GameSession({ port, pack });
  try {
    session.start();
    for (let tick = 0; tick < 30; tick++) session.step(.1);
    const tasks = decode(pack.definition).initial.filter(row => row.components["colony.tree"])
      .map(row => `${treeJob(row.id as import("../contracts").EntityId)}:task:fell` as import("../contracts").EntityId);
    const attempts = tasks.flatMap((_, offset) => offset % 64 === 0 ? session.workAttempts(tasks.slice(offset, offset + 64)) : []);
    const executing = attempts.filter(attempt => attempt.phase.kind === "executing");
    assert.equal(new Set(executing.map(attempt => attempt.worker)).size, 100);
    assert.equal(executing.length, 100);
  } finally {
    port.dispose();
  }
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

function performancePackWithPails(workerCount: 32 | 100): GamePack {
  const pack = createColonyPerformancePack(128, workerCount);
  const definition = decode(pack.definition);
  const workers = definition.initial.filter(record => record.components[Worker.id]).map(record => record.id);
  const pailHolders = new Set(definition.initial
    .map(record => record.components[MaterialLot.id] as { kind?: string; container?: string } | undefined)
    .filter(lot => lot?.kind === "pail")
    .map(lot => lot!.container));
  for (const [index, worker] of workers.entries()) {
    if (pailHolders.has(worker)) continue;
    definition.initial.push(
      { id: `${worker}.pail`, components: {
        "hive.lot": { quantity: 1, kind: "pail", container: worker },
        "hive.container": { capacity: 7 },
        "hive.vessel-capability": { acceptsWater: true },
        "hive.owned-by-party": { party: "party:1" },
        "hive.visual": { sprite: "pail", label: `Pail ${index + 1}` },
      } },
    );
  }
  return {
    ...pack,
    definition: new TextEncoder().encode(JSON.stringify(definition)),
  };
}

function elapsedMs(run: () => void): number {
  const start = process.hrtime.bigint();
  run();
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function timingSummary(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    total: values.reduce((sum, value) => sum + value, 0),
    median: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? 0,
  };
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
      for (let tick = 0; tick < 90; tick++) {
        try {
          stepMs.push(elapsedMs(() => session.step(1)));
          saveMs.push(elapsedMs(() => JSON.stringify(session.save())));
          observationMs.push(elapsedMs(() => buildObservation(session, { epoch: 0, sequence: tick + 1 })));
        } catch (error) {
          recoveryError = `tick ${tick}: ${error instanceof Error ? error.message : String(error)}`;
          break;
        }
      }
      assert.equal(recoveryError, undefined, `sustained workload threw during step/save/observation: ${recoveryError}`);
      assert.equal(workers().length, workerCount, "all performance actors remain retained");
      const completedTrees = session.query(query(ColonyTree, FiniteResource)).filter(row => row.get(FiniteResource).quantity === 0).length;
      const woodRemaining = session.query(query(FiniteResource)).filter(row => row.get(FiniteResource).kind === "wood").reduce((sum, row) => sum + row.get(FiniteResource).quantity, 0);
      assert.ok(completedTrees > 0 || woodRemaining < 300, "sustained workload must complete productive tree work");
      console.log(JSON.stringify({
        workload: `colony-performance-${workerCount}`,
        workers: workers().length,
        productiveTrees: completedTrees,
        eligiblePailWorkers: eligiblePails,
        steps: stepMs.length,
        stepMs: timingSummary(stepMs),
        snapshotSaveMs: timingSummary(saveMs),
        observationMs: timingSummary(observationMs),
        recoveryError: recoveryError ?? null,
      }));
    } finally {
      port.dispose();
    }
  }
});

test("200-worker Colony stress keeps productive native work and measures each boundary", () => {
  const workerCount = 200 as const;
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: createColonyPerformancePack(128, workerCount) });
  const stepMs: number[] = [], saveMs: number[] = [], observationMs: number[] = [];
  let recoveryError: string | undefined;
  try {
    session.start();
    const workers = () => session.query(query(Worker));
    assert.equal(workers().length, workerCount, "stress workload must start with every actor");
    for (let tick = 0; tick < 90; tick++) {
      try {
        stepMs.push(elapsedMs(() => session.step(1)));
        saveMs.push(elapsedMs(() => JSON.stringify(session.save())));
        observationMs.push(elapsedMs(() => buildObservation(session, { epoch: 0, sequence: tick + 1 })));
      } catch (error) {
        recoveryError = `tick ${tick}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    assert.equal(recoveryError, undefined, `200-worker workload threw during step/save/observation: ${recoveryError}`);
    assert.equal(stepMs.length, 90, "stress workload must complete the measured step window");
    assert.equal(workers().length, workerCount, "all stress actors remain retained");
    const productiveTrees = session.query(query(ColonyTree, FiniteResource))
      .filter(row => row.get(FiniteResource).quantity === 0).length;
    assert.ok(productiveTrees > 0, "200-worker stress must complete productive native tree work");
    console.log(JSON.stringify({
      workload: "colony-performance-200",
      workers: workers().length,
      productiveTrees,
      steps: stepMs.length,
      stepMs: timingSummary(stepMs),
      snapshotSaveMs: timingSummary(saveMs),
      observationMs: timingSummary(observationMs),
      recoveryError: recoveryError ?? null,
    }));
  } finally {
    port.dispose();
  }
});

test("real pail workload crosses the sixteen-worker water planning batch", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: performancePackWithPails(32) });
  let maxDemand = 0;
  let maxActive = 0;
  let recoveryError: string | undefined;
  try {
    session.start();
    const pailWorkers = new Set(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "pail").map(row => row.get(MaterialLot).container)).size;
    assert.ok(pailWorkers > 16, "test-local records must author more than sixteen worker-held pails");
    for (let index = 0; index < pailWorkers; index++) session.command("requestWater", {});
    for (let tick = 0; tick < 12; tick++) {
      try {
        session.step(1);
        const demands = session.query(query(FieldWaterWork));
        maxDemand = Math.max(maxDemand, demands.length);
        maxActive = Math.max(maxActive, demands.filter(row => row.get(FieldWaterWork).lot === null).length);
      } catch (error) {
        recoveryError = `tick ${tick}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    assert.equal(recoveryError, undefined, `water workload threw during recovery/continuation: ${recoveryError}`);
    assert.ok(maxDemand > 16, `water demand did not cross batch boundary: ${maxDemand}`);
    assert.ok(maxActive > 0, "water workload must retain observed active demand");
    assert.equal(session.query(query(Worker)).length, 32, "all water workload actors remain retained");
    console.log(JSON.stringify({ workload: "colony-performance-water-32", pailWorkers, maxDemand, maxActive, recoveryError: null }));
  } finally {
    port.dispose();
  }
});
