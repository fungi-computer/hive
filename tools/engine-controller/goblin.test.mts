import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { Mycelium } from "@fungi.computer/mycelium";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { loadOptimizer } from "../../src/engine/colony/loader.ts";
import { createGoblinRegionProgram } from "../../src/world-presets/goblin-region.ts";
import { openRegion, type RegionSqliteOwner } from "../../src/engine/region/index.ts";
import { goblinController } from "./goblin.mts";

const optimizer = await loadOptimizer(await WebAssembly.compile(
  await readFile("src/engine/colony/colony.wasm"),
));
const digCell = { x: 7, z: 9, level: 0 as const };
function fixture(t: { after(fn: () => void): void }) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const owner: RegionSqliteOwner = {
    sql: {
      exec<Row extends Record<string, string | number | null | ArrayBuffer | Uint8Array>>(statement: string, ...bindings: (string | number | null | ArrayBuffer | Uint8Array)[]) {
        if (statement.startsWith("CREATE TABLE")) {
          db.exec(statement);
          return { toArray: () => [] };
        }
        const rows = db.prepare(statement).all(...bindings.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value));
        return { toArray: () => rows as Row[] };
      },
    },
    transactionSync(operation) {
      db.exec("BEGIN");
      try { const value = operation(); db.exec("COMMIT"); return value; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  const reopen = () => openRegion({
    owner, region: "delegated-goblin", program: createGoblinRegionProgram(optimizer),
  });
  const region = reopen();
  return { region, reopen, db };
}

/** Deterministic public binding fixture. It does not evaluate JavaScript or
 * claim native sandbox isolation; native-v4 separately proves that transport.
 */
async function invoke(
  module: ReturnType<typeof goblinController>,
  operation: "observe" | "command",
  input: unknown,
) {
  const runtime = await Mycelium.make({
    modules: [module],
    sandbox: {
      execute(request) {
        const binding = request.bindings.goblin?.[operation];
        assert(binding);
        return binding(input);
      },
    },
  });
  try {
    const lease = await runtime.acquire();
    try {
      const prepared = await Effect.runPromise(lease.executeTool.prepare({
        type: "toolCall", id: crypto.randomUUID(), name: "execute",
        arguments: { code: "/* deterministic authored-binding fixture */" },
      }));
      const parts = await Effect.runPromise(Stream.runCollect(prepared.execute()));
      for (const part of parts) {
        if (part.type !== "result") continue;
        if (part.result.isError) throw new Error(JSON.stringify(part.result.content));
        const text = part.result.content.find(item => item.type === "text");
        assert(text && text.type === "text");
        return JSON.parse(text.text);
      }
      throw new Error("missing-execute-result");
    } finally { await lease.release(); }
  } finally { await runtime.close(); }
}

function controller(region: ReturnType<typeof fixture>["region"], actor = "rowan") {
  return goblinController(region, { actor, knownDigCells: [digCell] });
}

test("personal rest admission stays paused; actor/knowledge grants are copied and observations narrow", async t => {
  const { region } = fixture(t);
  const selected = { actor: "rowan", knownDigCells: [{ ...digCell }] };
  const module = goblinController(region, selected);
  selected.actor = "sedge";
  selected.knownDigCells[0].x = 12;
  const before = region.readCommitted();
  const observation = await invoke(module, "observe", {});
  assert.deepEqual(Object.keys(observation).sort(), ["actor", "knownDigCells", "paused", "revision", "tick"]);
  assert.deepEqual(Object.keys(observation.actor).sort(), ["hydration", "id", "level", "nourishment", "rest", "x", "z"]);
  assert.equal(observation.actor.id, "rowan");
  assert.deepEqual(observation.knownDigCells, [digCell]);
  const receipt = await invoke(module, "command", {
    id: "personal-rest", expectedRevision: 0, command: { kind: "rest" },
  });
  assert.equal(receipt.status, "applied");
  const after = region.readCommitted();
  assert.equal(after.state.clearing.paused, true);
  assert.equal(after.state.clearing.tick, 0);
  assert.deepEqual(after.state.clearing.actors, before.state.clearing.actors);
  assert.deepEqual(after.state.clearing.materials, before.state.clearing.materials);
  assert.deepEqual(after.state.clearing.jobs.map(job => job.id), receipt.result.createdJobs);
  assert.equal(after.state.clearing.jobs.length, 1);
  assert(after.state.clearing.jobs[0].kind === "care");
  assert.equal(after.state.clearing.jobs[0].target, "rowan");
  assert.equal(after.state.clearing.jobs[0].policy, "manual-rest");
});

test("ungranted actor/cell and host-time inputs cannot mutate the real region", async t => {
  const { region, db } = fixture(t);
  const module = controller(region);
  const before = region.readCommitted();
  for (const command of [
    { kind: "rest", actor: "sedge" },
    { kind: "rest", actors: ["sedge"] },
    { kind: "dig", at: { ...digCell, x: 8 } },
    { kind: "advance", ticks: 1 },
    { kind: "set-paused", paused: false },
  ]) {
    await assert.rejects(invoke(module, "command", { id: "denied", expectedRevision: 0, command }));
    assert.deepEqual(region.readCommitted(), before);
  }
  await assert.rejects(invoke(module, "command", {
    id: "principal-injection", expectedRevision: 0, principal: "goblin-host", command: { kind: "rest" },
  }));
  await assert.rejects(invoke(controller(region, "not-a-member"), "observe", {}));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get()!.n, 0);
});

test("paused personal dig has a durable receipt; reconstructed retry cannot duplicate pawn work or soil", async t => {
  const { region, reopen, db } = fixture(t);
  const input = { id: "personal-dig", expectedRevision: 0, command: { kind: "dig", at: digCell } };
  const receipt = await invoke(controller(region), "command", input);
  assert.equal(receipt.status, "applied");
  const admitted = region.readCommitted();
  assert.equal(admitted.state.clearing.tick, 0);
  assert.equal(admitted.state.clearing.paused, true);
  assert.deepEqual(admitted.state.clearing.terrain.edits, []);
  assert.equal(admitted.state.clearing.jobs.length, 1);
  assert(admitted.state.clearing.jobs[0].kind === "dig");
  assert.deepEqual(admitted.state.clearing.jobs[0].scope, { party: "home", actors: ["rowan"] });
  assert.deepEqual(receipt.result.createdJobs, admitted.state.clearing.jobs.map(job => job.id));
  const resumed = reopen();
  assert.deepEqual(await invoke(controller(resumed), "command", input), receipt);
  assert.deepEqual(resumed.readCommitted(), admitted);
  await assert.rejects(invoke(controller(resumed), "command", { ...input, command: { kind: "rest" } }));
  assert.deepEqual(resumed.readCommitted(), admitted);
  // Only the host drives the unchanged clock and actual libcolony optimizer.
  resumed.dispatch("goblin-player", { id: "unpause", expectedRevision: 1, command: { kind: "set-paused", paused: false } });
  resumed.dispatch("goblin-host", { id: "work", expectedRevision: 2, command: { kind: "advance", ticks: 120 } });
  const worked = resumed.readCommitted();
  assert.deepEqual(worked.state.clearing.terrain.edits, [digCell]);
  assert.equal(worked.state.clearing.materials.lots.filter(lot => lot.material === "soil").reduce((n, lot) => n + lot.quantity, 0), 1);
  assert.deepEqual(await invoke(controller(reopen()), "command", input), receipt);
  assert.deepEqual(reopen().readCommitted(), worked);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get()!.n, 3);
});
