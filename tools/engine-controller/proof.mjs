import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const directory = resolve(process.argv[2] ?? ".botanical/controller-proof");
await mkdir(directory, { recursive: true });
const bundled = await build({
  entryPoints: [new URL("worker.mts", import.meta.url).pathname],
  bundle: true,
  tsconfig: new URL("tsconfig.json", import.meta.url).pathname,
  write: false,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2024",
  external: ["cloudflare:workers", "node:*"],
  nodePaths: [new URL("node_modules", import.meta.url).pathname],
  metafile: true,
});
const script = bundled.outputFiles[0].text;
await writeFile(resolve(directory, "worker.mjs"), script);
const builderKey = randomUUID(),
  outsiderKey = randomUUID();
function open() {
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: [{ type: "ESModule", path: "worker.mjs", contents: script }],
      compatibilityDate: "2026-09-02",
      compatibilityFlags: ["nodejs_compat"],
      workerLoaders: { LOADER: {} },
      durableObjects: {
        REGION: { className: "QuarryController", useSQLite: true },
      },
      resourcePersistencePath: resolve(directory, "storage"),
      bindings: { BUILDER_KEY: builderKey, UNAUTHORIZED_KEY: outsiderKey },
    }),
  );
}
const command = {
  id: "physical-dig-1",
  expectedRevision: 0,
  command: { kind: "excavate", at: { x: 0, y: -1, z: 0 } },
};
const run = (runtime, code, key = builderKey) =>
  runtime.dispatchFetch("http://controller.local/execute", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
async function value(response) {
  const text = await response.text();
  assert.equal(
    response.status,
    200,
    `controller HTTP ${response.status}: ${text.slice(0, 512)}`,
  );
  return JSON.parse(text);
}
async function sqliteWitness() {
  const entries = await readdir(resolve(directory, "storage"), {
    recursive: true,
  });
  for (const entry of entries.filter((entry) => entry.endsWith(".sqlite"))) {
    const db = new DatabaseSync(resolve(directory, "storage", entry), {
      readOnly: true,
    });
    try {
      if (
        !db
          .prepare("SELECT name FROM sqlite_master WHERE name='hive_region'")
          .get()
      )
        continue;
      const state = db
        .prepare("SELECT revision,state_json FROM hive_region")
        .get();
      return {
        ...state,
        receipts: db
          .prepare(
            "SELECT principal,command_id,receipt_json FROM hive_region_receipts ORDER BY principal,command_id",
          )
          .all(),
        events: db
          .prepare("SELECT * FROM hive_region_events ORDER BY sequence")
          .all(),
      };
    } finally {
      db.close();
    }
  }
  return null;
}
let runtime = open();
try {
  const observation = await value(
    await run(runtime, "return await quarry.observe({});"),
  );
  assert.deepEqual(observation.value, {
    revision: 0,
    excavated: 0,
    visibleChalk: 0,
  });
  const described = await value(
    await run(
      runtime,
      'return await forage.describe({ path: "quarry.command" });',
    ),
  );
  assert.equal(described.value.path, "quarry.command");
  assert.equal(described.value.kind, "operation");
  const forbidden = await run(
    runtime,
    `return await quarry.command(${JSON.stringify(command)});`,
    outsiderKey,
  );
  assert.notEqual(forbidden.status, 200);
  const injected = await run(
    runtime,
    `return await quarry.command(${JSON.stringify({ ...command, principal: "quarry-builder" })});`,
  );
  assert.notEqual(injected.status, 200);
  const hidden = await run(
    runtime,
    "return await quarry.observe({});",
    outsiderKey,
  );
  assert.notEqual(hidden.status, 200);
  const before = await sqliteWitness();
  assert.equal(before.revision, 0);
  assert.equal(before.receipts.length, 0);

  // Guest deliberately never returns after the physical command. A read-only
  // SQLite witness sees the committed effect before we destroy this runtime;
  // no follow-up DO fetch reveals or drives that first transition.
  let returned = false;
  const lost = run(
    runtime,
    `await quarry.command(${JSON.stringify(command)}); await new Promise(() => {}); return null;`,
  ).then(
    () => {
      returned = true;
    },
    () => {},
  );
  let committed;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    committed = await sqliteWitness();
    if (committed?.receipts.length === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(committed?.revision, 1);
  assert.equal(returned, false);
  await writeFile(
    resolve(directory, "before-restart.json"),
    JSON.stringify(committed, null, 2),
  );
  await runtime.dispose();
  await lost;
  runtime = open();
  const replay = await value(
    await run(
      runtime,
      `return await quarry.command(${JSON.stringify(command)});`,
    ),
  );
  const prior = JSON.parse(committed.receipts[0].receipt_json);
  assert.deepEqual(replay.value, prior);
  assert.notEqual(replay.executionId, observation.executionId);
  assert.notEqual(replay.executionId, command.id);
  const again = await value(
    await run(
      runtime,
      `return await quarry.command(${JSON.stringify(command)});`,
    ),
  );
  assert.notEqual(again.executionId, replay.executionId);
  assert.deepEqual(again.value, prior);
  const conflict = await run(
    runtime,
    `return await quarry.command(${JSON.stringify({ ...command, command: { kind: "excavate", at: { x: 1, y: -1, z: 0 } } })});`,
  );
  assert.notEqual(conflict.status, 200);
  const after = await sqliteWitness();
  assert.deepEqual(after, committed);
  const physical = JSON.parse(after.state_json);
  assert.equal(physical.excavated, 1);
  assert.equal(physical.materials.state.lots.length, 1);
  assert.equal(physical.materials.state.lots[0].quantity, 1);
  assert.equal(after.events.length, 1);
  await writeFile(
    resolve(directory, "after-restart.json"),
    JSON.stringify(after, null, 2),
  );
  const source = {};
  for (const path of Object.keys(bundled.metafile.inputs)) {
    if (path.includes("node_modules")) continue;
    source[path] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  }
  await writeFile(
    resolve(directory, "source-hashes.json"),
    JSON.stringify(source, null, 2),
  );
  await writeFile(
    resolve(directory, "result.json"),
    JSON.stringify(
      {
        status: "passed",
        native:
          "workerd + Durable Object SQLite + Codemode + public Mycelium execute",
        beforeRevision: before.revision,
        afterRevision: after.revision,
        receipts: after.receipts.length,
        lots: physical.materials.state.lots.length,
        events: after.events.length,
        replay: prior,
        distinctExecutionIds: [
          observation.executionId,
          replay.executionId,
          again.executionId,
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS native controller: scoped observation/command, denied authority, lost-response restart, one physical effect and durable replay",
  );
} finally {
  await runtime.dispose();
}
