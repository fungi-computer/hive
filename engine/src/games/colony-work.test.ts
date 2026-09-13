// Focused laws for the shared tended-resource work owner.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { Body, MaterialLot, Position, ResourceSite } from "../sdk/common";
import { query } from "../sdk/authoring";
import { colonyPack } from "./colony";
import { ColonyResourceOrder, resourceWorkProvider } from "./colony-work";
import { Worker } from "./colony-components";
import { WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";

const id = (value: string) => value as import("../contracts").EntityId;
const row = (entity: string, values: Map<object, unknown>) => ({ id: id(entity), get: (definition: object) => values.get(definition) });
const clock = { now: 20, delta: 0.25, tick: 80 };

function providerContext(order: unknown, site: unknown, lots: unknown[] = [], outcomes: unknown[] = []) {
  const writes: unknown[] = [], created: unknown[] = [], removed: string[] = [], actions: unknown[] = [];
  const worker = row("worker", new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 1, y: 1, z: 1, facing: 0 }]]));
  const context: any = {
    clock, outcomes, writes,
    query(spec: any) {
      if (spec.components.includes(Worker)) return [worker];
      if (spec.components.includes(ResourceSite)) return [row("site", new Map([[ResourceSite, site]]))];
      if (spec.components.includes(MaterialLot)) return lots.map(lot => row(lot.id, new Map([[MaterialLot, lot]])));
      if (spec.components.includes(WaterSupplyOrder)) return created.map(record => row(record.id, new Map([
        [WaterSupplyOrder, record.components[WaterSupplyOrder.id]],
        [WaterSupplyWork, record.components[WaterSupplyWork.id]],
      ])));
      return [row("order", new Map([[ColonyResourceOrder, order]]))];
    },
    workMaterialFacts: () => ({ version: 1, containers: lots.map(lot => ({ id: lot.id, capacity: 8, sealed: false })), lots }),
    worldPoses: () => [{ id: id("worker"), local: { x: 2, y: 1.5, z: 1, facing: 0 }, world: { x: 2, y: 1.5, z: 1, facing: 0 }, support: null, surface: null }],
    routeToAny: () => ({ status: "reachable", targetIndex: 0, cost: 1 }),
    routeCosts: () => [], waterContacts: () => [],
    action: value => actions.push(value),
    write: (_definition, entity, value) => writes.push([entity, value]),
    createAuthoredEntity: value => created.push(value),
    removeAuthoredEntity: value => removed.push(value),
  };
  return { context, writes, created, removed, actions };
}

test("player sow intent is workerless and blocked tend creates one stable shared water demand", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id("site"), actor: null, vessel: null, phase: "waiting", workSeconds: 0, reason: "", approachX: 0, approachY: 0, approachZ: 0, attempt: 0, operation: "" };
  const { context, created } = providerContext(order, { kind: "mugwort", stage: 0, nextDue: 0 }, []);
  resourceWorkProvider(context, new Set());
  assert.equal(created.length, 1);
  assert.match(created[0].id, /colony\.resource-water\.order/);
  resourceWorkProvider(context, new Set());
  assert.equal(created.length, 1, "the same blocked resource keeps one shared demand identity");
});

test("tend candidates require the exact worker-held pail and nested sufficient water", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id("site"), actor: null, vessel: null, phase: "tend", workSeconds: 0, reason: "", approachX: 0, approachY: 0, approachZ: 0, attempt: 0, operation: "" };
  const { context } = providerContext(order, { kind: "mugwort", stage: 1, nextDue: 0 }, [
    { id: id("pail-empty"), kind: "pail", quantity: 1, container: id("worker") },
    { id: id("pail-empty-water"), kind: "water", quantity: 0, container: id("pail-empty") },
    { id: id("pail-full"), kind: "pail", quantity: 1, container: id("other-worker") },
    { id: id("pail-full-water"), kind: "water", quantity: 4, container: id("pail-full") },
  ]);
  const prepared = resourceWorkProvider(context, new Set());
  assert.equal(prepared.candidates.length, 0);

  const sufficient = providerContext(order, { kind: "mugwort", stage: 1, nextDue: 0 }, [
    { id: id("pail"), kind: "pail", quantity: 1, container: id("worker") },
    { id: id("nested-water"), kind: "water", quantity: 1, container: id("pail") },
  ]);
  const selected = resourceWorkProvider(sufficient.context, new Set());
  assert.equal(selected.candidates[0].vessel, "pail");
  assert.equal(selected.candidates[0].worker, "worker");
});

test("rejected native approach releases the claim and accepted operation settles once", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id("site"), actor: id("worker"), vessel: id("pail"), phase: "tend", workSeconds: 2, reason: "", approachX: 1, approachY: 1.5, approachZ: 0, attempt: 3, operation: "order:tend:3" };
  const rejected = providerContext(order, { kind: "mugwort", stage: 0, nextDue: 99 }, [], [{ action: { kind: "move", entity: id("worker"), destination: { x: 1, y: 1.5, z: 0 } }, result: { accepted: false, reason: "blocked" } }]);
  resourceWorkProvider(rejected.context, new Set());
  assert.equal(rejected.writes.at(-1)[1].actor, null);
  assert.equal(rejected.writes.at(-1)[1].workSeconds, 0);

  const settled = providerContext({ ...order, phase: "submitting-tend" }, { kind: "mugwort", stage: 0, nextDue: 99 }, [], [{ action: { kind: "tend-resource-site", operation: order.operation, worker: id("worker"), site: id("site"), vessel: id("pail") }, result: { accepted: true } }]);
  resourceWorkProvider(settled.context, new Set());
  assert.equal(settled.writes.at(-1)[1].phase, "waiting");
  assert.equal(settled.writes.at(-1)[1].actor, null);
});

test("GameSession preserves a finite mugwort harvest through extraction and reload", async (t) => {
  if (!existsSync("engine/generated/hive_kernel_bg.wasm")) {
    t.skip("generated WASM is unavailable in this checkout");
    return;
  }
  const [{ initSync, WasmKernel }, { GameSession }, { wasmKernelPort }] = await Promise.all([
    import("../../generated/hive_kernel.js"), import("../runtime/session"), import("../runtime/wasm-kernel"),
  ]);
  initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  try {
    session.start();
    session.command("sowMugwort", { target: { cell: [0, 13, 0] } });
    session.step(0);
    const intent = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
    assert(intent, "sow command must create a workerless resource intent");
    const savedBeforeWork = session.save();
    session.restore(savedBeforeWork);
    assert.deepEqual(session.save(), savedBeforeWork);
    for (let tick = 0; tick < 4000; tick++) {
      try { session.step(0.25); } catch (error) {
        throw new Error(`resource step ${tick} failed: ${String(error)}`, { cause: error as Error });
      }
      const current = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
      if (current?.phase === "complete") break;
    }
    const completed = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
    assert.equal(completed?.phase, "complete", "resource order must complete before conservation is assessed");
    const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    const harvested = lots.filter(lot => lot.kind === "mugwort" && lot.container.startsWith("colony.worker."));
    assert.equal(harvested.reduce((sum, lot) => sum + lot.quantity, 0), 1, "the native harvest lot must enter worker custody");
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
  } finally { try { port.dispose(); } catch { /* preserve the primary law assertion */ } }
});
