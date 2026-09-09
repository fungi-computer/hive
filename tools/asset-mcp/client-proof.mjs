import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const packageDirectory = fileURLToPath(new URL(".", import.meta.url));
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  assert(
    ["--output", "--url"].includes(key) && value,
    "Usage: node client-proof.mjs --output <directory> [--url <MCP endpoint>]",
  );
  assert(!options.has(key), `Duplicate option: ${key}`);
  options.set(key, value);
}
assert(options.has("--output"), "An explicit --output directory is required.");
const outputDirectory = resolve(options.get("--output"));

const baselineRecipe = {
  name: "Copper Familiar workshop",
  assets: [
    { id: "kettle", kind: "kettle", position: [-1.2, 0, 0] },
    {
      id: "bench",
      kind: "bench",
      position: [0.5, 0, 0],
      parameters: { width: 1.2, depth: 0.5, height: 0.7 },
    },
    {
      id: "bottle",
      kind: "bottle",
      position: [0.5, 0.7, 0],
      parameters: { color: "#88687e", size: 1 },
    },
  ],
};

const endpoint = options.has("--url") ? new URL(options.get("--url")) : null;
if (endpoint) {
  assert(
    ["http:", "https:"].includes(endpoint.protocol),
    "MCP HTTP endpoint must use HTTP or HTTPS.",
  );
  assert(
    !endpoint.username && !endpoint.password,
    "Do not place credentials in the MCP endpoint URL.",
  );
}
const transport = endpoint
  ? new StreamableHTTPClientTransport(endpoint)
  : new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("./server.mjs", import.meta.url))],
      cwd: packageDirectory,
      stderr: "pipe",
    });
const client = new Client(
  { name: "hive-asset-export-proof", version: "0.1.0" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
let stderr = "";
if (!endpoint)
  transport.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
const errors = [];
client.onerror = (error) => errors.push(error.message);
const receipt = {
  transport: endpoint ? "streamable-http" : "stdio",
  endpoint: endpoint ? `${endpoint.origin}${endpoint.pathname}` : undefined,
  sdk: { client: "2.0.0", server: "2.0.0" },
  proof:
    "Real MCP connection, discovery, tool calls and exported artifacts; rendering is verified separately.",
  checks: [],
  artifacts: [],
};

function structured(result) {
  assert(!result.isError, JSON.stringify(result.content));
  assert(
    result.structuredContent && typeof result.structuredContent === "object",
  );
  return result.structuredContent;
}

async function exportScene(name, result) {
  const { scene, recipe, metadata } = structured(result);
  assert(
    scene.object && scene.metadata,
    "Tool must return Three.js Object JSON.",
  );
  const sceneText = JSON.stringify(scene);
  const sha256 = createHash("sha256").update(sceneText).digest("hex");
  assert.equal(
    sha256,
    metadata.sha256,
    "Client-computed scene digest must match tool metadata.",
  );
  assert.equal(
    Buffer.byteLength(sceneText),
    metadata.bytes,
    "Client-computed byte size must match tool metadata.",
  );
  await writeFile(resolve(outputDirectory, `${name}.three.json`), sceneText);
  await writeFile(
    resolve(outputDirectory, `${name}.recipe.json`),
    `${JSON.stringify(recipe, null, 2)}\n`,
  );
  await writeFile(
    resolve(outputDirectory, `${name}.metadata.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  receipt.artifacts.push({
    name,
    file: `${name}.three.json`,
    sha256,
    bytes: metadata.bytes,
  });
  return { scene, recipe, metadata };
}

async function expectRejection(name, input) {
  let rejection;
  try {
    const result = await client.callTool({
      name: "hive_build_scene",
      arguments: input,
    });
    if (result.isError) {
      const message = result.content
        .filter((entry) => entry.type === "text")
        .map((entry) => entry.text)
        .join("\n");
      assert.match(message, /Input validation error/);
      rejection = { surface: "tool-result", content: result.content };
    }
  } catch (error) {
    // The maintained SDK distinguishes malformed arguments from tool execution errors.
    if (error.code === -32602)
      rejection = {
        surface: "protocol-error",
        code: error.code,
        message: error.message,
      };
    else throw error;
  }
  assert(rejection, `${name} must be rejected by the actual MCP server.`);
  receipt.checks.push({ name, rejected: true, ...rejection });
}

await mkdir(outputDirectory, { recursive: true });
try {
  await client.connect(transport);
  if (!endpoint) receipt.childPid = transport.pid;
  receipt.protocolEra = client.getProtocolEra();
  receipt.server = client.getServerVersion();
  assert.equal(receipt.protocolEra, "modern");
  const listing = await client.listTools();
  receipt.tools = listing.tools;
  assert.deepEqual(listing.tools.map((tool) => tool.name).sort(), [
    "hive_asset_catalog",
    "hive_build_scene",
  ]);
  assert(
    listing.tools.find((tool) => tool.name === "hive_build_scene").inputSchema
      .properties.assets,
  );
  const catalog = structured(
    await client.callTool({ name: "hive_asset_catalog", arguments: {} }),
  );
  await writeFile(
    resolve(outputDirectory, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  receipt.checks.push({ name: "actual-discovery-and-catalog", passed: true });

  const baseline = await exportScene(
    "baseline",
    await client.callTool({
      name: "hive_build_scene",
      arguments: baselineRecipe,
    }),
  );
  receipt.checks.push({ name: "configured-scene-export", passed: true });

  const variantRecipe = structuredClone(baseline.recipe);
  const bottle = variantRecipe.assets.find((asset) => asset.kind === "bottle");
  const bench = variantRecipe.assets.find((asset) => asset.kind === "bench");
  assert(
    bottle && bench,
    "The proof fixture must include a bottle and bench for the parameter comparison.",
  );
  bottle.parameters.color = "#728e79";
  bench.parameters.width = 2;
  bench.rotationY = 30;
  const variant = await exportScene(
    "variant",
    await client.callTool({
      name: "hive_build_scene",
      arguments: variantRecipe,
    }),
  );
  assert.equal(
    variant.recipe.assets.find((asset) => asset.id === bottle.id).parameters
      .color,
    "#728e79",
  );
  assert.equal(
    variant.recipe.assets.find((asset) => asset.id === bench.id).parameters
      .width,
    2,
  );
  assert.notEqual(baseline.metadata.sha256, variant.metadata.sha256);
  assert.notDeepEqual(
    baseline.scene.materials.map((material) => material.color),
    variant.scene.materials.map((material) => material.color),
  );
  assert.notDeepEqual(
    baseline.scene.geometries.map((geometry) => geometry.width),
    variant.scene.geometries.map((geometry) => geometry.width),
  );
  const benchGroup = variant.scene.object.children.find(
    (node) => node.name === bench.id,
  );
  assert(Math.abs(benchGroup.matrix[0] - Math.cos(Math.PI / 6)) < 1e-10);
  assert(Math.abs(benchGroup.matrix[2] + Math.sin(Math.PI / 6)) < 1e-10);
  receipt.checks.push({
    name: "parameters-change-materials-and-geometry",
    passed: true,
  });

  await expectRejection("unknown-asset-kind", {
    name: "invalid",
    assets: [{ id: "bad", kind: "foreign-builder" }],
  });
  await expectRejection("unknown-parameter", {
    name: "invalid",
    assets: [
      { id: "bad", kind: "kettle", parameters: { execute: "unavailable" } },
    ],
  });
  await expectRejection("unbounded-scene-count", {
    name: "invalid",
    assets: Array.from({ length: 25 }, (_, index) => ({
      id: `kettle-${index}`,
      kind: "kettle",
    })),
  });
  await expectRejection("duplicate-asset-identity", {
    name: "invalid",
    assets: [
      { id: "same", kind: "kettle" },
      { id: "same", kind: "kettle" },
    ],
  });
} finally {
  await client.close();
  receipt.closed = Boolean(endpoint);
  receipt.cleanup = endpoint
    ? "Client connection closed; remote server lifecycle remains host-owned."
    : "Owned child process exit checked separately.";
  if (receipt.childPid) {
    try {
      process.kill(receipt.childPid, 0);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      receipt.closed = true;
    }
  }
  receipt.errors = errors;
  receipt.stderr = stderr;
  await writeFile(
    resolve(outputDirectory, "mcp-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
assert(
  receipt.closed,
  "The MCP client must close; an owned stdio child must also exit.",
);
assert.deepEqual(errors, []);
assert.equal(stderr, "");
console.log(
  JSON.stringify({
    outputDirectory,
    checks: receipt.checks.length,
    artifacts: receipt.artifacts,
    closed: receipt.closed,
  }),
);
