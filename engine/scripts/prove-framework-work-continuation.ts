/** Short real v2 workload: accepted arrivals must become physical work even
 * while another assignment frontier is retained. Local WASM evidence only. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session";
import { wasmKernelPort } from "../src/runtime/wasm-kernel";
import { createColonyFrameworkProofV2Pack } from "../src/games/colony-performance";
import { driveColonyFrameworkProofV2 } from "../src/games/colony-framework-proof-v2-driver";
import { FiniteResource, MaterialLot } from "../src/sdk/common";
import { query } from "../src/sdk/authoring";
import { Worker } from "../src/games/colony-components";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
const kernel = new WasmKernel();
const port = wasmKernelPort(kernel);
const pack = createColonyFrameworkProofV2Pack();
const session = new GameSession({ port, pack });
const steps = Number(process.argv.find(arg => arg.startsWith("--steps="))?.slice(8) ?? 160);
assert.ok(Number.isSafeInteger(steps) && steps >= 40 && steps <= 300);
const samples: unknown[] = [];
let progressed = false;
let recoveredAt: number | undefined;
try {
  session.start();
  session.captureForCommit(); session.acceptCapture();
  const workers = session.query(query(Worker)).map(row => row.id);
  for (let step = 1; step <= steps; step++) {
    driveColonyFrameworkProofV2(session, step);
    session.runDisposableCandidate(() => {
      session.step(.1);
      session.captureForCommit();
    });
    session.acceptCapture();
    if (step === 80) { session.restore(session.save()); recoveredAt = step; }
    if (step % 40 !== 0 && step !== steps) continue;
    const state = JSON.parse(new TextDecoder().decode(session.save().kernel.records.find(row => row.key === "kernel/state/root")!.bytes));
    const attempts = workers.flatMap(worker => { const attempt = port.workAttemptForWorker(worker); return attempt ? [attempt] : []; });
    const phases: Record<string, number> = {};
    for (const attempt of attempts) {
      const phase = attempt.phase;
      const key = phase.kind === "outcome" ? `${phase.kind}:${phase.activity.kind}:${phase.result.kind}`
        : phase.kind === "executing" ? `${phase.kind}:${phase.activity.kind}` : phase.kind;
      phases[key] = (phases[key] ?? 0) + 1;
    }
    const retained = new Set<string>(state.planner.continuation?.sourceWindow.tasks.map((task: {id: string}) => task.id) ?? []);
    const completedRoutes = attempts.filter(attempt => attempt.phase.kind === "outcome" && attempt.phase.activity.kind === "route" && attempt.phase.result.kind === "completed");
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    const finite = session.query(query(FiniteResource)).filter(row => row.get(FiniteResource).kind === "wood").reduce((sum, row) => sum + row.get(FiniteResource).quantity, 0);
    const wood = lots.filter(lot => lot.kind === "wood").reduce((sum, lot) => sum + lot.quantity, 0);
    const felled = lots.filter(lot => lot.kind === "wood-felled").reduce((sum, lot) => sum + lot.quantity, 0);
    assert.equal(finite + wood + felled, 2304, "continuation must conserve finite wood");
    progressed ||= wood > 0;
    samples.push({ step, phases, wood, felled, finite, retainedTasks: retained.size,
      completedRoutesOutsideRetainedWindow: completedRoutes.filter(attempt => !retained.has(attempt.key.task)).length,
      examples: completedRoutes.slice(0, 2),
    });
  }
  process.stdout.write(JSON.stringify({ steps, progressed, recoveredAt, samples }, null, 2) + "\n");
  if (!process.argv.includes("--allow-stall")) assert.ok(progressed, "accepted arrivals must produce completed chains within the short v2 workload");
} finally { port.dispose(); }
