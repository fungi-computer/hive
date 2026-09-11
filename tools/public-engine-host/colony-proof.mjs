import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const outputArgument = process.argv[2];
assert(typeof outputArgument === "string" && outputArgument.length > 0, "usage: node colony-proof.mjs <output>");
const output = resolve(outputArgument);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const port = 8789;
const endpoint = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString("hex");
const configPath = resolve(output, "wrangler.json");
let child;
let starts = 0;
let log = "";

function redact(value) {
  return String(value).replaceAll(token, "[public-token]").replace(/Bearer\s+[a-f0-9]{64}/gi, "Bearer [redacted]");
}
async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once("error", no); server.listen(port, "127.0.0.1", yes); });
  await new Promise((yes, no) => server.close((error) => error ? no(error) : yes()));
}
async function start() {
  assert.equal(starts < 2, true, "Colony witness start budget exceeded");
  await freePort();
  starts++;
  child = spawn(process.execPath, [resolve(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--local",
    "--show-interactive-dev-session=false", "--persist-to", resolve(output, "sqlite")], {
    cwd: root, detached: true, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { log += data; });
  child.stderr.on("data", (data) => { log += data; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
    const body = response ? await response.text().catch(() => "") : "";
    if (response?.status === 404 && body.includes('"error":"not-found"')) return;
    await delay(100);
  }
  throw new Error(`public host readiness timeout: ${redact(log.slice(-4096))}`);
}
async function stop() {
  const owned = child;
  child = undefined;
  if (!owned) return;
  if (owned.exitCode === null && owned.signalCode === null) {
    process.kill(-owned.pid, "SIGTERM");
    await delay(1000);
    if (owned.exitCode === null && owned.signalCode === null) process.kill(-owned.pid, "SIGKILL");
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await freePort(); return; } catch (error) { if (error.code !== "EADDRINUSE") throw error; await delay(100); }
  }
  throw new Error("public host listener did not close");
}
async function jsonResponse(response) {
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = undefined; }
  return { response, text, value };
}
async function observe() {
  const result = await jsonResponse(await fetch(`${endpoint}/v1/colony/observe`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
  }));
  assert.equal(result.response.status, 200, redact(result.text));
  assert(Number.isSafeInteger(result.value?.revision), "observation revision missing");
  assert(result.value.observation && Array.isArray(result.value.observation.facts), "observation facts missing");
  return result.value;
}
async function send(body) {
  const result = await jsonResponse(await fetch(`${endpoint}/v1/colony/command`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  }));
  assert.equal(result.response.status, 200, redact(result.text));
  assert.equal(result.value?.commandId, body.id, "receipt command identity mismatch");
  return result.value;
}
let sequence = 0;
async function admit(command, label) {
  const body = { id: `colony-${label}-${++sequence}`, command };
  const receipt = await send(body);
  assert.equal(receipt.status, "applied", `${label} was rejected: ${JSON.stringify(receipt)}`);
  return { body, receipt };
}
async function waitFor(predicate, label, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const current = await observe();
    if (predicate(current)) return current;
    await delay(150);
  }
  throw new Error(`timed out waiting for ${label}`);
}
function terrain(observation) {
  const frame = observation.observation.terrain;
  assert(frame && Array.isArray(frame.surfaces) && frame.surfaces.length > 0, "Colony terrain surface projection missing");
  assert(Number.isFinite(frame.verticalMetres) && frame.verticalMetres > 0, "Colony terrain metric missing");
  return frame;
}
function surfaceAt(observation, x, z) {
  const row = terrain(observation).surfaces.find(({ cell }) => cell[0] === x && cell[2] === z);
  assert(row, `published surface missing at ${x},${z}`);
  return row;
}
function fact(observation, id) {
  const row = observation.observation.facts.find((candidate) => candidate.id === id);
  assert(row, `published fact missing: ${id}`);
  return row;
}
function quantity(observation, container, kind = undefined) {
  const row = observation.observation.facts.find((candidate) => candidate.id === container);
  return (row?.inventory?.items ?? [])
    .filter((item) => kind === undefined || item.kind === kind)
    .reduce((sum, item) => sum + item.quantity, 0);
}
function presentationFact(observation, id) {
  const row = observation.observation.presentationFacts?.find((candidate) => candidate.id === id);
  assert(row, `published presentation fact missing: ${id}`);
  return row;
}
function digMarks(observation) {
  return (observation.observation.terrainMarks ?? [])
    .filter((mark) => mark.id.startsWith("colony.dig."))
    .sort((left, right) => left.id.localeCompare(right.id));
}
function physical(observation) {
  const frame = terrain(observation);
  return {
    terrain: { revision: frame.revision, surfaces: frame.surfaces, water: frame.water },
    pantry: quantity(observation, "colony.pantry"),
    pantrySpoil: quantity(observation, "colony.pantry", "soil-spoil") + quantity(observation, "colony.pantry", "stone-spoil"),
    worker1: quantity(observation, "colony.worker.1"),
    worker2: quantity(observation, "colony.worker.2"),
    digMarks: digMarks(observation),
  };
}
function assertQueuedArea(observation) {
  assert.equal(observation.observation.paused, true, "Colony should remain paused");
  assert.equal(presentationFact(observation, "dig-orders").value, 2, "queued dig order count changed");
  assert.deepEqual(digMarks(observation).map((mark) => [mark.id, mark.status]), [
    ["colony.dig.1.13.0", "queued"], ["colony.dig.2.13.0", "queued"],
  ], "queued area projection changed");
  assert.equal(quantity(observation, "colony.pantry"), 6, "paused area changed pantry inventory");
  assert.equal(quantity(observation, "colony.worker.1"), 0, "paused area changed worker 1 inventory");
  assert.equal(quantity(observation, "colony.worker.2"), 0, "paused area changed worker 2 inventory");
}
function assertCutsAndSpoil(observation) {
  for (const x of [1, 2]) {
    const row = surfaceAt(observation, x, 0);
    assert(row.cell[1] < 13, `area cell ${x},13,0 was not excavated`);
  }
  assert.equal(quantity(observation, "colony.pantry", "soil-spoil") + quantity(observation, "colony.pantry", "stone-spoil"), 6,
    "pantry does not contain six spoil units");
  assert.equal(quantity(observation, "colony.worker.1") + quantity(observation, "colony.worker.2"), 0,
    "workers still carry material");
  assert.equal(digMarks(observation).length, 0, "completed dig orders remain projected");
}


await mkdir(output, { recursive: true });
try {
  const inventory = [
    "tools/public-engine-host/worker.ts", "tools/public-engine-host/protocol.ts",
    "engine/src/games/colony.ts", "engine/src/games/colony-environment.ts", "engine/src/games/colony-work.ts", "engine/src/presentation.ts", "engine/src/runtime/observation.ts",
    "engine/src/runtime/session.ts", "engine/src/runtime/region-program.ts", "engine/src/contracts.ts",
    "engine/generated/hive_kernel.js", "engine/generated/hive_kernel_bg.wasm",
  ].sort();
  const digest = createHash("sha256");
  const hashes = [];
  for (const relative of inventory) {
    const bytes = await readFile(resolve(root, relative));
    digest.update(relative); digest.update("\0"); digest.update(bytes); digest.update("\0");
    hashes.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  await writeFile(resolve(output, "hash-inventory.json"), JSON.stringify(hashes, null, 2));
  const config = JSON.parse(await readFile(resolve(root, "tools/public-engine-host/wrangler.json"), "utf8"));
  config.main = resolve(root, "tools/public-engine-host/worker.ts");
  config.vars = { IMPLEMENTATION_HASH: digest.digest("hex"), PUBLIC_ORIGIN: endpoint };
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });

  await start();
  const initial = await observe();
  assert.equal(quantity(initial, "colony.pantry"), 6, "fresh Colony pantry baseline changed");
  assert.equal(digMarks(initial).length, 0, "fresh Colony has unexpected dig orders");

  const pause = await admit({ kind: "pause" }, "pause-before-area");
  const area = await admit({ kind: "command", name: "dig", input: {
    area: { start: [1, 13, 0], end: [2, 13, 0] },
  } }, "area");
  const queued = await observe();
  assertQueuedArea(queued);

  const queuedWitness = { initial: physical(initial), pause: pause.receipt, area: { body: area.body, receipt: area.receipt },
    queued: { revision: queued.revision, observation: queued, physical: physical(queued) } };

  await stop();
  await start();
  const reopened = await observe();
  assertQueuedArea(reopened);
  assert.deepEqual(digMarks(reopened), digMarks(queued), "restart changed queued area projection");
  const replay = await send(area.body);
  assert.deepEqual(replay, area.receipt, "replayed area receipt changed");
  const afterReplay = await observe();
  assertQueuedArea(afterReplay);
  assert.equal(digMarks(afterReplay).length, 2, "replayed area duplicated an order");
  queuedWitness.replay = replay;
  queuedWitness.afterReplay = { revision: afterReplay.revision, physical: physical(afterReplay) };
  await writeFile(resolve(output, "colony-proof-area.json"), JSON.stringify(queuedWitness, null, 2));

  const resume = await admit({ kind: "resume" }, "resume-after-restart");
  const completed = await waitFor((current) => {
    try {
      assertCutsAndSpoil(current);
      return true;
    } catch {
      return false;
    }
  }, "both area cuts, six pantry spoil, and empty workers", 45_000);
  const finalPause = await admit({ kind: "pause" }, "pause-final");
  const final = await observe();
  assertCutsAndSpoil(final);
  assert.equal(final.observation.paused, true, "final Colony pause was not applied");
  await writeFile(resolve(output, "colony-proof-restart.json"), JSON.stringify({
    reopened, resume: resume.receipt, completed: { revision: completed.revision, observation: completed, physical: physical(completed) },
    finalPause: finalPause.receipt, final: { revision: final.revision, observation: final, physical: physical(final) },
  }, null, 2));
  console.log(JSON.stringify({ status: "passed", starts, areaCells: 2, restarted: true }));

} catch (error) {
  await writeFile(resolve(output, "colony-proof-diagnostics.json"), JSON.stringify({ status: "failed", starts, error: redact(error?.stack ?? error), log: redact(log.slice(-16384)) }, null, 2));
  throw error;
} finally {
  await stop();
}
