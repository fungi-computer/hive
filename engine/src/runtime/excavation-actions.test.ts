import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkedAction } from "./actions";
import { isReservedComponent } from "../contracts";
import { entity } from "../sdk/authoring";
import { excavate, cancelWork, ExcavationWork, LotWater, encodeDefinition } from "../sdk/common";

test("excavation authoring requests intent without work or output credit", () => {
  const request = excavate(entity("worker.one"), { x: -4, y: -12, z: 8 }, 2, 0);
  assert.deepEqual(checkedAction(request), request);
  assert.deepEqual(checkedAction(cancelWork(entity("worker.one"))), { kind: "cancel-work", entity: "worker.one" });
  for (const invalid of [
    {...request, seconds: 100}, {...request, quantity: 100},
    {...request, x: 0.5}, {...request, expected: -1},
    {...request, replacement: 65536}, {...request, replacement: 2},
  ]) assert.throws(() => checkedAction(invalid), /invalid action/);
});

test("native work and carried water stay outside authored component definitions", () => {
  assert.equal(isReservedComponent(ExcavationWork.id), true);
  assert.equal(isReservedComponent(LotWater.id), true);
  const definition = JSON.parse(new TextDecoder().decode(encodeDefinition("test", [ExcavationWork, LotWater])));
  assert.deepEqual(definition.components, []);
});
