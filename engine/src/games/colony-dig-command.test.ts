import test from "node:test";
import assert from "node:assert/strict";
import { entity } from "../sdk/authoring";
import {
  Body,
  Container,
  ExcavationWork,
  MaterialLot,
} from "../sdk/common";
import { DeliveryTask } from "../sdk/delivery";
import { ColonyDigOrder, colonyGroundStockPhase } from "./colony-work";
import { GroundStock } from "../sdk/ground-stock";
import { colonyPack } from "./colony";

const worker = entity("colony.worker.1");
const source = entity("colony.pantry");

test("current Colony pack has one DeliveryTask system writer", () => {
  const writers = colonyPack.systems.filter(system => system.writes.some(definition => definition.id === DeliveryTask.id));
  assert.equal(writers.map(system => system.id).join(","), "colony.work");
});

function row(id: ReturnType<typeof entity>, definition: { id: string }, value: object) {
  return { id, get(requested: { id: string }) { assert.equal(requested.id, definition.id); return value; } };
}

type FixtureRow = ReturnType<typeof row>;
type Fixture = {
  readonly lots: readonly FixtureRow[];
  readonly tasks: readonly FixtureRow[];
  readonly work: readonly FixtureRow[];
  readonly orders: readonly FixtureRow[];
};

function context(overrides: Partial<Fixture> = {}) {
  const fixture: Fixture = {
    lots: [],
    tasks: [],
    work: [],
    orders: [],
    ...overrides,
  };
  const values = new Map<string, readonly unknown[]>([
    ["colony.worker", [row(worker, { id: "colony.worker" }, { guest: false })]],
    [Body.id, [row(worker, Body, { speed: 2 })]],
    [Container.id, [
      row(worker, Container, { capacity: 3 }),
      row(source, Container, { capacity: 20 }),
    ]],
    [MaterialLot.id, fixture.lots],
    [DeliveryTask.id, fixture.tasks],
    [ExcavationWork.id, fixture.work],
    [ColonyDigOrder.id, fixture.orders],
  ]);
  return { physicalContacts: () => { throw new Error("unexpected physical contact query"); }, query: (spec: { components: readonly { id: string }[] }) => values.get(spec.components[0].id) as never };
}

test("Colony dig creates an unassigned area order without requiring a worker", () => {
  const result = colonyPack.commands!.dig.invoke(context(), {
    area: { start: [0, 12, 0], end: [0, 12, 0] },
  });
  assert.deepEqual(result.writes, []);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.creates, [{
    id: "colony.dig.0.12.0",
    components: { [ColonyDigOrder.id]: {
      cellX: 0, cellY: 12, cellZ: 0, expected: -1,
      actor: null, phase: "queued", reason: "",
      approachX: 0, approachY: 0, approachZ: 0,
    } },
  }]);
});

test("Colony ground stock schedules one ordinary pantry delivery and preserves existing claims", () => {
  const pile = entity("hive.lot.17");
  const source = entity("hive.ground-stock.17");
  const created: unknown[] = [];
  const sourceRow = { id: source, get() { return {}; } };
  const pileRow = { id: pile, get(definition: { id: string }) {
    if (definition.id === MaterialLot.id) return { quantity: 3, kind: "soil-spoil", container: source };
    return {};
  }};
  const context = {
    query(spec: { components: readonly { id: string }[] }) {
      if (spec.components[0].id === GroundStock.id) return [sourceRow];
      if (spec.components[0].id === MaterialLot.id) return [pileRow];
      if (spec.components[0].id === DeliveryTask.id) return [];
      throw new Error(`unexpected query ${spec.components[0].id}`);
    },
    createAuthoredEntity(record: unknown) { created.push(record); },
  };
  colonyGroundStockPhase(context as never);
  assert.deepEqual(created, [{ id: `${pile}.delivery`, components: { [DeliveryTask.id]: {
    actor: null, sourceLot: pile, source, destination: "colony.pantry",
    material: "soil-spoil", quantity: 3, phase: "idle",
  }}}]);
});

test("Colony dig rejects the superseded worker-target input and accepts a designation while workers are busy", () => {
  assert.throws(() => colonyPack.commands!.dig.invoke(context(), {
    entities: [worker], target: { cell: [0, 12, 0], material: 0 },
  }));
  const task = row(entity("colony.delivery.1"), DeliveryTask, {
    actor: worker, sourceLot: entity("colony.food.1"), source,
    destination: entity("colony.guest.1"), material: "bread", quantity: 1, phase: "idle",
  });
  assert.doesNotThrow(() => colonyPack.commands!.dig.invoke(context({ tasks: [task] }), {
    area: { start: [0, 12, 0], end: [1, 12, 0] },
  }));
});

test("Colony cancelDig removes designated orders and cancels only their active workers", () => {
  const work = row(worker, ExcavationWork, {
    x: 0, y: 12, z: 0, expected: 1, replacement: 0, seconds: 0,
  });
  const order = row(entity("colony.dig.0.12.0"), ColonyDigOrder, {
    cellX: 0, cellY: 12, cellZ: 0, expected: 1,
    actor: worker, phase: "working", reason: "",
    approachX: 0, approachY: 0, approachZ: 0,
  });
  const result = colonyPack.commands!.cancelDig.invoke(context({ work: [work], orders: [order] }), { entities: [worker] });
  assert.deepEqual(result, {
    actions: [{ kind: "cancel-work", entity: worker }],
    writes: [],
    removes: [order.id],
  });
  const activeDelivery = row(entity("colony.delivery.1"), DeliveryTask, {
    actor: worker, sourceLot: entity("colony.food.1"), source,
    destination: entity("colony.guest.1"), material: "bread", quantity: 1, phase: "idle",
  });
  assert.deepEqual(
    colonyPack.commands!.cancelDig.invoke(context({ work: [work], orders: [order], tasks: [activeDelivery] }), { entities: [worker] }),
    { actions: [{ kind: "cancel-work", entity: worker }], writes: [], removes: [order.id] },
  );
  assert.throws(() => colonyPack.commands!.cancelDig.invoke(context(), { entities: [worker] }), /no matching excavation order/);
});

test("Colony deposit emits stable whole-lot transfers for unreserved cargo", () => {
  const first = row(entity("colony.spoil.z"), MaterialLot, {
    quantity: 2, kind: "stone-spoil", container: worker,
  });
  const second = row(entity("colony.spoil.a"), MaterialLot, {
    quantity: 1, kind: "soil-spoil", container: worker,
  });
  const result = colonyPack.commands!.deposit.invoke(context({ lots: [first, second] }), { entities: [worker] });
  assert.deepEqual(result, {
    writes: [],
    actions: [
      { kind: "transfer", lot: "colony.spoil.a", from: worker, to: source, quantity: 1 },
      { kind: "transfer", lot: "colony.spoil.z", from: worker, to: source, quantity: 2 },
    ],
  });
});

test("Colony deposit rejects reserved cargo and aggregate pantry overflow", () => {
  const reserved = row(entity("colony.spoil.reserved"), MaterialLot, {
    quantity: 1, kind: "soil-spoil", container: worker,
  });
  const claim = row(entity("colony.delivery.claimed"), DeliveryTask, {
    actor: null, sourceLot: reserved.id, source: worker,
    destination: entity("colony.guest.1"), material: "soil-spoil", quantity: 1, phase: "idle",
  });
  assert.throws(
    () => colonyPack.commands!.deposit.invoke(context({ lots: [reserved], tasks: [claim] }), { entities: [worker] }),
    /reserved/,
  );
  const pantryStock = row(entity("colony.pantry.stock"), MaterialLot, {
    quantity: 19, kind: "bread", container: source,
  });
  const carried = row(entity("colony.spoil.overflow"), MaterialLot, {
    quantity: 2, kind: "soil-spoil", container: worker,
  });
  assert.throws(
    () => colonyPack.commands!.deposit.invoke(context({ lots: [pantryStock, carried] }), { entities: [worker] }),
    /capacity/,
  );
});
