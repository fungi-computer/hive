import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkedAction } from "./actions";
import { isReservedComponent } from "../contracts";
import { entity } from "../sdk/authoring";
import { cancelWork, ExcavationOrder, ExcavationWork, LotWater, encodeDefinition } from "../sdk/common";

test("excavation uses the shared WorkAttempt boundary", () => {
  const request = { kind: "begin-work-attempt" as const, task: entity("dig.task"), worker: entity("worker.one"), party: entity("party.one"), operation: { kind: "route" as const, destination: { x: -4, y: -12, z: 8, frame: null } } };
  assert.deepEqual(checkedAction(request), request);
  assert.deepEqual(checkedAction(cancelWork(entity("worker.one"))), { kind: "cancel-work", entity: "worker.one" });
});

test("native work and carried water stay outside authored component definitions", () => {
  assert.equal(isReservedComponent(ExcavationWork.id), true);
  assert.equal(isReservedComponent(ExcavationOrder.id), true);
  assert.equal(isReservedComponent(LotWater.id), true);
  const definition = JSON.parse(new TextDecoder().decode(encodeDefinition("test", [ExcavationOrder, ExcavationWork, LotWater], [], [])));
  assert.deepEqual(definition.components, []);
});
