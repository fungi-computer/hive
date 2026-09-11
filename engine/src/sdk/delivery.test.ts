import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import {
  ExcavationWork,
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
    query: (spec) => values.get(spec.components[0].id) as never,
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
    action: (request) => actions.push(request),
  });
  assert.equal(assignments, 0);
  assert.equal(writes.length, 0);
  assert.equal(actions.length, 0);
  assert.deepEqual(taskRows[0].get(DeliveryTask), taskValues(worker, "to-source"));
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
