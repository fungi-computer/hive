import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { PublicEngineRegion } from "./worker.ts";
import { openRegion } from "../../src/engine/region/index.ts";
import { createPublicationQueue } from "./publication-queue.ts";
import { createObservationProjector } from "../../engine/src/runtime/observation.ts";
import { acknowledgeObservation, canSendObservation } from "./observation-delivery.ts";

// Exercise the real host methods and Region against SQLite. Only Cloudflare's
// storage/socket platform and native physics are substituted, not host policy.
function fixture(receipts = 4096) {
  const db = new DatabaseSync(":memory:");
  let alarm: number | null = null, depth = 0, failRearm = false;
  const sockets: any[] = [];
  const owner = {
    sql: { exec(statement: string, ...bindings: any[]) {
      if (statement.trimStart().startsWith("CREATE TABLE")) { db.exec(statement); return { toArray: () => [] }; }
      const rows = db.prepare(statement).all(...bindings);
      return { toArray: () => rows };
    } },
    transactionSync<T>(operation: () => T): T {
      const id = `nested${depth++}`;
      db.exec(`SAVEPOINT ${id}`);
      try { const result = operation(); db.exec(`RELEASE ${id}`); return result; }
      catch (error) { db.exec(`ROLLBACK TO ${id}`); db.exec(`RELEASE ${id}`); throw error; }
      finally { depth--; }
    },
  };
  const storage = {
    sql: owner.sql, transactionSync: owner.transactionSync,
    async setAlarm(at: number) { alarm = at; },
    async deleteAlarm() { alarm = null; },
    async transaction<T>(operation: (txn: any) => Promise<T>) {
      const previous = alarm;
      db.exec("SAVEPOINT outer_host");
      try {
        const result = await operation({
          async setAlarm(at: number) { if (failRearm) throw new Error("injected rearm failure"); alarm = at; },
          async deleteAlarm() { alarm = null; },
        });
        db.exec("RELEASE outer_host");
        return result;
      } catch (error) {
        db.exec("ROLLBACK TO outer_host"); db.exec("RELEASE outer_host"); alarm = previous; throw error;
      }
    },
  };
  db.exec(`CREATE TABLE hive_public_host (singleton INTEGER PRIMARY KEY, format_version INTEGER, pack TEXT, token_hash TEXT, paused INTEGER, next_sequence INTEGER, lease_until_ms INTEGER, due_sequence INTEGER, due_request_json TEXT, due_deadline_ms INTEGER,wake_json TEXT NOT NULL);
    INSERT INTO hive_public_host VALUES(1,2,'formations','test',0,0,NULL,NULL,NULL,NULL,'{"state":"running"}');
    CREATE TABLE hive_public_world(singleton INTEGER PRIMARY KEY,world_handle TEXT,pack TEXT,invite_hash TEXT);
    CREATE TABLE hive_public_participants(credential_hash TEXT PRIMARY KEY,principal TEXT,player_id TEXT,party_id TEXT);`);
  const open = () => openRegion({ owner, limits: { receipts }, region: "host-owner-test", clock: { principal: "formations-host" }, program: {
    id: "host-owner-test-v1", initial: () => ({ state: { session: { paused: false }, time: 0 }, records: [] }),
    parseState: (value: any) => value, parseCommand: (value: any) => value,
    authorize: () => true,
    execute(state: any, command: any) {
      if (command.kind === "reject") return { status: "rejected" as const, result: {}, events: [] };
      if (command.kind === "step") state.time += command.delta;
      if (command.kind === "pause") state.session.paused = true;
      if (command.kind === "resume") state.session.paused = false;
      return { status: "applied" as const, result: {}, events: [] };
    },
  } });
  const waits: Promise<unknown>[] = [];
  const make = () => {
    const host: any = Object.create(PublicEngineRegion.prototype);
    Object.assign(host, {
      owner, region: open(), pack: "formations", registration: {}, tokenHash: "test", initialized: true,
      resident: { begin() {}, accept() {}, discard() {}, takeCandidateCost() {} },
      ready: Promise.resolve(), residentQueue: Promise.resolve(), terrainStreams: new Map(),
      hostEnv: { PUBLIC_ORIGIN: "https://example.test" },
      state: { storage, getWebSockets: () => sockets, waitUntil: (p: Promise<unknown>) => waits.push(p), acceptWebSocket: (s: any) => sockets.push(s) },
      projectObservation: createObservationProjector(),
    });
    host.publicationQueue = createPublicationQueue(() => host.publishObservation(), (e) => { throw e; });
    return host;
  };
  return { make, db, sockets, waits, get alarm() { return alarm; }, fire() { alarm = null; }, fail(value: boolean) { failRearm = value; }, close: () => db.close() };
}

test("lease expiry settles one admitted occurrence, then sleeps until a later request", async () => {
  const f = fixture();
  try {
    let host = f.make();
    await host.renewLease(0);
    assert.equal(f.alarm, 100);
    await host.runDue(99); // Duplicate/early delivery cannot consume the occurrence.
    assert.equal(f.alarm, 100);
    await host.runDue(100);
    assert.equal(host.region.readCommitted().state.time, 0.1);
    assert.ok(f.alarm! >= 200);
    await host.runDue(15_000); // The already admitted sequence settles once after expiry.
    assert.equal(host.region.readCommitted().state.time, 0.2);
    assert.equal(f.alarm, null);
    host = f.make(); // Drop all resident/queue/cache state.
    await host.runDue(100_000);
    assert.equal(host.region.readCommitted().state.time, 0.2);
    assert.equal(f.alarm, null);
    await host.renewLease(100_000); // An authorized observation/command wakes the same sequence frontier.
    assert.ok(f.alarm! >= 100_100);
    await host.runDue(f.alarm!);
    assert.ok(Math.abs(host.region.readCommitted().state.time - 0.3) < 1e-9);
    assert.ok(f.alarm! >= 100_200);
  } finally { f.close(); }
});

test("pause removes wake, quiet command arrival commits its occurrence and rearm together", async () => {
  const f = fixture();
  try {
    const host = f.make();
    await host.command({ id: "pause", replayEpoch: 0, command: { kind: "pause" } }, 0);
    assert.equal(f.alarm, null);
    f.fail(true);
    await assert.rejects(host.command({ id: "resume", replayEpoch: 0, command: { kind: "resume" } }, 1000), /rearm failure/);
    assert.equal(host.region.readCommitted().state.session.paused, true);
    f.fail(false);
    await host.command({ id: "resume", replayEpoch: 0, command: { kind: "resume" } }, 1000);
    assert.equal(host.region.readCommitted().state.session.paused, false);
    assert.equal(f.alarm, 1100);
  } finally { f.close(); }
});

test("transactional rearm failures preserve the occurrence through restart until lease expiry", async () => {
  const f = fixture();
  try {
    let host = f.make();
    await host.renewLease(0);
    f.fail(true);
    for (let failure = 1; failure <= 4; failure++) {
      const now = f.alarm!;
      f.fire();
      await host.runDue(now); // Failure is represented durably, not rethrown forever.
      assert.equal(host.region.readCommitted().state.time, 0, `failure ${failure} must roll back its occurrence`);
      const status = host.hostStatus();
      assert.equal(status.attempts, failure);
      assert.equal(status.state, "retrying");
      assert.equal(f.alarm, now + 1000 * 2 ** (failure - 1));
      host = f.make();
    }
    // The durable clock request survives alarm-write failures. Its retry is
    // after the lease, but the occurrence still settles and no new clock is made.
    assert.ok(f.alarm! > 15_000);
    f.fail(false);
    await host.runDue(f.alarm!);
    assert.equal(host.region.readCommitted().state.time, 0.1);
    assert.deepEqual(host.hostStatus(), { state: "running" });
    assert.equal(f.alarm, null);
  } finally { f.close(); }
});

 test("transient failure recovers the same occurrence once and clears its durable retry budget", async () => {
  const f = fixture();
  try {
    let host = f.make(); await host.renewLease(0);
    const request = host.hostRow().due_request_json;
    f.fail(true); await host.runDue(100);
    assert.equal(host.hostStatus().state, "retrying");
    f.fail(false); host = f.make(); await host.runDue(1099);
    assert.equal(host.region.readCommitted().state.time, 0);
    await host.runDue(1100);
    assert.equal(host.region.readCommitted().state.time, .1);
    assert.deepEqual(host.hostStatus(), { state: "running" });
    const receipt = host.region.dispatchOccurrence("formations-host", {sequence:0, request:JSON.parse(request)});
    assert.equal(receipt.revision, 1);
    assert.equal(host.region.readCommitted().state.time, .1);
  } finally { f.close(); }
});

test("slow recipient retains one frame while fast recipient advances; ack survives process replacement", async () => {
  const f = fixture();
  try {
    let host = f.make();
    const socket = () => {
      let attachment: any = { authenticated: true, hostStatusWire: JSON.stringify({ state: "running" }), pack: "formations", worldHandle: "test" };
      return { frames: [] as string[], deserializeAttachment: () => attachment, serializeAttachment: (a: any) => { attachment = a; }, send(frame: string) { this.frames.push(frame); }, close() {} };
    };
    const slow = socket(), fast = socket(); f.sockets.push(slow, fast);
    let builds = 0;
    const payload = (revision: number) => ({ hostStatus: { state: "running" }, revision, replayEpoch: 0, observation: { whistleRevision: 0, whistleAgent: [], whistleTargets: [] } });
    host.observationPayload = () => { builds++; return payload(host.region.readCommitted().revision); };
    await host.publishObservation();
    assert.equal(slow.frames.length, 1);
    await host.publishObservation(); assert.equal(builds, 1);
    await host.renewLease(0); await host.runDue(100);
    fast.serializeAttachment(acknowledgeObservation(fast.deserializeAttachment(), 0, 0));
    await host.publishObservation();
    assert.equal(slow.frames.length, 1); assert.equal(fast.frames.length, 2);
    host = f.make(); host.observationPayload = () => payload(host.region.readCommitted().revision);
    assert.equal(canSendObservation(slow.deserializeAttachment()), false);
    slow.serializeAttachment(acknowledgeObservation(slow.deserializeAttachment(), 0, 0));
    await host.publishObservation(); assert.equal(slow.frames.length, 2);
    assert.throws(() => acknowledgeObservation(slow.deserializeAttachment(), 999, 0), /ack-invalid/);
  } finally { f.close(); }
});

test("first join cannot bind an arbitrary invite to another invitation's world hash", async () => {
  const f = fixture();
  try {
    const host = f.make();
    host.worldHandle = createHash("sha256").update("a".repeat(64)).digest("hex");
    await assert.rejects(host.joinColony("b".repeat(64), "c".repeat(64), 0), /invite-forbidden/);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM hive_public_world").get()!.n, 0);
    assert.equal(host.region.readCommitted().revision, 0);
  } finally { f.close(); }
});

test("idle v2 unauthenticated socket is armed immediately and expires without another message", async () => {
  const f = fixture();
  const originalPair = (globalThis as any).WebSocketPair;
  try {
    const host = f.make();
    const world = "a".repeat(64);
    host.worldHandle = world;
    host.initialize = async () => {};
    let attachment: any, closed = false;
    const socket = { deserializeAttachment: () => attachment, serializeAttachment: (a: any) => { attachment = a; }, close: () => { closed = true; } };
    (globalThis as any).WebSocketPair = class { 0 = {}; 1 = socket; };
    await host.fetch(new Request(`https://example.test/v2/colony/worlds/${world}/socket/handle`, { headers: { Upgrade: "websocket" } }));
    // Node Response refuses status101; the real handler has already accepted and
    // durably armed the socket before constructing its platform-only response.
    assert.equal(f.sockets.length, 1);
    assert.equal(f.alarm, attachment.authDeadline);
    host.expireUnauthenticated(f.alarm);
    assert.equal(closed, true);
    assert.equal(host.socketAlarmAt(), null);
  } finally { (globalThis as any).WebSocketPair = originalPair; f.close(); }
});

test("rejection-only replay rollover publishes a new envelope and requires its exact acknowledgement", async () => {
  const f = fixture(1);
  try {
    const host = f.make();
    const observation = { whistleRevision: 0, whistleAgent: [], whistleTargets: [] };
    host.observationCache = { revision: 0, payload: { hostStatus: { state: "running" }, revision: 0, replayEpoch: 0, observation } };
    let attachment: any = { authenticated: true, hostStatusWire: JSON.stringify({ state: "running" }), pack: "formations", worldHandle: "test" };
    const frames: any[] = [];
    const socket = { deserializeAttachment: () => attachment, serializeAttachment: (a: any) => { attachment = a; }, send: (s: string) => frames.push(JSON.parse(s)), close() {} };
    f.sockets.push(socket);
    await host.publishObservation();
    attachment = acknowledgeObservation(attachment, 0, 0);
    await host.command({ id: "rejected", replayEpoch: 0, command: { kind: "reject" } }, 100);
    assert.equal(host.region.readCommitted().revision, 0);
    await host.publishObservation();
    assert.equal(frames.length, 2);
    assert.equal(frames[1].revision, 0);
    assert.equal(frames[1].replayEpoch, 1);
    assert.equal(host.observationCache.payload.observation, observation);
    assert.throws(() => acknowledgeObservation(attachment, 0, 0), /ack-invalid/);
    attachment = acknowledgeObservation(attachment, 0, 1);
    await host.publishObservation();
    assert.equal(frames.length, 2);
  } finally { f.close(); }
});

test("admitted join retry resolves its original binding after receipt retirement without restamping", async () => {
  const f = fixture(1);
  try {
    const host = f.make();
    const invite = "a".repeat(64), credential = "c".repeat(64);
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    host.worldHandle = hash(invite);
    const credentialHash = hash(credential);
    const binding = hash(`hive:colony:join:${host.worldHandle}:${credentialHash}`);
    f.db.prepare("INSERT INTO hive_public_participants VALUES (?,?,?,?)").run(credentialHash, `participant:${credentialHash}`, "player:1", "party:1");
    host.resident.observe = (_revision: number, _state: any, _records: any, use: any) => use({ partyJoinIdentity(id: string) {
      assert.equal(id, binding);
      return { status: "existing", player: "player:1", party: "party:1", people: ["person:1"] };
    } });
    host.commandExclusive = () => { throw new Error("join must not dispatch again"); };
    const original = await host.joinColony(invite, credential, 0);
    host.region.dispatch("player", { id: "epoch-rollover", replayEpoch: 0, command: { kind: "reject" } });
    assert.equal(host.region.readReplayWindow().epoch, 1);
    assert.deepEqual(await host.joinColony(invite, credential, 1), original);
    assert.equal(host.region.readCommitted().revision, 0);
    assert.equal(host.region.readReplayWindow().epoch, 1);
  } finally { f.close(); }
});

test("resident replacement invalidates session-local Whistle baselines before publication", async () => {
  const f = fixture();
  try {
    const host = f.make();
    let attachment: any = { authenticated: true, hostStatusWire: JSON.stringify({ state: "running" }), pack: "formations", worldHandle: "test", whistleRevision: 1 };
    const frames: any[] = [];
    f.sockets.push({ deserializeAttachment: () => attachment, serializeAttachment: (a: any) => { attachment = a; }, send: (s: string) => frames.push(JSON.parse(s)), close() {} });
    host.resident.observe = (_revision: number, _state: any, _records: any, use: any) => use({});
    host.projectObservation = () => ({ whistleRevision: 1, whistleAgent: ["new-session-capability"], whistleTargets: [] });
    await host.publishObservation();
    assert.deepEqual(frames[0].observation.whistleAgent, ["new-session-capability"]);
  } finally { f.close(); }
});

test("terminal capacity fault preserves due identity, has no alarm, and publishes once despite an unacked frame", async () => {
  const f = fixture();
  try {
    let host = f.make(); await host.renewLease(0);
    const due = host.hostRow(); let attempts = 0;
    host.region = { ...host.region, dispatchOccurrence: () => { attempts++; throw Error("region-record-capacity"); } };
    let attachment: any = { authenticated: true, pack: "formations", worldHandle: "test", observationRevision: 0, observationAcknowledged: false };
    const frames: any[] = [];
    f.sockets.push({ deserializeAttachment: () => attachment, serializeAttachment: (a: any) => { attachment = a; }, send: (s: string) => frames.push(JSON.parse(s)), close() {} });
    await host.runDue(100);
    assert.deepEqual(host.hostStatus(), {state:"faulted",sequence:0,attempts:1,code:"region-record-capacity"});
    assert.equal(f.alarm, null);
    assert.equal(host.hostRow().due_request_json, due.due_request_json);
    assert.equal(host.hostRow().due_sequence, due.due_sequence);
    assert.equal(frames.length, 1); assert.equal(frames[0].type, "host-status");
    host = f.make();
    await host.runDue(999_999); await host.renewLease(999_999); await host.publishObservation();
    assert.equal(attempts, 1); assert.equal(f.alarm, null); assert.equal(frames.length, 1);
    assert.equal(host.region.readCommitted().state.time, 0);
  } finally { f.close(); }
});

test("postcommit resident failure cannot fault the next unattempted occurrence", async () => {
  const f = fixture();
  try {
    let host=f.make();await host.renewLease(0);
    host.resident.accept=()=>{throw Error("session-postcommit-cache-failure");};
    await host.runDue(100);
    assert.equal(host.region.readCommitted().state.time,.1);
    assert.equal(host.hostRow().next_sequence,1);
    assert.deepEqual(host.hostStatus(),{state:"running"});
    host=f.make(); const due=host.hostRow();
    const actualNow=Date.now; Date.now=()=>due.due_deadline_ms;
    try { await host.runDue(due.due_deadline_ms); } finally { Date.now=actualNow; }
    assert.equal(host.region.readCommitted().state.time,.2);
    assert.deepEqual(host.hostStatus(),{state:"running"});
  }finally{f.close();}
});
