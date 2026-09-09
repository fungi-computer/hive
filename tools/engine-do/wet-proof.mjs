import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { createWetClearing } from "../../src/world-presets/seepage/wet-clearing.mjs";
import {
  createVoxelWorld,
  MATERIAL,
} from "../../src/world-presets/height-caves.mjs";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

assert(
  process.argv.length === 4 && process.argv[2] === "--output",
  "Usage: node proof.mjs --output <new directory>",
);
const output = resolve(process.argv[3]);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Do not accidentally reuse another proof's database.
const directory = fileURLToPath(new URL(".", import.meta.url));
const secrets = Object.fromEntries(
  ["WRITER_SECRET", "HOST_SECRET", "DEBUG_SECRET"].map((key) => [
    key,
    randomBytes(32).toString("hex"),
  ]),
);
const config = JSON.parse(
  await readFile(resolve(directory, "wet-wrangler.json"), "utf8"),
);
const temporary = await mkdtemp(resolve(tmpdir(), "hive-wet-region-proof-"));
config.main = resolve(directory, "wet-worker.ts");
config.vars = secrets;
await writeFile(resolve(temporary, "wrangler.json"), JSON.stringify(config), {
  mode: 0o600,
});
const reservation = createServer();
await new Promise((yes, no) => {
  reservation.once("error", no);
  reservation.listen(0, "127.0.0.1", yes);
});
const port = reservation.address().port;
await new Promise((yes, no) =>
  reservation.close((error) => (error ? no(error) : yes())),
);
const endpoint = `http://127.0.0.1:${port}`;
const receipt = { status: "running", endpoint, checks: [], processes: [] };
let server;
function redact(text) {
  // Wrangler truncates displayed bindings, so complete-token replacement alone
  // cannot remove their prefixes. Omit the entire binding line first.
  text = text.replace(
    /^.*\b(?:WRITER_SECRET|HOST_SECRET|DEBUG_SECRET)\b.*$/gm,
    "[harness binding redacted]",
  );
  for (const secret of Object.values(secrets))
    text = text.replaceAll(secret, "[harness-secret]");
  return text;
}
async function start() {
  const env = Object.fromEntries(
    ["PATH", "HOME", "USER", "TMPDIR", "LD_LIBRARY_PATH"]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, { CI: "true", WRANGLER_SEND_METRICS: "false" });
  const child = spawn(
    process.execPath,
    [
      resolve(directory, "../../node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      resolve(temporary, "wrangler.json"),
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      "0",
      "--local",
      "--show-interactive-dev-session=false",
      "--persist-to",
      resolve(output, "sqlite"),
    ],
    { cwd: directory, env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const entry = { pid: child.pid, log: "", exit: null };
  const exited = new Promise((yes, no) => {
    child.once("error", no);
    child.once("exit", (code, signal) => {
      entry.exit = { code, signal };
      yes();
    });
  });
  child.stdout.on("data", (data) => {
    entry.log += data;
  });
  child.stderr.on("data", (data) => {
    entry.log += data;
  });
  server = { child, entry, exited };
  receipt.processes.push(entry);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(entry.exit, null, "Owned runtime exited before readiness");
    const response = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null);
    if (response?.ok) {
      assert.equal(
        (await response.json()).service,
        "hive-wet-region-local-proof",
      );
      return;
    }
    await delay(100);
  }
  throw new Error("Owned runtime readiness timeout");
}
async function stop(abrupt = false) {
  if (!server) return;
  const { child, entry, exited } = server;
  for (const signal of abrupt
    ? ["SIGKILL"]
    : ["SIGINT", "SIGTERM", "SIGKILL"]) {
    if (entry.exit) break;
    process.kill(-child.pid, signal);
    await Promise.race([exited, delay(5000, undefined, { ref: false })]);
  }
  await exited;
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(300),
    }).catch(() => null);
    if (!response) {
      entry.listenerClosed = true;
      break;
    }
    await delay(100);
  }
  assert.equal(entry.listenerClosed, true);
  server = undefined;
}
async function command(input, { role = "WRITER_SECRET", fault } = {}) {
  const response = await fetch(`${endpoint}/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets[role]}`,
      "Content-Type": "application/json",
      ...(fault
        ? { "X-Harness-Fault": fault, "X-Harness-Debug": secrets.DEBUG_SECRET }
        : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: ${redact(text).slice(0, 2048)}`);
  }
  return { status: response.status, body };
}
async function snapshot() {
  const response = await fetch(`${endpoint}/debug`, {
    headers: { Authorization: `Bearer ${secrets.DEBUG_SECRET}` },
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  assert.equal(
    response.status,
    200,
    `debug HTTP ${response.status}: ${redact(text).slice(0, 2048)}`,
  );
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `debug HTTP ${response.status}: ${redact(text).slice(0, 2048)}`,
    );
  }
}
const dig = (id, expectedRevision, at) => ({
  id,
  expectedRevision,
  command: { kind: "excavate", at },
});
const advance = {
  id: "six-seconds",
  expectedRevision: 3,
  command: { kind: "advance", seconds: 6 },
};
const first = dig("first", 0, [0, 14, 128]);
const second = dig("adjacent", 1, [1, 14, 128]);
const deep = dig("deeper", 2, [1, 13, 128]);
function check(name) {
  receipt.checks.push(name);
}
async function files(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else found.push(path);
  }
  return found;
}
async function durable() {
  for (const path of (await files(resolve(output, "sqlite"))).filter((path) =>
    path.endsWith(".sqlite"),
  )) {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      if (
        !db
          .prepare("SELECT name FROM sqlite_master WHERE name='hive_region'")
          .get()
      )
        continue;
      return {
        region: db.prepare("SELECT * FROM hive_region").all(),
        receipts: db
          .prepare(
            "SELECT * FROM hive_region_receipts ORDER BY principal,command_id",
          )
          .all(),
        events: db
          .prepare("SELECT * FROM hive_region_events ORDER BY sequence")
          .all(),
      };
    } finally {
      db.close();
    }
  }
  throw new Error("missing-retained-region-sqlite");
}
async function lostAcknowledgment(input, options, label) {
  let settled = false;
  const pending = command(input, { ...options, fault: "after-commit" }).then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      return { error: redact(String(error)) };
    },
  );
  const deadline = Date.now() + 20000;
  let witness;
  while (Date.now() < deadline) {
    witness = await durable();
    if (witness.receipts.some((row) => row.command_id === input.id)) break;
    await delay(20);
  }
  assert(
    witness.receipts.some((row) => row.command_id === input.id),
    "committed receipt before response",
  );
  assert.equal(settled, false, "success acknowledgment is still withheld");
  await writeFile(
    resolve(output, `${label}-before-restart.json`),
    JSON.stringify(witness, null, 2),
  );
  await stop(true);
  await pending;
  await start();
  assert.deepEqual(
    await durable(),
    witness,
    "read-only storage survives before any DO fetch",
  );
  const restored = await snapshot();
  assert.equal(restored.snapshot.revision, witness.region[0].revision);
  assert.deepEqual(
    restored.snapshot.state,
    JSON.parse(witness.region[0].state_json),
  );
  assert.deepEqual(
    restored.events,
    witness.events.map((row) => ({
      sequence: row.sequence,
      event: JSON.parse(row.event_json),
    })),
  );
  assert.deepEqual(
    await durable(),
    witness,
    "fresh constructor is read-only for committed state",
  );
  const replay = await command(input, options);
  assert.equal(replay.status, 200);
  const original = JSON.parse(
    witness.receipts.find((row) => row.command_id === input.id).receipt_json,
  );
  assert.deepEqual(replay.body, original);
  assert.deepEqual(await command(input, options), replay);
  assert.deepEqual(await durable(), witness);
  await writeFile(
    resolve(output, `${label}-after-restart.json`),
    JSON.stringify(restored, null, 2),
  );
  check(
    `${label}: persisted receipt before lost acknowledgment; kill/reconstruct/replay unchanged`,
  );
  return restored;
}
async function laws() {
  const initial = await snapshot(),
    initialSql = await durable();
  const recipe = createWetClearing({ connected: true });
  assert.deepEqual(initial.snapshot.state.environment, recipe.input);
  assert.equal((await fetch(`${endpoint}/debug`)).status, 403);
  assert.equal((await command(first, { role: "HOST_SECRET" })).status, 403);
  assert.equal(
    (await command({ ...advance, expectedRevision: 0 })).status,
    403,
  );
  assert.deepEqual(await durable(), initialSql);
  check(
    "host/player grants distinct, initial state is actual generated recipe",
  );
  assert.equal((await command(first, { fault: "before-commit" })).status, 503);
  assert.deepEqual(await snapshot(), initial);
  assert.deepEqual(await durable(), initialSql);
  check(
    "native transaction fault after terrain/water/spoil/event/receipt writes rolls back all rows",
  );
  const cut = await lostAcknowledgment(first, {}, "cut");
  assert.equal(cut.snapshot.state.environment.exports.length, 1);
  assert.equal(cut.snapshot.state.environment.soilState.timeS, 0);
  assert.equal((await command(second)).status, 200);
  assert.equal((await command(deep)).status, 200);
  const ledge = await snapshot(),
    ledgeSql = await durable();
  const state = ledge.snapshot.state.environment;
  assert.equal(state.exports.length, 3);
  assert.equal(state.world.revision, 3);
  assert.equal(state.soilState.timeS, 0);
  const world = createVoxelWorld(state.world.identity, {
    checkpoint: state.world,
  });
  assert.equal(world.readPoint({ x: 1, y: 12, z: 128 }), MATERIAL.stone);
  assert.equal((await command(dig("stone", 3, [1, 12, 128]))).status, 400);
  assert.deepEqual(await durable(), ledgeSql);
  const before = recipe.adapter.read(state);
  assert.equal(before.balance.pitWaterKg, 0);
  check(
    "two adjacent cuts then deeper owned soil exposes actual stone floor; no granted water or clock change",
  );
  assert.equal(
    (await command(advance, { role: "HOST_SECRET", fault: "before-commit" }))
      .status,
    503,
  );
  assert.deepEqual(await snapshot(), ledge);
  assert.deepEqual(await durable(), ledgeSql);
  check(
    "failed field advance rolls back water mass, clock and receipt together",
  );
  const final = await lostAcknowledgment(
    advance,
    { role: "HOST_SECRET" },
    "advance",
  );
  const facts = recipe.adapter.read(final.snapshot.state.environment);
  assert.equal(facts.timeS, 6);
  assert.equal(final.snapshot.revision, 4);
  assert.equal(final.snapshot.state.environment.world.revision, 3);
  assert.equal(final.snapshot.state.environment.exports.length, 3);
  assert(facts.balance.pitWaterKg > 0);
  assert(Math.abs(facts.balance.totalWaterKg - state.initialWaterKg) < 2e-9);
  assert(Math.abs(facts.balance.residualKg) < 2e-9);
  const finalSql = await durable();
  assert.equal(finalSql.receipts.length, 4);
  assert.equal(finalSql.events.length, 4);
  assert.equal(
    (await command({ ...first, command: second.command })).status,
    409,
  );
  assert.deepEqual(await durable(), finalSql);
  const reconstructed = recipe.adapter.parse(final.snapshot.state.environment);
  assert.deepEqual(reconstructed, final.snapshot.state.environment);
  receipt.physical = {
    cuts: 3,
    timeS: facts.timeS,
    pitWaterKg: facts.balance.pitWaterKg,
    totalWaterKg: facts.balance.totalWaterKg,
    residualKg: facts.balance.residualKg,
    spoilVoxelM3: state.exports.reduce(
      (sum, item) => sum + item.sourceVoxelM3,
      0,
    ),
  };
  await writeFile(
    resolve(output, "final.json"),
    JSON.stringify(final, null, 2),
  );
  check(
    "fresh exact reconstruction, finite original water, three spoil exports, no double cut or time advance",
  );
}
async function inventory() {
  const built = await build({
    entryPoints: [resolve(directory, "wet-worker.ts")],
    bundle: true,
    write: false,
    platform: "neutral",
    format: "esm",
    target: "es2024",
    metafile: true,
  });
  const hashes = {};
  for (const path of [
    ...Object.keys(built.metafile.inputs),
    resolve(directory, "wet-proof.mjs"),
    resolve(directory, "wet-wrangler.json"),
  ])
    hashes[path] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  await writeFile(
    resolve(output, "source-hashes.json"),
    JSON.stringify(hashes, null, 2),
  );
  await writeFile(
    resolve(output, "metafile.json"),
    JSON.stringify(built.metafile, null, 2),
  );
}

try {
  await inventory();
  await start();
  await laws();
  receipt.status = "passed";
} catch (error) {
  receipt.status = "failed";
  receipt.error = error.stack;
  process.exitCode = 1;
} finally {
  try {
    await stop();
  } catch (error) {
    receipt.status = "failed";
    receipt.cleanupError = error.stack;
    process.exitCode = 1;
  }
  for (const [index, entry] of receipt.processes.entries()) {
    await writeFile(
      resolve(output, `wrangler-${index}.log`),
      redact(entry.log),
    );
    delete entry.log;
  }
  await rm(temporary, { recursive: true, force: true });
  await writeFile(
    resolve(output, "receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
}
console.log(JSON.stringify(receipt));
