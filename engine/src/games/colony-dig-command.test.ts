import test from "node:test";
import assert from "node:assert/strict";
import { entity } from "../sdk/authoring";
import {
  Body,
  Container,
  ExcavationWork,
  MaterialLot,
  SupplyAllocation,
} from "../sdk/common";
import { ExcavationOrder } from "../sdk/common";
import { colonyPack } from "./colony";
import { OwnedByParty, PartyMember } from "../sdk/party";
import type { WorkAttempt } from "../contracts";

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
  readonly orders: readonly FixtureRow[];
  readonly attempts: readonly WorkAttempt[];
};

function context(overrides: Partial<Fixture> = {}) {
  const fixture: Fixture = {
    lots: [],
    tasks: [],
    work: [],
    orders: [],
    attempts: [],
    ...overrides,
  };
  const workerRow = {
    id: worker,
    get(definition: { id: string }) {
      if (definition.id === "colony.worker") return { guest: false };
      if (definition.id === PartyMember.id) return { party: entity("host") };
      if (definition.id === Container.id) return { capacity: 3 };
      throw new Error(`unexpected worker component ${definition.id}`);
    },
  };
  const pantryRow = {
    id: source,
    get(definition: { id: string }) {
      if (definition.id === Container.id) return { capacity: 20 };
      if (definition.id === OwnedByParty.id) return { party: entity("host") };
      throw new Error(`unexpected pantry component ${definition.id}`);
    },
  };
  const values = new Map<string, readonly unknown[]>([
    ["colony.worker", [workerRow]],
    [PartyMember.id, [workerRow]],
    [OwnedByParty.id, [pantryRow]],
    [Body.id, [row(worker, Body, { speed: 2 })]],
    [Container.id, [workerRow, pantryRow]],
    [MaterialLot.id, fixture.lots],
    [SupplyAllocation.id, fixture.tasks],
    [ExcavationWork.id, fixture.work],
    [ExcavationOrder.id, fixture.orders],
  ]);
  return {
    scope: { kind: "player" as const, player: "tester" },
    physicalContacts: () => {
      throw new Error("unexpected physical contact query");
    },
    terrainMaterials: () => [],
    terrainSurfaces: () => [],
    workAttempts: (tasks: readonly ReturnType<typeof entity>[]) =>
      fixture.attempts.filter((attempt) => tasks.includes(attempt.key.task)),
    query: (spec: { components: readonly { id: string }[] }) => {
      const ids = new Set(spec.components.map((component) => component.id));
      if (ids.has("colony.worker") && ids.has(PartyMember.id))
        return [workerRow] as never;
      if (ids.has(Container.id) && ids.has(OwnedByParty.id))
        return [pantryRow] as never;
      return (values.get(spec.components[0].id) ?? []) as never;
    },
  };
}

test("Colony dig submits one bounded native designation without requiring a worker", () => {
  const result = colonyPack.commands!.dig.invoke(context(), {
    area: { start: [0, 12, 0], end: [0, 12, 0] },
  });
  assert.deepEqual(result.writes, []);
  assert.deepEqual(result.creates, undefined);
  assert.deepEqual(result.actions, [{ kind: "plan-excavation", prefix: "colony.dig", start: [0, 12, 0], end: [0, 12, 0] }]);
});

test("Colony dig rejects the superseded worker-target input and accepts a designation while workers are busy", () => {
  assert.throws(() => colonyPack.commands!.dig.invoke(context(), {
    entities: [worker], target: { cell: [0, 12, 0], material: 0 },
  }));
  assert.doesNotThrow(() => colonyPack.commands!.dig.invoke(context(), {
    area: { start: [0, 12, 0], end: [1, 12, 0] },
  }));
});

test("Colony cancelDig submits native cancellation for the exact active worker", () => {
  const work = row(worker, ExcavationWork, {
    x: 0, y: 12, z: 0, expected: 1, replacement: 0, seconds: 0,
  });
  const order = row(entity("colony.dig.0.12.0"), ExcavationOrder, {
    cellX: 0, cellY: 12, cellZ: 0, expected: 1,
    status: "queued", reason: "",
  });
  const attempt: WorkAttempt = { key: { task: order.id, generation: 1 }, worker, execution: { pool: entity("host"), initiatingPlayer: null, policyId: "excavation" }, phase: { kind: "executing", operation: { attempt: { task: order.id, generation: 1 }, sequence: 1 }, activity: { kind: "excavation", cell: [0, 12, 0], expectedMaterial: 1, replacementMaterial: 0 } } };
  const result = colonyPack.commands!.cancelDig.invoke(context({ work: [work], orders: [order], attempts: [attempt] }), { entities: [worker] });
  assert.deepEqual(result, { actions: [{ kind: "cancel-excavation", area: null, workers: [worker] }], writes: [] });
  assert.deepEqual(colonyPack.commands!.cancelDig.invoke(context({ work: [work], orders: [order] }), { area: { start: [0, 12, 0], end: [0, 12, 0] } }), { actions: [{ kind: "cancel-excavation", area: { start: [0, 12, 0], end: [0, 12, 0] }, workers: [] }], writes: [] });
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
  const claim = row(entity("colony.delivery.claimed"), SupplyAllocation, {
    requirementOwner: entity("colony.delivery.claimed"), requirementRole: "soil-spoil", requirementGeneration: 1,
    party: entity("host"), portion: reserved.id, destination: entity("colony.guest.1"), material: "soil-spoil", quantity: 1, state: "reserved",
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
