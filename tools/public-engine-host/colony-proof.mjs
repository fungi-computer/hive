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
function quantity(observation, container) {
  const row = observation.observation.facts.find((fact) => fact.id === container);
  return (row?.inventory?.items ?? [])
    .reduce((sum, item) => sum + item.quantity, 0);
}
function physical(observation) {
  const frame = terrain(observation);
  return {
    terrain: { revision: frame.revision, surfaces: frame.surfaces, water: frame.water },
    pantry: quantity(observation, "colony.pantry"),
    worker: quantity(observation, "colony.worker.1"),
  };
}

await mkdir(output, { recursive: true });
try {
  const inventory = [
    "tools/public-engine-host/worker.ts", "tools/public-engine-host/protocol.ts",
    "engine/src/games/colony.ts", "engine/src/games/colony-environment.ts", "engine/src/runtime/observation.ts",
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
  const cuts = [
    { walk: null, cut: [1, 0] },
    { walk: [0, 0], cut: [1, 0] },
    { walk: [2, 1], cut: [2, 0] },
    { walk: [2, 0], cut: [1, 0] },
  ];
  const cutEvidence = [];
  for (const { walk, cut } of cuts) {
    const [x, z] = cut;
    const before = await observe();
    const surface = surfaceAt(before, x, z);
    const y = surface.cell[1];
    const move = walk === null ? undefined : await admit({ kind: "action", action: { kind: "move", entity: "colony.worker.1", destination: {
      x: walk[0], y: (surfaceAt(before, walk[0], walk[1]).cell[1] + 0.5) * terrain(before).verticalMetres,
      z: walk[1], frame: null,
    } } }, `move-${walk[0]}-${walk[1]}`);
    const moved = walk === null ? before : await waitFor((current) => {
      const position = fact(current, "colony.worker.1").pose?.position;
      return position && Math.abs(position.x - walk[0]) < 0.1 && Math.abs(position.z - walk[1]) < 0.1;
    }, `worker reaches ${walk[0]},${walk[1]}`);
    const dig = await admit({ kind: "command", name: "dig", input: {
      entities: ["colony.worker.1"], target: { cell: [x, y, z], material: surface.material },
    } }, `dig-${x}-${y}-${z}`);
    const completed = await waitFor((current) => quantity(current, "colony.worker.1") >= 3,
      `dig completes ${x},${y},${z}`, 30_000);
    const lowered = completed.observation.terrain.surfaces.find(({ cell }) => cell[0] === x && cell[2] === z);
    assert(lowered && lowered.cell[1] < surface.cell[1], `cut ${x},${y},${z} did not lower its published surface`);
    cutEvidence.push({ cell: [x, y, z], surface, move: move?.receipt, movedRevision: moved.revision, dig: dig.receipt,
      after: physical(completed) });
    if (cutEvidence.length < cuts.length) {
      const pantry = fact(completed, "colony.pantry").pose?.position;
      assert(pantry, "published pantry position missing");
      const toPantry = await admit({ kind: "action", action: { kind: "move", entity: "colony.worker.1", destination: {
        x: pantry.x, y: pantry.y, z: pantry.z, frame: null,
      } } }, `pantry-${cutEvidence.length}`);
      await waitFor((current) => {
        const position = fact(current, "colony.worker.1").pose?.position;
        return position && Math.abs(position.x - pantry.x) < 0.1 && Math.abs(position.z - pantry.z) < 0.1;
      }, `worker reaches pantry ${cutEvidence.length}`);
      const unload = await admit({ kind: "command", name: "deposit", input: { entities: ["colony.worker.1"] } }, `deposit-${cutEvidence.length}`);
      const unloaded = await waitFor((current) => quantity(current, "colony.worker.1") === 0, `deposit ${cutEvidence.length}`);
      cutEvidence.at(-1).deposit = { move: toPantry.receipt, command: unload.body, receipt: unload.receipt, after: physical(unloaded) };
    }
  }
  const carried = await waitFor((current) => quantity(current, "colony.worker.1") >= 3, "finite spoil carried");
  const pantryBefore = quantity(carried, "colony.pantry");
  assert.equal(pantryBefore + quantity(carried, "colony.worker.1"), 18, "Colony material total changed before final deposit");
  const finalPantry = fact(carried, "colony.pantry").pose?.position;
  assert(finalPantry, "published pantry position missing before final deposit");
  await admit({ kind: "action", action: { kind: "move", entity: "colony.worker.1", destination: {
    x: finalPantry.x, y: finalPantry.y, z: finalPantry.z, frame: null,
  } } }, "pantry-final");
  await waitFor((current) => {
    const position = fact(current, "colony.worker.1").pose?.position;
    return position && Math.abs(position.x - finalPantry.x) < 0.1 && Math.abs(position.z - finalPantry.z) < 0.1;
  }, "worker reaches pantry final");
  const deposit = await admit({ kind: "command", name: "deposit", input: { entities: ["colony.worker.1"] } }, "deposit");
  const deposited = await waitFor((current) => quantity(current, "colony.worker.1") === 0 && quantity(current, "colony.pantry") > pantryBefore, "deposit settles");
  await waitFor((current) => terrain(current).water?.some((cell) => cell.liquidVolumeM3 > 0) === true,
    "visible liquid water before pause", 30_000);
  const pause = await admit({ kind: "pause" }, "pause");
  const wetEnd = await observe();
  assert((terrain(wetEnd).water?.length ?? 0) > 0, "paused Colony observation has no visible water");
  const finalCell = cutEvidence.at(-1).cell;
  assert(terrain(wetEnd).water.some((cell) => cell.at[0] === finalCell[0] && cell.at[1] === finalCell[1] && cell.at[2] === finalCell[2] && cell.liquidVolumeM3 > 0), "paused water is not present at final cut");
  const witness = { initial: physical(initial), cuts: cutEvidence, deposit: { body: deposit.body, receipt: deposit.receipt },
    wetEnd: { receipt: pause.receipt, observation: wetEnd, physical: physical(wetEnd) } };
  await writeFile(resolve(output, "colony-proof-wet.json"), JSON.stringify(witness, null, 2));
  await stop();
  await start();
  const reopened = await observe();
  assert.deepEqual(physical(reopened), physical(wetEnd), "restart changed Colony geometry or quantities");
  const replay = await send(deposit.body);
  assert.deepEqual(replay, deposit.receipt, "replayed deposit receipt changed");
  const afterReplay = await observe();
  assert.deepEqual(physical(afterReplay), physical(reopened), "replayed deposit had an extra effect");
  await writeFile(resolve(output, "colony-proof-restart.json"), JSON.stringify({ reopened, replay, afterReplay }, null, 2));
  console.log(JSON.stringify({ status: "passed", starts, cuts: cuts.length, restarted: true }));
} catch (error) {
  await writeFile(resolve(output, "colony-proof-diagnostics.json"), JSON.stringify({ status: "failed", starts, error: redact(error?.stack ?? error), log: redact(log.slice(-16384)) }, null, 2));
  throw error;
} finally {
  await stop();
}
