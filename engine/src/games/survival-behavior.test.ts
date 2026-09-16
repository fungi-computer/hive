import test from "node:test";
import assert from "node:assert/strict";
import type { QueryRow, WriteContext, WriteIntent } from "../contracts.js";
import { Body, MaterialLot, Position } from "../sdk/common.js";
import { Condition, Fatigue, MealRule, Survivor, fatigue, survival, survivorActor } from "./survival.js";

const values = new Map([
  [Survivor.id, { controlled: true }],
  [Condition.id, { hunger: 40, wellbeing: 100 }],
  [MealRule.id, { recovery: 25 }],
  [Position.id, { x: 1, y: 0, z: 0, facing: 0 }],
  [Body.id, { speed: 2 }],
  [Fatigue.id, { value: 0, lastX: 0, lastY: 0, lastZ: 0 }],
]);

const subject: QueryRow = {
  id: "survival.survivor.1",
  get(definition) {
    const value = values.get(definition.id);
    if (!value) throw new Error(`missing ${definition.id}`);
    return value;
  },
};

test("survivor actor composes hunger and fatigue through prepared behaviors", () => {
  const writes: WriteIntent[] = [];
  const context = {
    clock: { now: 1, delta: 1, tick: 1 },
    outcomes: [], impacts: [], random: { next: () => 0.5 },
    query(spec) {
      return spec.components.some(component => component.id === MaterialLot.id) ? [] : [subject];
    },
    write(definition, entity, value) { writes.push({ component: definition.id, entity, value }); },
    action() {}, createAuthoredEntity() {}, removeAuthoredEntity() {},
  } as WriteContext;

  survival.run(context);
  fatigue.run(context);

  assert.deepEqual(writes, [
    { component: Condition.id, entity: subject.id, value: { hunger: 40.5, wellbeing: 100 } },
    { component: Fatigue.id, entity: subject.id, value: { value: 5, lastX: 1, lastY: 0, lastZ: 0 } },
  ]);
  assert.deepEqual(survivorActor.behaviors.map(behavior => behavior.id), [survival.id, fatigue.id]);
});
