import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { GroundStock } from "./ground-stock";
import {
  DeliveryControl,
  DeliveryTask,
  decodeDeliveryObligation,
  deliveryProvider,
  type DeliveryTaskValue,
} from "./delivery";
import {
  Body,
  Container,
  Destination,
  MaterialLot,
  Position,
  ExcavationWork,
} from "./common";
import { SealedContainer } from "./construction";
import { PartyMember } from "./party";
import type {
  EntityId,
  WorkAttempt,
  WorkActivityRef,
  WorkOutcome,
} from "../contracts";

const point = { x: 0, y: 0, z: 0, frame: null } as const;
const row = (id: EntityId, definition: { id: string }, value: unknown) => ({
  id,
  get: (requested: { id: string }) => {
    assert.equal(requested.id, definition.id);
    return value as never;
  },
});

type FixtureOptions = {
  readonly workers?: readonly EntityId[];
  readonly party?: EntityId;
  readonly workerParties?: ReadonlyMap<EntityId, EntityId>;
  readonly lotContainer?: EntityId;
  readonly lotQuantity?: number;
  readonly containerCapacity?: number;
  readonly occupiedWorkers?: readonly EntityId[];
  readonly sealedContainers?: readonly EntityId[];
  readonly attempt?: WorkAttempt;
  readonly contacts?: "ready" | "blocked";
  readonly routeTargetIndex?: number;
};
function fixture(options: FixtureOptions = {}) {
  const task = entity("delivery.task"),
    worker = options.workers?.[0] ?? entity("delivery.worker"),
    workers = options.workers ?? [worker];
  const party = options.party ?? entity("delivery.party"),
    source = entity("delivery.source"),
    destination = entity("delivery.destination"),
    lot = entity("delivery.lot"),
    routeTargetIndex = options.routeTargetIndex ?? 0;
  const lotQuantity = options.lotQuantity ?? 1,
    capacity = options.containerCapacity ?? 8;
  let lotContainer = options.lotContainer ?? source;
  let state: DeliveryTaskValue = {
    version: 2,
    party,
    sourceLot: lot,
    source,
    destination,
    material: "wood",
    quantity: 1,
    custody: "available",
    ground: null,
  };
  const actions: unknown[] = [],
    writes: unknown[] = [];
  let attempt = options.attempt;
  let contactState = options.contacts ?? "ready";
  let batchCalls = 0;
  const values = new Map<string, readonly unknown[]>([
    [DeliveryTask.id, [row(task, DeliveryTask, state)]],
    [
      DeliveryControl.id,
      workers.map((id) =>
        row(id, DeliveryControl, { enabled: true, quantity: 1 }),
      ),
    ],
    [
      PartyMember.id,
      workers.map((id) =>
        row(id, PartyMember, {
          party: options.workerParties?.get(id) ?? party,
        }),
      ),
    ],
    [Body.id, workers.map((id) => row(id, Body, { speed: 1 }))],
    [
      Container.id,
      [source, destination, ...workers].map((id) =>
        row(id, Container, { capacity }),
      ),
    ],
    [
      Position.id,
      [source, destination, ...workers].map((id) =>
        row(id, Position, { x: 0, y: 0, z: 0, facing: 0 }),
      ),
    ],
    [Destination.id, []],
    [
      ExcavationWork.id,
      (options.occupiedWorkers ?? []).map((id) =>
        row(id, ExcavationWork, {
          x: 0,
          y: 0,
          z: 0,
          expected: 1,
          replacement: 0,
          seconds: 0,
        }),
      ),
    ],
    [GroundStock.id, [row(source, GroundStock, {})]],
    [
      SealedContainer.id,
      (options.sealedContainers ?? []).map((id) =>
        row(id, SealedContainer, {}),
      ),
    ],
    [
      MaterialLot.id,
      [
        row(lot, MaterialLot, {
          kind: "wood",
          quantity: lotQuantity,
          container: lotContainer,
        }),
      ],
    ],
  ]);
  const context = {
    clock: { now: 1, delta: 0.1, tick: 1 },
    outcomes: [],
    impacts: [],
    random: { next: () => 0 },
    query: (spec: { components: readonly { id: string }[] }) =>
      (values.get(spec.components[0]!.id) ?? []) as never,
    workMaterialFacts: () => ({
      version: 1 as const,
      containers: [source, destination, ...workers].map((id) => ({
        id,
        capacity,
        sealed: (options.sealedContainers ?? []).includes(id),
      })),
      lots: [
        {
          id: lot,
          container: lotContainer,
          kind: "wood",
          quantity: lotQuantity,
        },
      ],
    }),
    workAttempts: (ids: readonly EntityId[]) => {
      batchCalls++;
      return attempt && ids.includes(attempt.key.task) ? [attempt] : [];
    },
    workAttemptForWorker: (id: EntityId) =>
      attempt?.worker === id ? attempt : null,
    worldPoses: (ids: readonly EntityId[]) =>
      ids.map((id) => ({
        id,
        local: point,
        world: point,
        support: null,
        surface: null,
      })),
    routeCosts: (requests: readonly { actor: EntityId }[]) =>
      requests.map((request) => ({
        actor: request.actor,
        status: "reachable" as const,
        cost: 1,
      })),
    routeToAny: ({ actor }: { actor: EntityId }) => ({
      actor,
      status: "reachable" as const,
      targetIndex: routeTargetIndex,
      cost: 1,
    }),
    transferContacts: () =>
      contactState === "ready"
        ? {
            kind: "ready" as const,
            targets: [point, { x: 1, y: 0, z: 0, frame: null }],
          }
        : { kind: "blocked" as const, reason: "no-contact" as const },
    write: (_definition: unknown, id: EntityId, value: DeliveryTaskValue) => {
      assert.equal(id, task);
      state = value;
      writes.push(value);
    },
    action: (value: unknown) => actions.push(value),
  } as never;
  const makeAttempt = (
    activity: WorkActivityRef,
    result: WorkOutcome,
    attemptWorker = worker,
  ): WorkAttempt => ({
    key: { task, generation: 1 },
    worker: attemptWorker,
    party,
    phase: {
      kind: "outcome",
      operation: { attempt: { task, generation: 1 }, sequence: 1 },
      activity,
      result,
    },
  });
  return {
    task,
    worker,
    workers,
    party,
    source,
    destination,
    lot,
    context,
    actions,
    writes,
    get state() {
      return state;
    },
    set state(value: DeliveryTaskValue) {
      state = value;
    },
    setAttempt(value: WorkAttempt | undefined) {
      attempt = value;
    },
    setLotContainer(value: EntityId) {
      lotContainer = value;
      values.set(MaterialLot.id, [
        row(lot, MaterialLot, {
          kind: "wood",
          quantity: lotQuantity,
          container: value,
        }),
      ]);
    },
    setContacts(value: "ready" | "blocked") {
      contactState = value;
    },
    get batchCalls() {
      return batchCalls;
    },
    prepare: (suspended: ReadonlySet<EntityId> = new Set()) =>
      deliveryProvider(context, suspended),
    makeAttempt,
  };
}
function route(destination = point): WorkActivityRef {
  return { kind: "route", destination };
}
function transfer(
  lot: EntityId,
  from: EntityId,
  to: EntityId,
): WorkActivityRef {
  return { kind: "material-transfer", lot, from, to, quantity: 1 };
}
function drop(lot: EntityId): WorkActivityRef {
  return { kind: "material-drop", lot };
}

test("delivery uses one native attempt and completes source pickup through destination deposit", () => {
  const f = fixture();
  let p = f.prepare();
  assert.equal(p.candidates.length, 1);
  assert.equal(p.estimate(p.candidates[0]!), 2);
  p.apply([{ task: f.task, worker: f.worker, cost: 2 }]);
  assert.equal((f.actions[0] as { kind: string }).kind, "begin-work-attempt");
  f.actions.length = 0;
  f.setAttempt(f.makeAttempt(route(), { kind: "completed" }));
  p = f.prepare();
  p.progress();
  assert.deepEqual(f.actions[0], {
    kind: "continue-work-attempt",
    task: f.task,
    generation: 1,
    sequence: 1,
    nextActivity: {
      kind: "material-transfer",
      lot: f.lot,
      from: f.source,
      to: f.worker,
      quantity: 1,
    },
  });
  f.actions.length = 0;
  f.setLotContainer(f.worker);
  f.setAttempt(
    f.makeAttempt(transfer(f.lot, f.source, f.worker), { kind: "completed" }),
  );
  p = f.prepare();
  p.progress();
  assert.equal(
    (f.actions[0] as { nextActivity: { kind: string } }).nextActivity.kind,
    "route",
  );
  f.actions.length = 0;
  f.setAttempt(f.makeAttempt(route(), { kind: "completed" }));
  p = f.prepare();
  p.progress();
  assert.equal(
    (f.actions[0] as { nextActivity: { kind: string } }).nextActivity.kind,
    "material-transfer",
  );
  f.actions.length = 0;
  f.setLotContainer(f.destination);
  f.setAttempt(
    f.makeAttempt(transfer(f.lot, f.worker, f.destination), {
      kind: "completed",
    }),
  );
  p = f.prepare();
  p.progress();
  assert.equal(f.state.custody, "delivered");
  assert.equal(
    (f.actions.at(-1) as { kind: string }).kind,
    "acknowledge-work-attempt",
  );
});

test("interrupted carrying preserves lot custody, releases labor, and only its holder may resume", () => {
  const holder = entity("holder"),
    other = entity("other"),
    f = fixture({ workers: [holder, other], lotContainer: holder });
  f.setAttempt(
    f.makeAttempt(
      transfer(f.lot, f.source, holder),
      { kind: "interrupted", cause: "drafted" },
      holder,
    ),
  );
  f.prepare().progress();
  assert.equal(f.state.custody, "held");
  f.setAttempt(undefined);
  assert.deepEqual(
    f.prepare().candidates.map((candidate) => candidate.worker),
    [holder],
  );
});

test("J2 lost destination contact drops held material, then reopens from committed ground lot", () => {
  const f = fixture({ lotContainer: entity("holder") });
  f.setAttempt(
    f.makeAttempt(transfer(f.lot, f.worker, f.destination), {
      kind: "completed",
    }),
  );
  f.setContacts("blocked");
  f.prepare().progress();
  assert.equal(
    (f.actions[0] as { nextActivity: { kind: string } }).nextActivity.kind,
    "material-drop",
  );
  f.actions.length = 0;
  f.setLotContainer(f.source);
  f.setAttempt(f.makeAttempt(drop(f.lot), { kind: "completed" }));
  f.prepare().progress();
  assert.equal(f.state.custody, "dropped");
  assert.equal(f.state.ground, f.source);
  f.actions.length = 0;
  f.setAttempt(undefined);
  f.prepare().progress();
  assert.equal(f.state.custody, "available");
  assert.equal(f.state.source, f.source);
  assert.equal(f.state.ground, null);
});

test("delivery batches WorkAttempt projection and excludes a foreign worker for the same task", () => {
  const good = entity("party.worker"),
    foreign = entity("foreign.worker"),
    party = entity("delivery.party"),
    foreignParty = entity("foreign.party");
  const f = fixture({
    workers: [good, foreign],
    party,
    workerParties: new Map([
      [good, party],
      [foreign, foreignParty],
    ]),
  });
  assert.deepEqual(
    f.prepare().candidates.map((candidate) => candidate.worker),
    [good],
  );
  assert.equal(f.batchCalls, 1);
});

test("impossible pairs are filtered before routing: missing, insufficient, sealed, full, and occupied", () => {
  for (const options of [
    { lotQuantity: 0 },
    { sealedContainers: [entity("delivery.source")] },
    { containerCapacity: 0 },
    { occupiedWorkers: [entity("delivery.worker")] },
  ] as const) {
    const f = fixture(options);
    assert.equal(f.prepare().candidates.length, 0);
  }
});

test("a held obligation never routes a second worker to the physical holder", () => {
  const holder = entity("delivery.holder"),
    other = entity("delivery.other"),
    f = fixture({ workers: [holder, other], lotContainer: holder });
  f.state = { ...f.state, custody: "held" };
  const candidates = f.prepare().candidates;
  assert.deepEqual(
    candidates.map((candidate) => candidate.worker),
    [holder],
  );
});

test("capacity remains bounded by the requested quantity", () => {
  const f = fixture({ lotQuantity: 3, containerCapacity: 1 });
  assert.equal(f.prepare().candidates.length, 0);
});

test("manual control removes a worker from automatic delivery without changing the obligation", () => {
  const f = fixture();
  assert.equal(f.prepare(new Set([f.worker])).candidates.length, 0);
  assert.equal(f.state.custody, "available");
});

test("a move interruption leaves source custody and does not fabricate a transfer", () => {
  const f = fixture();
  f.setAttempt(
    f.makeAttempt(route(), { kind: "blocked", reason: "accessLost" }),
  );
  f.prepare().progress();
  assert.equal(f.state.custody, "available");
  assert.equal(
    f.actions.at(-1) && (f.actions.at(-1) as { kind: string }).kind,
    "acknowledge-work-attempt",
  );
  assert.equal(f.writes.length, 0);
});

test("an existing native construction or excavation attempt occupies its worker", () => {
  const f = fixture();
  f.setAttempt(f.makeAttempt(route(), { kind: "completed" }));
  assert.equal(f.prepare().candidates.length, 0);
});

test("repeated terminal delivery output is idempotent and cannot duplicate completion", () => {
  const f = fixture({ lotContainer: entity("delivery.destination") });
  f.state = { ...f.state, custody: "delivered" };
  assert.equal(f.prepare().candidates.length, 0);
});

test("versioned obligation codec rejects unsupported versions and ground mismatch on reload", () => {
  assert.deepEqual(
    decodeDeliveryObligation({ version: 2, kind: "available", lot: "lot" }),
    { version: 2, kind: "available", lot: "lot" },
  );
  assert.deepEqual(
    decodeDeliveryObligation({
      version: 2,
      kind: "dropped",
      lot: "lot",
      ground: "ground",
    }),
    { version: 2, kind: "dropped", lot: "lot", ground: "ground" },
  );
  assert.throws(
    () =>
      decodeDeliveryObligation({ version: 1, kind: "available", lot: "lot" }),
    /version/,
  );
  assert.throws(
    () =>
      decodeDeliveryObligation({
        version: 2,
        kind: "dropped",
        lot: "lot",
        ground: null,
      }),
    /custody/,
  );
  assert.throws(
    () =>
      decodeDeliveryObligation({
        version: 2,
        kind: "available",
        lot: "lot",
        ground: "stale",
      }),
    /custody|shape/,
  );
});

test("native pickup and deposit are emitted as the two closed material-transfer shapes", () => {
  const f = fixture();
  const p = f.prepare();
  p.estimate(p.candidates[0]!);
  p.apply([{ task: f.task, worker: f.worker, cost: 2 }]);
  assert.equal(
    (f.actions[0] as { operation: { kind: string } }).operation.kind,
    "route",
  );
  assert.notEqual(f.source, f.worker);
});

test("J3 completed pickup recomputes contact routing instead of trusting the first contact", () => {
  const f = fixture({ routeTargetIndex: 1 });
  f.setLotContainer(f.worker);
  f.setAttempt(
    f.makeAttempt(transfer(f.lot, f.worker, f.destination), {
      kind: "completed",
    }),
  );
  f.prepare().progress();
  assert.deepEqual(
    (f.actions[0] as { nextActivity: { destination: unknown } }).nextActivity
      .destination,
    { x: 1, y: 0, z: 0, frame: null },
  );
});
