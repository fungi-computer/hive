import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { colonyBindingId, colonyWorldRoute } from "./protocol";
import { createColonyPartyPlan } from "../../engine/src/games/colony-party";
import { entity } from "../../engine/src/sdk/authoring";

test("v2 world routing keeps world identity separate from socket handles", () => {
  const world = "a".repeat(64);
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/join`), { world, operation: "join" });
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/socket/client.1`), { world, operation: "socket", socketHandle: "client.1" });
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${world}/socket/${"b".repeat(257)}`), null);
});

test("binding and party plans are deterministic and retry safe", async () => {
  const world = "a".repeat(64), credential = "b".repeat(64);
  const first = await colonyBindingId(world, credential);
  assert.equal(first, await colonyBindingId(world, credential));
  const party = entity(`party:${first.slice(0, 24)}`);
  const plan = createColonyPartyPlan(`player:${first.slice(0, 24)}`, party, { x: 1, y: 0.5, z: 1 });
  const replay = createColonyPartyPlan(`player:${first.slice(0, 24)}`, party, { x: 1, y: 0.5, z: 1 });
  assert.deepEqual(plan, replay);
  assert.equal(plan.people.length, 2);
  assert.equal(plan.records.filter(record => record.components["hive.party-member"] !== undefined).length, 2);
  assert.equal(plan.records.filter(record => record.components["hive.owned-by-party"] !== undefined).length, 3);
});

test("participant binding is atomic, idempotent, and survives reopen", () => {
  const directory = mkdtempSync("/tmp/hive-party-laws-");
  const file = join(directory, "world.sqlite");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE hive_public_participants (credential_hash TEXT PRIMARY KEY, principal TEXT UNIQUE, player_id TEXT UNIQUE, party_id TEXT UNIQUE)");
  const insert = db.prepare("INSERT INTO hive_public_participants VALUES (?,?,?,?)");
  db.exec("BEGIN");
  insert.run("a", "participant:a", "player:a", "party:a");
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT count(*) AS count FROM hive_public_participants").get().count, 0);
  insert.run("a", "participant:a", "player:a", "party:a");
  assert.throws(() => insert.run("a", "participant:a", "player:a", "party:a"));
  assert.throws(() => insert.run("b", "participant:b", "player:a", "party:b"));
  db.close();
  const reopened = new DatabaseSync(file);
  assert.equal(reopened.prepare("SELECT count(*) AS count FROM hive_public_participants").get().count, 1);
  reopened.close();
  rmSync(directory, { recursive: true, force: true });
});
