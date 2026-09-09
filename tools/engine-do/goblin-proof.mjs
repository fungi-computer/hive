import { terrainFacts } from "../../src/terrain.ts";
import { fieldWaterBalance } from "../../src/field-water.ts";
import {
  containerQuantity,
  selectContainerPortions,
} from "../../src/materials.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

assert(
  (process.argv.length === 4 || process.argv.length === 6) &&
    process.argv[2] === "--output",
  "Usage: node goblin-proof.mjs --output <new directory> [--fixture dig|field]",
);
const fixture = process.argv.length === 4 ? "dig" : process.argv[5];
assert(process.argv.length === 4 || process.argv[4] === "--fixture");
assert(fixture === "dig" || fixture === "field", "Unknown fixed proof fixture");
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
  await readFile(resolve(directory, "goblin.wrangler.json"), "utf8"),
);
const temporary = await mkdtemp(resolve(tmpdir(), "hive-region-proof-"));
config.main = resolve(directory, "goblin-worker.ts");
config.vars = { ...secrets, FIXTURE: fixture };
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
const receipt = {
  status: "running",
  fixture,
  endpoint,
  checks: [],
  processes: [],
};
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
      assert.equal((await response.json()).service, "hive-goblin-local-proof");
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
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJson: redact(text).slice(0, 4096) };
  }
  const result = { status: response.status, body };
  (receipt.requests ??= []).push({ input, role, fault: fault ?? null, result });
  return result;
}
async function snapshot() {
  const response = await fetch(`${endpoint}/debug`, {
    headers: { Authorization: `Bearer ${secrets.DEBUG_SECRET}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
function check(name) {
  receipt.checks.push(name);
}
async function digLaws() {
  const initial = await snapshot();
  assert.equal(initial.snapshot.state.clearing.paused, true);
  const order = {
    id: "shared-dig",
    expectedRevision: 0,
    command: {
      kind: "order",
      command: {
        kind: "dig",
        party: "home",
        actors: null,
        voxel: [0, 14, 128],
      },
    },
  };
  assert.equal(
    (await command(order, { role: "SPECTATOR_SECRET" })).status,
    403,
  );
  const admission = await command(order);
  assert.equal(admission.status, 200);
  assert.equal(admission.body.status, "applied");
  const accepted = await snapshot();
  assert.equal(accepted.snapshot.state.clearing.tick, 0);
  assert.deepEqual(accepted.snapshot.state.clearing.terrain.exports, []);
  assert.deepEqual(
    admission.body.result.createdJobs,
    accepted.snapshot.state.clearing.jobs.map((j) => j.id),
  );
  assert.equal(admission.body.result.createdJobs.length, 1);
  assert.deepEqual(await command(order), admission);
  check(
    "paused player admission returns real job identity; duplicate receipt creates no work",
  );
  const pauseNoop = {
    id: "paused-advance",
    expectedRevision: 1,
    command: { kind: "advance", ticks: 120 },
  };
  assert.equal((await command(pauseNoop)).status, 403);
  const paused = await command(pauseNoop, { role: "SPECTATOR_SECRET" });
  assert.equal(paused.body.result.advanced, 0);
  assert.equal((await snapshot()).events.length, accepted.events.length);
  assert.equal(
    (
      await command({
        id: "run",
        expectedRevision: 2,
        command: { kind: "set-paused", paused: false },
      })
    ).body.status,
    "applied",
  );
  const firstAdvance = {
    id: "first-ten",
    expectedRevision: 3,
    command: { kind: "advance", ticks: 10 },
  };
  const running = await command(firstAdvance, { role: "SPECTATOR_SECRET" });
  assert.equal(running.status, 200, JSON.stringify(running));
  assert.equal(running.body.result.advanced, 10);
  const working = await snapshot();
  assert.equal(working.snapshot.state.clearing.tick, 10);
  assert.equal(working.snapshot.state.clearing.paused, false);
  assert(
    working.snapshot.state.clearing.actors.rowan.task,
    "actual pawn has work",
  );
  await writeFile(
    resolve(output, "working-before-restart.json"),
    JSON.stringify(working, null, 2),
  );
  await stop(true);
  await start();
  assert.deepEqual(await snapshot(), working);
  check(
    "actual optimizer pawn work survives abrupt DO process restart without Continue pause",
  );
  const finish = {
    id: "finish-fifty",
    expectedRevision: 4,
    command: { kind: "advance", ticks: 50 },
  };
  const finished = await command(finish, { role: "SPECTATOR_SECRET" });
  assert.equal(finished.body.result.advanced, 50);
  const final = await snapshot();
  const clearing = final.snapshot.state.clearing;
  assert.equal(clearing.tick, 60);
  assert.equal(clearing.terrain.exports.length, 1);
  assert.equal(
    clearing.materials.lots
      .filter((l) => l.material === "soil")
      .reduce((n, l) => n + l.quantity, 0),
    1,
  );
  assert(!Object.hasOwn(clearing, "commands"));
  await stop(true);
  await start();
  assert.deepEqual(
    await command(finish, { role: "SPECTATOR_SECRET" }),
    finished,
  );
  assert.deepEqual(await command(order), admission);
  assert.deepEqual(await snapshot(), final);
  await writeFile(
    resolve(output, "final.json"),
    JSON.stringify(final, null, 2),
  );
  check(
    "real dig changes one voxel and yields one soil; restart/retry repeats neither tick nor effect",
  );
}

function fieldFacts(value) {
  const state = value.snapshot.state.clearing;
  const operation = state.operations.find(
    (entry) => entry.id === "water-operation",
  );
  const terrain = terrainFacts(state.terrain);
  const pit = terrain.soil.nodes.find(
    (node) => node.nodeId === "reservoir:column-p0-p128",
  );
  const balance = fieldWaterBalance(state);
  assert(Math.abs(balance.residualKg) <= balance.toleranceKg);
  return {
    tick: state.tick,
    phase: operation?.execution.phase,
    contents: operation?.execution.contents ?? [],
    pailWater: containerQuantity(
      state.materials,
      `vessel:${operation.pail}`,
      "water",
    ),
    pitKg: pit.massKg,
    exchangeKg: terrain.balance.exchangeWaterKg,
    balance,
    sinks: state.materials.sinks,
  };
}
async function recordField(name) {
  const saved = await snapshot();
  await writeFile(
    resolve(output, `${name}.json`),
    JSON.stringify({ ...saved, facts: fieldFacts(saved) }, null, 2),
  );
  return saved;
}
async function failedCommand(input, host, fault) {
  const response = await command(input, { ...host, fault });
  assert.deepEqual(response, {
    status: 503,
    body: { error: `injected-${fault}` },
  });
}
async function fieldLaws() {
  const initial = await recordField("field-initial");
  const state = initial.snapshot.state.clearing;
  const operation = state.operations[0];
  assert.equal(state.paused, false);
  assert.equal(fieldFacts(initial).tick, 0);
  assert.equal(fieldFacts(initial).phase, "draw");
  assert.equal(fieldFacts(initial).pailWater, 2);
  assert.equal(fieldFacts(initial).pitKg, 0);
  const returned = {
    id: "return-held-water",
    expectedRevision: 0,
    command: {
      kind: "return-field-water",
      binding: operation.supply.binding,
      nodeId: operation.supply.nodeId,
      operation: operation.id,
      quantity: 2,
      portions: selectContainerPortions(
        state.materials,
        `vessel:${operation.pail}`,
        "water",
        2,
      ).portions,
    },
  };
  assert.equal((await command(returned)).status, 403);
  assert.deepEqual(await snapshot(), initial);
  const host = { role: "SPECTATOR_SECRET" };
  await failedCommand(returned, host, "before-commit");
  assert.deepEqual(await snapshot(), initial);
  await stop(true);
  await start();
  assert.deepEqual(
    await recordField("field-return-rollback-reopened"),
    initial,
  );
  check(
    "unauthorized return and receipt-write failure preserve both physical owners, work, events and revision across restart",
  );

  await failedCommand(returned, host, "after-commit");
  const paid = await recordField("field-return-lost-ack");
  assert.equal(paid.snapshot.revision, 1);
  assert.equal(fieldFacts(paid).tick, 0);
  assert.equal(fieldFacts(paid).pailWater, 0);
  assert.equal(fieldFacts(paid).pitKg, 2);
  assert.equal(fieldFacts(paid).exchangeKg, 2);
  assert.deepEqual(fieldFacts(paid).sinks, []);
  await stop(true);
  await start();
  assert.deepEqual(await recordField("field-return-reopened"), paid);
  const returnReceipt = await command(returned, host);
  assert.equal(returnReceipt.status, 200);
  assert.equal(returnReceipt.body.status, "applied");
  assert.equal(returnReceipt.body.result.quantity, 2);
  assert.equal(returnReceipt.body.result.tick, 0);
  assert.equal(paid.events.length, 1);
  assert.equal(
    (
      await command(
        { ...returned, command: { ...returned.command, quantity: 1 } },
        host,
      )
    ).status,
    409,
  );
  assert.deepEqual(await command(returned, host), returnReceipt);
  assert.deepEqual(await snapshot(), paid);
  check(
    "lost return acknowledgement recovers one durable receipt after process restart without duplicate mass",
  );

  const draw = {
    id: "draw-and-walk",
    expectedRevision: 1,
    command: { kind: "advance", ticks: 1 },
  };
  assert.equal((await command(draw)).status, 403);
  await failedCommand(draw, host, "before-commit");
  assert.deepEqual(await snapshot(), paid);
  await stop(true);
  await start();
  assert.deepEqual(await recordField("field-draw-rollback-reopened"), paid);
  check(
    "ordinary worker draw, material allocation, progress and field tick all roll back with failed receipt",
  );

  await failedCommand(draw, host, "after-commit");
  const carrying = await recordField("field-draw-lost-ack");
  const carried = fieldFacts(carrying);
  assert.equal(carrying.snapshot.revision, 2);
  assert.equal(carried.tick, 1);
  assert.equal(carried.phase, "deliver");
  assert.equal(carried.pailWater, 2);
  assert.equal(carried.exchangeKg, 0);
  assert.equal(
    carried.contents.reduce((n, portion) => n + portion.quantity, 0),
    2,
  );
  assert.deepEqual(carried.sinks, []);
  const walking = carrying.snapshot.state.clearing.actors.rowan;
  assert.equal(walking.mode, "walk");
  assert(walking.path.length > 0);
  await stop(true);
  await start();
  assert.deepEqual(await recordField("field-draw-reopened"), carrying);
  const drawReceipt = await command(draw, host);
  assert.equal(drawReceipt.status, 200);
  assert.equal(drawReceipt.body.result.advanced, 1);
  assert.deepEqual(await command(draw, host), drawReceipt);
  assert.deepEqual(await snapshot(), carrying);
  check(
    "lost ordinary-draw acknowledgement replays its exact receipt with no new field charge or tick",
  );

  const continued = await command(
    {
      id: "continue-walk",
      expectedRevision: 2,
      command: { kind: "advance", ticks: 1 },
    },
    host,
  );
  assert.equal(continued.status, 200);
  const final = await recordField("field-continued-walk");
  assert.equal(fieldFacts(final).tick, 2);
  assert.equal(fieldFacts(final).phase, "deliver");
  assert.equal(fieldFacts(final).exchangeKg, 0);
  assert.equal(fieldFacts(final).pailWater, 2);
  assert.deepEqual(fieldFacts(final).contents, carried.contents);
  assert.deepEqual(fieldFacts(final).sinks, []);
  assert.equal(final.snapshot.state.clearing.actors.rowan.mode, "walk");
  assert.equal(final.snapshot.state.clearing.actors.rowan.leg, walking.leg + 1);
  check(
    "continued actual movement preserves the same held portions and never redraws",
  );
}

try {
  const files = [
    "goblin-worker.ts",
    "goblin-proof.mjs",
    "goblin.wrangler.json",
    "goblin-field-fixture.ts",
    "../../src/field-water.ts",
    "../../src/field-water-source.ts",
    "../../src/water-supply.ts",
    "../../src/activity.ts",
    "../../src/clearing.ts",
    "../../src/clearing-state.ts",
    "../../src/orders.ts",
    "../../src/command-schema.ts",
    "../../src/world-presets/goblin-region.ts",
    "../../src/engine/colony/loader.ts",
    "../../src/engine/colony/colony.mjs",
    "../../src/engine/colony/colony.wasm",
  ];
  // Pin the actual local import closure, including physical/codec/work owners.
  // Bare package imports stay visible separately; no secret/runtime files enter it.
  const pending = files.map((file) => resolve(directory, file));
  const hashes = new Map();
  const packages = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (hashes.has(path)) continue;
    const bytes = await readFile(path);
    hashes.set(path, createHash("sha256").update(bytes).digest("hex"));
    if (!/\.(?:ts|js|mjs)$/.test(path)) continue;
    for (const match of bytes
      .toString()
      .matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      if (match[1].startsWith("."))
        pending.push(resolve(dirname(path), match[1]));
      else packages.add(match[1]);
    }
  }
  receipt.sourceHashes = Object.fromEntries(
    [...hashes].map(([path, hash]) => [relative(directory, path), hash]).sort(),
  );
  receipt.externalImports = [...packages].sort();
  await start();
  await (fixture === "field" ? fieldLaws() : digLaws());
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
