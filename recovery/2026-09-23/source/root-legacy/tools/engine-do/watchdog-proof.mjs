import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  ["WRITER_SECRET", "SPECTATOR_SECRET", "DEBUG_SECRET"].map((key) => [
    key,
    randomBytes(32).toString("hex"),
  ]),
);
const config = JSON.parse(
  await readFile(resolve(directory, "watchdog.wrangler.json"), "utf8"),
);
const temporary = await mkdtemp(resolve(tmpdir(), "hive-region-proof-"));
config.main = resolve(directory, "watchdog-worker.ts");
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
    /^.*\b(?:WRITER_SECRET|SPECTATOR_SECRET|DEBUG_SECRET)\b.*$/gm,
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
      assert.equal((await response.json()).service, "hive-watchdog-local-proof");
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
async function responseJson(response) {
  const body = await response.text();
  try { return JSON.parse(body); }
  catch {
    throw new Error(`HTTP ${response.status} ${response.statusText}: non-JSON response ${redact(body).slice(0, 4096)}`);
  }
}
async function command(input, { role = "WRITER_SECRET", fault } = {}) {
  const response = await fetch(`${endpoint}/work`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets[role]}`,
      "Content-Type": "application/json",
      ...(fault
        ? { "X-Harness-Fault": fault, "X-Harness-Debug": secrets.DEBUG_SECRET }
        : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await responseJson(response) };
}
async function snapshot() {
  const response = await fetch(`${endpoint}/debug`, {
    headers: { Authorization: `Bearer ${secrets.DEBUG_SECRET}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  return responseJson(response);
}
const dig = (id, expectedRevision, x) => ({
  id,
  expectedRevision,
  command: { kind: "excavate", at: { x, y: -1, z: 0 } },
});
function check(name) {
  receipt.checks.push(name);
}
async function persisted() {
  const root = resolve(output, "sqlite/v3/do/hive-watchdog-local-proof-WatchdogQuarry");
  const names = await readdir(root);
  const file = names.find(name => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  assert(file, "Native DO SQLite exists");
  const db = new DatabaseSync(resolve(root, file), { readOnly: true });
  try {
    const rows = table => db.prepare(`SELECT * FROM ${table}`).all();
    return { observedAt: Date.now(), region: rows("hive_region"), receipts: rows("hive_region_receipts"),
      events: rows("hive_region_events"), jobs: rows("watchdog_jobs"),
      barriers: rows("hive_watchdog_harness"), witness: rows("hive_watchdog_witness") };
  } finally { db.close(); }
}
async function retain(name, state) {
  await writeFile(resolve(output, `${name}.json`), JSON.stringify(state, null, 2));
}
async function waitPersisted(name, predicate) {
  const deadline = Date.now() + 20_000;
  let state;
  while (Date.now() < deadline) {
    state = await persisted();
    if (predicate(state)) { await retain(name, state); return state; }
    await delay(100);
  }
  await retain(`${name}-timeout`, state);
  throw new Error(`Autonomous SQLite witness timeout: ${name}`);
}
function physical(state, count) {
  assert.equal(state.region[0].revision, count);
  const world = JSON.parse(state.region[0].state_json);
  assert.equal(world.excavated, count);
  assert.equal(world.materials.state.lots.reduce((sum, lot) => sum + lot.quantity, 0), count);
  assert.equal(state.events.length, count);
  assert.equal(state.receipts.length, count);
  assert.equal(state.witness[0].repairs, 0, "Constructor alarm repair was not needed");
}
async function publicResult(id) {
  const response = await fetch(`${endpoint}/work?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${secrets.WRITER_SECRET}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  const result = await responseJson(response);
  assert.equal(result.work.job.outcome, "completed");
  assert.equal(result.receipt.status, "applied");
  return result;
}
async function laws() {
  const oversized = await command(dig("\u0001".repeat(80), 0, 0));
  assert.equal(oversized.status, 409);
  assert.equal(oversized.body.error, "harness-job-identity-too-long");
  const empty = await persisted();
  assert.equal(empty.jobs.length, 0);
  check("encoded scoped identity rejected before admission");
  const first = await command(dig("queued-restart", 0, 0));
  assert.equal(first.status, 202);
  const queued = await persisted();
  assert.equal(queued.jobs[0].state, "queued");
  physical(queued, 0);
  await retain("queued-before-kill", queued);
  await stop(true);
  await start(); // /health is handled outside the DO. No DO request until SQL success.
  const recovered = await waitPersisted("queued-autonomous-after", s => s.jobs[0].state === "settled");
  physical(recovered, 1);
  assert.equal(recovered.jobs[0].outcome, "completed");
  assert(recovered.witness[0].alarms >= 1);
  await retain("queued-public-result", await publicResult("queued-restart"));
  check("queued restart runs by retained native alarm before any DO fetch");
  const second = await command(dig("effect-restart", 1, 1), { fault: "after-region-commit" });
  assert.equal(second.status, 202);
  const barrier = await waitPersisted("effect-before-kill", s => s.barriers.some(b => b.barrier === "reached"));
  physical(barrier, 2);
  assert.equal(barrier.jobs.find(j => j.job_id === second.body.jobId).state, "running");
  await stop(true);
  await start();
  const final = await waitPersisted("effect-autonomous-after", s => s.jobs.every(j => j.state === "settled"));
  physical(final, 2);
  assert.deepEqual(final.region, barrier.region);
  assert.deepEqual(final.receipts, barrier.receipts);
  assert.deepEqual(final.events, barrier.events);
  const job = final.jobs.find(j => j.job_id === second.body.jobId);
  assert.equal(job.outcome, "completed");
  assert.equal(job.recovery_count, 1);
  await retain("effect-public-result", await publicResult("effect-restart"));
  check("committed effect before terminal recovers via exact region receipt without duplicate lot/event");
}

try {
  const files = ["watchdog-worker.ts", "watchdog.wrangler.json", "watchdog-proof.mjs", "watchdog-env.d.ts", "watchdog.tsconfig.json", "package.json", "package-lock.json", "vendor/fungi.computer-watchdog-0.0.0.tgz", "vendor/fungi.computer-cairn-0.0.0.tgz", "../../src/engine/region/index.ts", "../../src/world-presets/excavation-region.ts"];
  receipt.sourceHashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash("sha256").update(await readFile(resolve(directory, file))).digest("hex")])));
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
