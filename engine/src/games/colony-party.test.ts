import assert from "node:assert/strict";
import test from "node:test";
import { isReservedComponent } from "../contracts";
import { createColonyPartyPlan } from "./colony-party";
import { colonyPack, colonyServerPack } from "./colony";

test("Colony party plans declare deterministic actor slots and finite grants", () => {
  for (const component of ["hive.party", "hive.party-member", "hive.owned-by-party"])
    assert.equal(isReservedComponent(component), true);
  const first = createColonyPartyPlan({ x: 4, y: 0, z: 7 });
  const replay = createColonyPartyPlan({ x: 4, y: 0, z: 7 });
  const other = createColonyPartyPlan({ x: 12, y: 0, z: 7 });
  assert.deepEqual(replay, first);
  assert.deepEqual(first.peopleSlots, ["person.0", "person.1"]);
  assert.equal(new Set(first.actors.map(actor => actor.slot)).size, first.actors.length);
  assert.equal(first.actors.filter(actor => actor.definition === "colony.worker").length, 2);
  assert.deepEqual(first.initialMaterials.map(({ kind, quantity }) => [kind, quantity]), [
    ["pail", 1], ["pail", 1], ["wood", 48], ["bread", 6], ["malt", 4], ["barm", 1], ["keg", 1],
  ]);
  assert.notDeepEqual(other, first);
  assert.equal(JSON.stringify(first).includes("ownerPlayer"), false);
  assert.equal(JSON.stringify(first).includes("components"), false);
});

test("local and server Colony packs share templates without static party records", () => {
  const local = JSON.parse(new TextDecoder().decode(colonyPack.definition)) as { initial: { id: string }[]; actors: { id: string }[] };
  const server = JSON.parse(new TextDecoder().decode(colonyServerPack.definition)) as { initial: { id: string }[]; actors: { id: string }[] };
  assert.deepEqual(local.actors.map(actor => actor.id), server.actors.map(actor => actor.id));
  assert.deepEqual(local.actors.map(actor => actor.id), ["colony.party", "colony.worker", "colony.store", "colony.pail", "colony.keg", "colony.barm", "colony.cat"]);
  assert.equal(local.initial.some(record => record.id === "party:1"), false);
  assert.equal(server.initial.some(record => record.id === "party:1"), false);
  assert.equal(colonyPack.bootstrapActions?.[0]?.kind, "instantiate-actors");
  assert.equal(colonyServerPack.bootstrapActions, undefined);
});
