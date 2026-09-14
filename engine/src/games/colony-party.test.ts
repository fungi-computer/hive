import assert from "node:assert/strict";
import test from "node:test";
import { entity } from "../sdk/authoring";
import { isReservedComponent } from "../contracts";
import { createColonyPartyPlan } from "./colony-party";

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
