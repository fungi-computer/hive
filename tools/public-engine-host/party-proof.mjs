import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Bounded P1/P2/P3 party witness. It is deliberately a source-matched runner:
// missing generated WASM is a preflight failure and must never turn into a
// Wrangler run against a different kernel.
const outputArgument = process.argv[2];
assert(typeof outputArgument === "string" && outputArgument.length > 0, "usage: node party-proof.mjs <output>");
const output = resolve(outputArgument);
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const port = 8790;
const endpoint = `http://127.0.0.1:${port}`;
const invite = randomBytes(32).toString("hex");
// The v2 world handle is part of the public contract, not an independent
// random routing key: the host derives it from the invitation.
const world = createHash("sha256").update(invite).digest("hex");
const credentialA = randomBytes(32).toString("hex");
const credentialB = randomBytes(32).toString("hex");
const configPath = resolve(output, "wrangler.json");
let child;
let starts = 0;
let log = "";

const sourceInventory = [
  "tools/public-engine-host/worker.ts",
  "tools/public-engine-host/protocol.ts",
  "engine/src/contracts.ts",
  "engine/src/games/colony.ts",
  "engine/src/games/colony-party.ts",
  "engine/src/runtime/region-program.ts",
  "engine/src/runtime/session.ts",
  "engine/src/runtime/session-record-store.ts",
  "engine/src/runtime/wasm-kernel.ts",
  "engine/kernel/src/authored_entities.rs",
  "engine/kernel/src/components.rs",
  "engine/kernel/src/lib.rs",
  "engine/kernel/src/party_tests.rs",
  "engine/kernel/src/record_bundle.rs",
  "engine/kernel/src/registry.rs",
  "engine/kernel/src/work_attempt.rs",
  "engine/kernel/src/world.rs",
  "engine/generated/hive_kernel.d.ts",
  "engine/generated/hive_kernel.js",
  "engine/generated/hive_kernel_bg.wasm",
].sort();

function redact(value) {
  return String(value)
    .replaceAll(invite, "[invite]")
    .replaceAll(credentialA, "[credential-a]")
    .replaceAll(credentialB, "[credential-b]")
    .replace(/Bearer\s+[a-f0-9]{64}/gi, "Bearer [redacted]");
}
async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once("error", no); server.listen(port, "127.0.0.1", yes); });
  await new Promise((yes, no) => server.close((error) => error ? no(error) : yes()));
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
    try { await freePort(); return; } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      await delay(100);
    }
  }
  throw new Error("party witness listener did not close");
}
async function start() {
  assert.equal(starts < 3, true, "party witness start budget exceeded");
  await freePort();
  starts++;
  child = spawn(process.execPath, [
    resolve(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--local",
    "--show-interactive-dev-session=false", "--persist-to", resolve(output, "sqlite"),
  ], {
    cwd: root,
    detached: true,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
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
  throw new Error(`party host readiness timeout: ${redact(log.slice(-4096))}`);
}
async function jsonResponse(response) {
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = undefined; }
  return { response, text, value };
}
function auth(credential) { return { Authorization: `Bearer ${credential}` }; }
function route(operation) { return `${endpoint}/v2/colony/worlds/${world}/${operation}`; }
async function join(credential) {
  return jsonResponse(await fetch(route("join"), {
    method: "POST",
    headers: { ...auth(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ invite }),
    signal: AbortSignal.timeout(10_000),
  }));
}
async function observe(credential) {
  const result = await jsonResponse(await fetch(route("observe"), {
    headers: auth(credential), signal: AbortSignal.timeout(10_000),
  }));
  assert.equal(result.response.status, 200, redact(result.text));
  assert(Number.isSafeInteger(result.value?.revision), "party observation revision missing");
  assert(result.value.observation && Array.isArray(result.value.observation.facts), "party observation facts missing");
  return result.value;
}
async function command(credential, id, value) {
  return jsonResponse(await fetch(route("command"), {
    method: "POST",
    headers: { ...auth(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ id, command: value }),
    signal: AbortSignal.timeout(10_000),
  }));
}
function facts(observation) { return observation.observation.facts; }
function factIds(observation) { return facts(observation).map((row) => row.id).sort(); }
function terrainMarkIds(observation) { return (observation.observation.terrainMarks ?? []).map((row) => row.id).sort(); }
function assertJoin(value, label) {
  assert.equal(value.response.status, 200, `${label} join failed: ${redact(value.text)}`);
  const row = value.value;
  assert(typeof row?.player === "string" && typeof row?.party === "string", `${label} join identity missing`);
  assert(Array.isArray(row.people) && row.people.length === 2, `${label} must receive exactly two people`);
  assert.deepEqual([...row.people].sort(), row.people, `${label} people must be canonical sorted IDs`);
  assert.equal(new Set(row.people).size, 2, `${label} people must be unique`);
  return row;
}
function assertRejected(result, label) {
  const transportRejected = result.response.status >= 400;
  const receiptRejected = result.response.status === 200 && result.value?.status === "rejected";
  assert(transportRejected || receiptRejected, `${label} unexpectedly succeeded: ${redact(result.text)}`);
}

await mkdir(output, { recursive: true });
try {
  const missing = [];
  const hashes = [];
  const digest = createHash("sha256");
  for (const relative of sourceInventory) {
    try { await access(resolve(root, relative)); } catch { missing.push(relative); continue; }
    const bytes = await readFile(resolve(root, relative));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    digest.update(relative); digest.update("\0"); digest.update(bytes); digest.update("\0");
    hashes.push({ path: relative, sha256 });
  }
  const implementation = digest.digest("hex");
  await writeFile(resolve(output, "hash-inventory.json"), JSON.stringify({ implementation, files: hashes }, null, 2));
  if (missing.length > 0) {
    await writeFile(resolve(output, "party-proof-diagnostics.json"), JSON.stringify({ status: "preflight-failed", reason: "source-or-generated-artifact-missing", missing }, null, 2));
    throw new Error(`preflight missing source/generated artifact: ${missing.join(", ")}`);
  }
  const config = JSON.parse(await readFile(resolve(root, "tools/public-engine-host/wrangler.json"), "utf8"));
  config.main = resolve(root, "tools/public-engine-host/worker.ts");
  config.vars = { IMPLEMENTATION_HASH: implementation, PUBLIC_ORIGIN: endpoint, TEST_DROP_JOIN_RESPONSE: "1" };
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });

  // Start 1 commits A's membership but drops both HTTP responses. Restarting
  // the same SQLite state is the lost-ack proof; no second world is created.
  await start();
  const lost = await Promise.all([join(credentialA), join(credentialA)]);
  assert(lost.every(({ response }) => response.status !== 200), "injected lost join response unexpectedly succeeded");
  await stop();

  config.vars.TEST_DROP_JOIN_RESPONSE = "0";
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  await start();
  const a = assertJoin(await join(credentialA), "A recovery");
  const aRetry = assertJoin(await join(credentialA), "A retry");
  assert.deepEqual(aRetry, a, "A retry changed its durable party membership");
  const [aConcurrent, aConcurrent2] = await Promise.all([join(credentialA), join(credentialA)]);
  assert.deepEqual(assertJoin(aConcurrent, "A concurrent 1"), a);
  assert.deepEqual(assertJoin(aConcurrent2, "A concurrent 2"), a);
  const b = assertJoin(await join(credentialB), "B");
  assert.notEqual(a.party, b.party, "two credentials share a party");
  assert.equal(new Set([...a.people, ...b.people]).size, 4, "two parties did not produce four people");

  const before = await observe(credentialB);
  const forged = await command(credentialA, "party-forged-cross-party", {
    kind: "command", name: "resumeWork", input: { entities: b.people, party: b.party, player: b.player },
  });
  assertRejected(forged, "cross-party worker command");
  assertRejected(await command(credentialA, "party-forged-pause", { kind: "pause" }), "player global pause");
  assertRejected(await command(credentialA, "party-forged-native", { kind: "action", action: { kind: "pause" }, scope: { kind: "host" } }), "forged native/global scope");

  const aInitial = await observe(credentialA);
  const terrain = aInitial.observation.terrain;
  const people = a.people
    .map((id) => facts(aInitial).find((row) => row.id === id))
    .filter((row) => row?.pose?.position);
  assert(people.length === 2, "A people have no complete observed positions");
  const occupied = new Set(facts(aInitial).flatMap((row) => row.pose?.position
    ? [`${Math.round(row.pose.position.x)},${Math.round(row.pose.position.z)}`]
    : []));
  const structures = new Set((terrain.structureSurfaces ?? []).map((surface) =>
    `${surface.cell[0]},${surface.cell[1]},${surface.cell[2]}`));
  const marks = new Set(terrainMarkIds(aInitial));
  const nearestSurfaceFor = (position) => terrain.surfaces
    .filter((surface) => surface.material === 1)
    .slice()
    .sort((left, right) =>
      (left.cell[0] - position.x) ** 2 + (left.cell[2] - position.z) ** 2 -
      ((right.cell[0] - position.x) ** 2 + (right.cell[2] - position.z) ** 2))[0];
  const actorSurfaces = people.map((person) => nearestSurfaceFor(person.pose.position));
  assert(actorSurfaces.every(Boolean), "A people have no generated material-1 support surface");
  const digCandidates = terrain.surfaces.filter((surface) => {
    if (surface.material !== 1 || !Number.isSafeInteger(surface.generatedTop)) return false;
    const key = `${surface.cell[0]},${surface.cell[1]},${surface.cell[2]}`;
    if (occupied.has(`${surface.cell[0]},${surface.cell[2]}`) || structures.has(key)) return false;
    if (marks.has(`colony.dig.${surface.cell[0]}.${surface.cell[1]}.${surface.cell[2]}`)) return false;
    return actorSurfaces.some((actorSurface) =>
      actorSurface.cell[1] === surface.cell[1] &&
      Math.abs(actorSurface.cell[0] - surface.cell[0]) + Math.abs(actorSurface.cell[2] - surface.cell[2]) === 1);
  });
  const digSurface = digCandidates[0];
  assert(digSurface, "party dig witness has no unoccupied generated surface adjacent to A");
  const digCell = digSurface.cell;
  const dig = await command(credentialA, "party-a-dig", {
    kind: "command", name: "dig", input: { area: { start: digCell, end: digCell } },
  });
  assert.equal(dig.response.status, 200, `A ordinary work enqueue failed: ${redact(dig.text)}`);
  assert.equal(dig.value?.status, "applied", `A ordinary work was rejected: ${redact(dig.text)}`);
  const afterEnqueue = await observe(credentialA);
  const digId = `colony.dig.${digCell[0]}.${digCell[1]}.${digCell[2]}`;
  const mark = (observation) => observation.observation.terrainMarks?.find((row) => row.id === digId);
  const initialMark = mark(afterEnqueue);
  assert(initialMark, "A dig did not publish its exact order");
  const initialSurface = afterEnqueue.observation.terrain.surfaces?.find(({ cell }) =>
    cell[0] === digCell[0] && cell[1] === digCell[1] && cell[2] === digCell[2]);
  assert(initialSurface, "A dig target disappeared before offline progress could be observed");
  let bRenew;
  let afterTick;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await delay(200);
    // A makes no requests in this interval. B alone keeps the shared Region
    // lease alive and reads the exact order's durable status.
    bRenew = await observe(credentialB);
    const currentMark = mark(bRenew);
    const surface = bRenew.observation.terrain.surfaces?.find(({ cell }) => cell[0] === digCell[0] && cell[2] === digCell[2]);
    const terrainChanged = !surface || surface.cell[1] !== initialSurface.cell[1] || surface.material !== initialSurface.material || surface.generatedTop !== initialSurface.generatedTop;
    const nonblockedProgress = currentMark?.status === "working" || currentMark?.status === "complete";
    if (currentMark?.status === "blocked") continue;
    if (nonblockedProgress || terrainChanged) {
      afterTick = bRenew;
      break;
    }
  }
  assert(afterTick, "A dig did not show nonblocked physical progress while A was disconnected");
  assert.notEqual(mark(afterTick)?.status, "blocked", "A dig became blocked instead of making physical progress");
  assert(mark(afterTick) || afterTick.observation.terrain.surfaces?.some(({ cell }) => cell[0] === digCell[0] && cell[2] === digCell[2]), "A exact dig order disappeared while disconnected");
  const aReconnected = await observe(credentialA);
  assert.deepEqual(mark(aReconnected), mark(afterTick), "A reconnect did not restore the exact dig order state");
  assert.deepEqual(terrainMarkIds(aReconnected), terrainMarkIds(afterTick), "A reconnect did not restore the same order IDs");
  assert.deepEqual(aReconnected.observation.terrain.surfaces?.find(({ cell }) => cell[0] === digCell[0] && cell[2] === digCell[2]), afterTick.observation.terrain.surfaces?.find(({ cell }) => cell[0] === digCell[0] && cell[2] === digCell[2]), "A reconnect changed the dig world state");
  assert(aReconnected.revision >= afterTick.revision, "A reconnect regressed world revision");
  const witness = { world, a, b, beforeRevision: before.revision, dig: dig.value, afterEnqueueRevision: afterEnqueue.revision, bRenewRevision: bRenew.revision, afterTickRevision: afterTick.revision, reconnectedRevision: aReconnected.revision };
  await writeFile(resolve(output, "party-proof-witness.json"), JSON.stringify(witness, null, 2));
  await stop();
  console.log(JSON.stringify({ status: "prepared-and-passed", starts, world: "[redacted]", fourPeople: true, lostAckRestart: true, crossPartyRejection: true }));
} catch (error) {
  await writeFile(resolve(output, "party-proof-diagnostics.json"), JSON.stringify({ status: "failed", starts, error: redact(error?.stack ?? error), log: redact(log.slice(-16384)) }, null, 2));
  throw error;
} finally {
  await stop();
}
