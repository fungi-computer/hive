import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deliveryPresentationFacts } from "./delivery-presentation";
import { DeliveryTask } from "../sdk/delivery";
import { MaterialLot } from "../sdk/common";

const task = (id: string, value: object) => ({
  id,
  get(component: { id: string }) {
    if (component.id === DeliveryTask.id) return value;
    throw new Error("unexpected component");
  },
});
const lot = (id: string, value: object) => ({
  id,
  get(component: { id: string }) {
    if (component.id === MaterialLot.id) return value;
    throw new Error("unexpected component");
  },
});

test("delivery presentation reports committed custody and activity", () => {
  const facts = deliveryPresentationFacts({
    query(spec) {
      if (spec.components[0] === DeliveryTask)
        return [
          task("task.b", {
            actor: "worker.2",
            sourceLot: "lot.b",
            source: "pantry",
            destination: "guest",
            material: "bread",
            quantity: 1,
            phase: "carrying",
          }),
          task("task.a", {
            actor: null,
            sourceLot: "lot.a",
            source: "chest",
            destination: "hold",
            material: "wood",
            quantity: 1,
            phase: "idle",
          }),
        ] as never;
      return [
        lot("lot.b", { quantity: 1, kind: "bread", container: "worker.2" }),
        lot("lot.a", { quantity: 3, kind: "wood", container: "chest" }),
      ] as never;
    },
  });
  assert.deepEqual(facts, [
    { id: "delivery-1-phase", label: "Delivery 1 activity", value: "idle" },
    { id: "delivery-1-material", label: "Delivery 1 material", value: "wood" },
    { id: "delivery-1-quantity", label: "Delivery 1 carried quantity", value: 3 },
    { id: "delivery-1-custody", label: "Delivery 1 custody", value: "chest" },
    { id: "delivery-2-phase", label: "Delivery 2 activity", value: "carrying" },
    { id: "delivery-2-material", label: "Delivery 2 material", value: "bread" },
    { id: "delivery-2-quantity", label: "Delivery 2 carried quantity", value: 1 },
    { id: "delivery-2-custody", label: "Delivery 2 custody", value: "worker.2" },
  ]);
});

test("delivery presentation does not invent custody for a missing lot", () => {
  const facts = deliveryPresentationFacts({
    query() {
      return [
        task("task.a", {
          actor: "worker.1",
          sourceLot: "gone",
          source: "pantry",
          destination: "guest",
          material: "bread",
          quantity: 1,
          phase: "to-source",
        }),
      ] as never;
    },
  });
  assert.equal(facts.at(-1)?.value, "missing");
  assert.equal(facts.at(-2)?.value, 0);
});
