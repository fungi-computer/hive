import assert from "node:assert/strict";
import test from "node:test";
import { entity } from "../sdk/authoring";
import { isReservedComponent } from "../contracts";
import { createColonyPartyPlan } from "./colony-party";
import { colonyPack, colonyServerPack } from "./colony";

test("Colony party plans are deterministic, finite and world-unique", () => {
  for (const component of [
    "hive.party",
    "hive.party-member",
    "hive.owned-by-party",
    "hive.party-receipt",
  ])
    assert.equal(isReservedComponent(component), true);
  const first = createColonyPartyPlan(
    "player.1",
    entity("party.1"),
    { x: 4, y: 0, z: 7 },
  );
  const replay = createColonyPartyPlan(
    "player.1",
    entity("party.1"),
    { x: 4, y: 0, z: 7 },
  );
  const other = createColonyPartyPlan(
    "player.2",
    entity("party.2"),
    { x: 12, y: 0, z: 7 },
  );

  assert.deepEqual(replay, first);
  assert.equal(first.people.length, 2);
  assert.equal(new Set(first.records.map(({ id }) => id)).size, first.records.length);
  assert.equal(
    first.records.filter(({ components }) => "hive.party-member" in components).length,
    2,
  );
  assert.deepEqual(
    first.records
      .filter(({ id }) => id.includes(".pail."))
      .map(({ components }) => components["hive.lot"]),
    [
      { quantity: 1, kind: "pail", container: "party.1.person.0" },
      { quantity: 1, kind: "pail", container: "party.1.person.1" },
    ],
  );
  assert.deepEqual(
    first.records.find(({ id }) => id === "party.1.starter.wood")?.components[
      "hive.lot"
    ],
    { quantity: 48, kind: "wood", container: "party.1.starter-store" },
  );
  assert.equal(
    first.records.some(({ id }) => other.records.some((record) => record.id === id)),
    false,
  );
});

test("party starter custody has no duplicated supply and cannot cross party", () => {
  const a = createColonyPartyPlan("a", entity("party.a"), { x: 0, y: 0, z: 0 });
  const b = createColonyPartyPlan("b", entity("party.b"), { x: 8, y: 0, z: 0 });
  const quantity = (plan: typeof a, kind: string) => plan.records.filter(record => (record.components["hive.lot"] as { kind?: string } | undefined)?.kind === kind).reduce((sum, record) => sum + ((record.components["hive.lot"] as { quantity?: number }).quantity ?? 0), 0);
  assert.equal(quantity(a, "wood"), 48);
  assert.equal(quantity(a, "bread"), 6);
  assert.equal(new Set(a.records.map(record => record.id)).size, a.records.length);
  const ownedBy = (plan: typeof a) => new Set(plan.records.filter(record => record.components["hive.owned-by-party"] !== undefined).map(record => record.id));
  assert.equal([...ownedBy(a)].some(id => ownedBy(b).has(id)), false);
});

test("local and server Colony packs keep party custody distinct", () => {
  const local = JSON.parse(new TextDecoder().decode(colonyPack.definition)) as { initial: { id: string }[] };
  const server = JSON.parse(new TextDecoder().decode(colonyServerPack.definition)) as { initial: { id: string }[] };
  assert.equal(local.initial.some(record => record.id === "colony.local-party"), true);
  assert.equal(server.initial.some(record => record.id === "colony.local-party"), false);
  assert.equal(server.initial.some(record => record.id.startsWith("colony.local-party.")), false);
  const first = createColonyPartyPlan("p1", entity("party.one"), { x: 0, y: 0, z: 0 });
  const second = createColonyPartyPlan("p2", entity("party.two"), { x: 8, y: 0, z: 0 });
  assert.equal(first.records.some(record => second.records.some(other => other.id === record.id)), false);
});
