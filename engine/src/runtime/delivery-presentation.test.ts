import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RenderFact } from "../contracts";
import { MaterialLot } from "../sdk/common";
import { DeliveryTask } from "../sdk/delivery";
import { decorateDeliveryFacts } from "./delivery-presentation";

const row = (id: string, component: object, value: object) => ({
  id,
  get(definition: { id: string }) {
    if (definition.id === (component as { id: string }).id) return value;
    throw new Error("unexpected component");
  },
});

test("decorates only visible owners with authoritative lot custody and actor activity", () => {
  const facts: RenderFact[] = [
    { id: "pantry", visual: "crate" },
    { id: "worker.1", visual: "goblin" },
    { id: "guest", visual: "goblin" },
  ];
  const lotRows = [
    row("lot.1", MaterialLot, { quantity: 2, kind: "bread", container: "pantry" }),
    row("lot.2", MaterialLot, { quantity: 1, kind: "bread", container: "worker.1" }),
    row("lot.3", MaterialLot, { quantity: 1, kind: "bread", container: "guest" }),
  ];
  const taskRows = [
    row("task.1", DeliveryTask, {
      actor: "worker.1", sourceLot: "lot.2", source: "pantry", destination: "guest",
      material: "bread", quantity: 1, phase: "to-destination",
    }),
  ];
  const result = decorateDeliveryFacts(facts, {
    query(spec) {
      return (spec.components[0] === MaterialLot ? lotRows : taskRows) as never;
    },
  });
  assert.deepEqual(result[0], facts[0], "source stock is not presented as carried");
  assert.deepEqual(result[1].inventory, { items: [{ kind: "bread", quantity: 1 }] });
  assert.deepEqual(result[1].activity, {
    kind: "delivery", phase: "to-destination", material: "bread", quantity: 1,
  });
  assert.equal(result[2].inventory, undefined);
  assert.equal(result[2].activity, undefined);
});

test("packs without delivery or lots leave render facts unchanged", () => {
  const facts: RenderFact[] = [{ id: "actor", visual: "worker" }];
  assert.deepEqual(
    decorateDeliveryFacts(facts, { query: () => [] as never }),
    facts,
  );
});

test("inventory aggregates kinds and bounds item entries without failing the frame", () => {
  const facts: RenderFact[] = [{ id: "worker", visual: "worker" }];
  const lots = Array.from({ length: 9 }, (_, index) =>
    row(`lot.${index}`, MaterialLot, { quantity: 1, kind: `kind.${index}`, container: "worker" }),
  );
  const result = decorateDeliveryFacts(facts, {
    query: (spec) =>
      (spec.components[0] === MaterialLot ? lots : []) as never,
  });
  assert.equal(result[0].inventory?.items.length, 8);
  assert.equal(result[0].inventory?.overflow, true);
});
