import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { DeliveryTask, isDeliveryCustody } from "./delivery";

const task = {
  version: 2,
  party: entity("party.a"),
  sourceLot: entity("lot.wood"),
  source: entity("stock.source"),
  destination: entity("stock.destination"),
  material: "wood",
  quantity: 2,
  custody: "available" as const,
};

test("delivery obligation is a versioned custody union", () => {
  assert.equal(DeliveryTask.version, 2);
  assert.equal(DeliveryTask.validate(task), true);
  assert.equal(DeliveryTask.validate({ ...task, custody: "held" }), true);
  assert.equal(isDeliveryCustody(task.custody), true);
  assert.equal(isDeliveryCustody("carrying"), false);
});

test("delivery obligation has no labor or phase authority", () => {
  assert.deepEqual(Object.keys(task).sort(), ["custody", "destination", "material", "party", "quantity", "source", "sourceLot", "version"]);
  assert.equal("actor" in task, false);
  assert.equal("phase" in task, false);
});
