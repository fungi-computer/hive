import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { ConstructionSite } from "./construction";
import { Body, Container, MaterialLot, Traversal } from "./common";
import { DeconstructionApproach, DeconstructionOrder, deconstructionWorkProvider, queueDeconstruction } from "./deconstruction-work";
import type { DeconstructionAccess, QueryRow, QuerySpec, WriteContext } from "../contracts";
import { parseDeconstructionAccess } from "../runtime/wasm-kernel";

const worker = entity("worker.deconstructor");
const site = entity("site.finished");
const order = entity("order.deconstruct");

function row(id: ReturnType<typeof entity>, values: Record<string, unknown>): QueryRow<any> {
  return { id, get: (definition: { id: string }) => values[definition.id] } as QueryRow<any>;
}

function fixture(options: {
  readonly access?: Partial<DeconstructionAccess>;
  readonly quantity?: number;
  readonly capacity?: number;
  readonly suspended?: boolean;
  readonly orderState?: Record<string, unknown>;
  readonly orderId?: ReturnType<typeof entity>;
  readonly includeSite?: boolean;
  readonly secondOrder?: boolean;
  readonly approach?: boolean;
  readonly outcomes?: readonly any[];
}) {
  const records: QueryRow<any>[] = [];
  if (options.includeSite !== false) records.push(row(site, {
    [ConstructionSite.id]: { catalog: "floor", x: 1, y: 0, z: 1, orientation: "north", worker: null, seconds: 1, phase: "finished" },
  }));
  const state = {
    site, actor: null, phase: "queued", seconds: 0,
    contactX: 1, contactY: 0.5, contactZ: 1, reason: "", retryKey: "",
    ...options.orderState,
  };
  const primaryOrder = options.orderId ?? order;
  records.push(row(primaryOrder, { [DeconstructionOrder.id]: state }));
  if (options.secondOrder) records.push(row(entity("order.deconstruct.second"), { [DeconstructionOrder.id]: { ...state } }));
  if (options.approach) records.push(row(entity(`deconstruction-approach.${order.length}:${order}`), {
    [DeconstructionApproach.id]: { order: primaryOrder, worker, contactX: 1, contactY: 0.5, contactZ: 1 },
  }));
  records.push(row(worker, {
    [Body.id]: { speed: 1 }, [Container.id]: { capacity: options.capacity ?? 8 },
    [Traversal.id]: { clearanceCells: 1, maxStepCells: 1 },
  }));
  if (options.quantity) records.push(row(entity("lot.salvage"), { [MaterialLot.id]: { kind: "wood", quantity: options.quantity, container: worker } }));
  const actions: unknown[] = [];
  const writes: { entity: ReturnType<typeof entity>; value: any }[] = [];
  const created: unknown[] = [];
  const removed: ReturnType<typeof entity>[] = [];
  const routes: unknown[] = [];
  const accessRow: DeconstructionAccess = {
    site, status: "ready", contacts: [{ x: 1, y: 0.5, z: 1, frame: null, kind: "origin" }], salvageQuantity: 0, workSeconds: 1,
    ...options.access,
  };
  const context = {
    clock: { now: 0, delta: 0.2, tick: 1 }, outcomes: options.outcomes ?? [], impacts: [], random: { next: () => 0 },
    query(spec: QuerySpec<any>) { return records.filter((candidate) => spec.components.every((definition) => candidate.get(definition) !== undefined)); },
    worldPoses(ids: readonly ReturnType<typeof entity>[]) { return ids.flatMap((id) => id === worker ? [{ id, local: { x: 1, y: 0.5, z: 1, facing: 0 }, world: { x: 1, y: 0.5, z: 1, facing: 0 }, support: null, surface: null }] : []); },
    deconstructionAccess: (sites: readonly ReturnType<typeof entity>[]) => sites.map(() => accessRow),
    routeToAny: (request: { actor: ReturnType<typeof entity>; targets: readonly unknown[] }) => { routes.push(request); return { actor: request.actor, status: "reachable" as const, targetIndex: 0, cost: 1 }; },
    routeCosts: () => [], workMaterialFacts: () => ({ version: 1, containers: [], lots: [] }),
    physicalContacts: () => [], environmentFacts: () => ({}), atmosphereSamples: () => ({ revision: 0, geometryRevision: 0, samples: [] }), terrainMaterials: () => [], terrainSurfaces: () => [],
    assign: (candidates: readonly any[]) => candidates,
    write(definition: { id: string }, id: ReturnType<typeof entity>, value: unknown) {
      writes.push({ entity: id, value });
      const target = records.find((candidate) => candidate.id === id);
      if (target) (target.get as any) = (requested: { id: string }) => requested.id === definition.id ? value : undefined;
    },
    action: (action: unknown) => actions.push(action), createAuthoredEntity: (record: unknown) => created.push(record), removeAuthoredEntity: (id: ReturnType<typeof entity>) => removed.push(id),
  } as unknown as WriteContext;
  return { context, actions, writes, created, removed, routes };
}

test("deconstruction intent queues without a worker", () => {
  const record = queueDeconstruction(entity("site.finished"));
  const state = record.components[DeconstructionOrder.id] as any;
  assert.equal(state.actor, null);
  assert.equal(state.phase, "queued");
});

test("empty deconstruction queue does not ask native access or routing for a worker", () => {
  const context = { query: () => [], deconstructionAccess: () => { throw new Error("unexpected native access query"); } } as unknown as WriteContext;
  const prepared = deconstructionWorkProvider(context, [], new Set());
  assert.deepEqual(prepared.candidates, []);
  assert.deepEqual(prepared.claims, []);
});

test("structural and capacity blockers yield no candidates and no route", () => {
  const structural = fixture({ access: { status: "structuralDependency" } });
  const blocked = deconstructionWorkProvider(structural.context, [worker], new Set());
  assert.deepEqual(blocked.candidates, []); assert.deepEqual(structural.routes, []);
  const capacity = fixture({ access: { salvageQuantity: 3 }, capacity: 2, quantity: 1 });
  const full = deconstructionWorkProvider(capacity.context, [worker], new Set());
  assert.deepEqual(full.candidates, []); assert.deepEqual(capacity.routes, []);
});

test("suspending an approached worker releases its order", () => {
  const fake = fixture({ approach: true, orderState: { actor: worker, phase: "approaching" } });
  const prepared = deconstructionWorkProvider(fake.context, [worker], new Set([worker]));
  prepared.progress();
  assert.deepEqual(fake.removed, [entity("deconstruction-approach.17:order.deconstruct")]);
  assert.equal(fake.writes[0].value.actor, null); assert.equal(fake.writes[0].value.phase, "queued");
});

test("progress emits deconstruct once and submitting does not reissue it", () => {
  const fake = fixture({ approach: true, orderState: { actor: worker, phase: "working", seconds: 0.9 } });
  deconstructionWorkProvider(fake.context, [worker], new Set()).progress();
  assert.equal(fake.actions.filter((action: any) => action.kind === "deconstruct").length, 1);
  assert.equal(fake.writes.at(-1)?.value.phase, "submitting");
  const again = fixture({ approach: true, orderState: { actor: worker, phase: "submitting", seconds: 1 } });
  deconstructionWorkProvider(again.context, [worker], new Set()).progress();
  assert.deepEqual(again.actions, []);
});

test("rejected move is consumed, releases the approach, and preserves native reason", () => {
  const fake = fixture({ approach: true, orderState: { actor: worker, phase: "approaching" }, outcomes: [{ action: { kind: "move", entity: worker, destination: { x: 1, y: 0.5, z: 1, frame: null } }, result: { accepted: false, reason: "contact occupied", revision: 1 } }] });
  deconstructionWorkProvider(fake.context, [worker], new Set()).progress();
  assert.equal(fake.removed.length, 1); assert.equal(fake.writes[0].value.phase, "blocked");
  assert.equal(fake.writes[0].value.reason, "contact occupied"); assert.deepEqual(fake.actions, []);
});

test("rejected outcome blocks until relevant access or capacity facts change", () => {
  const first = fixture({ orderState: { actor: worker, phase: "approaching" }, outcomes: [{ action: { kind: "deconstruct", worker, site }, result: { accepted: false, reason: "capacity", revision: 1 } }] });
  deconstructionWorkProvider(first.context, [worker], new Set());
  assert.equal(first.writes[0].value.phase, "blocked");
  const second = fixture({ orderState: first.writes[0].value });
  const prepared = deconstructionWorkProvider(second.context, [worker], new Set());
  assert.deepEqual(prepared.candidates, []); assert.deepEqual(second.routes, []);

  const changed = fixture({ orderState: first.writes[0].value, capacity: 9 });
  const reconsidered = deconstructionWorkProvider(changed.context, [worker], new Set());
  assert.equal(reconsidered.candidates.length, 1);
});

test("accepted and missing-site cleanup removes records without writing them", () => {
  const accepted = fixture({ approach: true, orderState: { actor: worker, phase: "submitting" }, outcomes: [{ action: { kind: "deconstruct", worker, site }, result: { accepted: true, revision: 1 } }] });
  deconstructionWorkProvider(accepted.context, [worker], new Set());
  assert.deepEqual(accepted.writes, []); assert.equal(accepted.removed.length, 2);
  const missing = fixture({ includeSite: false });
  deconstructionWorkProvider(missing.context, [worker], new Set());
  assert.deepEqual(missing.writes, []); assert.deepEqual(missing.removed, [order]);
});

test("duplicate site orders choose the stable first order", () => {
  const fake = fixture({ secondOrder: true });
  const prepared = deconstructionWorkProvider(fake.context, [worker], new Set());
  assert.deepEqual(prepared.candidates.map((candidate) => candidate.task), [order]);
  assert.deepEqual(fake.removed, [entity("order.deconstruct.second")]);
});

test("deconstruction access wire is strict, ordered, and preserves contacts", () => {
  const value = [{
    site,
    removal: "ready",
    salvageQuantity: 3,
    workSeconds: 2,
    contacts: [{ x: 1, y: 0.5, z: 1, frame: null, kind: "origin" }],
  }];
  assert.deepEqual(parseDeconstructionAccess(value, [site]), [{
    site,
    status: "ready",
    salvageQuantity: 3,
    workSeconds: 2,
    contacts: value[0].contacts,
  }]);
  assert.throws(() => parseDeconstructionAccess([{ ...value[0], support: "ready" }], [site]));
  assert.throws(() => parseDeconstructionAccess(value, [entity("site.other")]), /order mismatch/);
  assert.throws(() => parseDeconstructionAccess([value[0], value[0]], [site, site]), /unique valid sites/);
});
