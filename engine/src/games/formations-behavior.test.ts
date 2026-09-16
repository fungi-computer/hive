import test from "node:test";
import assert from "node:assert/strict";
import type { ActionRequest, QueryRow, WriteContext } from "../contracts.js";
import { Position } from "../sdk/common.js";
import { FormationMember, FormationSettings, Morale, formationUnitActor, formations } from "./formations.js";

const unit = (morale: number): QueryRow => ({
  id: "formations.unit.1",
  get(definition) {
    if (definition.id === FormationMember.id) return { group: "formations.group.1", slot: 1 };
    if (definition.id === Morale.id) return { value: morale };
    if (definition.id === Position.id) return { x: 1, y: 0, z: 0, facing: 0 };
    throw new Error(`missing ${definition.id}`);
  },
});

const settings: QueryRow = {
  id: "formations.group.1",
  get(definition) {
    if (definition.id === FormationSettings.id) return { facing: 2, retreatBelow: 25 };
    throw new Error(`missing ${definition.id}`);
  },
};

function run(morale: number) {
  const actions: ActionRequest[] = [];
  const context = {
    clock: { now: 1, delta: 1, tick: 1 }, outcomes: [], impacts: [], random: { next: () => 0.5 },
    query(spec) { return spec.components[0]?.id === FormationSettings.id ? [settings] : [unit(morale)]; },
    action(request) { actions.push(request); },
    write() {}, createAuthoredEntity() {}, removeAuthoredEntity() {},
  } as WriteContext;
  formations.run(context);
  return actions;
}

test("formation actor reuses prepared rules while cannon impacts stay event-owned", () => {
  assert.deepEqual(run(80), []);
  assert.deepEqual(run(10), [{
    kind: "move", entity: "formations.unit.1",
    destination: { x: -4, y: 0, z: -4, frame: null }, facing: 2,
  }]);
  assert.deepEqual(formationUnitActor.behaviors.map(behavior => behavior.id), [formations.id]);
});
