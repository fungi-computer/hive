/** Bundle with esbuild, then run from the repo root. This is local WASM evidence,
 * not a Region/workerd/hosted benchmark. Never mix its metrics with v1. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus, platform, arch } from "node:os";
import { execFileSync } from "node:child_process";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session";
import { wasmKernelPort } from "../src/runtime/wasm-kernel";
import { createColonyFrameworkProofV2Pack } from "../src/games/colony-performance";
import { colonyFrameworkProofV2Schedule as schedule } from "../src/games/colony-performance-config";
import { driveColonyFrameworkProofV2 } from "../src/games/colony-framework-proof-v2-driver";
import { FiniteResource, MaterialLot, Position } from "../src/sdk/common";
import { FieldWaterWork } from "../src/sdk/process-supply";
import { query } from "../src/sdk/authoring";
import { Worker } from "../src/games/colony-components";

const steps = Number(process.argv.find(arg => arg.startsWith("--steps="))?.slice(8) ?? schedule.steps);
if (!Number.isSafeInteger(steps) || steps < 1 || steps > schedule.steps) throw new Error(`steps must be 1..${schedule.steps}`);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const wasm = readFileSync("engine/generated/hive_kernel_bg.wasm");
initSync({ module: wasm });
const pack = createColonyFrameworkProofV2Pack();
const port = wasmKernelPort(new WasmKernel());
const session = new GameSession({ port, pack });
const advanceMs: number[] = [], captureMs: number[] = [], changedBytes: number[] = [], changedRows: number[] = [];
const activeAdvanceMs: number[] = [];
const commands: unknown[] = [], samples: unknown[] = [];
const environmentSummary = (value: unknown) => {
  const facts = value as Record<string, unknown> & { cells: { mobileKg: number; massKg: number }[] };
  const { cells, ...rest } = facts;
  return { ...rest, observedWaterCells: cells.length, mobileKg: cells.reduce((sum, cell) => sum + cell.mobileKg, 0) };
};
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return { count: values.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? null, total: values.reduce((a, b) => a + b, 0) };
};
let error: string | null = null;
let completedSteps = 0, overHostChangeLimit = 0, qualifyingSamples = 0;
let previousPositions = new Map<string, { x: number; y: number; z: number }>();
let finalSnapshot: ReturnType<GameSession["save"]> | undefined;
const started = performance.now();
try {
  session.start();
  const workers = session.query(query(Worker)).map(row => row.id);
  const initialEnvironment = session.environmentFacts();
  const emissionCells = (initialEnvironment as { emissions: { cell: [number, number, number] }[] }).emissions.map(emission => emission.cell);
  session.captureForCommit();
  session.acceptCapture();
  previousPositions = new Map(session.query(query(Worker, Position)).map(row => [row.id, row.get(Position)]));
  for (let step = 1; step <= steps; step++) {
    try {
      const issued = driveColonyFrameworkProofV2(session, step);
      session.runDisposableCandidate(() => {
        const before = performance.now();
        session.step(schedule.stepSeconds);
        advanceMs.push(performance.now() - before);
        const captureAt = performance.now();
        const capture = session.captureForCommit();
        captureMs.push(performance.now() - captureAt);
        finalSnapshot = capture.snapshot;
        const bytes = capture.changes.puts.reduce((sum, row) => sum + row.bytes.length + new TextEncoder().encode(row.key).length + 16, 0);
        changedBytes.push(bytes);
        changedRows.push(capture.changes.puts.length + capture.changes.removes.length);
        if (bytes > 1024 * 1024) overHostChangeLimit++;
        if (issued.length || step === 1) commands.push({ step, issued: step === 1 ? ["128 initial chains; four finite fuel emissions admitted at bootstrap"] : issued, outcomes: capture.snapshot.outcomes.map(outcome => ({ kind: outcome.action.kind, accepted: outcome.result.accepted, reason: outcome.result.reason ?? null })) });
      });
      // The local driver treats each captured candidate as a committed step.
      session.acceptCapture();
      completedSteps = step;
      if (step % 10 !== 0 && step !== steps) continue;
      const sampledAt = performance.now();
      const positions = new Map(session.query(query(Worker, Position)).map(row => [row.id, row.get(Position)]));
      let assigned = 0, moving = 0, stalledRoute = 0, working = 0, blocked = 0, unassigned = 0;
      let sampledDisplacement = 0;
      const activities: Record<string, number> = {}, blockedReasons: Record<string, number> = {};
      for (const worker of workers) {
        const attempt = port.workAttemptForWorker(worker);
        if (!attempt) { unassigned++; continue; }
        if (attempt.phase.kind === "executing") {
          assigned++;
          const kind = attempt.phase.activity.kind;
          activities[kind] = (activities[kind] ?? 0) + 1;
          if (kind === "route") {
            const before = previousPositions.get(worker)!, after = positions.get(worker)!;
            const distance = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
            sampledDisplacement += distance;
            if (distance > .000001) moving++;
            else stalledRoute++;
          } else working++;
        } else if (attempt.phase.kind === "outcome" && attempt.phase.result.kind === "blocked") {
          blocked++;
          const reason = attempt.phase.result.reason;
          blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1;
        }
      }
      previousPositions = positions;
      const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
      const wood = lots.filter(lot => lot.kind === "wood").reduce((sum, lot) => sum + lot.quantity, 0);
      const felledWood = lots.filter(lot => lot.kind === "wood-felled").reduce((sum, lot) => sum + lot.quantity, 0);
      const finiteWood = session.query(query(FiniteResource)).filter(row => row.get(FiniteResource).kind === "wood").reduce((sum, row) => sum + row.get(FiniteResource).quantity, 0);
      const storedWood = lots.filter(lot => lot.kind === "wood" && lot.container.startsWith("framework-v2.store.")).reduce((sum, lot) => sum + lot.quantity, 0);
      const carriedWood = lots.filter(lot => lot.kind === "wood" && workers.includes(lot.container)).reduce((sum, lot) => sum + lot.quantity, 0);
      if (finiteWood + felledWood + wood !== 2304) throw new Error(`wood conservation failed: ${finiteWood + felledWood + wood}`);
      if (moving + working >= 90) qualifyingSamples++;
      // The preceding one-second window is active only with observed movement
      // or native non-route execution. Stationary route assignments do not pass.
      if (moving + working > 0) activeAdvanceMs.push(...advanceMs.slice(-Math.min(10, step)));
      samples.push({ step, seconds: step * schedule.stepSeconds, assigned, moving, working, stalledRoute, blocked, unassigned,
        otherAttemptPhases: workers.length - assigned - blocked - unassigned, activities, blockedReasons,
        sampledDisplacement, finiteWood, felledWood, wood, completedChains: wood / 6, storedWood, carriedWood,
        waterLots: lots.filter(lot => lot.kind === "water").reduce((sum, lot) => sum + lot.quantity, 0),
        waterDemands: session.query(query(FieldWaterWork)).length,
        environment: environmentSummary(session.environmentFacts()), air: port.atmosphereSamples(emissionCells), sampleMs: performance.now() - sampledAt,
      });
    } catch (failure) { error = `step ${step}: ${failure instanceof Error ? failure.message : String(failure)}`; break; }
  }
  const recoveryPort = wasmKernelPort(new WasmKernel());
  let recovery: unknown;
  try {
    if (finalSnapshot) {
      const recoveryAt = performance.now();
      const recovered = new GameSession({ port: recoveryPort, pack });
      recovered.restore(finalSnapshot);
      recovery = { ms: performance.now() - recoveryAt, workers: recovered.query(query(Worker)).length, environmentMatches: JSON.stringify(recovered.environmentFacts()) === JSON.stringify(session.environmentFacts()) };
    }
  } catch (failure) {
    const snapshotPath = ".botanical/framework-v2/recovery-failure.json";
    mkdirSync(".botanical/framework-v2", { recursive: true });
    writeFileSync(snapshotPath, JSON.stringify(finalSnapshot, (_key, value) => value instanceof Uint8Array ? { encoding: "uint8", bytes: Array.from(value) } : value));
    recovery = { error: failure instanceof Error ? failure.message : String(failure), stack: failure instanceof Error ? failure.stack : new Error(String(failure)).stack, snapshotPath };
    process.exitCode = 1;
  }
  finally { recoveryPort.dispose(); }
  process.stdout.write(JSON.stringify({ fixture: pack.id, source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtySource: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    wasmSha256: hash(wasm), definitionSha256: hash(pack.definition), environmentSha256: hash(pack.environmentDefinition!),
    runtime: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, clients: 0, host: "local WASM; no Region, SQL or sockets" },
    schedule, requestedSteps: steps, completedSteps, wallMs: performance.now() - started, error,
    advanceMs: summary(advanceMs), activeAdvanceMs: summary(activeAdvanceMs), captureMs: summary(captureMs), changedBytes: summary(changedBytes), changedRows: summary(changedRows),
    overHostChangeLimit, qualifyingSamples, sampleCount: samples.length, memory: process.memoryUsage(), initialEnvironment: environmentSummary(initialEnvironment), recovery, commands, samples,
    gaps: ["180 simulated seconds, not the frozen 10-minute hosted qualification", "No DO/workerd, SQL, sockets, alarms or invocation CPU", "Observed worker displacement is a lower bound, not route length or search expansions", "Working means native non-route execution, not separately verified progress per worker", "Route deferrals/replans and field backlog age are not exposed by this driver", "Ordinary-air pressure is unsupported; four finite hearths exercise smoke and heat", "Water orders and excavation are requests; inspect outcomes, water lots and terrain revision for actual effects"],
  }, null, 2) + "\n");
  if (error) process.exitCode = 1;
} finally { port.dispose(); }
