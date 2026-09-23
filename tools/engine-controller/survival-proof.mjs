import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const output = resolve(process.argv[2] ?? ".botanical/survival-controller");
await mkdir(output, { recursive: true });
const root = new URL("../../", import.meta.url).pathname;
const options = {
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2024",
  mainFields: ["module", "main"], external: ["cloudflare:workers", "node:*"],
  nodePaths: [new URL("node_modules", import.meta.url).pathname],
  tsconfig: new URL("tsconfig.json", import.meta.url).pathname,
};
const engine = await build({
  ...options,
  tsconfig: resolve(root, "tsconfig.json"),
  nodePaths: [resolve(root, "node_modules")],
  entryPoints: [resolve(root, "tools/public-engine-host/worker.ts")],
  plugins: [{ name: "wasm-module", setup(build) {
    build.onResolve({ filter: /hive_kernel_bg\.wasm$/ }, () => ({ path: "./hive_kernel_bg.wasm", external: true }));
  } }],
});
const controller = await build({ ...options, entryPoints: [new URL("survival-worker.mts", import.meta.url).pathname] });
const engineScript = engine.outputFiles[0].text;
const controllerScript = controller.outputFiles[0].text;
const wasm = await readFile(resolve(root, "engine/generated/hive_kernel_bg.wasm"));
const implementationHash = createHash("sha256").update(engineScript).update(wasm).digest("hex");
await writeFile(resolve(output, "engine.mjs"), engineScript);
await writeFile(resolve(output, "controller.mjs"), controllerScript);
const gameToken = randomBytes(32).toString("hex");
const controllerToken = randomBytes(32).toString("hex");
const common = { compatibilityDate: "2026-09-04", compatibilityFlags: ["nodejs_compat"] };
function open() {
  return new Miniflare(convertV4MiniflareOptions({
    resourcePersistencePath: resolve(output, "storage"),
    workers: [
      { name: "controller", ...common,
        modules: [{ type: "ESModule", path: "controller.mjs", contents: controllerScript }],
        workerLoaders: { LOADER: {} }, serviceBindings: { ENGINE: "engine" },
        bindings: { GAME_TOKEN: gameToken, CONTROLLER_TOKEN: controllerToken } },
      { name: "engine", ...common,
        modules: [
          { type: "ESModule", path: "engine.mjs", contents: engineScript },
          { type: "CompiledWasm", path: "hive_kernel_bg.wasm", contents: wasm },
        ],
        durableObjects: { REGIONS: { className: "PublicEngineRegion", useSQLite: true } },
        bindings: { IMPLEMENTATION_HASH: implementationHash, PUBLIC_ORIGIN: "https://proof.local" } },
    ],
  }));
}
const execute = (runtime, code, token = controllerToken) => runtime.dispatchFetch("https://controller.local/execute", {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ code }),
});
async function value(response) {
  const body = await response.text();
  assert.equal(response.status, 200, body.slice(0, 500));
  return JSON.parse(body).value;
}
async function waitFor(runtime, predicate, description) {
  const deadline = Date.now() + 25_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await value(await execute(runtime, "return await survival.observe({});"));
    if (predicate(latest)) return latest;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail(`${description} timed out: ${JSON.stringify(latest)}`);
}

let runtime = open();
try {
  assert.equal((await execute(runtime, "return await survival.observe({});", "not-authorized")).status, 403);
  assert.equal((await execute(runtime, "return await survival.command({});", controllerToken)).status, 400,
    "the controller does not expose a generic or administrative command");
  const engineWorker = await runtime.getWorker("engine");
  const direct = await engineWorker.fetch("https://engine.local/v1/survival/observe", {
    headers: { Authorization: `Bearer ${gameToken}` },
  });
  assert.equal(direct.status, 200, await direct.clone().text());
  const initial = await value(await execute(runtime, "return await survival.observe({});"));
  assert.deepEqual(Object.keys(initial).sort(), ["carriedBread", "hunger", "lockerBread", "replayEpoch", "revision", "time", "wellbeing"]);
  assert.equal(initial.carriedBread + initial.lockerBread, 8);
  assert.equal((await execute(runtime, `return await survival.command({ id: "forbidden-rule-change",
    replayEpoch: ${initial.replayEpoch}, expectedRevision: ${initial.revision},
    command: { kind: "command", name: "setMealRule", input: { recovery: 10 } } });`)).status, 400,
    "the controller grant cannot change pack rules");
  assert.deepEqual(await value(await execute(runtime, "return await survival.observe({});")), initial,
    "rejected out-of-grant action leaves the scoped world unchanged");

  const takeSubmission = await value(await execute(runtime, `
    for (let attempt = 0; attempt < 4; attempt++) {
      const view = await survival.observe({});
      const command = { id: "survival-take-" + attempt, replayEpoch: view.replayEpoch,
        expectedRevision: view.revision, command: { kind: "command", name: "takeFood", input: null } };
      const receipt = await survival.command(command);
      if (receipt.status === "applied") return { command, receipt };
    }
    throw new Error("fresh Survival take command was not admitted");
  `));
  const { command: take, receipt: takeReceipt } = takeSubmission;
  assert.equal(takeReceipt.status, "applied", JSON.stringify(takeReceipt));
  // Simulate a lost execute response: retain only the durable input and destroy
  // both worker processes before retrying it through a fresh Mycelium lease.
  await runtime.dispose();
  runtime = open();
  assert.deepEqual(await value(await execute(runtime, `return await survival.command(${JSON.stringify(take)});`)), takeReceipt);
  const carried = await waitFor(runtime, view => view.carriedBread === 1 && view.lockerBread === 7, "one conserved pickup");

  const eatSubmission = await value(await execute(runtime, `
    for (let attempt = 0; attempt < 4; attempt++) {
      const view = await survival.observe({});
      const command = { id: "survival-eat-" + attempt, replayEpoch: view.replayEpoch,
        expectedRevision: view.revision, command: { kind: "command", name: "eatFood", input: null } };
      const receipt = await survival.command(command);
      if (receipt.status === "applied") return { command, receipt };
    }
    throw new Error("fresh Survival meal command was not admitted");
  `));
  const { command: eat, receipt: eatReceipt } = eatSubmission;
  assert.equal(eatReceipt.status, "applied", JSON.stringify(eatReceipt));
  const terminal = await waitFor(runtime, view => view.carriedBread === 0 && view.lockerBread === 7 && view.hunger < initial.hunger,
    "durable meal effect");
  assert.equal(terminal.carriedBread + terminal.lockerBread, 7, "one bread unit is consumed by the game rule");
  await runtime.dispose();
  runtime = open();
  const recovered = await value(await execute(runtime, "return await survival.observe({});"));
  assert.deepEqual(recovered, terminal);
  assert.deepEqual(await value(await execute(runtime, `return await survival.command(${JSON.stringify(take)});`)), takeReceipt);
  assert.deepEqual(await value(await execute(runtime, `return await survival.command(${JSON.stringify(eat)});`)), eatReceipt);
  await writeFile(resolve(output, "result.json"), JSON.stringify({
    implementationHash,
    wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    initial, takeReceipt, carried, eatReceipt, terminal, recovered,
    conservation: { starting: 8, afterPickup: 8, afterMeal: 7, consumed: 1 },
    runtime: "local workerd, existing public Survival pack + Region DO + actual Mycelium execute + Code Mode",
    hosted: false,
    shiitakeModelSession: false,
  }, null, 2));
  console.log(JSON.stringify({ result: "passed", implementationHash, initial, recovered }));
} finally {
  await runtime.dispose();
}
