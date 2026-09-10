import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { createClearing, step } from "../src/clearing.ts";
import { admitCommand } from "../src/orders.ts";
import { loadOptimizer } from "../src/engine/colony/loader.ts";
import { advancePaidEnvironment } from "../src/world-presets/goblin-environment/environment-state.ts";
import { terrainEnvironment } from "../src/terrain.ts";
import { waterSurfaces } from "../src/water-surfaces.ts";
import { airEnvironmentFacts } from "../src/world-presets/goblin-environment/air-state.ts";
import { assignWork } from "../src/jobs.ts";

const WARMUP = 10;
const TICKS = 40;
const PROBES = 10;
const output =
  process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ??
  ".botanical/clearing-performance/current.json";
const label =
  process.argv.find((arg) => arg.startsWith("--label="))?.slice(8) ?? "current";

const optimizer = await loadOptimizer(
  await WebAssembly.compile(
    await readFile(
      new URL("../src/engine/colony/colony.wasm", import.meta.url),
    ),
  ),
);

function timed(fn) {
  const cpuBefore = process.cpuUsage();
  const start = performance.now();
  const value = fn();
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuBefore);
  return { value, wallMs, cpuMs: (cpu.user + cpu.system) / 1000 };
}

function distribution(rows, key = "wallMs") {
  const values = rows.map((row) => row[key]).toSorted((a, b) => a - b);
  const percentile = (fraction) =>
    values[Math.max(0, Math.ceil(values.length * fraction) - 1)];
  return {
    count: values.length,
    totalMs: values.reduce((sum, value) => sum + value, 0),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: values.at(-1),
    cpuMs: rows.reduce((sum, row) => sum + row.cpuMs, 0),
  };
}

// Startup is one real createClearing call. The state remains canonical through
// every following measurement; no clone or synthetic replacement is involved.
const startup = timed(() => createClearing(42));
const state = startup.value;
console.log(JSON.stringify({ stage: "startup", wallMs: startup.wallMs }));
const initialMasses = state.water.water.massKg;
const warmup = [];
for (let index = 0; index < WARMUP; index++)
  warmup.push(timed(() => step(state, optimizer)));
const flowingRows = [];
for (let index = 0; index < TICKS; index++)
  flowingRows.push(timed(() => step(state, optimizer)));
console.log(JSON.stringify({ stage: "flowing", ...distribution(flowingRows) }));

state.paused = true;
const result = admitCommand(state, {
  kind: "dig",
  voxel: [0, 14, 128],
  party: "home",
  actors: ["rowan"],
});
assert.equal(result.status, "applied", result.reason ?? "dig admission failed");
assert(
  state.jobs.some((job) => job.kind === "dig"),
  "accepted dig job missing",
);
state.paused = false;
const digRows = [];
for (let index = 0; index < TICKS; index++)
  digRows.push(timed(() => step(state, optimizer)));
console.log(JSON.stringify({ stage: "dig", ...distribution(digRows) }));
const gameplay = {
  tick: state.tick,
  geometryRevision: state.water.geometryRevision,
  waterCells: state.water.water.massKg.length,
  gasVolumes: state.air.air.parcels.length,
  changedWaterStocks: state.water.water.massKg.reduce(
    (count, amount, index) => count + Number(amount !== initialMasses[index]),
    0,
  ),
  remainingJobs: state.jobs.map(({ kind }) => kind),
  rowan: { mode: state.actors.rowan.mode, work: state.actors.rowan.work },
};

// Attribution aids use the same live state and are deliberately separate
// measurements; they are not additive and do not claim a capacity limit.
const source = {
  terrain: terrainEnvironment(state.terrain),
  sites: state.sites,
};
const fieldRows = [];
let optimizerCalls = 0;
const projectionRows = [];
for (let index = 0; index < PROBES; index++) {
  const field = timed(() => {
    let environment = {
      water: state.water,
      air: state.air,
      atmosphereReleases: state.atmosphereReleases,
    };
    environment = advancePaidEnvironment(
      environment,
      state.materials,
      source,
      1,
    );
    state.water = environment.water;
    state.air = environment.air;
    state.atmosphereReleases = environment.atmosphereReleases;
  });
  fieldRows.push({ ...field, calls: 1 });

  state.workDirty = true;
  assignWork(state, optimizer);
  optimizerCalls++;

  const projection = timed(() => {
    waterSurfaces(state, 0);
    airEnvironmentFacts(state.air, state.water, source);
  });
  projectionRows.push({ ...projection, calls: 2 });
}

const revision = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
})();
const report = {
  schema: 2,
  label,
  revision,
  optimizerBuildId: optimizer.buildId,
  workload: {
    seed: 42,
    startupCalls: 1,
    warmupTicks: WARMUP,
    measuredFlowingTicks: TICKS,
    measuredDigTicks: TICKS,
    fixture:
      "createClearing(42), 10 warmup ticks, 40 flowing ticks, paused admitCommand dig [0,14,128] for home/rowan, 40 dig ticks",
    headline:
      "step -> commitTicks -> advanceCandidate, including paid environment, work, observation and libcolony assignWork",
    probes: `${PROBES} single advancePaidEnvironment calls, ${PROBES} untimed assignWork calls, ${PROBES} timed water/air projection calls`,
  },
  startup: { wallMs: startup.wallMs, cpuMs: startup.cpuMs },
  gameplay,
  warmup: distribution(warmup),
  flowingTicks: distribution(flowingRows),
  digTicks: distribution(digRows),
  fields: distribution(fieldRows),
  optimizer: { calls: optimizerCalls, timed: false },
  presentation: distribution(projectionRows),
  limitations:
    "Local source witness only; startup is createClearing after optimizer load; probes are attribution aids, not additive totals or performance guarantees; no renderer/browser/DO claim.",
};
await mkdir(output.substring(0, output.lastIndexOf("/")) || ".", {
  recursive: true,
});
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  output.replace(/\.json$/, ".md"),
  `# Clearing performance (${label})\n\n` +
    `Revision: ${revision}\n\n${report.workload.fixture}. ` +
    "Startup, field, optimizer, and presentation probes are separate diagnostics; no capacity guarantee is claimed.\n",
);
console.log(JSON.stringify(report, null, 2));
