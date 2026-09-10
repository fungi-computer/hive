// Input-only closure over the already-built and unchanged release candidate.
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { open, writeFile, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const root = process.cwd(),
  out = ".botanical/gameplay-water-input-v2";
const runtimePin = "210b85d722e4d074eeff34d3653d109882c02655";
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runtimePin,
  "Frozen runtime HEAD changed",
);
assert.equal(
  execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    encoding: "utf8",
  }).trim(),
  "",
  "Frozen runtime has tracked changes",
);
const children = new Set(),
  record = { root, runtimePin, commands: [], childrenClosed: false };
function child(args, log, env = {}) {
  const process = spawn(globalThis.process.execPath, args, {
    cwd: root,
    env: { ...globalThis.process.env, ...env },
    stdio: ["ignore", log.fd, log.fd],
  });
  children.add(process);
  process.once("exit", () => children.delete(process));
  record.commands.push({ args, pid: process.pid });
  return process;
}
function done(process) {
  return new Promise((resolve, reject) => {
    process.once("error", reject);
    process.once("exit", (code, signal) => resolve({ code, signal }));
  });
}
async function run(args, name, env) {
  const log = await open(`${out}/${name}.log`, "wx");
  try {
    const p = child(args, log, env),
      result = await done(p);
    record.commands.at(-1).result = result;
    if (result.code !== 0)
      throw Error(`${name} failed: ${JSON.stringify(result)}`);
  } finally {
    await log.close();
  }
}
let server, serverDone, serverLog;
try {
  const prior = await fetch("http://127.0.0.1:5198/", {
    signal: AbortSignal.timeout(1000),
  }).catch(() => null);
  assert(
    !prior,
    "Reserved preview port is already serving; preserve its owner",
  );
  const previous = JSON.parse(
    await readFile(
      ".botanical/gameplay-water-release/dist-sha256.json",
      "utf8",
    ),
  );
  assert.equal(previous.runtimePin, runtimePin);
  const manifest = previous.files;
  for (const [path, hash] of Object.entries(manifest))
    assert.equal(
      createHash("sha256")
        .update(await readFile("dist/" + path))
        .digest("hex"),
      hash,
      "Frozen dist changed: " + path,
    );
  record.reusedBuild = ".botanical/gameplay-water-release/dist-sha256.json";
  serverLog = await open(`${out}/window-vite.log`, "wx");
  server = child(
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "5198",
      "--strictPort",
    ],
    serverLog,
  );
  serverDone = done(server);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw Error("Owned Vite exited before readiness");
    try {
      const response = await fetch("http://127.0.0.1:5198/", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  if (!ready) throw Error("Owned Vite readiness timed out");
  const servedIndex = await fetch("http://127.0.0.1:5198/", {
    signal: AbortSignal.timeout(2000),
  });
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await servedIndex.arrayBuffer()))
      .digest("hex"),
    manifest["index.html"],
    "Preview index differs from built release",
  );
  await run(
    [`${out}/prove-water.mjs`, "http://127.0.0.1:5198/", `${out}/browser`],
    "window-browser",
    {
      CHROMIUM_PATH:
        "/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
      LD_LIBRARY_PATH:
        "/home/levi/src/Botanical-next/.botanical/browser-libs/root/usr/lib/x86_64-linux-gnu" +
        (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : ""),
    },
  );
} catch (error) {
  record.error = error.message;
  globalThis.process.exitCode = 1;
} finally {
  if (server && children.has(server)) {
    server.kill("SIGTERM");
    const grace = delay(5000).then(() => {
      if (children.has(server)) server.kill("SIGKILL");
    });
    record.serverExit = await serverDone;
    await grace;
  }
  await serverLog?.close();
  record.childrenClosed = children.size === 0;
  record.listenerClosed = !(await fetch("http://127.0.0.1:5198/", {
    signal: AbortSignal.timeout(1000),
  }).catch(() => null));
  if (!record.childrenClosed || !record.listenerClosed) {
    record.cleanupError = "Owned child/listener closure incomplete";
    globalThis.process.exitCode = 1;
  }
  await writeFile(
    `${out}/window-result.json`,
    JSON.stringify(record, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify(record));
}
