import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "../sdk/authoring";
import type { RenderFact } from "../contracts";
import { Container, MaterialLot } from "../sdk/common";
import { decorateInventoryFacts } from "./inventory-presentation";

const row = (id: string, value: object) => ({
  id,
  get(definition: { id: string }) {
    if (definition.id === MaterialLot.id) return value;
    if (definition.id === Container.id) {
      if (!("capacity" in value)) throw new Error("unexpected component");
      return value;
    }
    throw new Error("unexpected component");
  },
});

test("projects visible material custody without inventing transfer state", () => {
  const facts: RenderFact[] = [
    { id: entity("pantry"), visual: "crate" },
    { id: entity("worker.1"), visual: "goblin" },
    { id: entity("guest"), visual: "goblin" },
  ];
  const result = decorateInventoryFacts(facts, {
    query: () => [
      row("lot.source", { quantity: 2, kind: "bread", container: "pantry" }),
      row("lot.carried", { quantity: 1, kind: "bread", container: "worker.1" }),
      row("lot.delivered", { quantity: 1, kind: "bread", container: "guest" }),
    ] as never,
  });
  assert.deepEqual(result[0].inventory, { items: [{ kind: "bread", quantity: 2 }] });
  assert.deepEqual(result[1].inventory, { items: [{ kind: "bread", quantity: 1 }] });
  assert.deepEqual(result[2].inventory, { items: [{ kind: "bread", quantity: 1 }] });
});

test("packs without material lots leave render facts unchanged", () => {
  const facts: RenderFact[] = [{ id: entity("actor"), visual: "worker" }];
  assert.deepEqual(decorateInventoryFacts(facts, { query: () => [] as never }), facts);
});

test("aggregates positive safe quantities and bounds kinds without failing the frame", () => {
  const facts: RenderFact[] = [{ id: entity("worker"), visual: "worker" }];
  const lots = Array.from({ length: 9 }, (_, index) =>
    row(`lot.${index}`, { quantity: 1, kind: `kind.${index}`, container: "worker" }),
  );
  const result = decorateInventoryFacts(facts, { query: () => lots as never });
  assert.equal(result[0].inventory?.items.length, 8);
  assert.equal(result[0].inventory?.overflow, true);
});

test("rejects malformed canonical quantities instead of inventing a display value", () => {
  assert.throws(
    () => decorateInventoryFacts([{ id: entity("worker") }], {
      query: () => [row("bad", { quantity: Number.NaN, kind: "bread", container: "worker" })] as never,
    }),
    /invalid material lot quantity/,
  );
});


test("consumed zero-quantity lots keep their identity without rendering goods", () => {
  const facts: RenderFact[] = [{id: entity("actor"),visual:"worker"}];
  assert.deepEqual(decorateInventoryFacts(facts,{query:()=>[row("empty",{quantity:0,kind:"bread",container:"actor"})] as never}), facts);
});

test("projects one bounded nested portable container on each exact item", () => {
  const facts: RenderFact[] = [{ id: entity("worker"), visual: "worker" }];
  const result = decorateInventoryFacts(facts, {
    query: (spec) => spec.components[0].id === Container.id
      ? [row("pail.a", { capacity: 4 })] as never
      : [
        row("pail.a", { quantity: 1, kind: "pail", container: "worker" }),
        row("water.a", { quantity: 2, kind: "water", container: "pail.a" }),
      ] as never,
  });
  assert.deepEqual(result[0].inventory, {
    items: [{ id: "pail.a", kind: "pail", quantity: 1, container: { capacity: 4, contents: { items: [{ kind: "water", quantity: 2 }] } } }],
  });
});

test("keeps two same-kind portable vessels distinct and rejects deeper custody", () => {
  const facts: RenderFact[] = [{ id: entity("worker"), visual: "worker" }];
  const queryFor = (deeper: boolean) => (spec: { components: readonly { id: string }[] }) =>
    spec.components[0].id === Container.id
      ? [row("pail.a", { capacity: 4 }), row("pail.b", { capacity: 4 }), ...(deeper ? [row("cup", { capacity: 1 })] : [])] as never
      : [
        row("pail.a", { quantity: 1, kind: "pail", container: "worker" }),
        row("pail.b", { quantity: 1, kind: "pail", container: "worker" }),
        row("water.a", { quantity: 4, kind: "water", container: "pail.a" }),
        ...(deeper ? [row("cup", { quantity: 1, kind: "cup", container: "pail.a" })] : []),
      ] as never;
  const result = decorateInventoryFacts(facts, { query: queryFor(false) });
  assert.equal(result[0].inventory?.items.length, 2);
  assert.deepEqual(result[0].inventory?.items.map(item => item.id), ["pail.a", "pail.b"]);
  assert.throws(() => decorateInventoryFacts(facts, { query: queryFor(true) }), /nested portable container depth/);
});
