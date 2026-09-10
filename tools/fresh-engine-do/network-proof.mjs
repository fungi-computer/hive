import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";

assert(process.argv[2] === "--output" && process.argv.length === 4,
  "Usage: node network-proof.mjs --output <directory>");
const output = resolve(process.argv[3]);
const directory = fileURLToPath(new URL(".", import.meta.url));
await mkdir(output, { recursive: true });
const secrets = Object.fromEntries(
  ["WRITER_SECRET", "HOST_SECRET", "DEBUG_SECRET"].map((key) => [key, randomBytes(32).toString("hex")]),
);
const inventory = [
  "../../src/engine/region/codec.ts",
  "../../src/engine/region/index.ts",
  "../../engine/src/contracts.ts",
  "../../engine/src/presentation.ts",
  "../../engine/src/runtime/actions.ts",
  "../../engine/src/runtime/observation.ts",
  "../../engine/src/runtime/protocol.ts",
  "../../engine/src/runtime/region-program.ts",
  "../../engine/src/runtime/session.ts",
  "../../engine/src/runtime/wasm-kernel.ts",
  "../../engine/src/runtime/remote-client.ts",
  "../../engine/src/sdk/authoring.ts",
  "../../engine/src/sdk/common.ts",
  "../../engine/src/sdk/delivery.ts",
  "../../engine/src/games/survival.ts",
  "../../engine/src/games/pirates.ts",
  "../../engine/src/games/colony.ts",
  "../../engine/src/games/formations.ts",
  "../../engine/generated/hive_kernel.js",
  "../../engine/generated/hive_kernel.d.ts",
  "../../engine/generated/hive_kernel_bg.wasm",
  "./worker.ts",
].sort();
const fileHashes = [];
const hash = createHash("sha256");
for (const relative of inventory) {
  const bytes = await readFile(resolve(directory, relative));
  const digest = createHash("sha256").update(bytes).digest("hex");
  fileHashes.push({ path: relative, sha256: digest });
  hash.update(relative);
  hash.update("\0");
  hash.update(bytes);
  hash.update("\0");
}
await writeFile(resolve(output, "hash-inventory.json"), JSON.stringify(fileHashes, null, 2));
const config = JSON.parse(await readFile(resolve(directory, "wrangler.json"), "utf8"));
config.main = resolve(directory, "worker.ts");
config.vars = { ...secrets, IMPLEMENTATION_HASH: hash.digest("hex"), PROOF_PACK: "survival" };
const configPath = resolve(output, "wrangler.json");
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
let clientA;
let clientB;
const eventsA = [];
const eventsB = [];
let runtimeLog = "";
let lastObservationDiagnostic;
const port = 8789;
const endpoint = `http://127.0.0.1:${port}`;
let child;
let childExit;
let starts = 0;
function redact(text) {
  text = text.replace(/^.*(?:WRITER_SECRET|HOST_SECRET|DEBUG_SECRET).*$/gm, "[harness binding redacted]");
  for (const secret of Object.values(secrets)) text = text.replaceAll(secret, "[harness-secret]");
  return text;
}
async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once("error", no); server.listen(port, "127.0.0.1", yes); });
  await new Promise((yes, no) => server.close((error) => error ? no(error) : yes()));
}
async function start() {
  assert(starts < 3, "proof start budget exceeded");
  await freePort();
  starts++;
  child = spawn(process.execPath, [
    resolve(directory, "../../node_modules/wrangler/bin/wrangler.js"), "dev", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--local",
    "--show-interactive-dev-session=false", "--persist-to", resolve(output, "sqlite"),
  ], { cwd: directory, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  runtimeLog = "";
  child.stdout.on("data", (data) => { runtimeLog += data; });
  child.stderr.on("data", (data) => { runtimeLog += data; });
  let exited;
  childExit = new Promise((resolveExit) => child.once("exit", (code, signal) => { exited = { code, signal }; resolveExit(exited); }));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`runtime exited before readiness: ${redact(runtimeLog.slice(-4096))}`);
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
    if (response?.ok) return;
    await delay(100);
  }
  throw new Error(`runtime readiness timeout: ${redact(runtimeLog.slice(-4096))}`);
}
async function stop() {
  if (!child) return;
  const owned = child;
  child = undefined;
  if (owned.exitCode === null && owned.signalCode === null) {
    process.kill(-owned.pid, "SIGTERM");
    await Promise.race([childExit, delay(5000)]);
    if (owned.exitCode === null && owned.signalCode === null) {
      process.kill(-owned.pid, "SIGKILL");
      await childExit;
    }
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await freePort(); return; } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      await delay(100);
    }
  }
  throw new Error("owned listener did not close");
}
try {
const bundled = await build({
  entryPoints: [resolve(directory, "../../engine/src/runtime/remote-client.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "es2024",
  tsconfig: resolve(directory, "../../tsconfig.json"),
  metafile: true,
});
const clientPath = resolve(output, "remote-client.mjs");
await writeFile(clientPath, bundled.outputFiles[0].text);
const { connectRemoteRuntime } = await import(`${pathToFileURL(clientPath).href}?network-proof`);

function authorizedFetch(secret, loseCommandName, attempts) {
  let lost = false;
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${secret}`);
    const response = await fetch(input, { ...init, headers, signal: init.signal });
    let commandName;
    if (typeof init.body === "string") {
      try { commandName = JSON.parse(init.body).command?.name; } catch { commandName = undefined; }
    }
    if (String(input).endsWith("/command") && typeof init.body === "string")
      attempts?.push({ body: init.body });
    if (String(input).endsWith("/command"))
      attempts?.at(-1) && (attempts.at(-1).receipt = await response.clone().json().catch(() => undefined));
    if (loseCommandName && !lost && commandName === loseCommandName && String(input).endsWith("/command")) {
      lost = true;
      await response.arrayBuffer();
      const attempt = attempts?.at(-1);
      if (attempt) attempt.status = response.status;
      throw new Error("intentionally lost committed response");
    }
    const attempt = attempts?.at(-1);
    if (attempt) attempt.status = response.status;
    return response;
  };
}
async function observe(secret) {
  const response = await fetch(`${endpoint}/observe`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  lastObservationDiagnostic = { status: response.status, body: redact(text.slice(0, 4096)) };
  assert.equal(response.status, 200, text.slice(0, 512));
  return JSON.parse(text);
}
async function debugSnapshot() {
  const response = await fetch(`${endpoint}/debug`, {
    headers: { Authorization: `Bearer ${secrets.DEBUG_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
function scene(snapshot) {
  return JSON.parse(snapshot.snapshot.state.session.kernel.json).scene.initial;
}
function breadIn(snapshot, container) {
  return scene(snapshot).reduce((total, row) => {
    const lot = row.components["hive.lot"];
    return total + (lot?.kind === "bread" && lot.container === container ? lot.quantity : 0);
  }, 0);
}
async function hostStep(id, expectedRevision) {
  const response = await fetch(`${endpoint}/command`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secrets.HOST_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, expectedRevision, command: { kind: "step", delta: 0.1 } }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
function waitFor(events, predicate, label, cursor = 0) {
  return (async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const found = events.slice(cursor).find(predicate);
      if (found) return found;
      await delay(25);
    }
    throw new Error(`timed out waiting for ${label}`);
  })();
}
function waitUntil(predicate, label) {
  return (async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await delay(25);
    }
    throw new Error(`timed out waiting for ${label}`);
  })();
}

await start();
const denied = await fetch(`${endpoint}/observe`);
assert.equal(denied.status, 403, "observe requires the writer authorization");
const clientAAttempts = [];
clientA = connectRemoteRuntime({ endpoint, game: "survival", fetch: authorizedFetch(secrets.WRITER_SECRET, "takeFood", clientAAttempts), pollMs: 100 });
clientB = connectRemoteRuntime({ endpoint, game: "survival", fetch: authorizedFetch(secrets.WRITER_SECRET), pollMs: 100 });
  clientA.subscribe((event) => eventsA.push(event));
  clientB.subscribe((event) => eventsB.push(event));
  clientA.send({ type: "start", game: "survival" });
  clientB.send({ type: "start", game: "survival" });
  await Promise.all([waitFor(eventsA, (event) => event.type === "ready", "client A ready", 0), waitFor(eventsB, (event) => event.type === "ready", "client B ready", 0)]);
  const initial = await observe(secrets.WRITER_SECRET);
  assert.equal(initial.revision, 0);
  assert.deepEqual((await observe(secrets.WRITER_SECRET)).observation, initial.observation);

  const pauseCursorA = eventsA.length;
  const pauseCursorB = eventsB.length;
  clientA.send({ type: "pause" });
  await waitFor(eventsA, (event) => event.type === "state" && event.paused, "pause state", pauseCursorA);
  await waitFor(eventsB, (event) => event.type === "state" && event.paused, "second client sees pause", pauseCursorB);
  const resumeCursorA = eventsA.length;
  const resumeCursorB = eventsB.length;
  clientB.send({ type: "resume" });
  await waitFor(eventsB, (event) => event.type === "state" && !event.paused, "resume state", resumeCursorB);
  await waitFor(eventsA, (event) => event.type === "state" && !event.paused, "first client sees resume", resumeCursorA);

  const takeCursorA = eventsA.length;
  clientA.send({ type: "command", name: "takeFood" });
  await waitUntil(() => clientAAttempts.length >= 2, "take retry");
  await waitFor(eventsA, (event) => event.type === "frame" && event.sequence >= 3, "take observation", takeCursorA);
  assert.equal(clientAAttempts.length, 2, "lost take response was retried");
  assert.equal(clientAAttempts[0].body, clientAAttempts[1].body, "take retry reused exact envelope");
  assert.equal(clientAAttempts[0].status, 200);
  assert.equal(clientAAttempts[1].status, 200);
  assert.equal(clientAAttempts[0].receipt?.status, "applied");
  assert.equal(clientAAttempts[1].receipt?.status, "applied");
  assert.equal(clientAAttempts[0].receipt?.revision, 3);
  assert.equal(clientAAttempts[1].receipt?.revision, 3);
  const afterTake = await observe(secrets.WRITER_SECRET);
  assert.equal(afterTake.revision, 3, "lost command response commits exactly once");
  const takeStepCursorA = eventsA.length;
  const takeStepCursorB = eventsB.length;
  const stepTake = await hostStep("host-step-take", afterTake.revision);
  assert.equal(stepTake.status, "applied");
  await Promise.all([
    waitFor(eventsA, (event) => event.type === "frame" && event.sequence >= 4, "first client sees host step", takeStepCursorA),
    waitFor(eventsB, (event) => event.type === "frame" && event.sequence >= 4, "second client sees host step", takeStepCursorB),
  ]);
  const taken = await debugSnapshot();
  assert.equal(breadIn(taken, "survival.survivor.1"), 1, "replayed take command does not duplicate custody");
  assert.equal(breadIn(taken, "survival.locker"), 7);
  const eatCursorB = eventsB.length;
  clientB.send({ type: "command", name: "eatFood" });
  await waitFor(eventsB, (event) => event.type === "frame" && event.sequence >= 5, "eat observation", eatCursorB);
  const beforeEatStep = await observe(secrets.WRITER_SECRET);
  assert.equal(beforeEatStep.revision, 5);
  const finalCursorA = eventsA.length;
  const finalCursorB = eventsB.length;
  const stepEat = await hostStep("host-step-eat", beforeEatStep.revision);
  assert.equal(stepEat.status, "applied");
  await Promise.all([
    waitFor(eventsA, (event) => event.type === "frame" && event.sequence >= 6, "first client final frame", finalCursorA),
    waitFor(eventsB, (event) => event.type === "frame" && event.sequence >= 6, "second client final frame", finalCursorB),
  ]);
  const final = await observe(secrets.WRITER_SECRET);
  assert.equal(final.revision, 6);
  const eaten = await debugSnapshot();
  assert.equal(breadIn(eaten, "survival.survivor.1"), 0);
  assert.equal(breadIn(eaten, "survival.locker"), 7);
  assert.deepEqual((await observe(secrets.WRITER_SECRET)).observation, final.observation);
  const latestA = [...eventsA].reverse().find((event) => event.type === "frame");
  const latestB = [...eventsB].reverse().find((event) => event.type === "frame");
  assert.equal(latestA?.sequence, final.observation.sequence);
  assert.equal(latestB?.sequence, final.observation.sequence);
  assert.deepEqual(latestA?.facts, latestB?.facts, "both clients render the same committed frame");
  assert.deepEqual(eventsA.filter((event) => event.type === "error"), []);
  assert.deepEqual(eventsB.filter((event) => event.type === "error"), []);
} finally {
  clientA?.dispose();
  clientB?.dispose();
  await stop();
  await rm(configPath, { force: true });
  const summarizeEvents = (events) => events.map((event) => {
    if (event.type === "error") return { type: event.type, message: event.message };
    if (event.type === "frame") return { type: event.type, time: event.time, epoch: event.epoch, sequence: event.sequence, facts: event.facts.length };
    if (event.type === "presentation") return { type: event.type, facts: event.facts.length, controls: event.controls.length };
    if (event.type === "results") return { type: event.type, results: event.results.length };
    return event;
  });
  await writeFile(resolve(output, "network-proof-diagnostics.json"), JSON.stringify({
    runtimeLog: redact(runtimeLog.slice(-16_384)),
    clientA: summarizeEvents(eventsA),
    clientB: summarizeEvents(eventsB),
    lastObservation: lastObservationDiagnostic,
  }, null, 2));
}
console.log(JSON.stringify({ status: "passed", checks: ["unauthorized-observe", "two-remote-observers", "pause-resume", "host-only-step", "lost-response-replay", "action-conservation"], implementationHash: config.vars.IMPLEMENTATION_HASH, starts }));
