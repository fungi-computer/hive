import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
  await readFile(resolve(directory, "wrangler.json"), "utf8"),
);
const temporary = await mkdtemp(resolve(tmpdir(), "hive-region-proof-"));
config.main = resolve(directory, "worker.ts");
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
      assert.equal((await response.json()).service, "hive-region-local-proof");
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
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}
async function snapshot() {
  const response = await fetch(`${endpoint}/debug`, {
    headers: { Authorization: `Bearer ${secrets.DEBUG_SECRET}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const dig = (id, expectedRevision, x) => ({
  id,
  expectedRevision,
  command: { kind: "excavate", at: { x, y: -1, z: 0 } },
});
function check(name) {
  receipt.checks.push(name);
}
async function laws() {
  const initial = await snapshot();
  assert.equal(initial.snapshot.revision, 0);
  assert.equal((await fetch(`${endpoint}/debug`)).status, 403);
  const first = dig("first", 0, 0);
  assert.equal(
    (await command(first, { role: "SPECTATOR_SECRET" })).status,
    403,
  );
  assert.deepEqual(await snapshot(), initial);
  check("permission rejection unchanged");
  const rollback = await command(first, { fault: "before-commit" });
  assert.deepEqual(rollback, {
    status: 503,
    body: { error: "injected-before-commit" },
  });
  assert.deepEqual(await snapshot(), initial);
  check("native transaction rollback after state and event writes");
  const lost = await command(first, { fault: "after-commit" });
  assert.equal(lost.status, 503);
  const committed = await snapshot();
  assert.equal(committed.snapshot.revision, 1);
  assert.equal(committed.snapshot.state.excavated, 1);
  assert.equal(committed.events.length, 1);
  await writeFile(
    resolve(output, "before-restart.json"),
    JSON.stringify(committed, null, 2),
  );
  await stop(true);
  await start();
  assert.deepEqual(await snapshot(), committed);
  check("abrupt process loss exact SQLite restore");
  const replay = await command(first);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.status, "applied");
  assert.deepEqual(await command(first), replay);
  assert.deepEqual(await snapshot(), committed);
  check("lost acknowledgment receipt replay no extra resource or event");
  assert.equal((await command(dig("first", 0, 1))).status, 409);
  assert.deepEqual(await snapshot(), committed);
  check("same id different payload conflict");
  const stale = dig("stale", 0, 1);
  const staleReceipt = await command(stale);
  assert.deepEqual(staleReceipt.body.result, { reason: "stale-revision" });
  assert.equal(staleReceipt.body.status, "rejected");
  assert.deepEqual(await command(stale), staleReceipt);
  assert.deepEqual(await snapshot(), committed);
  check("stale receipt replay unchanged world");
  const concurrent = await Promise.all([
    command(dig("parallel-a", 1, 1)),
    command(dig("parallel-b", 1, 2)),
  ]);
  assert.deepEqual(concurrent.map((item) => item.body.status).sort(), [
    "applied",
    "rejected",
  ]);
  const final = await snapshot();
  assert.equal(final.snapshot.revision, 2);
  assert.equal(final.snapshot.state.excavated, 2);
  assert.equal(final.events.length, 2);
  assert.equal(
    final.snapshot.state.materials.state.lots.reduce(
      (sum, lot) => sum + lot.quantity,
      0,
    ),
    2,
  );
  check("concurrent expected revision serialization and material conservation");
  await stop(true);
  await start();
  assert.deepEqual(await snapshot(), final);
  assert.deepEqual(await command(stale), staleReceipt);
  assert.deepEqual(await command(first), replay);
  check("final snapshot events and rejected receipts persist");
  await writeFile(
    resolve(output, "final.json"),
    JSON.stringify(final, null, 2),
  );
}
try {
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
