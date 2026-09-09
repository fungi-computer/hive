import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const packageDirectory = fileURLToPath(new URL(".", import.meta.url));
assert(
  process.argv.length === 4 && process.argv[2] === "--output",
  "Usage: node http-proof.mjs --output <directory>",
);
const outputDirectory = resolve(process.argv[3]);
const endpoint = new URL("http://127.0.0.1:5196/mcp");
await mkdir(outputDirectory, { recursive: true });

// Refuse to borrow an existing server or interrupt somebody else's listener.
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(5196, "127.0.0.1", resolve);
});
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);

const environment = Object.fromEntries(
  ["PATH", "HOME", "USER", "TMPDIR", "LD_LIBRARY_PATH"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
environment.WRANGLER_SEND_METRICS = "false";
environment.CI = "true";
const log = createWriteStream(resolve(outputDirectory, "wrangler.log"));
const server = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url),
    ),
    "dev",
    "--config",
    resolve(packageDirectory, "wrangler.jsonc"),
    "--ip",
    "127.0.0.1",
    "--port",
    "5196",
    "--inspector-port",
    "0",
    "--local",
    "--show-interactive-dev-session=false",
    "--persist-to",
    resolve(outputDirectory, "wrangler-state"),
  ],
  {
    cwd: packageDirectory,
    env: environment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
let spawnError;
server.once("error", (error) => {
  spawnError = error;
});
const exited = new Promise((resolve) =>
  server.once("exit", (code, signal) => resolve({ code, signal })),
);
const receipt = {
  endpoint: endpoint.href,
  server: { localOnly: true, command: "wrangler dev --local", pid: server.pid },
  checks: [],
};

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    assert(
      server.exitCode === null && server.signalCode === null,
      "Owned Wrangler exited before ready; inspect retained log.",
    );
    try {
      const response = await fetch(new URL("/health", endpoint), {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        assert.equal((await response.json()).service, "hive-original-assets");
        return;
      }
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
    }
    await delay(100);
  }
  throw new Error(
    "Owned local MCP server did not become healthy within 30 seconds.",
  );
}

async function modernProof() {
  const child = spawn(
    process.execPath,
    [
      resolve(packageDirectory, "client-proof.mjs"),
      "--url",
      endpoint.href,
      "--output",
      outputDirectory,
    ],
    {
      cwd: packageDirectory,
      env: environment,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.code, 0, "Actual HTTP client proof must succeed.");
  receipt.checks.push({ name: "current-protocol-http-client", passed: true });
}

async function legacyProof() {
  const client = new Client({
    name: "hive-http-legacy-proof",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(endpoint);
  const errors = [];
  client.onerror = (error) => errors.push(error.message);
  try {
    await client.connect(transport);
    assert.equal(client.getProtocolEra(), "legacy");
    assert.equal((await client.listTools()).tools.length, 2);
    const result = await client.callTool({
      name: "hive_build_scene",
      arguments: {
        name: "Legacy HTTP kettle",
        assets: [{ id: "kettle", kind: "kettle" }],
      },
    });
    assert(!result.isError);
    assert.equal(result.structuredContent.metadata.stats.meshes, 36);
    receipt.checks.push({
      name: "default-legacy-http-client-build",
      passed: true,
      meshes: 36,
    });
  } finally {
    await client.close();
  }
  assert.deepEqual(errors, []);
}

async function boundaryProof() {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const message = JSON.stringify({
    jsonrpc: "2.0",
    id: 101,
    method: "server/discover",
    params: {},
  });
  const atLimit = await fetch(endpoint, {
    method: "POST",
    headers,
    body: message.padEnd(32 * 1024, " "),
  });
  assert.notEqual(
    atLimit.status,
    413,
    "32KiB itself must not be rejected as oversized.",
  );
  await atLimit.arrayBuffer();
  const oversized = await fetch(endpoint, {
    method: "POST",
    headers,
    body: message.padEnd(32 * 1024 + 1, " "),
  });
  assert.equal(oversized.status, 413);
  assert.equal(await oversized.text(), "Request too large");
  receipt.checks.push({
    name: "request-byte-boundary",
    atLimitStatus: atLimit.status,
    overLimitStatus: oversized.status,
  });

  const catalogMessage = {
    jsonrpc: "2.0",
    id: 102,
    method: "tools/call",
    params: { name: "hive_asset_catalog", arguments: {} },
  };
  const batch = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify([catalogMessage, { ...catalogMessage, id: 103 }]),
  });
  assert.equal(batch.status, 400);
  receipt.checks.push({
    name: "batch-request-rejected",
    status: batch.status,
    response: await batch.text(),
  });

  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      Origin: "https://shiit.app",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,mcp-protocol-version",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  receipt.checks.push({
    name: "public-cors-preflight",
    status: preflight.status,
  });
  receipt.checks.push({
    name: "ordinary-clients-require-no-origin-or-authorization-header",
    passed: true,
  });
}

async function stopServer() {
  if (server.pid && server.exitCode === null && server.signalCode === null) {
    // This group was created solely for this wrapper's Wrangler/workerd tree.
    process.kill(-server.pid, "SIGINT");
    await Promise.race([exited, delay(5000, undefined, { ref: false })]);
    if (server.exitCode === null && server.signalCode === null) {
      process.kill(-server.pid, "SIGTERM");
      await Promise.race([exited, delay(5000, undefined, { ref: false })]);
    }
    if (server.exitCode === null && server.signalCode === null) {
      process.kill(-server.pid, "SIGKILL");
    }
  }
  receipt.server.exit = await exited;
  await new Promise((resolve) => log.end(resolve));
  const runtimeLog = (
    await readFile(resolve(outputDirectory, "wrangler.log"), "utf8")
  ).replace(/\x1b\[[0-9;]*m/g, "");
  receipt.server.runtimeErrors = runtimeLog
    .split("\n")
    .filter((line) => line.includes("[ERROR]"));
  const response = await fetch(new URL("/health", endpoint), {
    signal: AbortSignal.timeout(1000),
  }).catch(() => null);
  receipt.server.listenerClosed = response === null;
  assert(
    receipt.server.listenerClosed,
    "Owned local server listener must close.",
  );
  assert.deepEqual(
    receipt.server.runtimeErrors,
    [],
    "Inspect retained Wrangler log for runtime errors.",
  );
}

try {
  await waitForHealth();
  await modernProof();
  await legacyProof();
  await boundaryProof();
  receipt.status = "passed";
} catch (error) {
  receipt.status = "failed";
  receipt.error = error.message;
  throw error;
} finally {
  try {
    await stopServer();
  } finally {
    await writeFile(
      resolve(outputDirectory, "http-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
  }
}
console.log(
  JSON.stringify({
    status: receipt.status,
    checks: receipt.checks.length,
    listenerClosed: receipt.server.listenerClosed,
  }),
);
