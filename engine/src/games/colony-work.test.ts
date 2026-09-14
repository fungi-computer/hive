// Focused laws for the shared tended-resource work owner.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { Body, Container, FiniteResource, MaterialLot, Position, ResourceSite } from "../sdk/common";
import { GroundStock } from "../sdk/ground-stock";
import { query } from "../sdk/authoring";
import { colonyPack } from "./colony";
import { ColonyDigOrder, ColonyResourceOrder, ColonyTree, ColonyTreeOrder, ColonyTreePolicy, digProvider, resourceWorkProvider, treeWorkProvider } from "./colony-work";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { Worker } from "./colony-components";
import { WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";
import { ConstructionSite } from "../sdk/construction";
import { DeliveryTask } from "../sdk/delivery";
import { StagedProcess } from "../sdk/process-supply";
import type { ActionRequest, EntityId, QueryRow, WorkActivityRef, WorkAttempt, WorkOutcome } from "../contracts";

const id = (value: string) => value as import("../contracts").EntityId;
const row = (entity: string, values: Map<object, unknown>) => ({ id: id(entity), get: (definition: object) => values.get(definition) });
const clock = { now: 20, delta: 0.25, tick: 80 };

type ReconciliationState = { cellX: number; cellY: number; cellZ: number; expected: number; status: "queued" | "blocked" | "cancelling"; reason: string } | { tree: EntityId; phase: "queued" | "working" | "blocked" | "complete"; stage: "fell" | "chop"; seconds: number; reason: string };
function reconciliationContext(kind: "dig" | "tree", attempt: WorkAttempt | null, stateOverride: Partial<ReconciliationState> = {}) {
  const task = id(kind === "dig" ? "dig-order" : "tree-order"), worker = id("worker"), tree = id("tree");
  const state = kind === "dig"
    ? { cellX: 1, cellY: 1, cellZ: 1, expected: 2, status: "queued", reason: "" }
    : { tree, phase: "queued", stage: "chop", seconds: 0, reason: "" };
  Object.assign(state, stateOverride);
  const records: Array<QueryRow> = [
    row(task as string, new Map([[kind === "dig" ? ColonyDigOrder : ColonyTreeOrder, state], [OwnedByParty, { party: id("party") }]])),
    row("worker", new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 0, y: 1, z: 0, facing: 0 }], [PartyMember, { party: id("party") }]])),
  ];
  if (kind === "tree") records.push(
    row("tree", new Map([[ColonyTree, { phase: "felled" }], [ColonyTreePolicy, { designated: true }], [Position, { x: 1, y: 1, z: 1 }], [Container, { capacity: 6 }], [FiniteResource, { kind: "wood", quantity: 6 }], [OwnedByParty, { party: id("party") }]])),
  );
  const writes: Array<readonly [unknown, EntityId, unknown]> = [], actions: ActionRequest[] = [], removed: EntityId[] = [];
  let projectedAttempt = attempt;
  const context: any = {
    clock, query: (spec: any) => records.filter(record => spec.components.every((component: any) => record.get(component) !== undefined)),
    workAttempts: () => projectedAttempt ? [projectedAttempt] : [],
    worldPoses: () => [{ id: worker, local: { x: 0, y: 1, z: 0, facing: 0 }, world: { x: 0, y: 1, z: 0, facing: 0 }, support: null, surface: null }],
    terrainMaterials: () => [2], routeToAny: () => ({ status: "reachable", targetIndex: 0, cost: 1 }),
    action: (action: ActionRequest) => { actions.push(action); if (action.kind === "acknowledge-work-attempt") projectedAttempt = null; }, write: (definition: unknown, entity: EntityId, value: unknown) => writes.push([definition, entity, value]),
    removeAuthoredEntity: (entity: any) => removed.push(entity),
  };
  return { context, task, worker, tree, writes, actions, removed, state };
}
function outcome(task: EntityId, worker: EntityId, activity: WorkActivityRef, result: WorkOutcome = { kind: "completed" }): WorkAttempt {
  return { key: { task, generation: 1 }, worker, party: id("party"), phase: { kind: "outcome", operation: { attempt: { task, generation: 1 }, sequence: 1 }, activity, result } };
}

function providerContext(order: unknown, site: unknown, lots: unknown[] = [], outcomes: unknown[] = []) {
  const writes: unknown[] = [], created: unknown[] = [], removed: string[] = [], actions: unknown[] = [];
  const worker = row("worker", new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 1, y: 1, z: 1, facing: 0 }], [PartyMember, { party: id("party") }]]));
  const context: any = {
    clock, outcomes, writes,
    query(spec: any) {
      if (spec.components.includes(Worker)) return [worker];
      if (spec.components.includes(PartyMember)) return [worker];
      if (spec.components.includes(OwnedByParty)) return [row("order", new Map([[ColonyResourceOrder, order], [OwnedByParty, { party: id("party") }]]))];
      if (spec.components.includes(ResourceSite)) return [row("site", new Map([[ResourceSite, site]]))];
      if (spec.components.includes(MaterialLot)) return lots.map(lot => row(lot.id, new Map([[MaterialLot, lot]])));
      if (spec.components.includes(WaterSupplyOrder)) return created.map(record => row(record.id, new Map([
        [WaterSupplyOrder, record.components[WaterSupplyOrder.id]],
        [WaterSupplyWork, record.components[WaterSupplyWork.id]],
      ])));
      return [row("order", new Map([[ColonyResourceOrder, order], [OwnedByParty, { party: id("party") }]]))];
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

test("empty resource work does not ask native poses for an empty batch", () => {
  const context: any = {
    clock, outcomes: [],
    query: () => [],
    workMaterialFacts: () => ({ version: 1, containers: [], lots: [] }),
    worldPoses: () => { throw new Error("empty native pose query"); },
  };
  const prepared = resourceWorkProvider(context, new Set());
  assert.deepEqual(prepared.claims, []);
  assert.deepEqual(prepared.candidates, []);
});

test("player sow intent remains workerless while resource scheduling uses owned workers", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id("site"), stage: "tend", status: "queued", workSeconds: 0, reason: "" };
  const { context, created } = providerContext(order, { kind: "mugwort", stage: 0, nextDue: 0 }, []);
  resourceWorkProvider(context, new Set());
  assert.equal(created.length, 0);
  resourceWorkProvider(context, new Set());
  assert.equal(created.length, 0, "water demand creation belongs to the process water phase");
});

test("tend candidates require the exact worker-held pail and nested sufficient water", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id("site"), stage: "tend", status: "queued", workSeconds: 0, reason: "" };
  const { context } = providerContext(order, { kind: "mugwort", stage: 1, nextDue: 0 }, [
    { id: id("pail-empty"), kind: "pail", quantity: 1, container: id("other-worker") },
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

test("blocked resource work remains a retryable domain state without authored actor fields", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id("site"), stage: "tend", status: "blocked", workSeconds: 2, reason: "blocked" };
  const result = providerContext(order, { kind: "mugwort", stage: 0, nextDue: 99 }, [], []);
  resourceWorkProvider(result.context, new Set());
  assert.deepEqual(result.writes, []);
});

test("drafted dig route releases the claim and is eligible again after undraft", () => {
  const first = reconciliationContext("dig", outcome(id("dig-order"), id("worker"), { kind: "route", destination: { x: 1, y: 1.5, z: 1, frame: null } }));
  digProvider(first.context, new Set([first.worker])).progress();
  assert.equal(first.state.status, "queued");
  assert.equal(first.actions.length, 1);
  const retry = reconciliationContext("dig", null, first.state);
  assert.equal(digProvider(retry.context, new Set()).candidates.length, 1);
});

test("cancelling dig excludes candidates and removes only after an attempt acknowledgement", () => {
  const executing = reconciliationContext("dig", {
    key: { task: id("dig-order"), generation: 4 }, worker: id("worker"), party: id("party"),
    phase: { kind: "executing", operation: { attempt: { task: id("dig-order"), generation: 4 }, sequence: 9 }, activity: { kind: "route", destination: { x: 1, y: 1.5, z: 1, frame: null } } },
  }, { status: "cancelling", reason: "Cancelled" });
  const prepared = digProvider(executing.context, new Set());
  assert.equal(prepared.candidates.length, 0);
  prepared.progress();
  assert.deepEqual(executing.actions, [{ kind: "interrupt-work-attempt", task: executing.task, generation: 4, sequence: 9, cause: "cancelled" }]);
  assert.deepEqual(executing.removed, []);

  const outcomeState = reconciliationContext("dig", outcome(id("dig-order"), id("worker"), { kind: "excavation", cell: [1, 1, 1], expectedMaterial: 2, replacementMaterial: 0 }), { status: "cancelling", reason: "Cancelled" });
  digProvider(outcomeState.context, new Set()).progress();
  assert.deepEqual(outcomeState.actions, [{ kind: "acknowledge-work-attempt", task: outcomeState.task, generation: 1, sequence: 1 }]);
  assert.deepEqual(outcomeState.removed, [], "physical completion is acknowledged before authored removal");

  const removed = reconciliationContext("dig", null, { status: "cancelling", reason: "Cancelled" });
  digProvider(removed.context, new Set()).progress();
  assert.deepEqual(removed.removed, [removed.task]);
});

test("cancelling dig with no attempt removes the authored order immediately", () => {
  const fixture = reconciliationContext("dig", null, { status: "cancelling", reason: "Cancelled" });
  digProvider(fixture.context, new Set()).progress();
  assert.deepEqual(fixture.removed, [fixture.task]);
  assert.deepEqual(fixture.actions, []);
});

test("drafted executing dig and tree attempts emit the exact native interrupt", () => {
  for (const kind of ["dig", "tree"] as const) {
    const fixture = reconciliationContext(kind, {
      key: { task: id(kind === "dig" ? "dig-order" : "tree-order"), generation: 4 },
      worker: id("worker"), party: id("party"),
      phase: { kind: "executing", operation: { attempt: { task: id(kind === "dig" ? "dig-order" : "tree-order"), generation: 4 }, sequence: 9 }, activity: { kind: "route", destination: { x: 1, y: 1.5, z: 1, frame: null } } },
    });
    (kind === "dig" ? digProvider(fixture.context, new Set([fixture.worker])) : treeWorkProvider(fixture.context, new Set([fixture.worker]))).progress();
    assert.deepEqual(fixture.actions, [{ kind: "interrupt-work-attempt", task: fixture.task, generation: 4, sequence: 9, cause: "workerUnavailable" }]);
  }
});

test("drafted dig interruption blocks and acknowledges, while committed excavation is removed once", () => {
  const interrupted = reconciliationContext("dig", outcome(id("dig-order"), id("worker"), { kind: "route", destination: { x: 1, y: 1.5, z: 1, frame: null } }, { kind: "interrupted", cause: "workerUnavailable" }));
  digProvider(interrupted.context, new Set([interrupted.worker])).progress();
  assert.equal(interrupted.writes[0][2].status, "blocked");
  assert.equal(interrupted.actions.length, 1);
  const physical = reconciliationContext("dig", outcome(id("dig-order"), id("worker"), { kind: "excavation", cell: [1, 1, 1], expectedMaterial: 2, replacementMaterial: 0 }));
  digProvider(physical.context, new Set([physical.worker])).progress();
  assert.deepEqual(physical.removed, [physical.task]);
  assert.equal(physical.actions.length, 1);
});

test("drafted tree route remains queued, then committed extraction completes exactly once", () => {
  const route = reconciliationContext("tree", outcome(id("tree-order"), id("worker"), { kind: "route", destination: { x: 1, y: 1, z: 1, frame: null } }));
  treeWorkProvider(route.context, new Set([route.worker])).progress();
  assert.equal(route.writes[0][2].phase, "queued");
  assert.equal(route.actions.length, 1);
  const physical = reconciliationContext("tree", outcome(id("tree-order"), id("worker"), { kind: "resource-extract", source: route.tree }));
  treeWorkProvider(physical.context, new Set([physical.worker])).progress();
  treeWorkProvider(physical.context, new Set([physical.worker])).progress();
  assert.equal(physical.writes.filter(write => write[0] === ColonyTree).length, 1);
  assert.equal(physical.writes[1][2].phase, "complete");
  assert.equal(physical.actions.length, 1);
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
    for (const columnX of [9, 9, 10, 9]) {
      const surface = port.terrainSurfaces([[columnX, 0]])[0];
      assert(surface, "generated column must have another diggable surface");
      session.command("dig", { area: { start: surface.cell, end: surface.cell } });
      for (let tick = 0; tick < 240 && port.terrainMaterials([surface.cell])[0] !== 0; tick++) session.step(0.25);
      assert.equal(port.terrainMaterials([surface.cell])[0], 0, "groundwater exposure must finish");
    }
    session.command("sowMugwort", { target: { cell: [0, 13, 0], material: 1 } });
    session.step(0);
    const intent = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
    assert(intent, "sow command must create a workerless resource intent");
    const savedBeforeWork = session.save();
    session.restore(savedBeforeWork);
    assert.deepEqual(session.save(), savedBeforeWork);
    let restoredNativeAttempt = false;
    for (let tick = 0; tick < 4000; tick++) {
      try { session.step(0.25); } catch (error) {
        throw new Error(`resource step ${tick} failed: ${String(error)}`, { cause: error as Error });
      }
      const current = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
      if (!restoredNativeAttempt && current?.status === "queued" && current?.stage !== "sow") {
        const pending = session.save();
        session.restore(pending);
        assert.deepEqual(session.save(), pending, "an admitted physical operation must survive exact save/reload");
        restoredNativeAttempt = true;
      }
      if (current?.status === "complete") break;
    }
    assert(restoredNativeAttempt, "the real consumer must cross a durable submitting phase");
    const completed = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
    assert.equal(completed?.status, "complete", "resource order must complete before conservation is assessed");
    const groundStocks = new Set(session.query(query(GroundStock)).map(row => row.id));
    const harvested = session.query(query(MaterialLot)).filter(row => {
      const lot = row.get(MaterialLot);
      return lot.kind === "mugwort" && groundStocks.has(lot.container);
    });
    assert.equal(harvested.reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 1, "the native harvest lot must land once at its physical site");

    session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
    for (let tick = 0; tick < 500; tick++) {
      const station = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "brew-station" && row.get(ConstructionSite).phase === "finished");
      if (station) break;
      session.step(0.25);
    }
    const station = session.query(query(ConstructionSite)).find(row => row.get(ConstructionSite).catalog === "brew-station" && row.get(ConstructionSite).phase === "finished");
    assert(station, "retained brew station must be built through ordinary construction");
    session.command("requestBrew", { station: station.id });
    let sawHarvestDelivery = false;
    for (let tick = 0; tick < 2400; tick++) {
      try { session.step(0.25); } catch (error) {
        const processes = session.query(query(StagedProcess)).map(row => ({ id: row.id, ...row.get(StagedProcess) }));
        const deliveries = session.query(query(DeliveryTask)).map(row => ({ id: row.id, ...row.get(DeliveryTask) }));
        const lots = session.query(query(MaterialLot)).map(row => ({ id: row.id, ...row.get(MaterialLot) }));
        throw new Error(`brew step ${tick} failed with processes=${JSON.stringify(processes)} deliveries=${JSON.stringify(deliveries)} lots=${JSON.stringify(lots)}: ${String(error)}`, { cause: error as Error });
      }
      sawHarvestDelivery ||= session.query(query(DeliveryTask)).some(row => {
        const delivery = row.get(DeliveryTask);
        return delivery.material === "mugwort" && delivery.sourceLot === harvested[0]?.id;
      });
      const process = session.query(query(StagedProcess))[0]?.get(StagedProcess);
      if (process?.phase === "complete") break;
    }
    assert(sawHarvestDelivery, "ordinary delivery must haul the newly harvested mugwort into the station");
    assert.equal(session.query(query(StagedProcess))[0]?.get(StagedProcess).phase, "complete", "retained herbal-ale process must complete");
    const brewedLots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
    assert.equal(brewedLots.filter(lot => lot.kind === "ale").reduce((sum, lot) => sum + lot.quantity, 0), 4);
    assert.equal(brewedLots.filter(lot => lot.kind === "mugwort").reduce((sum, lot) => sum + lot.quantity, 0), 0, "the harvested mugwort must be consumed exactly once");
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
  } finally { try { port.dispose(); } catch { /* preserve the primary law assertion */ } }
});
