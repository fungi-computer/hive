/**
 * Proof-only v4 registry overlay for the maintained local public DO host.
 * The overlay adds this fixture identity without editing production host files.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";

const dependencyContext = process.env.HIVE_DEPENDENCY_CONTEXT ?? "/home/levi/src/hive/package.json";
const require = createRequire(dependencyContext);
const nodeModules = resolve(require.resolve("esbuild"), "../../");
const { build } = require("esbuild");
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require("miniflare");

const outputArg = process.argv.indexOf("--output");
assert(outputArg >= 0 && process.argv[outputArg + 1], "usage: node framework-proof-v4-workerd.mjs --output DIR [--minimum-sequence N] [--active-seconds N]");
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : Number(process.argv[index + 1]);
};
const output = resolve(process.argv[outputArg + 1]);
const minimumSequence = option("--minimum-sequence", 3);
const activeSeconds = option("--active-seconds", 0);
assert(Number.isInteger(minimumSequence) && minimumSequence >= 3 && minimumSequence <= 6000);
assert(Number.isInteger(activeSeconds) && activeSeconds >= 0 && activeSeconds <= 600);
await mkdir(output, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const game = "colony-framework-proof-256-100-v4";
const root = process.cwd();
const workerPath = resolve(output, "worker.mjs");
const wasmPath = resolve(output, "hive_kernel_bg.wasm");
const workerSource = resolve(root, "tools/public-engine-host/worker.ts");
const registrationSource = resolve(root, "tools/public-engine-host/pack-registration.ts");
const registryShim = `
  import { publicPackRegistration as baseRegistration } from ${JSON.stringify(registrationSource)};
  import { createColonyFrameworkProofV4Pack } from ${JSON.stringify(resolve(root, "engine/src/games/colony-framework-proof-v4.ts"))};
  import { driveColonyFrameworkProofV4 } from ${JSON.stringify(resolve(root, "engine/src/games/colony-framework-proof-v4-driver.ts"))};
  import { colonyFrameworkProofV4GameId, colonyFrameworkProofV4Schedule } from ${JSON.stringify(resolve(root, "engine/src/games/colony-performance-config.ts"))};
  export function publicPackRegistration(pack) {
    if (pack !== colonyFrameworkProofV4GameId) return baseRegistration(pack);
    const fixture = createColonyFrameworkProofV4Pack();
    if (!fixture.localScope) throw new Error("framework v4 fixture has no command scope");
    return { pack: fixture, seed: 1, clockControl: true, measureCosts: true, placementQuery: true,
      occurrenceDriver: { id: "colony-framework-command-ledger-v4", version: 1,
        stepSeconds: colonyFrameworkProofV4Schedule.stepSeconds, scope: fixture.localScope,
        beforeStep: driveColonyFrameworkProofV4 } };
  }
`;
const entry = `import production, {PublicEngineRegion as Base} from ${JSON.stringify(workerSource)};
import {clockRequest} from ${JSON.stringify(resolve(root, "tools/public-engine-host/protocol.ts"))};
export default production;
export class PublicEngineRegion extends Base {
  async proofReplayLastClock() {
    await this.ready;
    return this.serial(() => {
      const sequence = this.hostRow().next_sequence - 1;
      return JSON.stringify(this.region.dispatchOccurrence(this.pack + '-host', {sequence,request:clockRequest(sequence)}));
    });
  }
}`;
const ledger = [];
const wasmBytes = await readFile(resolve(root, "engine/generated/hive_kernel_bg.wasm"));
await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts" },
  outfile: workerPath,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  nodePaths: [nodeModules],
  external: ["cloudflare:workers"],
  plugins: [
    {
      name: "v4-pack-registration",
      setup(buildApi) {
        buildApi.onResolve({ filter: /pack-registration/ }, (args) =>
          args.importer === workerSource
            ? { path: "registration-v4", namespace: "registration-v4" }
            : null,
        );
        buildApi.onLoad({ filter: /.*/, namespace: "registration-v4" }, () => ({
          contents: registryShim,
          resolveDir: root,
          loader: "ts",
        }));
        buildApi.onResolve({ filter: /\.wasm$/ }, () => ({ path: wasmPath, external: true }));
      },
    },
  ],
});
await copyFile(resolve(root, "engine/generated/hive_kernel_bg.wasm"), wasmPath);
const inventoryPaths = [
  "engine/src/games/colony-framework-proof-v4.ts",
  "engine/src/games/colony-framework-proof-v4-driver.ts",
  "engine/src/games/colony-performance-config.ts",
  "tools/public-engine-host/worker.ts",
  "tools/public-engine-host/protocol.ts",
  "src/engine/region/index.ts",
  "engine/generated/hive_kernel_bg.wasm",
];
const inventory = await Promise.all(inventoryPaths.map(async (path) => ({ path, sha256: hash(await readFile(resolve(root, path))) })));
const implementationHash = hash(JSON.stringify(inventory));
const token = randomBytes(32).toString("hex");
const tokenHash = hash(token);
const options = {
  workers: [{
    name: "hive-framework-v4-workerd",
    modules: [{ type: "ESModule", path: workerPath }, { type: "CompiledWasm", path: wasmPath }],
    compatibilityDate: "2026-09-04",
    durableObjects: { REGIONS: { className: "PublicEngineRegion", useSQLite: true } },
    bindings: { IMPLEMENTATION_HASH: implementationHash, PUBLIC_ORIGIN: "https://framework-v4.invalid" },
  }],
  resourcePersistencePath: resolve(output, "storage"),
  isolatedResourcePersistencePath: resolve(output, "storage"),
  log: new Log(LogLevel.ERROR),
  port: 0,
  handleStructuredLogs(log) {
    try {
      const value = JSON.parse(log.message);
      if (value.proof === "framework-host-cost-v1") ledger.push(value);
    } catch { /* Non-JSON worker logs are not host ledger rows. */ }
  },
};
let mf;
const start = async () => { mf = new Miniflare(convertV4MiniflareOptions(options)); await mf.ready; };
const endpoint = `http://framework.test/v1/${game}`;
const request = async (operation, body) => {
  const response = await mf.dispatchFetch(`${endpoint}/${operation}`, {
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const bodyText = await response.text();
  assert.equal(response.status, 200, bodyText);
  return JSON.parse(bodyText);
};
const readRows = async () => {
  for (const path of await readdir(resolve(output, "storage"), { recursive: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  })) {
    if (!path.endsWith(".sqlite")) continue;
    const db = new DatabaseSync(resolve(output, "storage", path), { readOnly: true });
    try {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE name='hive_public_host'").get()) continue;
      const host = db.prepare("SELECT * FROM hive_public_host WHERE token_hash=?").get(tokenHash);
      if (host) return { host, clock: db.prepare("SELECT * FROM hive_region_clock").get(), region: db.prepare("SELECT revision,state_json FROM hive_region").get() };
    } finally { db.close(); }
  }
};
const until = async (check, label, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(50);
  }
  throw new Error(`timed out: ${label}`);
};
try {
  await start();
  const started = performance.now();
  const initial = await request("observe");
  await until(async () => readRows(), "v4 host initialization");
  const activation = await until(
    async () => { const rows = await readRows(); return rows?.host.next_sequence >= minimumSequence ? rows : null; },
    "v4 native occurrences",
  );
  const activeStarted = performance.now();
  if (activeSeconds) await delay(activeSeconds * 1000);
  const pause = await request("command", {
    id: "workload-v4-proof-pause",
    replayEpoch: initial.replayEpoch,
    command: { kind: "pause" },
  });
  assert.deepEqual(await request("command", {
    id: "workload-v4-proof-pause",
    replayEpoch: initial.replayEpoch,
    command: { kind: "pause" },
  }), pause, "same-command retry preserves the exact host reply");
  const committed = await readRows();
  assert.equal(committed.host.paused, 1);
  assert.ok(JSON.parse(committed.region.state_json).session.now >= 0.1);
  const namespace = await mf.getDurableObjectNamespace("REGIONS");
  const stub = namespace.get(namespace.idFromName(`${game}:${tokenHash}`));
  const receipt = JSON.parse(await stub.proofReplayLastClock());
  assert.deepEqual(receipt, JSON.parse(committed.clock.last_receipt_json));
  await mf.dispose();
  mf = undefined;
  await start();
  const reopenedNamespace = await mf.getDurableObjectNamespace("REGIONS");
  const reopened = reopenedNamespace.get(reopenedNamespace.idFromName(`${game}:${tokenHash}`));
  assert.deepEqual(JSON.parse(await reopened.proofReplayLastClock()), receipt, "last clock receipt survives workerd restart");
  const result = {
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtySource: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    fixture: game,
    inventory,
    implementationHash,
    wasmSha256: hash(wasmBytes),
    minimumSequence,
    activeSeconds,
    activatedSequence: activation.host.next_sequence,
    finalSequence: committed.host.next_sequence,
    finalRevision: committed.region.revision,
    paused: committed.host.paused === 1,
    sameCommandRetry: "identical reply",
    clockReceiptSurvivesRestart: true,
    workerdCostRows: ledger,
    elapsedWallMs: performance.now() - started,
    activeWallMs: performance.now() - activeStarted,
    limits: [
      "Local workerd / actual public Region host only; no Cloudflare backend was contacted",
      "A short run proves fixture admission, host transaction, receipt replay and restart only",
      "Host publication and SQL cost rows are included only when emitted by this source build",
      "Productive actor and work-chain samples come from measure-framework-proof-v4.ts, not this short host smoke",
    ],
  };
  await writeFile(resolve(output, "RESULT.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ proof: "framework-v4-workerd-smoke", status: "passed", output, finalSequence: result.finalSequence, workerdCostRows: ledger.length }));
} finally {
  await mf?.dispose();
}
