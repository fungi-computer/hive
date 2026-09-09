import { createServer } from "node:net";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const root = "/home/levi/src/hive";
const scratch = `${root}/.botanical/engine-do/colony-module-20260909`;
const scope = readFileSync("/proc/self/cgroup", "utf8").trim();
const versions = Object.fromEntries(["wrangler", "workerd", "miniflare"].map(name => [name, JSON.parse(readFileSync(`${root}/node_modules/${name}/package.json`, "utf8")).version]));
const hashes = Object.fromEntries(["colony.mjs", "colony.wasm", "worker.mjs", "build.sh", "wrangler.jsonc"].map(name => [name, createHash("sha256").update(readFileSync(`${scratch}/${name}`)).digest("hex")]));
const evidence = { scope, node: process.version, versions, hashes, compatibilityDate: "2026-09-04", emscripten: "3.1.46", initialMemory: 16777216, stack: 1048576, allowMemoryGrowth: false, stackOverflowCheck: 2 };
console.log(JSON.stringify(evidence, null, 2));
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
evidence.port = port;
let output = "";
let success = false;
const child = spawn(process.execPath, [
  `${root}/node_modules/wrangler/bin/wrangler.js`, "dev",
  "--config", `${scratch}/wrangler.jsonc`, "--local", "--ip", "127.0.0.1",
  "--port", String(port), "--inspector-port", "0", "--persist-to", `${scratch}/state`,
], { cwd: scratch, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1", WRANGLER_LOG_PATH: `${scratch}/wrangler.log` } });
const exited = once(child, "exit");
for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; process.stdout.write(data); });
try {
  const deadline = Date.now() + 25000;
  let response;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited ${child.exitCode}`);
    try { response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) }); break; }
    catch { await delay(250); }
  }
  if (!response) throw new Error("Local Worker did not answer within 25 seconds");
  const body = await response.text();
  console.log(`PROBE_RESPONSE ${response.status} ${body}`);
  assert.equal(response.status, 200);
  evidence.response = JSON.parse(body);
  assert.equal(evidence.response.initialized, true);
  assert.equal(evidence.response.offeredCount, 500);
  assert.equal(evidence.response.runs, 100);
  assert.equal(evidence.response.chosen.length, 5);
  assert.equal(evidence.response.heapBefore, 16777216);
  assert.equal(evidence.response.heapAfter, 16777216);
  success = true;
} catch (error) {
  evidence.failure = String(error.stack ?? error);
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  const terminated = await Promise.race([exited.then(() => true), delay(3000).then(() => false)]);
  if (!terminated) {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    await exited;
  }
  const lingering = await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(500)}).catch(() => null);
  evidence.listenerClosed = lingering === null;
  if (lingering) { success = false; process.exitCode = 1; }
  evidence.success = success;
  evidence.childExit = { code: child.exitCode, signal: child.signalCode };
  writeFileSync(`${scratch}/runtime.log`, output);
  writeFileSync(`${scratch}/result.json`, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`PROBE_FINISHED ${JSON.stringify({ success, childExit: evidence.childExit, scope })}`);
}
