import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

assert(process.argv[2] === "--output" && process.argv.length === 4, "Usage: node proof.mjs --output <directory>");
const output = resolve(process.argv[3]);
const directory = fileURLToPath(new URL(".", import.meta.url));
const hostRoot = resolve(directory, "../..");
await mkdir(output, { recursive: true });
const tokens = { first: randomBytes(32).toString("hex"), second: randomBytes(32).toString("hex"), wrong: randomBytes(32).toString("hex") };
const inventory = [
  "tools/public-engine-host/worker.ts", "tools/public-engine-host/protocol.ts",
  "src/engine/region/index.ts", "src/engine/region/codec.ts", "engine/src/sdk/combat.ts",
  "engine/src/contracts.ts", "engine/src/presentation.ts", "engine/src/runtime/actions.ts",
  "engine/src/runtime/observation.ts", "engine/src/runtime/protocol.ts", "engine/src/runtime/region-program.ts",
  "engine/src/runtime/session.ts", "engine/src/runtime/wasm-kernel.ts", "engine/src/runtime/remote-client.ts",
  "engine/src/sdk/authoring.ts", "engine/src/sdk/common.ts", "engine/src/sdk/delivery.ts",
  "engine/src/games/survival.ts", "engine/src/games/pirates.ts", "engine/src/games/colony.ts", "engine/src/games/formations.ts",
  "engine/generated/hive_kernel.js", "engine/generated/hive_kernel.d.ts", "engine/generated/hive_kernel_bg.wasm",
].sort();
const implementation = createHash("sha256");
const hashes = [];
for (const relative of inventory) {
  const bytes = await readFile(resolve(hostRoot, relative));
  hashes.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex") });
  implementation.update(relative); implementation.update("\0"); implementation.update(bytes); implementation.update("\0");
}
await writeFile(resolve(output, "hash-inventory.json"), JSON.stringify(hashes, null, 2));
const config = JSON.parse(await readFile(resolve(hostRoot, "tools/public-engine-host/wrangler.json"), "utf8"));
config.main = resolve(hostRoot, "tools/public-engine-host/worker.ts");
config.vars = { IMPLEMENTATION_HASH: implementation.digest("hex"), PUBLIC_ORIGIN: "http://127.0.0.1:8789" };
const configPath = resolve(output, "wrangler.json");
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
const port = 8789;
const endpoint = `http://127.0.0.1:${port}`;
let child; let childExit; let starts = 0; let runtimeLog = ""; let lastObservation;
const eventsA = []; const eventsB = [];
let clientA; let clientB;
function redact(value) { for (const token of Object.values(tokens)) value = value.replaceAll(token, "[public-token]"); return value.replace(/^.*(?:Authorization|token_hash|token).*$/gim, "[sensitive line redacted]"); }
async function freePort() { const server = createServer(); await new Promise((yes, no) => { server.once("error", no); server.listen(port, "127.0.0.1", yes); }); await new Promise((yes, no) => server.close((error) => error ? no(error) : yes())); }
async function start() {
  assert(starts < 3, "public proof start budget exceeded"); await freePort(); starts++;
  child = spawn(process.execPath, [resolve(hostRoot, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", configPath, "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--local", "--show-interactive-dev-session=false", "--persist-to", resolve(output, "sqlite")], { cwd: hostRoot, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (data) => { runtimeLog += data; }); child.stderr.on("data", (data) => { runtimeLog += data; });
  let exited; childExit = new Promise((resolveExit) => child.once("exit", (code, signal) => { exited = { code, signal }; resolveExit(exited); }));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`public host exited: ${redact(runtimeLog.slice(-4096))}`);
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
    const body = response ? await response.text().catch(() => "") : "";
    if (response?.status === 404 && body.includes('"error":"not-found"')) return;
    await delay(100);
  }
  throw new Error(`public host readiness timeout: ${redact(runtimeLog.slice(-4096))}`);
}
async function stop() {
  if (!child) return; const owned = child; child = undefined;
  if (owned.exitCode === null && owned.signalCode === null) { process.kill(-owned.pid, "SIGTERM"); await Promise.race([childExit, delay(5000)]); if (owned.exitCode === null && owned.signalCode === null) { process.kill(-owned.pid, "SIGKILL"); await childExit; } }
  for (let attempt = 0; attempt < 50; attempt++) { try { await freePort(); return; } catch (error) { if (error.code !== "EADDRINUSE") throw error; await delay(100); } }
  throw new Error("public host listener did not close");
}
function authorizedFetch(token, loseCommandName, attempts = []) {
  let lost = false;
  return async (input, init = {}) => {
    const bodyText = typeof init.body === "string" ? init.body : undefined;
    let command;
    try { command = bodyText ? JSON.parse(bodyText) : undefined; } catch { command = undefined; }
    const commandName = command?.command?.kind === "command" ? command.command.name : command?.command?.kind;
    const record = loseCommandName !== undefined && commandName === loseCommandName ? { body: bodyText } : undefined;
    if (record) attempts.push(record);
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(input, { ...init, headers, signal: init.signal });
    if (record) {
      record.status = response.status;
      const text = await response.clone().text();
      try { record.receipt = JSON.parse(text); } catch { record.bodyText = text.slice(0, 512); }
      if (!lost && response.ok && record.receipt?.status === "applied") { lost = true; throw new Error("intentional lost public command response"); }
    }
    return response;
  };
}
async function observe(token) { const response = await fetch(`${endpoint}/v1/survival/observe`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }); const body = await response.text(); lastObservation = { status: response.status, body: redact(body.slice(0, 4096)) }; assert.equal(response.status, 200, body.slice(0, 512)); return JSON.parse(body); }
function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
async function hostRow(token) { const target = tokenHash(token); const entries = await readdir(resolve(output, "sqlite"), { recursive: true }); for (const entry of entries.filter((value) => value.endsWith(".sqlite"))) { const db = new DatabaseSync(resolve(output, "sqlite", entry), { readOnly: true }); try { if (db.prepare("SELECT name FROM sqlite_master WHERE name='hive_public_host'").all().length) { const row = db.prepare("SELECT next_sequence,paused FROM hive_public_host WHERE singleton=1 AND token_hash=?").get(target); if (row) return row; } } finally { db.close(); } } throw new Error("public host row unavailable for token"); }
function waitFor(events, predicate, label, cursor = 0) { return (async () => { const deadline = Date.now() + 10000; while (Date.now() < deadline) { const found = events.slice(cursor).find(predicate); if (found) return found; await delay(25); } throw new Error(`timed out waiting for ${label}`); })(); }
async function waitUntil(predicate, label) { const deadline = Date.now() + 10000; while (Date.now() < deadline) { if (await predicate()) return; await delay(25); } throw new Error(`timed out waiting for ${label}`); }
async function waitRevision(token, previous) { const deadline = Date.now() + 10000; while (Date.now() < deadline) { const current = await observe(token); if (current.revision > previous) return current; await delay(50); } throw new Error("autonomous revision did not advance"); }
function summarize(events) { return events.map((event) => event.type === "frame" ? { type: event.type, sequence: event.sequence, time: event.time, facts: event.facts.length } : event.type === "presentation" ? { type: event.type, facts: event.facts.length, controls: event.controls.length } : event.type === "error" ? { type: event.type, message: event.message } : event); }
try {
  const bundle = await build({ entryPoints: [resolve(directory, "../../engine/src/runtime/remote-client.ts")], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2024", tsconfig: resolve(directory, "../../tsconfig.json") });
  const clientPath = resolve(output, "remote-client.mjs"); await writeFile(clientPath, bundle.outputFiles[0].text);
  const { connectRemoteRuntime } = await import(`${pathToFileURL(clientPath).href}?public-proof`);
  await start();
  assert.equal((await fetch(`${endpoint}/v1/survival/observe`)).status, 403);
  assert.equal((await fetch(`${endpoint}/v1/survival/observe`, { headers: { Authorization: `Bearer ${tokens.wrong}` } })).status, 200);
  const publicEndpoint = `${endpoint}/v1/survival`;
  const pauseAttemptsA = [];
  clientA = connectRemoteRuntime({ endpoint: publicEndpoint, game: "survival", fetch: authorizedFetch(tokens.first, "pause", pauseAttemptsA), token: tokens.first });
  clientB = connectRemoteRuntime({ endpoint: publicEndpoint, game: "survival", fetch: authorizedFetch(tokens.second), token: tokens.second });
  clientA.subscribe((event) => eventsA.push(event)); clientB.subscribe((event) => eventsB.push(event));
  clientA.send({ type: "start", game: "survival" }); clientB.send({ type: "start", game: "survival" });
  await Promise.all([waitFor(eventsA, (event) => event.type === "ready", "first ready"), waitFor(eventsB, (event) => event.type === "ready", "second ready")]);
  const first = await observe(tokens.first); const second = await observe(tokens.second);
  const pauseCursor = eventsA.length; clientA.send({ type: "pause" }); await waitFor(eventsA, (event) => event.type === "state" && event.paused, "pause", pauseCursor);
  await waitUntil(() => pauseAttemptsA.filter((attempt) => attempt.status === 200 && attempt.receipt?.status === "applied").length >= 2, "pause retry receipt");
  const pauseBodies = pauseAttemptsA.filter((attempt) => attempt.status === 200 && attempt.receipt?.status === "applied");
  assert.equal(pauseBodies[0].body, pauseBodies[1].body, "lost public command retried with identical body");
  assert.equal(pauseBodies[0].receipt.revision, pauseBodies[1].receipt.revision, "lost public command applied once");
  const paused = await observe(tokens.first); await delay(700); assert.equal((await observe(tokens.first)).revision, paused.revision);
  const runningB = await observe(tokens.second); assert.ok(runningB.revision > second.revision, "active second world advanced while first was paused");
  const pauseBCursor = eventsB.length; clientB.send({ type: "pause" }); await waitFor(eventsB, (event) => event.type === "state" && event.paused, "second pause", pauseBCursor);
  const pausedB = await observe(tokens.second); await delay(700); assert.equal((await observe(tokens.second)).revision, pausedB.revision);
  const resumeCursor = eventsA.length; clientA.send({ type: "resume" }); await waitFor(eventsA, (event) => event.type === "state" && !event.paused, "resume", resumeCursor);
  const resumed = await waitRevision(tokens.first, paused.revision); const beforeRestart = await hostRow(tokens.first);
  clientA.dispose(); clientA = undefined; clientB.dispose(); clientB = undefined;
  await stop(); const persisted = await hostRow(tokens.first); assert.ok(persisted.next_sequence >= beforeRestart.next_sequence);
  await start(); let after; const deadline = Date.now() + 10000; while (Date.now() < deadline) { after = await hostRow(tokens.first); if (after.next_sequence > persisted.next_sequence) break; await delay(100); }
  assert.ok(after.next_sequence > persisted.next_sequence, "alarm advanced after restart before game request");
  assert.ok((await observe(tokens.first)).revision >= resumed.revision); assert.equal((await observe(tokens.second)).revision, pausedB.revision);
} finally {
  clientA?.dispose(); clientB?.dispose(); await stop(); await rm(configPath, { force: true });
  await writeFile(resolve(output, "public-proof-diagnostics.json"), JSON.stringify({ runtimeLog: redact(runtimeLog.slice(-16384)), clientA: summarize(eventsA), clientB: summarize(eventsB), lastObservation }, null, 2));
}
console.log(JSON.stringify({ status: "passed", starts, implementationHash: config.vars.IMPLEMENTATION_HASH }));
