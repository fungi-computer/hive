import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

assert(
  process.argv[2] && process.argv.length === 3,
  "Usage: node scene-client-proof.mjs <output directory>",
);
const output = resolve(process.argv[2]);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./server.mjs", import.meta.url))],
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  stderr: "pipe",
});
const client = new Client({
  name: "hive-scene-document-proof",
  version: "0.1.0",
});
const receipt = {
  scope: "real stdio client-owned document operations; no hosted scene",
  checks: [],
  errors: [],
  artifacts: [],
  closed: false,
};
client.onerror = (error) => receipt.errors.push(error.message);
let stderr = "";
transport.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert(!result.isError, JSON.stringify(result.content));
  assert(result.structuredContent, "Tool returned structured output");
  return result.structuredContent;
}
async function rejected(args, pattern) {
  const result = await client.callTool({
    name: "hive_scene_edit",
    arguments: args,
  });
  assert.equal(result.isError, true);
  assert.match(
    result.content
      .filter((value) => value.type === "text")
      .map((value) => value.text)
      .join("\n"),
    pattern,
  );
}
function inspectArtifact(result) {
  const bytes = JSON.stringify(result.scene);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    result.metadata.sha256,
  );
  assert.equal(Buffer.byteLength(bytes), result.metadata.bytes);
  const root = new THREE.ObjectLoader().parse(result.scene);
  try {
    const facts = [];
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (node.isMesh)
        facts.push({
          positions: [...node.geometry.attributes.position.array],
          matrix: [...node.matrixWorld.elements],
          color: node.material.color.getHexString(),
        });
    });
    assert(facts.length > 0);
    const box = new THREE.Box3().setFromObject(root);
    assert.deepEqual(
      { min: box.min.toArray(), max: box.max.toArray() },
      result.metadata.bounds,
    );
    return facts;
  } finally {
    const geometries = new Set(),
      materials = new Set();
    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.isMesh) materials.add(node.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
async function save(name, value) {
  await writeFile(
    resolve(output, `${name}.three.json`),
    JSON.stringify(value.scene),
  );
  await writeFile(
    resolve(output, `${name}.document.json`),
    JSON.stringify(value.document, null, 2),
  );
  await writeFile(
    resolve(output, `${name}.metadata.json`),
    JSON.stringify(value.metadata, null, 2),
  );
  receipt.artifacts.push({
    name,
    sha256: value.metadata.sha256,
    bytes: value.metadata.bytes,
  });
}
await mkdir(output, { recursive: true });
try {
  await client.connect(transport);
  receipt.tools = (await client.listTools()).tools
    .map((tool) => tool.name)
    .sort();
  assert.deepEqual(receipt.tools, [
    "hive_asset_catalog",
    "hive_build_scene",
    "hive_scene_create",
    "hive_scene_edit",
    "hive_scene_export",
    "hive_scene_inspect",
  ]);
  assert.equal((await call("hive_asset_catalog", {})).builders.length, 4);
  const legacy = await call("hive_build_scene", {
    assets: [{ id: "legacy", kind: "bottle" }],
  });
  assert.equal(legacy.recipe.assets[0].parameters.size, 1);
  receipt.checks.push("both legacy tools retained");
  const initial = (
    await call("hive_scene_create", { name: "Document-owned study" })
  ).document;
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.nodes, []);
  const empty = await call("hive_scene_inspect", { document: initial });
  assert.equal(empty.bounds, null);
  const transform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  const node = (id, geometry, parentId = null) => ({
    id,
    parentId,
    transform,
    geometry,
    material: null,
  });
  const baseline = (
    await call("hive_scene_edit", {
      document: initial,
      expectedRevision: 0,
      operations: [
        { type: "add", node: node("assembly", { kind: "group" }) },
        {
          type: "add",
          node: node(
            "bench",
            {
              kind: "original",
              pack: "hive-brewhouse-v1",
              asset: {
                builder: "bench",
                parameters: { width: 1.8, depth: 0.75, height: 0.81 },
              },
            },
            "assembly",
          ),
        },
        {
          type: "add",
          node: node(
            "block",
            { kind: "box", size: [0.3, 0.4, 0.5] },
            "assembly",
          ),
        },
      ],
    })
  ).document;
  assert.equal(baseline.revision, 1);
  const baselineExport = await call("hive_scene_export", {
    document: baseline,
  });
  const baselineFacts = inspectArtifact(baselineExport);
  await save("baseline", baselineExport);
  const originalBytes = JSON.stringify(baseline);
  await rejected(
    {
      document: baseline,
      expectedRevision: 1,
      operations: [
        { type: "material", id: "bench", material: { color: "#ff0000" } },
        { type: "remove", id: "missing" },
      ],
    },
    /Unknown scene node/,
  );
  await rejected(
    {
      document: baseline,
      expectedRevision: 0,
      operations: [{ type: "remove", id: "bench" }],
    },
    /revision conflict/,
  );
  assert.equal(JSON.stringify(baseline), originalBytes);
  assert.deepEqual(
    inspectArtifact(await call("hive_scene_export", { document: baseline })),
    baselineFacts,
  );
  receipt.checks.push(
    "late failed batch and stale revision leave client document reproducible",
  );
  const changed = (
    await call("hive_scene_edit", {
      document: baseline,
      expectedRevision: 1,
      operations: [
        {
          type: "transform",
          id: "bench",
          transform: { ...transform, rotation: [0, Math.PI / 2, 0] },
        },
        { type: "material", id: "bench", material: { color: "#b86842" } },
        { type: "material", id: "block", material: { color: "#65836c" } },
      ],
    })
  ).document;
  assert.equal(changed.revision, 2);
  const exported = await call("hive_scene_export", { document: changed });
  assert.deepEqual(exported.document, changed);
  const facts = inspectArtifact(exported);
  assert.notDeepEqual(facts, baselineFacts);
  assert(facts.some((fact) => fact.color === "b86842"));
  assert(facts.some((fact) => fact.color === "65836c"));
  const inspected = await call("hive_scene_inspect", { document: changed });
  assert.deepEqual(inspected.bounds, exported.metadata.bounds);
  assert.deepEqual(inspected.stats, exported.metadata.stats);
  await save("changed", exported);
  receipt.checks.push(
    "changed original and generic geometry ObjectLoader roundtrip, inspected counts and exact digest",
  );
  const removed = (
    await call("hive_scene_edit", {
      document: changed,
      expectedRevision: 2,
      operations: [{ type: "remove", id: "assembly" }],
    })
  ).document;
  assert.deepEqual(removed.nodes, []);
  assert.equal(removed.revision, 3);
  receipt.checks.push("subtree removal through maintained client");
  assert.deepEqual(receipt.errors, []);
} finally {
  await client.close();
  receipt.closed = true;
  receipt.stderr = stderr;
  await writeFile(
    resolve(output, "scene-client-receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
}
console.log(
  JSON.stringify({
    output,
    checks: receipt.checks,
    artifacts: receipt.artifacts,
    closed: receipt.closed,
  }),
);
