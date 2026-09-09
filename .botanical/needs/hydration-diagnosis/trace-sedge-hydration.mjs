import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { createClearing, step } from "../../../src/clearing.ts";

const output =
  process.argv[2] ||
  ".botanical/needs/hydration-diagnosis/sedge-hydration-trace.json";
const [wasmBinary, wasmSource] = await Promise.all([
  readFile(new URL("../../../public/vendor/libcolony/colony.wasm", import.meta.url)),
  readFile(
    new URL("../../../public/vendor/libcolony/colony.js", import.meta.url),
    "utf8",
  ),
]);
const colony = await new Promise((resolve, reject) => {
  const context = {
    Module: {
      wasmBinary,
      onRuntimeInitialized: () => resolve(context.Module),
      onAbort: reject,
    },
    window: {},
    console,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(wasmSource, context);
});
const tick = (state, commands = []) =>
  step(
    state,
    colony,
    commands.map((command) => ({
      party: "home",
      actors: null,
      level: 0,
      ...command,
    })),
  );
const summary = (state) => {
  const sedge = state.actors.sedge;
  const job = state.jobs.find((entry) => entry.kind === "care" && entry.target === "sedge");
  const operation = job && state.operations.find((entry) => entry.job === job.id);
  return {
    tick: state.tick,
    sedge: {
      x: sedge.x,
      z: sedge.z,
      level: sedge.level,
      mode: sedge.mode,
      task: structuredClone(sedge.task),
      work: sedge.work,
      path: structuredClone(sedge.path),
      hydration: sedge.needs.hydration,
    },
    job: job && { id: job.id, need: job.need, reason: job.reason },
    operation: structuredClone(operation),
    outcomes: structuredClone(
      state.careOutcomes.filter((outcome) => outcome.actor === "sedge"),
    ),
  };
};
const state = createClearing();
tick(state, [{ kind: "chop", tree: state.trees[0].id }]);
for (let ticks = 0; ticks < 600 && state.felled === 0; ticks++) tick(state);
tick(state, [{ kind: "repair-cache" }]);
for (
  let ticks = 0;
  ticks < 600 && !state.sources.some((source) => source.kind === "reclaimed-timber-cache" && source.repaired);
  ticks++
)
  tick(state);
state.actors.sedge.needs.hydration = 35;
const trace = [summary(state)];
let prior = JSON.stringify({
  sedge: {
    x: trace[0].sedge.x,
    z: trace[0].sedge.z,
    mode: trace[0].sedge.mode,
    task: trace[0].sedge.task,
    path: trace[0].sedge.path,
  },
  job: trace[0].job,
  operation: trace[0].operation,
  outcomes: trace[0].outcomes,
});
for (let ticks = 0; ticks < 900; ticks++) {
  tick(state);
  const next = summary(state);
  const encoded = JSON.stringify({
    sedge: {
      x: next.sedge.x,
      z: next.sedge.z,
      mode: next.sedge.mode,
      task: next.sedge.task,
      path: next.sedge.path,
    },
    job: next.job,
    operation: next.operation,
    outcomes: next.outcomes,
  });
  if (encoded !== prior) trace.push(next);
  prior = encoded;
  if (next.outcomes.some((outcome) => outcome.need === "hydration")) break;
}
await writeFile(output, `${JSON.stringify({ trace, final: summary(state) }, null, 2)}\n`);
