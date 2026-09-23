/**
 * Adds phase timings around the pinned v3 fixture without editing its record
 * owner or conflating local WASM measurements with DO host costs.
 * Bundle this entrypoint instead of measure-framework-proof-v3.ts.
 */
import { GameSession } from "../src/runtime/session";

type Timing = { count: number; totalMs: number; values: number[] };
const timing = (): Timing => ({ count: 0, totalMs: 0, values: [] });
const timings = {
  simulationOccurrence: timing(),
  recordCapture: timing(),
  fullSave: timing(),
  recoveryRestore: timing(),
  queryObservation: timing(),
};
let changedPuts = 0;
let changedRemoves = 0;
let changedBytes = 0;
const initialRssBytes = process.memoryUsage().rss;
let maxRssBytes = initialRssBytes;
let startCalls = 0;
let measuredSession: GameSession | undefined;
const clock = () => performance.now();
const measure = <T>(slot: Timing, run: () => T): T => {
  const start = clock();
  try {
    return run();
  } finally {
    const elapsed = clock() - start;
    slot.count++;
    slot.totalMs += elapsed;
    slot.values.push(elapsed);
    maxRssBytes = Math.max(maxRssBytes, process.memoryUsage().rss);
  }
};
const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const summary = (slot: Timing) => ({
  count: slot.count,
  totalMs: slot.totalMs,
  p50Ms: percentile(slot.values, 0.5),
  p95Ms: percentile(slot.values, 0.95),
  p99Ms: percentile(slot.values, 0.99),
  maxMs: slot.values.length ? Math.max(...slot.values) : null,
});

const proto = GameSession.prototype as any;
for (const [method, slot] of [
  ["step", timings.simulationOccurrence],
  ["captureForCommit", timings.recordCapture],
  ["save", timings.fullSave],
  ["restore", timings.recoveryRestore],
  ["query", timings.queryObservation],
] as const) {
  const original = proto[method];
  if (typeof original !== "function") throw new Error(`missing GameSession.${method}`);
  proto[method] = function (...args: unknown[]) {
    const measured = this === measuredSession;
    const recovery = method === "restore" && startCalls >= 2;
    if (!measured && !recovery) return original.apply(this, args);
    return measure(slot, () => {
      const result = original.apply(this, args);
      if (method === "captureForCommit") {
        const changes = result.changes;
        changedPuts += changes.puts.length;
        changedRemoves += changes.removes.length;
        for (const row of changes.puts)
          changedBytes += row.bytes.length + Buffer.byteLength(row.key) + 16;
        for (const key of changes.removes)
          changedBytes += Buffer.byteLength(key) + 16;
      }
      return result;
    });
  };
}
const originalStart = proto.start;
proto.start = function (...args: unknown[]) {
  startCalls++;
  if (startCalls === 2) measuredSession = this;
  return originalStart.apply(this, args);
};

const originalLog = console.log;
let fixtureReport: Record<string, any> | undefined;
console.log = (...values: unknown[]) => {
  const candidate = values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
  if (candidate) {
    try {
      fixtureReport = JSON.parse(candidate);
      return;
    } catch {
      // Preserve unexpected fixture output for diagnosis.
    }
  }
  originalLog(...values);
};
try {
  await import("./measure-framework-proof-v3");
} finally {
  console.log = originalLog;
}
if (!fixtureReport) throw new Error("v3 fixture did not emit its JSON report");

const activeSamples = (fixtureReport.samples as Array<{ step: number }>).map(
  (sample) => sample.step,
);
const measuredStepValues = timings.simulationOccurrence.values.slice(
  0,
  fixtureReport.completedSteps as number,
);
const measuredSimulation = {
  count: measuredStepValues.length,
  totalMs: measuredStepValues.reduce((sum, value) => sum + value, 0),
  values: measuredStepValues,
};
fixtureReport.runtimeCostLedger = {
  boundary: "local GameSession + WASM; no Region/DO host was invoked",
  workload: {
    occurrenceCount: measuredSimulation.count,
    activeSamples: activeSamples.length,
    simulatedSeconds: measuredSimulation.count * 0.1,
    actorCount: 100,
    finiteTreeChainsInitiallyAuthored: 384,
    finiteWoodUnitsInitiallyAuthored: 2304,
    waterCells: 2,
    waterPortionsPerCell: 7,
  },
  costs: {
    simulationOccurrence: summary(measuredSimulation),
    changedRecordCapture: {
      ...summary(timings.recordCapture),
      changedPutRows: changedPuts,
      changedRemoveRows: changedRemoves,
      changedRows: changedPuts + changedRemoves,
      changedBytesIncludingKeysAnd16ByteRowOverhead: changedBytes,
      includesInitialCapture: true,
    },
    fullSave: summary(timings.fullSave),
    recoveryRestore: summary(timings.recoveryRestore),
    queryObservation: summary(timings.queryObservation),
    memory: {
      initialRssBytes,
      maximumObservedRssBytes: maxRssBytes,
      note: "process RSS sampled at measured operation boundaries; not DO memory or heap peak",
    },
    sqlCommit: { status: "not-measured", reason: "local WASM fixture has no SQL adapter" },
    publication: { status: "not-measured", reason: "no connected clients or host projection path" },
    alarmCadence: { status: "not-measured", reason: "no Durable Object alarm runtime invoked" },
    routeSearch: { status: "not-exposed", reason: "GameSession/WASM port does not publish expansion, deferred, or replan counters" },
    recoveryReconstruction: { status: "timed-locally", detail: "GameSession.restore wall time is separate from SQL cold recovery" },
  },
  productiveSamples: (fixtureReport.samples as Array<{ moving: number; working: number; stalledRoute: number }>).map((sample) => ({
    moving: sample.moving,
    working: sample.working,
    stalledRoute: sample.stalledRoute,
    executingAssignment: sample.moving + sample.working + sample.stalledRoute,
    movingOrWorking: sample.moving + sample.working,
    blockedOrUnassigned: Math.max(0, 100 - sample.moving - sample.working - sample.stalledRoute),
  })),
  interpretation: [
    "Simulation occurrence wall time is a local aggregate around GameSession.step and is not native-only CPU time.",
    "Capture timing includes the current record/change extraction API and is not SQL commit time.",
    "Query timing includes workload sampling and restore/continuation comparisons; it is not committed recipient publication.",
    "The fixture's 1800-step default is 180 simulated seconds; the sprint's final hosted qualification window is 600 seconds.",
    "No hosted capacity, alarm serviceability, socket publication, or DO CPU claim follows from these measurements.",
  ],
};
originalLog(JSON.stringify(fixtureReport, null, 2));
