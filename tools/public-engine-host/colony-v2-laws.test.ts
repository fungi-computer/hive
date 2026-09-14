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

test("lost join response retries the identical membership without a second party", async () => {
  const world = "c".repeat(64), credential = "d".repeat(64);
  const binding = await colonyBindingId(world, credential);
  const membership = { player: `player:${binding.slice(0, 24)}`, party: `party:${binding.slice(0, 24)}` };
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE participants (credential_hash TEXT PRIMARY KEY, player_id TEXT UNIQUE, party_id TEXT UNIQUE)");
  const save = db.prepare("INSERT INTO participants VALUES (?,?,?)");
  save.run(credential, membership.player, membership.party); // commit happened; response was lost
  const replay = db.prepare("SELECT player_id AS player, party_id AS party FROM participants WHERE credential_hash=?").get(credential);
  assert.equal(replay.player, membership.player);
  assert.equal(replay.party, membership.party);
  assert.equal(db.prepare("SELECT count(*) AS count FROM participants").get().count, 1);
  db.close();
});

test("forged credentials and cross-party commands fail closed", async () => {
  const world = "e".repeat(64), credential = "f".repeat(64), forged = "0".repeat(64);
  const binding = await colonyBindingId(world, credential);
  assert.notEqual(binding, await colonyBindingId(world, forged));
  const owner = `party:${binding.slice(0, 24)}`;
  const foreign = createColonyPartyPlan("player:foreign", entity("party:foreign"), { x: 1, y: 0.5, z: 1 });
  assert.equal(foreign.records[0].components["hive.party"].ownerPlayer, "player:foreign");
  assert.notEqual(owner, String(foreign.party));
  assert.throws(() => createColonyPartyPlan("player/forged", entity("party:bad"), { x: 1, y: 0.5, z: 1 }), /invalid Colony player identity/);
});

test("disconnect and reopen preserve both participant memberships and world ticking", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE world (tick INTEGER NOT NULL); CREATE TABLE participants (credential_hash TEXT PRIMARY KEY, player_id TEXT UNIQUE, party_id TEXT UNIQUE, connected INTEGER NOT NULL)");
  db.exec("INSERT INTO world VALUES (1)");
  db.exec("INSERT INTO participants VALUES ('a','player:a','party:a',1), ('b','player:b','party:b',1)");
  db.prepare("UPDATE participants SET connected=0 WHERE credential_hash='b'").run();
  db.prepare("UPDATE world SET tick=tick+1").run();
  db.prepare("UPDATE participants SET connected=1 WHERE credential_hash='a'").run();
  assert.equal(db.prepare("SELECT tick FROM world").get().tick, 2);
  assert.equal(db.prepare("SELECT count(*) AS count FROM participants").get().count, 2);
  assert.equal(db.prepare("SELECT party_id FROM participants WHERE credential_hash='b'").get().party_id, "party:b");
  db.close();
});
