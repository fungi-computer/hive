import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const output = resolve(process.argv[2] ?? ".botanical/pirates-controller");
await mkdir(output, { recursive: true });
const root = new URL("../../", import.meta.url).pathname;
const options = { bundle: true, write: false, format: "esm", platform: "neutral", target: "es2024", mainFields: ["module", "main"],
  external: ["cloudflare:workers", "node:*"], nodePaths: [new URL("node_modules", import.meta.url).pathname],
  tsconfig: new URL("tsconfig.json", import.meta.url).pathname };
const engine = await build({ ...options, tsconfig: resolve(root, "tsconfig.json"), nodePaths: [resolve(root, "node_modules")], entryPoints: [resolve(root, "tools/public-engine-host/worker.ts")],
  plugins: [{ name: "wasm-module", setup(build) { build.onResolve({ filter: /hive_kernel_bg\.wasm$/ }, () => ({ path: "./hive_kernel_bg.wasm", external: true })); } }] });
const controller = await build({ ...options, entryPoints: [new URL("pirates-worker.mts", import.meta.url).pathname] });
const engineScript = engine.outputFiles[0].text, controllerScript = controller.outputFiles[0].text;
const wasm = await readFile(resolve(root, "engine/generated/hive_kernel_bg.wasm"));
const implementationHash = createHash("sha256").update(engineScript).update(wasm).digest("hex");
await writeFile(resolve(output, "engine.mjs"), engineScript);
await writeFile(resolve(output, "controller.mjs"), controllerScript);
const gameToken = randomBytes(32).toString("hex"), controllerToken = randomBytes(32).toString("hex");
const common = { compatibilityDate: "2026-09-04", compatibilityFlags: ["nodejs_compat"] };
function open() {
  return new Miniflare(convertV4MiniflareOptions({
    resourcePersistencePath: resolve(output, "storage"), workers: [
      { name: "controller", ...common, modules: [{ type: "ESModule", path: "controller.mjs", contents: controllerScript }],
        workerLoaders: { LOADER: {} }, serviceBindings: { ENGINE: "engine" },
        bindings: { GAME_TOKEN: gameToken, CONTROLLER_TOKEN: controllerToken } },
      { name: "engine", ...common, modules: [
        { type: "ESModule", path: "engine.mjs", contents: engineScript },
        { type: "CompiledWasm", path: "hive_kernel_bg.wasm", contents: wasm },
      ], durableObjects: { REGIONS: { className: "PublicEngineRegion", useSQLite: true } },
        bindings: { IMPLEMENTATION_HASH: implementationHash, PUBLIC_ORIGIN: "https://proof.local" } },
    ],
  }));
}
const execute = (runtime, code, token = controllerToken) => runtime.dispatchFetch("https://controller.local/execute", {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ code }),
});
async function value(response) {
  const text = await response.text(); assert.equal(response.status, 200, text.slice(0, 500));
  return JSON.parse(text).value;
}
let runtime = open();
try {
  assert.equal((await execute(runtime, "return await pirates.observe({});", "not-authorized")).status, 403);
  const publicOwner = await runtime.getWorker("engine");
  const direct = await publicOwner.fetch("https://engine.local/v1/pirates/observe", { headers: { Authorization: `Bearer ${gameToken}` } });
  assert.equal(direct.status, 200, await direct.clone().text());
  const initial = await value(await execute(runtime, "return await pirates.observe({});"));
  assert.deepEqual(Object.keys(initial).sort(), ["cargo", "replayEpoch", "revision", "time"]);
  assert.deepEqual(initial.cargo, { bread: 4, wood: 3, delivered: 0, pending: 2, result: "pending" });
  const command = { id: "load-cargo-once", replayEpoch: initial.replayEpoch, expectedRevision: initial.revision,
    command: { kind: "command", name: "loadCargo", input: { entities: ["pirates.crew.1"] } } };
  for (const forbidden of [
    { ...command, command: { kind: "step", delta: 1 } },
    { ...command, command: { kind: "command", name: "turnShip", input: { facing: 2 } } },
    { ...command, command: { kind: "command", name: "loadCargo", input: { entities: ["pirates.crew.2"] } } },
    { ...command, principal: "pirates-host" },
  ]) assert.equal((await execute(runtime, `return await pirates.command(${JSON.stringify(forbidden)});`)).status, 400);
  // Each new attempt observes immediately before submission. A rejected stale
  // command keeps its own durable identity; never relabel an uncertain retry.
  let accepted;
  for (let attempt = 0; attempt < 4; attempt++) {
    const submitted = await value(await execute(runtime, `
      const view = await pirates.observe({});
      const input = { ...${JSON.stringify(command)}, id: "load-cargo-${attempt}", expectedRevision: view.revision };
      return { input, receipt: await pirates.command(input) };
    `));
    if (submitted.receipt.status === "applied") {
      Object.assign(command, submitted.input); accepted = submitted.receipt; break;
    }
    assert.equal(submitted.receipt.status, "rejected");
  }
  assert(accepted, "fresh scoped cargo command must be admitted");
  // Treat the response as lost at the controller caller, then discard all RAM.
  await runtime.dispose(); runtime = open();
  const replay = await value(await execute(runtime, `return await pirates.command(${JSON.stringify(command)});`));
  assert.deepEqual(replay, accepted);
  let terminal;
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    terminal = await value(await execute(runtime, "return await pirates.observe({});"));
    assert.equal(terminal.cargo.bread, 4); assert.equal(terminal.cargo.wood, 3);
    if (terminal.cargo.result === "complete") break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(terminal.cargo.result, "complete", JSON.stringify(terminal));
  assert.equal(terminal.cargo.delivered, 2);
  await runtime.dispose(); runtime = open();
  const recovered = await value(await execute(runtime, "return await pirates.observe({});"));
  assert.deepEqual(recovered.cargo, terminal.cargo);
  assert.deepEqual(await value(await execute(runtime, `return await pirates.command(${JSON.stringify(command)});`)), accepted);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ implementationHash,
    wasmSha256: createHash("sha256").update(wasm).digest("hex"), initial, accepted, terminal, recovered,
    runtime: "local workerd, unchanged public engine DO + native Code Mode + actual Mycelium execute", hosted: false,
  }, null, 2));
  console.log(JSON.stringify({ result: "passed", implementationHash, cargo: recovered.cargo }));
} finally { await runtime.dispose(); }
