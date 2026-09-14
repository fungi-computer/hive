import { DurableObject } from "cloudflare:workers";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createSessionRegionRuntime, type SessionResident } from "../../engine/src/runtime/region-program";
import type { SessionRegionState } from "../../engine/src/runtime/region-program";
import { buildObservation, type SessionObservation } from "../../engine/src/runtime/observation";
import { terrainWireForRevision } from "../../engine/src/runtime/terrain-wire";
import { wasmKernelPort } from "../../engine/src/runtime/wasm-kernel";
import { WasmKernel, initSync } from "../../engine/generated/hive_kernel.js";
import { colonyPack } from "../../engine/src/games/colony";
import { formationsPack } from "../../engine/src/games/formations";
import { piratesPack } from "../../engine/src/games/pirates";
import { survivalPack } from "../../engine/src/games/survival";
import {
  LEASE_MS,
  STEP_MS,
  clockRequest,
  corsHeaders,
  packFromPath,
  readCommand,
  tokenFromRequest,
  withCors,
  type PublicCommandInput,
  type PublicPack,
  readSocketMessage,
  socketHandleFromPath,
  colonyWorldRoute,
  participantPrincipal,
  colonyBindingId,
  readColonyJoin,
} from "./protocol";
import wasmBytes from "../../engine/generated/hive_kernel_bg.wasm";
import { createPublicationQueue } from "./publication-queue";
import { advanceClockOccurrence } from "./clock-schedule";
import { createColonyPartyPlan } from "../../engine/src/games/colony-party";
import { establishParty } from "../../engine/src/sdk/party";
import { PartyMember } from "../../engine/src/sdk/party";
import { query } from "../../engine/src/sdk/authoring";
import { Position } from "../../engine/src/sdk/common";
import type { EntityId } from "../../engine/src/contracts";
import { runColonyJoinTransaction } from "./colony-join-owner";

type Environment = {
  REGIONS: DurableObjectNamespace;
  IMPLEMENTATION_HASH: string;
  PUBLIC_ORIGIN: string;
};
type HostRow = {
  singleton: number;
  format_version: number;
  pack: string;
  token_hash: string;
  paused: number;
  next_sequence: number;
  lease_until_ms: number | null;
  due_sequence: number | null;
  due_request_json: string | null;
  due_deadline_ms: number | null;
};
type WorldRow = { singleton: number; format_version: number; world_handle: string; pack: string; invite_hash: string };
type ParticipantRow = { credential_hash: string; principal: string; player_id: string; party_id: string };

/* legacy local copy removed */
/*
  readonly transaction: <T>(operation: () => T | Promise<T>) => Promise<T>;
  readonly owner: RegionSqliteOwner;
  readonly credentialHash: string;
  readonly principal: string;
  readonly bindingId: string;
  readonly player: string;
  readonly party: string;
  readonly people: readonly string[];
  readonly dispatch: () => { status: "applied" | "rejected"; result: unknown };
}): Promise<{ player: string; party: string; people: readonly string[] }> {
  return options.transaction(async () => {
    const existing = options.owner.sql.exec<ParticipantRow>("SELECT * FROM hive_public_participants WHERE credential_hash=?", options.credentialHash).toArray()[0];
    if (existing) return { player: existing.player_id, party: existing.party_id, people: options.people };
    const receipt = options.dispatch();
    const results = receipt.status === "applied" && receipt.result && typeof receipt.result === "object" ? (receipt.result as { results?: unknown }).results : undefined;
    if (!Array.isArray(results) || results.length !== 1 || !(results[0] as { accepted?: unknown })?.accepted) throw new Error("party-establish-rejected");
    options.owner.sql.exec("INSERT INTO hive_public_participants VALUES (?,?,?,?)", options.credentialHash, options.principal, options.player, options.party);
    return { player: options.player, party: options.party, people: options.people };
  });
}*/
type SocketAttachment = {
  readonly pack: PublicPack;
  readonly tokenHash: string;
  readonly authenticated: boolean;
  readonly authDeadline: number | null;
  readonly retired?: boolean;
  /** The complete terrain baseline successfully sent on this connection. */
  readonly terrainRevision?: number;
  /** The neutral Whistle capability revision successfully sent on this connection. */
  readonly whistleRevision?: number;
};
type PublicObservationPayload = {
  readonly revision: number;
  readonly observation: SessionObservation;
};
const MAX_OBSERVATION_BYTES = 1024 * 1024;

function packFor(pack: PublicPack) {
  switch (pack) {
    case "survival":
      return survivalPack;
    case "pirates":
      return piratesPack;
    case "colony":
      return colonyPack;
    case "formations":
      return formationsPack;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(
  value: unknown,
  status: number,
  origin: string,
): Response {
  return withCors(Response.json(value, { status }), origin);
}
function commandKind(input: { command: unknown }): string | undefined {
  const command = input.command;
  return command &&
    typeof command === "object" &&
    !Array.isArray(command) &&
    typeof (command as { kind?: unknown }).kind === "string"
    ? (command as { kind: string }).kind
    : undefined;
}
function validateHostRow(row: HostRow): void {
  if (
    row.format_version !== 1 ||
    (row.paused !== 0 && row.paused !== 1) ||
    !Number.isSafeInteger(row.next_sequence) ||
    row.next_sequence < 0 ||
    (row.lease_until_ms !== null &&
      (!Number.isSafeInteger(row.lease_until_ms) || row.lease_until_ms < 0))
  )
    throw new Error("public-host-format");
  const dueValues = [
    row.due_sequence,
    row.due_request_json,
    row.due_deadline_ms,
  ];
  const allNull = dueValues.every((value) => value === null);
  const allPresent = dueValues.every((value) => value !== null);
  if (!allNull && !allPresent) throw new Error("public-host-format");
  if ((row.paused === 1 || row.lease_until_ms === null) && allPresent) throw new Error("public-host-format");
  if (allNull) {
    if (row.paused !== 1 && row.lease_until_ms === null) return;
    return;
  }
  if (
    row.due_sequence === null ||
    row.due_deadline_ms === null ||
    typeof row.due_request_json !== "string"
  )
    throw new Error("public-host-format");
  const dueSequence = row.due_sequence;
  const dueDeadline = row.due_deadline_ms;
  const dueRequest = row.due_request_json;
  if (
    !Number.isSafeInteger(dueSequence) ||
    dueSequence < 0 ||
    dueSequence !== row.next_sequence ||
    !Number.isSafeInteger(dueDeadline) ||
    dueDeadline < 0 ||
    new TextEncoder().encode(dueRequest).byteLength > 8192
  )
    throw new Error("public-host-format");
  try {
    const request = JSON.parse(dueRequest) as Record<string, unknown>;
    const command = request.command;
    const id = request.id;
    if (
      typeof id !== "string" ||
      id.length < 1 ||
      id.length > 160 ||
      request.expectedRevision !== undefined ||
      !command ||
      typeof command !== "object" ||
      Array.isArray(command) ||
      (command as { kind?: unknown }).kind !== "step" ||
      typeof (command as { delta?: unknown }).delta !== "number" ||
      !Number.isFinite((command as { delta: number }).delta) ||
      (command as { delta: number }).delta < 0 ||
      (command as { delta: number }).delta > 1
    )
      throw new Error("invalid");
  } catch {
    throw new Error("public-host-format");
  }
}

export class PublicEngineRegion extends DurableObject<Environment> {
  private region!: ReturnType<typeof openRegion<SessionRegionState, unknown>>;
  private resident!: SessionResident;
  private pack!: PublicPack;
  private tokenHash!: string;
  private worldHandle!: string;
  private colonyWorld = false;
  private readonly owner: RegionSqliteOwner;
  private initialized = false;
  private startupFailure: string | undefined;
  private readonly ready: Promise<void>;
  private residentQueue: Promise<void> = Promise.resolve();
  private readonly publicationQueue: ReturnType<typeof createPublicationQueue>;
  private observationCache: {
    readonly revision: number;
    readonly payload: PublicObservationPayload;
  } | undefined;

  constructor(
    private readonly state: DurableObjectState,
    private readonly hostEnv: Environment,
  ) {
    super(state, hostEnv);
    this.owner = {
      sql: {
        exec: <Row extends Record<string, SqlStorageValue | Uint8Array>>(
          statement: string,
          ...bindings: (SqlStorageValue | Uint8Array)[]
        ) => {
          const cursor = state.storage.sql.exec(statement, ...bindings);
          return { toArray: () => cursor.toArray() as Row[] };
        },
      },
      transactionSync: (operation) => state.storage.transactionSync(operation),
    };
    this.publicationQueue = createPublicationQueue(
      () => this.publishObservation(),
      (error) => this.reportPublicationFailure(error),
    );
    this.ready = state.blockConcurrencyWhile(async () => {
      try {
        if (!/^[a-f0-9]{64}$/.test(hostEnv.IMPLEMENTATION_HASH)) throw new Error("missing immutable implementation hash");
        initSync({ module: wasmBytes });
        if (this.hasHostTable()) {
          const persisted = this.hostRow();
          if (persisted) {
            const world = this.owner.sql.exec<WorldRow>("SELECT * FROM hive_public_world WHERE singleton=1").toArray()[0];
            if (world) await this.initializeCore(persisted.pack as PublicPack, persisted.token_hash, world.world_handle);
            else await this.initializeCore(persisted.pack as PublicPack, persisted.token_hash);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        this.startupFailure = ["region-identity-conflict", "public-capability-conflict", "public-host-format"].includes(message) ? "unsupported-world" : "world-unavailable";
      }
    });
  }

  private async initialize(pack: PublicPack, tokenHash: string): Promise<void> {
    const expectedId = this.hostEnv.REGIONS.idFromName(`${pack}:${tokenHash}`);
    if (expectedId.toString() !== this.state.id.toString())
      throw new Error("public-capability-conflict");
    if (this.initialized) {
      if (this.pack !== pack || this.tokenHash !== tokenHash)
        throw new Error("public-capability-conflict");
      return;
    }
    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return;
      await this.initializeCore(pack, tokenHash);
    });
  }

  private async initializeColony(world: string, inviteHash: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(world) || world !== inviteHash) throw new Error("public-unauthorized");
    const expectedId = this.hostEnv.REGIONS.idFromName(`colony-party-v1:${world}`);
    if (expectedId.toString() !== this.state.id.toString()) throw new Error("public-capability-conflict");
    if (this.initialized) {
      if (!this.colonyWorld || this.worldHandle !== world) throw new Error("public-capability-conflict");
      return;
    }
    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return;
      await this.initializeCore("colony", world, world);
    });
  }

  private async initializeCore(
    pack: PublicPack,
    tokenHash: string,
    worldHandle?: string,
  ): Promise<void> {
    const game = packFor(pack);
    const hostPrincipal = `${pack}-host`;
    const playerPrincipal = `${pack}-player`;
    const runtime = createSessionRegionRuntime({
      pack: game,
      createKernel: () => wasmKernelPort(new WasmKernel()),
      implementationHash: this.hostEnv.IMPLEMENTATION_HASH,
      ownerPrincipal: playerPrincipal,
      hostPrincipal,
      seed: 17,
      scopeForPrincipal: (principal) => {
        if (principal === hostPrincipal) return { kind: "host" };
        const row = this.owner.sql.exec<ParticipantRow>("SELECT * FROM hive_public_participants WHERE principal=?", principal).toArray()[0];
        return row ? { kind: "player", player: row.player_id as never, party: row.party_id as never } : null;
      },
    });
    this.resident = runtime.resident;
    const program = runtime.program;
    this.pack = pack;
    this.tokenHash = tokenHash;
    this.worldHandle = worldHandle ?? "";
    this.colonyWorld = worldHandle !== undefined;
    this.region = openRegion({
      owner: this.owner,
      region: `public-v1-${pack}-${tokenHash.slice(0, 32)}`,
      program,
      clock: { principal: hostPrincipal },
    });
    const hadHostTable = this.hasHostTable();
    this.owner.transactionSync(() => {
      this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_host (
          singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL,
          pack TEXT NOT NULL, token_hash TEXT NOT NULL, paused INTEGER NOT NULL,
          next_sequence INTEGER NOT NULL,
          lease_until_ms INTEGER, due_sequence INTEGER, due_request_json TEXT,
          due_deadline_ms INTEGER);`);
      this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_world (
          singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL,
          world_handle TEXT NOT NULL UNIQUE, pack TEXT NOT NULL, invite_hash TEXT NOT NULL UNIQUE);`);
      this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_participants (
          credential_hash TEXT PRIMARY KEY, principal TEXT NOT NULL UNIQUE,
          player_id TEXT NOT NULL UNIQUE, party_id TEXT NOT NULL UNIQUE);`);
      const row = this.hostRow();
      if (!row) {
        if (hadHostTable) throw new Error("public-host-format");
        this.owner.sql.exec(
          "INSERT INTO hive_public_host VALUES (1,1,?,?,0,0,NULL,NULL,NULL,NULL)",
          pack,
          tokenHash,
        );
      } else if (
        row.format_version !== 1 ||
        row.pack !== pack ||
        row.token_hash !== tokenHash ||
        !Number.isSafeInteger(row.next_sequence) ||
        row.next_sequence < 0
      ) {
        throw new Error("public-capability-conflict");
      }
      const stored = row ?? {
        singleton: 1,
        format_version: 1,
        pack,
        token_hash: tokenHash,
        paused: 0,
        next_sequence: 0,
        lease_until_ms: null,
        due_sequence: null,
        due_request_json: null,
        due_deadline_ms: null,
      };
      validateHostRow(stored);
      const clock = this.owner.sql
        .exec<{ next_sequence: number }>(
          "SELECT next_sequence FROM hive_region_clock WHERE singleton=1",
        )
        .toArray()[0];
      if (!clock || clock.next_sequence !== stored.next_sequence)
        throw new Error("public-host-format");
      const paused = this.region.readCommitted().state.session.paused;
      if (stored.paused !== (paused ? 1 : 0))
        throw new Error("public-host-format");
      if (worldHandle !== undefined) {
        const world = this.owner.sql.exec<WorldRow>("SELECT * FROM hive_public_world WHERE singleton=1").toArray()[0];
        if (world && (world.format_version !== 2 || world.world_handle !== worldHandle || world.pack !== pack || world.invite_hash !== worldHandle)) throw new Error("public-capability-conflict");
        if (!world) this.owner.sql.exec("INSERT INTO hive_public_world VALUES (1,2,?,?,?)", worldHandle, pack, worldHandle);
      }
    });
    this.initialized = true;
  }

  private async initializeStored(): Promise<void> {
    if (this.initialized) return;
    if (!this.hasHostTable()) return;
    const row = this.owner.sql
      .exec<HostRow>("SELECT * FROM hive_public_host WHERE singleton=1")
      .toArray()[0];
    if (!row) return;
    const world = this.owner.sql.exec<WorldRow>("SELECT * FROM hive_public_world WHERE singleton=1").toArray()[0];
    if (world) await this.initializeColony(world.world_handle, world.invite_hash);
    else await this.initialize(row.pack as PublicPack, row.token_hash);
  }

  private hostRow(): HostRow | undefined {
    return this.owner.sql
      .exec<HostRow>("SELECT * FROM hive_public_host WHERE singleton=1")
      .toArray()[0];
  }

  private hasHostTable(): boolean {
    return (
      this.owner.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='hive_public_host'",
        )
        .toArray().length > 0
    );
  }

  private async inTransaction<T>(operation: () => T | Promise<T>): Promise<T> {
    return this.state.storage.transaction(async () => await operation());
  }

  private serial<T>(operation: () => T | Promise<T>): Promise<T> {
    const run = this.residentQueue.then(operation, operation);
    this.residentQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private nextDue(row: HostRow, now: number) {
    if (row.paused || row.lease_until_ms === null || row.lease_until_ms <= now)
      return null;
    if (row.due_sequence !== null) return row;
    const sequence = row.next_sequence;
    const request = JSON.stringify(clockRequest(sequence));
    const deadline = now + STEP_MS;
    this.owner.sql.exec(
      "UPDATE hive_public_host SET due_sequence=?,due_request_json=?,due_deadline_ms=? WHERE singleton=1",
      sequence,
      request,
      deadline,
    );
    return {
      ...row,
      due_sequence: sequence,
      due_request_json: request,
      due_deadline_ms: deadline,
    };
  }

  private alarmAt(row: HostRow): number | null {
    const socketDeadline = this.socketAlarmAt();
    const clockDeadline = row.lease_until_ms !== null && row.due_deadline_ms !== null
      ? Math.min(row.lease_until_ms, row.due_deadline_ms) : null;
    const values = [socketDeadline, clockDeadline].filter((value): value is number => value !== null);
    return values.length === 0 ? null : Math.min(...values);
  }

  private socketAlarmAt(): number | null {
    const deadlines = this.state.getWebSockets().map((socket) => {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      return attachment?.retired ? null : attachment?.authDeadline;
    }).filter((value): value is number => value !== null && value !== undefined);
    return deadlines.length === 0 ? null : Math.min(...deadlines);
  }

  private expireUnauthenticated(now: number): void {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || attachment.authenticated || attachment.retired || attachment.authDeadline === null || attachment.authDeadline === undefined || attachment.authDeadline > now) continue;
      socket.serializeAttachment({ ...attachment, retired: true });
      try { socket.close(1008, "authentication timeout"); } catch {}
    }
  }

  private async arm(row: HostRow): Promise<void> {
    const at = this.alarmAt(row);
    if (at === null) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(at);
  }

  private async renewLease(now: number): Promise<void> {
    return this.serial(() => this.renewLeaseExclusive(now));
  }

  private async renewLeaseExclusive(now: number): Promise<void> {
    await this.inTransaction(async () => {
      const current = this.hostRow();
      if (!current) throw new Error("public-host-state");
      validateHostRow(current);
      const lease = now + LEASE_MS;
      this.owner.sql.exec(
        "UPDATE hive_public_host SET lease_until_ms=? WHERE singleton=1",
        lease,
      );
      const renewed = { ...current, lease_until_ms: lease };
      const next =
        this.nextDue(renewed, now) ??
        renewed;
      await this.arm(next);
    });
  }

  private observationPayload(): PublicObservationPayload {
    const committed = this.region.readCommitted();
    const cached = this.observationCache;
    if (cached?.revision === committed.revision) return cached.payload;
    const payload = this.resident.observe(committed.revision, committed.state, this.residentRecords(committed.revision), (session) => {
      const observation = buildObservation(session, {
        epoch: 0,
        sequence: committed.revision,
      });
      return { revision: committed.revision, observation };
    });
    this.observationCache = { revision: committed.revision, payload };
    return payload;
  }

  private residentRecords(revision: number) {
    let records: Map<string, Uint8Array> | undefined;
    return { read: (key: string) => {
      if (!records) {
        records = new Map();
        let cursor = "";
        for (;;) {
          const page = this.region.readRecords(revision, cursor, 40);
          for (const record of page.records) records.set(record.key, record.bytes);
          if (records.size > 40) throw new Error("public-kernel-record-limit");
          if (page.nextKey === undefined) break;
          if (page.nextKey <= cursor) throw new Error("public-kernel-record-cursor");
          cursor = page.nextKey;
        }
      }
      return records.get(key);
    } };
  }

  private async observationResponse(): Promise<Response> {
    return Response.json(await this.queuedObservationPayload());
  }

  private queuedObservationPayload(): Promise<PublicObservationPayload> {
    return this.serial(() => this.observationPayload());
  }

  private sendObservation(
    socket: WebSocket,
    payload: PublicObservationPayload,
    attachment: SocketAttachment,
    forceComplete = false,
  ): boolean {
    const terrain = payload.observation.terrain;
    const wireTerrain = terrain && !forceComplete
      ? terrainWireForRevision(terrain, attachment.terrainRevision)
      : terrain;
    const observation = {
      ...payload.observation,
      ...(wireTerrain === terrain ? {} : { terrain: wireTerrain }),
      ...(forceComplete || attachment.whistleRevision !== payload.observation.whistleRevision
        ? { whistleAgent: payload.observation.whistleAgent, whistleTargets: payload.observation.whistleTargets }
        : { whistleAgent: undefined, whistleTargets: undefined }),
    };
    const wirePayload = { ...payload, observation };
    const encoded = JSON.stringify({ type: "observation", ...wirePayload });
    if (new TextEncoder().encode(encoded).byteLength > MAX_OBSERVATION_BYTES) {
      try { socket.close(1009, "observation too large"); } catch {}
      return false;
    }
    try {
      socket.send(encoded);
    } catch {
      return false;
    }
    const nextAttachment: SocketAttachment = {
      ...attachment,
      terrainRevision: terrain?.revision,
      whistleRevision: payload.observation.whistleRevision,
    };
    if (nextAttachment.terrainRevision !== attachment.terrainRevision ||
        nextAttachment.whistleRevision !== attachment.whistleRevision)
      socket.serializeAttachment(nextAttachment);
    return true;
  }

  private publishObservation(): Promise<void> {
    return this.serial(() => {
      const payload = this.observationPayload();
      let failed = false;
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (!attachment?.authenticated || attachment.pack !== this.pack || (!this.colonyWorld && attachment.tokenHash !== this.tokenHash)) continue;
        if (!this.sendObservation(socket, payload, attachment)) failed = true;
      }
      if (failed) throw new Error("observation publication failed");
    });
  }

  private reportPublicationFailure(error: unknown): void {
    console.error("public observation publication failed", error);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.authenticated || attachment.pack !== this.pack || (!this.colonyWorld && attachment.tokenHash !== this.tokenHash)) continue;
      try { socket.send(JSON.stringify({ type: "error", error: "observation-publication-failed" })); } catch {}
    }
  }

  private queueObservationPublication(): Promise<void> {
    return this.publicationQueue.request();
  }

  private async command(input: PublicCommandInput, now: number, principal = `${this.pack}-player`) {
    return this.serial(() => this.commandExclusive(input, now, principal));
  }

  private async commandExclusive(input: PublicCommandInput, now: number, principal = `${this.pack}-player`) {
    if (commandKind(input) === "step") throw new Error("public-step-forbidden");
    try {
      const result = await this.inTransaction(async () => {
        const committed = this.region.readCommitted();
        this.resident.begin(committed.revision, committed.state, this.residentRecords(committed.revision));
        const receipt = this.region.dispatch(principal, input);
        const current = this.hostRow();
        if (!current) throw new Error("public-host-state");
        validateHostRow(current);
        let next = { ...current, lease_until_ms: now + LEASE_MS };
        const paused = this.region.readCommitted().state.session.paused;
        if (receipt.status === "applied" && paused) {
          this.owner.sql.exec(
            "UPDATE hive_public_host SET paused=1,lease_until_ms=?,due_sequence=NULL,due_request_json=NULL,due_deadline_ms=NULL WHERE singleton=1",
            now + LEASE_MS,
          );
          next = {
            ...next,
            paused: 1,
            due_sequence: null,
            due_request_json: null,
            due_deadline_ms: null,
          };
        } else if (receipt.status === "applied" && !paused) {
          this.owner.sql.exec(
            "UPDATE hive_public_host SET paused=0,lease_until_ms=? WHERE singleton=1",
            now + LEASE_MS,
          );
          next = { ...next, paused: 0 };
        } else {
          this.owner.sql.exec(
            "UPDATE hive_public_host SET lease_until_ms=? WHERE singleton=1",
            now + LEASE_MS,
          );
        }
        const armed = this.nextDue(next, now) ?? next;
        await this.arm(armed);
        return { receipt, row: armed };
      });
      this.resident.accept(this.region.readCommitted().revision);
      return result;
    } catch (error) {
      try { this.resident.discard(); } catch {}
      throw error;
    }
  }

  private async joinColony(credentialHash: string, inviteHash: string, now: number) {
    return this.serial(async () => {
      if (!this.colonyWorld) throw new Error("public-capability-conflict");
      const existing = this.owner.sql.exec<ParticipantRow>("SELECT * FROM hive_public_participants WHERE credential_hash=?", credentialHash).toArray()[0];
      if (existing) return { player: existing.player_id, party: existing.party_id, people: this.partyPeople(existing.party_id) };
      const bindingId = await colonyBindingId(this.worldHandle, credentialHash);
      const player = `player:${bindingId.slice(0, 24)}`;
      const party = `party:${bindingId.slice(0, 24)}`;
      const spawn = this.safeColonySpawn();
      if (!spawn) throw new Error("spawn-unavailable");
      const plan = createColonyPartyPlan(player, party as EntityId, spawn);
      let revision: number | undefined;
      try {
        const result = await this.inTransaction(async () => {
          const committed = this.region.readCommitted();
          this.resident.begin(committed.revision, committed.state, this.residentRecords(committed.revision));
          revision = this.region.readCommitted().revision;
          const people = plan.people.map(String);
          const joined = await runColonyJoinTransaction({ transaction: operation => Promise.resolve(operation()), owner: this.owner, credentialHash, principal: participantPrincipal(credentialHash), bindingId, player, party, people, dispatch: () => this.region.dispatch(`${this.pack}-host`, { id: `join:${credentialHash}`, command: { kind: "action", action: establishParty(bindingId, player, party as EntityId, plan.records) } }) });
          await this.arm(this.hostRow()!);
          return joined;
        });
        this.resident.accept(revision!);
        return { player: result.player, party: result.party, people: result.people };
      } catch (error) {
        try { this.resident.discard(); } catch {}
        throw error;
      }
    });
  }

  private safeColonySpawn(): { x: number; y: number; z: number } | null {
    const committed = this.region.readCommitted();
    return this.resident.observe(committed.revision, committed.state, this.residentRecords(committed.revision), session => {
      for (let z = -8; z <= 24; z++) for (let x = -8; x <= 24; x++) {
        const columns: [number, number][] = [[x, z], [x + 2, z], [x, z + 2]];
        const surfaces = session.terrainSurfaces(columns);
        if (surfaces.some(surface => !surface || surface.cell[1] !== surfaces[0]?.cell[1])) continue;
        const y = (surfaces[0]!.cell[1] + 0.5) * 0.54;
        const occupied = session.query(query(Position)).some(row => {
          const p = row.get(Position);
          return columns.some(([cx, cz]) => Math.hypot(p.x - cx, p.z - cz) < 0.75);
        });
        if (!occupied) return { x, y, z };
      }
      return null;
    });
  }

  private partyPeople(party: string): string[] {
    const committed = this.region.readCommitted();
    return this.resident.observe(committed.revision, committed.state, this.residentRecords(committed.revision), session =>
      session.query(query(PartyMember)).filter(row => row.get(PartyMember).party === party as never).map(row => String(row.id))
    );
  }

  private async runDue(now: number): Promise<void> {
    return this.serial(() => this.runDueExclusive(now));
  }

  private async runDueExclusive(now: number): Promise<void> {
    try {
      let acceptedRevision: number | undefined;
      await this.inTransaction(async () => {
      const stored = this.hostRow();
      if (!stored) throw new Error("public-host-state");
      let row: HostRow = stored;
      validateHostRow(row);
      const committed = this.region.readCommitted();
      this.resident.begin(committed.revision, committed.state, this.residentRecords(committed.revision));
      acceptedRevision = committed.revision;
      if (
        row.paused ||
        row.lease_until_ms === null ||
        row.lease_until_ms <= now ||
        row.due_sequence === null ||
        row.due_request_json === null ||
        row.due_deadline_ms === null
      ) {
        this.owner.sql.exec(
          "UPDATE hive_public_host SET due_sequence=NULL,due_request_json=NULL,due_deadline_ms=NULL WHERE singleton=1",
        );
        const cleared = {
          ...row,
          due_sequence: null,
          due_request_json: null,
          due_deadline_ms: null,
        };
        await this.arm(cleared);
        return cleared;
      }
      // One durable occurrence per alarm keeps player requests serviceable.
      // The next occurrence retains its scheduled deadline and identity.
      const dueDeadline = row.due_deadline_ms;
      if (dueDeadline === null || row.due_request_json === null || row.due_sequence === null) throw new Error("public-host-format");
      if (dueDeadline > now) {
        acceptedRevision = this.region.readCommitted().revision;
        await this.arm(row);
        return row;
      }
      const request = JSON.parse(row.due_request_json);
      this.region.dispatchOccurrence(`${this.pack}-host`, {
        sequence: row.due_sequence,
        request,
      });
      const next = advanceClockOccurrence(row.due_sequence, dueDeadline);
      this.owner.sql.exec(
        "UPDATE hive_public_host SET next_sequence=?,due_sequence=?,due_request_json=?,due_deadline_ms=? WHERE singleton=1",
        next.sequence,
        next.sequence,
        next.request,
        next.deadline,
      );
      const advanced: HostRow = {
        ...row,
        next_sequence: next.sequence,
        due_sequence: next.sequence,
        due_request_json: next.request,
        due_deadline_ms: next.deadline,
      };
      row = advanced;
      await this.arm(row);
      acceptedRevision = this.region.readCommitted().revision;
      return row;
      });
      if (acceptedRevision !== undefined) this.resident.accept(acceptedRevision);
    } catch (error) {
      try { this.resident.discard(); } catch {}
      throw error;
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    const now = Date.now();
    this.expireUnauthenticated(now);
    if (this.startupFailure) {
      const next = this.socketAlarmAt();
      if (next === null) await this.state.storage.deleteAlarm();
      else await this.state.storage.setAlarm(next);
      return;
    }
    if (!this.hasHostTable() || !this.hostRow()) {
      const next = this.socketAlarmAt();
      if (next === null) await this.state.storage.deleteAlarm();
      else await this.state.storage.setAlarm(next);
      return;
    }
    await this.initializeStored();
    if (!this.initialized) return;
    await this.runDue(now);
    if (this.initialized) this.state.waitUntil(this.queueObservationPublication());
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ready;
    if (this.startupFailure) {
      try { socket.send(JSON.stringify({ type: "error", error: this.startupFailure })); socket.close(1011, this.startupFailure); } catch {}
      return;
    }
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > 8_192) {
      try { socket.close(1009, "message too large"); } catch {}
      return;
    }
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      try { socket.close(1008, "missing socket attachment"); } catch {}
      return;
    }
    if (!attachment.authenticated && (attachment.retired || (attachment.authDeadline !== null && attachment.authDeadline !== undefined && attachment.authDeadline <= Date.now()))) {
      socket.serializeAttachment({ ...attachment, retired: true, authDeadline: null });
      try { socket.close(1008, "authentication timeout"); } catch {}
      return;
    }
    if (attachment?.authenticated) {
      try {
        const parsed = typeof message === "string" ? JSON.parse(message) as Record<string, unknown> : null;
        if (parsed?.type === "heartbeat" && Object.keys(parsed).length === 1) {
          await this.renewLease(Date.now());
          const payload = await this.queuedObservationPayload();
          this.sendObservation(socket, payload, attachment);
          return;
        }
      } catch { /* malformed heartbeat is rejected below */ }
      try { socket.send(JSON.stringify({ type: "error", error: "public-socket-message-unsupported" })); } catch {}
      return;
    }
    try {
      const auth = readSocketMessage(message);
      const tokenHash = await sha256Hex(auth.token);
      if (!attachment?.pack) throw new Error("public-socket-state");
      if (this.colonyWorld) {
        const participant = this.owner.sql.exec<ParticipantRow>("SELECT principal FROM hive_public_participants WHERE credential_hash=?", tokenHash).toArray()[0];
        if (!participant) throw new Error("public-unauthorized");
      } else await this.initialize(attachment.pack, tokenHash);
      socket.serializeAttachment({ pack: attachment.pack, tokenHash, authenticated: true, authDeadline: null } satisfies SocketAttachment);
      await this.renewLease(Date.now());
      socket.send(JSON.stringify({ type: "ready", game: attachment.pack }));
      const authenticated = socket.deserializeAttachment() as SocketAttachment;
      const payload = await this.queuedObservationPayload();
      this.sendObservation(socket, payload, authenticated, true);
    } catch (error) {
      try { socket.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "public-socket-auth-failed" })); } catch {}
      socket.close(1008, "authentication failed");
    }
  }

  webSocketClose(socket: WebSocket): void {
    try { socket.close(); } catch {}
  }
  webSocketError(socket: WebSocket): void { this.webSocketClose(socket); }

  async fetch(request: Request): Promise<Response> {
    const origin = this.hostEnv.PUBLIC_ORIGIN;
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: request.headers.get("Origin") === origin ? 204 : 403,
        headers: new Headers({
          ...Object.fromEntries(corsHeaders(origin)),
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
        }),
      });
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== origin
    )
      return jsonResponse({ error: "public-origin-forbidden" }, 403, origin);
    const pathname = new URL(request.url).pathname;
    const worldRoute = colonyWorldRoute(pathname);
    const pack = packFromPath(pathname);
    if (worldRoute) {
      if (worldRoute.operation === "socket" && request.method === "GET") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return jsonResponse({ error: "websocket-upgrade-required" }, 426, origin);
        await this.initializeColony(worldRoute.world, worldRoute.world);
        const pair = new WebSocketPair();
        const server = pair[1];
        const sockets = this.state.getWebSockets();
        if (sockets.length >= 64 || sockets.filter(candidate => !(candidate.deserializeAttachment() as SocketAttachment | null)?.authenticated).length >= 32) return jsonResponse({ error: "public-socket-capacity" }, 429, origin);
        const deadline = Date.now() + 5_000;
        server.serializeAttachment({ pack: "colony", tokenHash: "", authenticated: false, authDeadline: deadline } satisfies SocketAttachment);
        this.state.acceptWebSocket(server);
        await this.state.storage.setAlarm(deadline);
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      try {
        const credential = tokenFromRequest(request);
        const credentialHash = await sha256Hex(credential);
        await this.initializeColony(worldRoute.world, worldRoute.world);
        if (worldRoute.operation === "join" && request.method === "POST") {
          const input = await readColonyJoin(request);
          const inviteHash = await sha256Hex(input.invite);
          if (inviteHash !== worldRoute.world) throw new Error("public-unauthorized");
          return jsonResponse(await this.joinColony(credentialHash, inviteHash, Date.now()), 200, origin);
        }
        if (worldRoute.operation === "observe" && request.method === "GET") {
          const participant = this.owner.sql.exec<ParticipantRow>("SELECT * FROM hive_public_participants WHERE credential_hash=?", credentialHash).toArray()[0];
          if (!participant) throw new Error("public-unauthorized");
          await this.renewLease(Date.now());
          return withCors(await this.observationResponse(), origin);
        }
        if (worldRoute.operation === "command" && request.method === "POST") {
          const participant = this.owner.sql.exec<ParticipantRow>("SELECT * FROM hive_public_participants WHERE credential_hash=?", credentialHash).toArray()[0];
          if (!participant) throw new Error("public-unauthorized");
          const result = await this.command(await readCommand(request), Date.now(), participant.principal);
          this.state.waitUntil(this.queueObservationPublication());
          return withCors(Response.json(result.receipt), origin);
        }
        return jsonResponse({ error: "not-found" }, 404, origin);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const status = message === "public-unauthorized" ? 403 : message === "region-command-conflict" ? 409 : message === "public-body-too-large" ? 413 : 400;
        return jsonResponse({ error: status === 403 ? "forbidden" : status === 409 ? "conflict" : status === 413 ? "body-too-large" : "bad-request" }, status, origin);
      }
    }
    if (!pack) return jsonResponse({ error: "not-found" }, 404, origin);
    try {
      await this.ready;
      if (this.startupFailure) throw new Error(this.startupFailure);
      if (new URL(request.url).pathname.includes("/socket/") && request.method === "GET") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return jsonResponse({ error: "websocket-upgrade-required" }, 426, origin);
        const pair = new WebSocketPair();
        const server = pair[1];
        const sockets = this.state.getWebSockets();
        const unauthenticated = sockets.filter((candidate) => {
          const attachment = candidate.deserializeAttachment() as SocketAttachment | null;
          return !attachment?.authenticated;
        });
        if (sockets.length >= 64 || unauthenticated.length >= 32) return jsonResponse({ error: "public-socket-capacity" }, 429, origin);
        const deadline = Date.now() + 5_000;
        server.serializeAttachment({ pack, tokenHash: "", authenticated: false, authDeadline: deadline } satisfies SocketAttachment);
        this.state.acceptWebSocket(server);
        const row = this.hasHostTable() ? this.hostRow() : undefined;
        if (row) await this.arm(row);
        else await this.state.storage.setAlarm(this.socketAlarmAt() ?? deadline);
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      const token = tokenFromRequest(request);
      const tokenHash = await sha256Hex(token);
      await this.initialize(pack, tokenHash);
      const now = Date.now();
      if (new URL(request.url).pathname.endsWith("/connect") && request.method === "GET")
        return withCors(Response.json({ handle: this.state.id.toString() }), origin);
      if (
        new URL(request.url).pathname.endsWith("/observe") &&
        request.method === "GET"
      ) {
        await this.renewLease(now);
        return withCors(await this.observationResponse(), origin);
      }
      if (
        new URL(request.url).pathname.endsWith("/command") &&
        request.method === "POST"
      ) {
        const input = await readCommand(request);
        const result = await this.command(input, now);
        this.state.waitUntil(this.queueObservationPublication());
        return withCors(Response.json(result.receipt), origin);
      }
      return jsonResponse({ error: "not-found" }, 404, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const status =
        message === "public-unauthorized" ||
        message === "public-capability-conflict"
          ? 403
          : message === "region-command-conflict"
            ? 409
            : message === "public-body-too-large"
              ? 413
              : message === "unsupported-world" || message === "world-unavailable"
                ? 503
              : 400;
      return jsonResponse(
        {
          error:
            status === 403
              ? "forbidden"
              : status === 409
                ? "conflict"
                : status === 413
                  ? "body-too-large"
                  : status === 503
                    ? message
                  : "bad-request",
        },
        status,
        origin,
      );
    }
  }
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    const pack = packFromPath(url.pathname);
    const origin = env.PUBLIC_ORIGIN;
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: request.headers.get("Origin") === origin ? 204 : 403,
        headers: new Headers({
          ...Object.fromEntries(corsHeaders(origin)),
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
        }),
      });
    const worldRoute = colonyWorldRoute(url.pathname);
    if (worldRoute) {
      const id = env.REGIONS.idFromName(`colony-party-v1:${worldRoute.world}`);
      return await env.REGIONS.get(id).fetch(request);
    }
    if (!pack) return jsonResponse({ error: "not-found" }, 404, origin);
    try {
      const handle = socketHandleFromPath(url.pathname);
      if (handle && request.method === "GET") {
        const id = env.REGIONS.idFromString(handle);
        return await env.REGIONS.get(id).fetch(request);
      }
      const token = tokenFromRequest(request);
      const hash = await sha256Hex(token);
      if (url.pathname.endsWith("/connect") && request.method === "GET") {
        const id = env.REGIONS.idFromName(`${pack}:${hash}`);
        return await env.REGIONS.get(id).fetch(request);
      }
      const id = env.REGIONS.idFromName(`${pack}:${hash}`);
      return await env.REGIONS.get(id).fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return jsonResponse(
        {
          error:
            message === "public-unauthorized" ? "forbidden" : "bad-request",
        },
        message === "public-unauthorized" ? 403 : 400,
        origin,
      );
    }
  },
};
