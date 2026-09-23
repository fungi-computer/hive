/**
 * Local diagnostic for the exact versioned DO framework workload. The ledger
 * separates native advancement, record capture and native attempt observation;
 * it does not include SQL, alarms, publication or DO CPU.
 * Bundle with esbuild and run from the repository root after building WASM.
 */
import { readFileSync } from "node:fs";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session.ts";
import { storeSession } from "../src/runtime/session-record-store.ts";
import { wasmKernelPort } from "../src/runtime/wasm-kernel.ts";
import { createColonyFrameworkProofPack } from "../src/games/colony-performance.ts";
import { treeJob } from "../src/games/colony.ts";
import { ColonyTree } from "../src/games/colony-work.ts";
import { FiniteResource, Position } from "../src/sdk/common.ts";
import { query } from "../src/sdk/authoring.ts";
import type { EntityId } from "../src/contracts.ts";

const count = Number(process.argv.find(arg => arg.startsWith("--steps="))?.slice(8) ?? "300");
if (!Number.isSafeInteger(count) || count < 1 || count > 6000) throw new Error("steps must be 1..6000");
initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
const pack = createColonyFrameworkProofPack();
const treeIds = (JSON.parse(new TextDecoder().decode(pack.definition)) as {
  initial: Array<{ id: string; components: Record<string, unknown> }>;
}).initial.filter(row => row.components["colony.tree"]).map(row => row.id as EntityId);
const taskIds = treeIds.flatMap(tree => [
  `${treeJob(tree)}:task:fell` as EntityId,
  `${treeJob(tree)}:task:chop` as EntityId,
]);
const port = wasmKernelPort(new WasmKernel());
const session = new GameSession({ port, pack });
let initialCaptureBytes = 0;
const advanceMs: number[] = [], captureMs: number[] = [], changedBytes: number[] = [];
const storedStateBytes: Array<{ tick: number; bytes: number; outcomeCount: number }> = [];
const changedByKey = new Map<string, { occurrences: number; bytes: number }>();
let overHostChangeLimit = 0;
const samples: Array<{ tick: number; executing: number; uniqueWorkers: number; completedTrees: number; sampleMs: number }> = [];
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? 0, total: values.reduce((a, b) => a + b, 0) };
};
try {
  session.start();
  // The DO stores a full baseline at creation; compare only later changes.
  const initialCapture = session.captureForCommit();
  initialCaptureBytes = initialCapture.snapshot.kernel.records.reduce((sum, record) => sum + record.bytes.length, 0);
  for (let tick = 1; tick <= count; tick++) {
    session.runDisposableCandidate(() => {
      const started = performance.now();
      session.step(.1);
      advanceMs.push(performance.now() - started);
      const capturedAt = performance.now();
      const capture = session.captureForCommit();
      captureMs.push(performance.now() - capturedAt);
      if (tick <= 30 || tick % 100 === 0) {
        const stored = storeSession(capture.snapshot).session;
        storedStateBytes.push({ tick, bytes: new TextEncoder().encode(JSON.stringify(stored)).length, outcomeCount: stored.outcomes.length });
      }
      let stepBytes = 0;
      for (const record of capture.changes.puts) {
        const bytes = record.bytes.length + new TextEncoder().encode(record.key).length + 16;
        stepBytes += bytes;
        const previous = changedByKey.get(record.key) ?? { occurrences: 0, bytes: 0 };
        changedByKey.set(record.key, { occurrences: previous.occurrences + 1, bytes: previous.bytes + bytes });
      }
      changedBytes.push(stepBytes);
      if (stepBytes > 1024 * 1024) overHostChangeLimit++;
    });
    if (tick === 1 || tick % 10 === 0 || tick === count) {
      const started = performance.now();
      const attempts = taskIds.flatMap((_, offset) => offset % 64 === 0 ? session.workAttempts(taskIds.slice(offset, offset + 64)) : []);
      const executing = attempts.filter(attempt => attempt.phase.kind === "executing");
      const completedTrees = session.query(query(ColonyTree, FiniteResource)).filter(row => row.get(FiniteResource).quantity === 0).length;
      samples.push({ tick, executing: executing.length, uniqueWorkers: new Set(executing.map(attempt => attempt.worker)).size, completedTrees, sampleMs: performance.now() - started });
    }
  }
  const finalAttempts = taskIds.flatMap((_, offset) => offset % 64 === 0 ? session.workAttempts(taskIds.slice(offset, offset + 64)) : []);
  const positions = new Map(session.query(query(Position)).map(row => [row.id, row.get(Position)]));
  const pendingTrees = session.query(query(ColonyTree, FiniteResource)).filter(row => row.get(FiniteResource).quantity > 0)
    .map(row => ({ id: row.id, quantity: row.get(FiniteResource).quantity, position: positions.get(row.id) }));
  const activeRoutes = finalAttempts.filter(attempt => attempt.phase.kind === "executing").slice(0, 25).map(attempt => ({
    task: attempt.key.task, worker: attempt.worker, position: positions.get(attempt.worker),
    activity: attempt.phase.kind === "executing" ? attempt.phase.activity : null,
  }));
  process.stdout.write(JSON.stringify({ fixture: pack.id, steps: count, trees: treeIds.length, initialCaptureBytes, advanceMs: summary(advanceMs), captureMs: summary(captureMs), changedBytes: summary(changedBytes), first30ChangedBytes: changedBytes.slice(0, 30), storedStateBytes, overHostChangeLimit, changedByKey: [...changedByKey].sort((a, b) => b[1].bytes - a[1].bytes), pendingTrees, activeRoutes, samples }, null, 2) + "\n");
} finally {
  port.dispose();
}
