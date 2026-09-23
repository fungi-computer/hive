/**
 * Real 100-worker/100-tree local Colony workload at 100 ms simulation steps.
 * Bundle against a freshly built current WASM kernel; this does not measure DO
 * SQL, socket publication, browser frames, or 100 concurrent claims.
 *
 * Run from the repository root:
 *   node_modules/.bin/esbuild engine/scripts/measure-active-colony.ts --bundle --platform=node --format=esm --outfile=/tmp/hive-active-colony.mjs
 *   node /tmp/hive-active-colony.mjs
 */
import { readFileSync } from "node:fs";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session.ts";
import { wasmKernelPort } from "../src/runtime/wasm-kernel.ts";
import { createColonyPerformancePack } from "../src/games/colony-performance.ts";
import { treeJob, treePlan } from "../src/games/colony.ts";
import { ColonyTree } from "../src/games/colony-work.ts";
import { FiniteResource } from "../src/sdk/common.ts";
import { query } from "../src/sdk/authoring.ts";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
const base = createColonyPerformancePack(128, 100);
const decoder = new TextDecoder();
const definition = JSON.parse(decoder.decode(base.definition));
const environment = JSON.parse(decoder.decode(base.environmentDefinition));
const occupied = new Set(environment.initialPlacements.map((entry: any) => entry.column.join(",")));
const actions = [...base.initialActions!];
for (let index = 50; index < 100; index++) {
  const id = `colony.tree.active-${index + 1}`;
  let column: [number, number] | undefined;
  for (let probe = 0; probe < 57 * 57; probe++) {
    const flat = (index * 113 + probe * 101) % (57 * 57);
    const candidate: [number, number] = [(flat % 57) - 28, Math.floor(flat / 57) - 28];
    if (!occupied.has(candidate.join(","))) { column = candidate; occupied.add(candidate.join(",")); break; }
  }
  if (!column) throw new Error("no free tree column");
  definition.initial.push({ id, components: {
    "hive.position": { x: column[0], y: 0, z: column[1], facing: 0 },
    "hive.container": { capacity: 6 },
    "colony.tree": { kind: "wood" },
    "hive.finite-resource": { kind: "wood", quantity: 6 },
    "hive.owned-by-party": { party: "party:1" },
    "colony.tree-policy": { designated: true, party: "party:1", job: null },
  }});
  environment.initialPlacements.push({ entity: id, column });
  actions.push({ kind: "create-job", id: treeJob(id), pool: "party:1", plan: treePlan(id) } as any);
}
const game = "colony-performance-128-100-active100";
definition.game = game;
const pack = { ...base, id: game, definition: new TextEncoder().encode(JSON.stringify(definition)), environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)), initialActions: actions };
const port = wasmKernelPort(new WasmKernel());
const session = new GameSession({ port, pack });
const steps: number[] = [];
try {
  session.start();
  for (let tick = 0; tick < 900; tick++) {
    const start = performance.now();
    session.step(0.1);
    steps.push(performance.now() - start);
  }
  const completed = session.query(query(ColonyTree, FiniteResource)).filter(row => row.get(FiniteResource).quantity === 0).length;
  if (completed !== 100) throw new Error(`active Colony fixture completed ${completed} of 100 trees`);
  const sorted = [...steps].sort((a,b) => a-b);
  const pct = (p: number) => sorted[Math.ceil(sorted.length*p)-1];
  process.stdout.write(JSON.stringify({ workers:100, trees:100, completed, steps:steps.length, first10:steps.slice(0,10), first100Median:[...steps.slice(0,100)].sort((a,b)=>a-b)[49], first100P95:[...steps.slice(0,100)].sort((a,b)=>a-b)[94], stepMedian:pct(.5), stepP95:pct(.95), stepMax:sorted.at(-1), stepTotal:steps.reduce((a,b)=>a+b,0) }) + "\n");
} finally { port.dispose(); }
