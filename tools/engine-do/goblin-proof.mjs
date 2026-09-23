import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
  await readFile(resolve(directory, "goblin.wrangler.json"), "utf8"),
);
const temporary = await mkdtemp(resolve(tmpdir(), "hive-region-proof-"));
config.main = resolve(directory, "goblin-worker.ts");
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
  try { body = JSON.parse(text); }
  catch { body = { nonJson: redact(text).slice(0,4096) }; }
  const result = { status: response.status, body };
  (receipt.requests ??= []).push({ input, role, result });
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
const dig = (id, expectedRevision, x) => ({
  id,
  expectedRevision,
  command: { kind: "excavate", at: { x, y: -1, z: 0 } },
});
function check(name) {
  receipt.checks.push(name);
}
async function laws() {
  const initial=await snapshot();
  assert.equal(initial.snapshot.state.clearing.paused,true);
  const order={id:"shared-dig",expectedRevision:0,command:{kind:"order",command:{kind:"dig",party:"home",actors:null,x:7,z:9,level:0}}};
  assert.equal((await command(order,{role:"SPECTATOR_SECRET"})).status,403);
  const admission=await command(order);
  assert.equal(admission.status,200); assert.equal(admission.body.status,"applied");
  const accepted=await snapshot();
  assert.equal(accepted.snapshot.state.clearing.tick,0);
  assert.deepEqual(accepted.snapshot.state.clearing.terrain.edits,[]);
  assert.deepEqual(admission.body.result.createdJobs,accepted.snapshot.state.clearing.jobs.map(j=>j.id));
  assert.equal(admission.body.result.createdJobs.length,1);
  assert.deepEqual(await command(order),admission);
  check("paused player admission returns real job identity; duplicate receipt creates no work");
  const pauseNoop={id:"paused-advance",expectedRevision:1,command:{kind:"advance",ticks:120}};
  assert.equal((await command(pauseNoop)).status,403);
  const paused=await command(pauseNoop,{role:"SPECTATOR_SECRET"});
  assert.equal(paused.body.result.advanced,0);
  assert.equal((await snapshot()).events.length,accepted.events.length);
  assert.equal((await command({id:"run",expectedRevision:2,command:{kind:"set-paused",paused:false}})).body.status,"applied");
  const firstAdvance={id:"first-ten",expectedRevision:3,command:{kind:"advance",ticks:10}};
  const running = await command(firstAdvance,{role:"SPECTATOR_SECRET"});
  assert.equal(running.status,200,JSON.stringify(running));
  assert.equal(running.body.result.advanced,10);
  const working=await snapshot();
  assert.equal(working.snapshot.state.clearing.tick,10);
  assert.equal(working.snapshot.state.clearing.paused,false);
  assert(working.snapshot.state.clearing.actors.rowan.task,"actual pawn has work");
  await writeFile(resolve(output,"working-before-restart.json"),JSON.stringify(working,null,2));
  await stop(true); await start();
  assert.deepEqual(await snapshot(),working);
  check("actual optimizer pawn work survives abrupt DO process restart without Continue pause");
  const finish={id:"finish-fifty",expectedRevision:4,command:{kind:"advance",ticks:50}};
  const finished=await command(finish,{role:"SPECTATOR_SECRET"});
  assert.equal(finished.body.result.advanced,50);
  const final=await snapshot(); const clearing=final.snapshot.state.clearing;
  assert.equal(clearing.tick,60); assert.deepEqual(clearing.terrain.edits,[{x:7,z:9,level:0}]);
  assert.equal(clearing.materials.lots.filter(l=>l.material==="soil").reduce((n,l)=>n+l.quantity,0),1);
  assert(!Object.hasOwn(clearing,"commands"));
  await stop(true); await start();
  assert.deepEqual(await command(finish,{role:"SPECTATOR_SECRET"}),finished);
  assert.deepEqual(await command(order),admission);
  assert.deepEqual(await snapshot(),final);
  await writeFile(resolve(output,"final.json"),JSON.stringify(final,null,2));
  check("real dig changes one voxel and yields one soil; restart/retry repeats neither tick nor effect");
}

try {
  const files=["goblin-worker.ts","goblin-proof.mjs","goblin.wrangler.json","../../src/orders.ts","../../src/command-schema.ts","../../src/world-presets/goblin-region.ts","../../src/engine/colony/loader.ts","../../src/engine/colony/colony.mjs","../../src/engine/colony/colony.wasm"];
  receipt.sourceHashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash("sha256").update(await readFile(resolve(directory,file))).digest("hex")])));
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
