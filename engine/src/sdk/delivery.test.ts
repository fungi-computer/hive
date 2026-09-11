import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import {
  ExcavationWork,
  Body,
  Container,
  MaterialLot,
  Position,
  Support,
  Surface,
} from "./common";
import { DeliveryControl, DeliveryTask, deliverySystem } from "./delivery";

test("native excavation reserves a worker without dropping its delivery state", () => {
  const worker = entity("worker.digging");
  const source = entity("stock.source");
  const destination = entity("stock.destination");
  const lot = entity("lot.food");
  const active = entity("delivery.active");
  const waiting = entity("delivery.waiting");
  const taskValues = (actor: typeof worker | null, phase: string) => ({
    actor,
    sourceLot: lot,
    source,
    destination,
    material: "food",
    quantity: 1,
    phase,
  });
  const taskRows = [
    row(active, DeliveryTask, taskValues(worker, "to-source")),
    row(waiting, DeliveryTask, taskValues(null, "idle")),
  ];
  const values = new Map<string, readonly unknown[]>([
    [DeliveryTask.id, taskRows],
    [DeliveryControl.id, [row(worker, DeliveryControl, { enabled: true, quantity: 1 })]],
    [ExcavationWork.id, [row(worker, ExcavationWork, {
      x: 0, y: 0, z: 0, expected: 1, replacement: 0, seconds: 0,
    })]],
    [Body.id, [row(worker, Body, { speed: 1 })]],
    [Container.id, [
      row(worker, Container, { capacity: 4 }),
      row(source, Container, { capacity: 4 }),
      row(destination, Container, { capacity: 4 }),
    ]],
    [Position.id, [worker, source, destination].map((id) => row(id, Position, {
      x: 0, y: 0, z: 0, facing: 0,
    }))],
    [MaterialLot.id, [row(lot, MaterialLot, {
      quantity: 2, kind: "food", container: source,
    })]],
    [Support.id, []],
    [Surface.id, []],
  ]);
  const writes: unknown[] = [];
  const actions: unknown[] = [];
  let assignments = 0;
  deliverySystem.run({
    clock: { now: 0, delta: 0.1, tick: 1 },
    outcomes: [],
    impacts: [],
    random: { next: () => 0 },
    query: (spec) => (values.get(spec.components[0].id) ?? []) as never,
    routeCosts: () => { throw new Error("unexpected route query"); },
    terrainMaterials: () => [],
    terrainSurfaces: () => [],
    worldPoses: (ids) => ids.map((id) => ({
      id,
      local: { x: 0, y: 0, z: 0, facing: 0 },
      world: { x: 0, y: 0, z: 0, facing: 0 },
      support: null,
      surface: null,
    })),
    assign: () => {
      assignments++;
      return [];
    },
    write: (...args) => writes.push(args),
    createAuthoredEntity: () => { throw new Error("unexpected authored creation"); },
    removeAuthoredEntity: () => { throw new Error("unexpected authored removal"); },
    action: (request) => actions.push(request),
  });
  assert.equal(assignments, 0);
  assert.equal(writes.length, 0);
  assert.equal(actions.length, 0);
  assert.deepEqual(taskRows[0].get(DeliveryTask), taskValues(worker, "to-source"));
});

test("delivery rejects impossible pairs before matcher cost", () => {
  const cases = [
    { name: "missing lot", lots: [] },
    { name: "insufficient source", lots: [{ quantity: 1, kind: "food", container: "source" }] },
    { name: "full destination", lots: [
      { quantity: 2, kind: "food", container: "source" },
      { quantity: 4, kind: "food", container: "destination" },
    ] },
  ] as const;
  for (const candidate of cases) {
    const slug = candidate.name.replaceAll(" ", ".");
    const worker = entity(`eligibility.worker.${slug}`);
    const source = entity(`eligibility.source.${slug}`);
    const destination = entity(`eligibility.destination.${slug}`);
    const task = entity(`eligibility.task.${slug}`);
    const lotRows = candidate.lots.map((lot, index) => row(
      entity(`eligibility.lot.${slug}.${index}`),
      MaterialLot,
      { ...lot, container: lot.container === "source" ? source : destination },
    ));
    const taskValue = {
      actor: null,
      sourceLot: lotRows[0]?.id ?? entity(`eligibility.missing.${slug}`),
      source,
      destination,
      material: "food",
      quantity: 1,
      phase: "idle",
    };
    const values = new Map<string, readonly unknown[]>([
      [DeliveryTask.id, [row(task, DeliveryTask, taskValue)]],
      [DeliveryControl.id, [row(worker, DeliveryControl, { enabled: true, quantity: 2 })]],
      [Body.id, [row(worker, Body, { speed: 1 })]],
      [Container.id, [
        row(worker, Container, { capacity: 4 }),
        row(source, Container, { capacity: 8 }),
        row(destination, Container, { capacity: 4 }),
      ]],
      [Position.id, [worker, source, destination].map((id) => row(id, Position, {
        x: 0, y: 0, z: 0, facing: 0,
      }))],
      [MaterialLot.id, lotRows],
      [ExcavationWork.id, []],
      [Support.id, []],
      [Surface.id, []],
    ]);
    let assignments = 0;
    let coordinateReads = 0;
    const point = Object.defineProperties({} as { x: number; y: number; z: number; facing: number }, {
      x: { get: () => { coordinateReads++; return 0; } },
      y: { get: () => { coordinateReads++; return 0; } },
      z: { get: () => { coordinateReads++; return 0; } },
      facing: { value: 0 },
    });
    deliverySystem.run({
      clock: { now: 0, delta: 0.1, tick: 1 },
      outcomes: [], impacts: [], random: { next: () => 0 },
      query: (spec) => (values.get(spec.components[0].id) ?? []) as never,
      routeCosts: () => { throw new Error("unexpected route query"); },
    terrainMaterials: () => [],
    terrainSurfaces: () => [],
    worldPoses: (ids) => ids.map((id) => ({
        id, local: point, world: point, support: null, surface: null,
      })),
      assign: () => { assignments++; return []; },
      createAuthoredEntity: () => { throw new Error("unexpected authored creation"); },
      removeAuthoredEntity: () => { throw new Error("unexpected authored removal"); },
      write: () => {}, action: () => {},
    });
    assert.equal(assignments, 0, `${candidate.name} reached native matcher`);
    assert.equal(coordinateReads, 0, `${candidate.name} reached distance cost`);
  }
});

function row<T extends object>(id: ReturnType<typeof entity>, definition: { id: string }, value: T) {
  return {
    id,
    get(requested: { id: string }) {
      assert.equal(requested.id, definition.id);
      return value;
    },
  };
}
