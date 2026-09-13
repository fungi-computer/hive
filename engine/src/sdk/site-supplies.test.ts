import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { Container, MaterialLot } from "./common";
import { SealedContainer } from "./construction";
import { DeliveryTask } from "./delivery";
import { planSiteSupplies } from "./site-supplies";
import type { EntityId, WriteContext } from "../contracts";

type Row = { id: EntityId; values: Map<string, unknown> };
function row(id: EntityId, definition: { id: string }, value: unknown): Row {
  return { id, values: new Map([[definition.id, value]]) };
}
function context(rows: Row[]) {
  const created: {
    id: EntityId;
    components: Record<string, Record<string, unknown>>;
  }[] = [];
  const removed: EntityId[] = [];
  const fake = {
    clock: { now: 0, delta: 0, tick: 0 },
    outcomes: [],
    impacts: [],
    random: { next: () => 0 },
    query: (spec: { components: readonly { id: string }[] }) =>
      rows
        .filter((candidate) => candidate.values.has(spec.components[0].id))
        .map((candidate) => ({
          id: candidate.id,
          get: (definition: { id: string }) =>
            candidate.values.get(definition.id),
        })),
    workMaterialFacts: () => ({
      version: 1 as const,
      containers: rows.filter((candidate) => candidate.values.has(Container.id)).map((candidate) => ({
        id: candidate.id,
        capacity: (candidate.values.get(Container.id) as { capacity: number }).capacity,
        sealed: rows.some((sealed) => sealed.id === candidate.id && sealed.values.has(SealedContainer.id)),
      })),
      lots: rows.filter((candidate) => candidate.values.has(MaterialLot.id)).map((candidate) => ({
        id: candidate.id,
        ...(candidate.values.get(MaterialLot.id) as { kind: string; quantity: number; container: EntityId }),
      })),
    }),
    worldPoses: () => [],
    routeCosts: () => [],
    physicalContacts: () => {
      throw new Error("unexpected physical contact query in this fixture");
    },
    terrainMaterials: () => [],
    terrainSurfaces: () => [],
    assign: () => [],
    write: () => {},
    action: () => {},
    createAuthoredEntity: (record: {
      id: EntityId;
      components: Record<string, Record<string, unknown>>;
    }) => {
      created.push(record);
      rows.push(
        row(record.id, DeliveryTask, record.components[DeliveryTask.id]),
      );
    },
    removeAuthoredEntity: (id: EntityId) => {
      removed.push(id);
      const index = rows.findIndex((candidate) => candidate.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  } as unknown as WriteContext;
  return { fake, created, removed };
}
function baseRows(
  source: EntityId,
  destination: EntityId,
  lots: readonly {
    id: EntityId;
    quantity: number;
    kind?: string;
    container?: EntityId;
  }[],
  tasks: readonly { id: EntityId; value: Record<string, unknown> }[] = [],
  sealed: readonly EntityId[] = [],
) {
  return [
    row(source, Container, { capacity: 20 }),
    row(destination, Container, { capacity: 4 }),
    ...lots.map((lot) =>
      row(lot.id, MaterialLot, {
        quantity: lot.quantity,
        kind: lot.kind ?? "wood",
        container: lot.container ?? source,
      }),
    ),
    ...tasks.map((task) => row(task.id, DeliveryTask, task.value)),
    ...sealed.map((id) => row(id, SealedContainer, {})),
  ];
}
const requirement = (destination: EntityId, quantity = 2) => ({
  destination,
  material: "wood",
  quantity,
});

test("plans one bounded ordinary delivery, subtracts partial stock, and does not repeat while outstanding", () => {
  const source = entity("supply.source");
  const destination = entity("supply.destination");
  const rows = baseRows(source, destination, [
    { id: entity("lot.a"), quantity: 4 },
    { id: entity("lot.destination"), quantity: 1, container: destination },
  ]);
  const state = context(rows);
  const first = planSiteSupplies(state.fake, {
    requirements: [requirement(destination)],
    sourceContainers: [source],
  });
  assert.equal(first.length, 1);
  assert.match(first[0], /site-supply\.18:supply\.destination4:wood5:lot\.a/);
  assert.equal(state.created[0].components[DeliveryTask.id].quantity, 1);
  assert.deepEqual(
    planSiteSupplies(state.fake, {
      requirements: [requirement(destination)],
      sourceContainers: [source],
    }),
    [],
  );
});

test("rejects full, sealed, and actively claimed supply endpoints before creating a task", () => {
  const source = entity("supply.source.eligibility");
  const destination = entity("supply.destination.eligibility");
  const claimed = entity("supply.claimed");
  const cases = [
    baseRows(source, destination, [
      { id: entity("lot.full"), quantity: 4 },
      { id: entity("lot.dest"), quantity: 4, container: destination },
    ]),
    baseRows(
      source,
      destination,
      [{ id: entity("lot.sealed-source"), quantity: 4 }],
      [],
      [source],
    ),
    baseRows(
      source,
      destination,
      [{ id: entity("lot.sealed-destination"), quantity: 4 }],
      [],
      [destination],
    ),
    baseRows(
      source,
      destination,
      [{ id: entity("lot.claimed"), quantity: 1 }],
      [
        {
          id: entity("foreign.delivery"),
          value: {
            actor: entity("worker"),
            sourceLot: entity("lot.claimed"),
            source,
            destination: claimed,
            material: "wood",
            quantity: 1,
            phase: "carrying",
          },
        },
      ],
    ),
  ];
  for (const rows of cases) {
    const state = context(rows);
    assert.deepEqual(
      planSiteSupplies(state.fake, {
        requirements: [requirement(destination)],
        sourceContainers: [source],
      }),
      [],
    );
    assert.equal(state.created.length, 0);
  }
});

test("cleans only its deposited completed task, then selects the next remaining lot", () => {
  const source = entity("supply.source.next");
  const destination = entity("supply.destination.next");
  const first = entity("lot.first");
  const second = entity("lot.second");
  const rows = baseRows(source, destination, [
    { id: first, quantity: 1 },
    { id: second, quantity: 1 },
  ]);
  const state = context(rows);
  planSiteSupplies(state.fake, {
    requirements: [requirement(destination, 1)],
    sourceContainers: [source],
  });
  const taskId = entity(
    "site-supply.23:supply.destination.next4:wood9:lot.first",
  );
  const taskRow = rows.find((candidate) => candidate.id === taskId)!;
  const task = taskRow.values.get(DeliveryTask.id) as Record<string, unknown>;
  task.phase = "complete";
  const firstLot = rows.find((candidate) => candidate.id === first)!;
  (firstLot.values.get(MaterialLot.id) as Record<string, unknown>).container =
    destination;
  assert.deepEqual(
    planSiteSupplies(state.fake, {
      requirements: [requirement(destination, 2)],
      sourceContainers: [source],
    }),
    [entity("site-supply.23:supply.destination.next4:wood10:lot.second")],
  );
  assert.deepEqual(state.removed, [taskId]);
  assert.equal(
    state.created.at(-1)?.components[DeliveryTask.id].sourceLot,
    second,
  );
});

test("preserves a completed task owned by another delivery planner", () => {
  const source = entity("supply.source.foreign");
  const destination = entity("supply.destination.foreign");
  const lot = entity("lot.foreign");
  const foreignTask = entity("stockpile.delivery.foreign");
  const rows = baseRows(
    source,
    destination,
    [{ id: lot, quantity: 1, container: destination }],
    [
      {
        id: foreignTask,
        value: {
          actor: null,
          sourceLot: lot,
          source,
          destination,
          material: "wood",
          quantity: 1,
          phase: "complete",
        },
      },
    ],
  );
  const state = context(rows);
  planSiteSupplies(state.fake, {
    requirements: [requirement(destination)],
    sourceContainers: [source],
  });
  assert.deepEqual(state.removed, []);
  assert(rows.some((row) => row.id === foreignTask));
});

test("does not partially mutate when a later source produces an overlong task identity", () => {
  const source = entity("supply.source.atomic");
  const destination = entity("supply.destination.atomic");
  const rows = baseRows(source, destination, [
    { id: entity("lot.a"), quantity: 1 },
    { id: entity("z".repeat(120)), quantity: 1 },
  ]);
  const state = context(rows);
  assert.throws(
    () =>
      planSiteSupplies(state.fake, {
        requirements: [requirement(destination, 2)],
        sourceContainers: [source],
        batchQuantity: 1,
      }),
    /task identity exceeds bound/,
  );
  assert.deepEqual(state.created, []);
  assert.deepEqual(state.removed, []);
});

test("plans independent haul legs for one demand from multiple lots without overfilling", () => {
  const source = entity("supply.source.parallel");
  const destination = entity("supply.destination.parallel");
  const rows = baseRows(source, destination, [
    { id: entity("lot.a"), quantity: 1 },
    { id: entity("lot.b"), quantity: 1 },
    { id: entity("lot.c"), quantity: 1 },
  ]);
  const state = context(rows);
  const created = planSiteSupplies(state.fake, {
    requirements: [requirement(destination, 3)],
    sourceContainers: [source],
    batchQuantity: 1,
  });
  assert.equal(created.length, 3);
  assert.deepEqual(
    created
      .map((id) =>
        rows
          .find((candidate) => candidate.id === id)!
          .values.get(DeliveryTask.id),
      )
      .map((task) => (task as { sourceLot: EntityId }).sourceLot),
    [entity("lot.a"), entity("lot.b"), entity("lot.c")],
  );
  assert.equal(new Set(created).size, 3);
  assert.equal(
    planSiteSupplies(state.fake, {
      requirements: [requirement(destination, 3)],
      sourceContainers: [source],
      batchQuantity: 1,
    }).length,
    0,
  );
});

test("validates duplicate requirements and bounded injective task identities before mutation", () => {
  const source = entity("supply.source.validation");
  const destination = entity("supply.destination.validation");
  const state = context(
    baseRows(source, destination, [
      { id: entity("lot.validation"), quantity: 2 },
    ]),
  );
  const longDestination = entity("d".repeat(120));
  const longState = context([
    row(source, Container, { capacity: 20 }),
    row(longDestination, Container, { capacity: 4 }),
    row(entity("lot.validation.long"), MaterialLot, {
      quantity: 1,
      kind: "wood",
      container: source,
    }),
  ]);
  assert.throws(
    () =>
      planSiteSupplies(longState.fake, {
        requirements: [requirement(destination), requirement(destination)],
        sourceContainers: [source],
      }),
    /duplicate site supply requirement/,
  );
  assert.equal(state.created.length, 0);
  assert.throws(
    () =>
      planSiteSupplies(longState.fake, {
        requirements: [
          { destination: longDestination, material: "wood", quantity: 1 },
        ],
        sourceContainers: [source],
      }),
    /task identity exceeds bound/,
  );
  assert.equal(longState.created.length, 0);
});
