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
import { colonyPack } from "./colony";

const worker = entity("colony.worker.1");
const source = entity("colony.pantry");

function row(id: ReturnType<typeof entity>, definition: { id: string }, value: object) {
  return { id, get(requested: { id: string }) { assert.equal(requested.id, definition.id); return value; } };
}

type FixtureRow = ReturnType<typeof row>;
type Fixture = {
  readonly lots: readonly FixtureRow[];
  readonly tasks: readonly FixtureRow[];
  readonly work: readonly FixtureRow[];
};

function context(overrides: Partial<Fixture> = {}) {
  const fixture: Fixture = {
    lots: [],
    tasks: [],
    work: [],
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
  ]);
  return { query: (spec: { components: readonly { id: string }[] }) => values.get(spec.components[0].id) as never };
}

test("Colony dig emits one native excavation request for an admitted target", () => {
  const result = colonyPack.commands!.dig.run(context(), {
    entities: [worker],
    target: { cell: [0, 12, 0], material: 1 },
  });
  assert.deepEqual(result.writes, []);
  assert.deepEqual(result.actions, [{
    kind: "excavate",
    entity: worker,
    x: 0,
    y: 12,
    z: 0,
    expected: 1,
    replacement: 0,
  }]);
});

test("Colony dig rejects invalid material, active delivery, and full spoil cargo", () => {
  assert.throws(() => colonyPack.commands!.dig.run(context(), {
    entities: [worker], target: { cell: [0, 12, 0], material: 0 },
  }), /not excavatable/);
  const task = row(entity("colony.delivery.1"), DeliveryTask, {
    actor: worker, sourceLot: entity("colony.food.1"), source,
    destination: entity("colony.guest.1"), material: "bread", quantity: 1, phase: "idle",
  });
  assert.throws(() => colonyPack.commands!.dig.run(context({ tasks: [task] }), {
    entities: [worker], target: { cell: [0, 12, 0], material: 1 },
  }), /carrying out a delivery/);
  const lot = row(entity("colony.spoil.1"), MaterialLot, {
    quantity: 3, kind: "soil-spoil", container: worker,
  });
  assert.throws(() => colonyPack.commands!.dig.run(context({ lots: [lot] }), {
    entities: [worker], target: { cell: [0, 12, 0], material: 1 },
  }), /capacity/);
});

test("Colony cancelDig emits native cancel-work only for active excavation", () => {
  const work = row(worker, ExcavationWork, {
    x: 0, y: 12, z: 0, expected: 1, replacement: 0, seconds: 0,
  });
  const result = colonyPack.commands!.cancelDig.run(context({ work: [work] }), { entities: [worker] });
  assert.deepEqual(result, {
    actions: [{ kind: "cancel-work", entity: worker }],
    writes: [],
  });
  const activeDelivery = row(entity("colony.delivery.1"), DeliveryTask, {
    actor: worker, sourceLot: entity("colony.food.1"), source,
    destination: entity("colony.guest.1"), material: "bread", quantity: 1, phase: "idle",
  });
  assert.deepEqual(
    colonyPack.commands!.cancelDig.run(context({ work: [work], tasks: [activeDelivery] }), { entities: [worker] }),
    { actions: [{ kind: "cancel-work", entity: worker }], writes: [] },
  );
  assert.throws(() => colonyPack.commands!.cancelDig.run(context(), { entities: [worker] }), /no excavation work/);
});

test("Colony deposit emits stable whole-lot transfers for unreserved cargo", () => {
  const first = row(entity("colony.spoil.z"), MaterialLot, {
    quantity: 2, kind: "stone-spoil", container: worker,
  });
  const second = row(entity("colony.spoil.a"), MaterialLot, {
    quantity: 1, kind: "soil-spoil", container: worker,
  });
  const result = colonyPack.commands!.deposit.run(context({ lots: [first, second] }), { entities: [worker] });
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
    () => colonyPack.commands!.deposit.run(context({ lots: [reserved], tasks: [claim] }), { entities: [worker] }),
    /reserved/,
  );
  const pantryStock = row(entity("colony.pantry.stock"), MaterialLot, {
    quantity: 19, kind: "bread", container: source,
  });
  const carried = row(entity("colony.spoil.overflow"), MaterialLot, {
    quantity: 2, kind: "soil-spoil", container: worker,
  });
  assert.throws(
    () => colonyPack.commands!.deposit.run(context({ lots: [pantryStock, carried] }), { entities: [worker] }),
    /capacity/,
  );
});
