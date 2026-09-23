import { DurableObject } from "cloudflare:workers";
import { terrainRegionRequestSchema } from "../../engine/src/runtime/terrain-regions";
import { startTerrainRegionStream } from "../../engine/src/runtime/terrain-region-stream";
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
import { colonyServerPack } from "../../engine/src/games/colony";
import { createColonyFrameworkProofPack, createColonyFrameworkProofV2Pack, createColonyPerformancePack } from "../../engine/src/games/colony-performance";
import { colonyFrameworkProofGameId, colonyFrameworkProofV2GameId, parseColonyPerformanceGameId } from "../../engine/src/games/colony-performance-config";
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
  readColonyJoin,
  readPlacementDecision,
  colonyWorldRoute,
  readColonySocketMessage,
  tokenFromRequest,
  withCors,
  type PublicCommandInput,
  type PublicPack,
  readSocketMessage,
  socketHandleFromPath,
} from "./protocol";
import wasmBytes from "../../engine/generated/hive_kernel_bg.wasm";
import { createPublicationQueue } from "./publication-queue";
import { advanceClockOccurrence } from "./clock-schedule";
import { createFrameworkCostLedger, type SqlCost } from "./framework-cost-ledger";
import { MAX_KERNEL_RECORDS } from "../../engine/src/runtime/kernel-records";

type Environment = {
  REGIONS: DurableObjectNamespace;
  IMPLEMENTATION_HASH: string;
  PUBLIC_ORIGIN: string;
  TEST_FAILURE_AFTER_JOIN?: string;
  TEST_DROP_JOIN_RESPONSE?: string;
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
type ParticipantRow = { credential_hash: string; principal: string; player_id: string; party_id: import("../../engine/src/contracts").EntityId };
type PartyJoinResult = { player: string; party: ParticipantRow["party_id"]; people: string[] };
function participantRow(value: unknown): ParticipantRow {
  if (!value || typeof value !== "object") throw new Error("public-participant-format");
  const row = value as Record<string, unknown>;
  if (typeof row.credential_hash !== "string" || !/^[a-f0-9]{64}$/.test(row.credential_hash) ||
      typeof row.principal !== "string" || row.principal !== `participant:${row.credential_hash}` ||
      typeof row.player_id !== "string" || !/^[A-Za-z0-9._:-]{1,96}$/.test(row.player_id) ||
      typeof row.party_id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(row.party_id)) throw new Error("public-participant-format");
  return { credential_hash: row.credential_hash, principal: row.principal, player_id: row.player_id, party_id: row.party_id as ParticipantRow["party_id"] };
}
function partyJoinResult(value: unknown): PartyJoinResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("public-party-join-result");
  const row = value as Record<string, unknown>;
  if (typeof row.player !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(row.player) || typeof row.party !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(row.party) || !Array.isArray(row.people) || row.people.length > 32 || !row.people.every(person => typeof person === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(person))) throw new Error("public-party-join-result");
  const people = row.people as string[];
  for (let index = 1; index < people.length; index += 1) if (people[index - 1] >= people[index]) throw new Error("public-party-join-result");
  return { player: row.player, party: row.party as ParticipantRow["party_id"], people };
}
type SocketAttachment = {
  readonly pack: PublicPack;
  readonly worldHandle: string;
  readonly principal: string;
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
/** Region reads are paged separately from the native snapshot's total bound. */
const RECORD_PAGE_SIZE = 40;

function packFor(pack: PublicPack) {
  if (pack === colonyFrameworkProofGameId) return createColonyFrameworkProofPack();
  if (pack === colonyFrameworkProofV2GameId) return createColonyFrameworkProofV2Pack();
  const preset = parseColonyPerformanceGameId(pack);
  if (preset) return createColonyPerformancePack(preset.size, preset.workers);
  switch (pack) {
    case "survival":
      return survivalPack;
    case "pirates":
      return piratesPack;
    case "colony":
      return colonyServerPack;
    case "formations":
      return formationsPack;
    default:
      throw new Error("public-host-format");
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
  private worldHandle: string | undefined;
  private readonly owner: RegionSqliteOwner;
  private initialized = false;
  private startupFailure: string | undefined;
  private readonly ready: Promise<void>;
  private residentQueue: Promise<void> = Promise.resolve();
  private readonly terrainStreams = new Map<WebSocket, ReturnType<typeof startTerrainRegionStream>>();
  private readonly publicationQueue: ReturnType<typeof createPublicationQueue>;
  private observationCache: {
    readonly revision: number;
    readonly payload: PublicObservationPayload;
  } | undefined;
  private proofLedger: ReturnType<typeof createFrameworkCostLedger> | undefined;
  private activeSqlCost: SqlCost | undefined;

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
          const sample = this.activeSqlCost;
          const started = sample ? performance.now() : 0;
          const cursor = state.storage.sql.exec(statement, ...bindings);
          let read = 0, written = 0;
          const account = () => {
            if (!sample) return;
            sample.rowsRead += cursor.rowsRead - read;
            sample.rowsWritten += cursor.rowsWritten - written;
            read = cursor.rowsRead;
            written = cursor.rowsWritten;
          };
          if (sample) {
            sample.statements++;
            sample.sqlWallMs += performance.now() - started;
            account();
          }
          return { toArray: () => {
            const readStarted = performance.now();
            const rows = cursor.toArray() as Row[];
            if (sample) {
              sample.sqlWallMs += performance.now() - readStarted;
              account();
            }
            return rows;
          } };
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
          if (persisted) await this.initializeCore(persisted.pack as PublicPack, persisted.token_hash);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        this.startupFailure = ["region-identity-conflict", "public-capability-conflict", "public-host-format"].includes(message) ? "unsupported-world" : "world-unavailable";
      }
    });
  }

  private async initialize(pack: PublicPack, tokenHash: string): Promise<void> {
    const name = pack === "colony" ? `colony-party-v1:${tokenHash}` : `${pack}:${tokenHash}`;
    const expectedId = this.hostEnv.REGIONS.idFromName(name);
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

  private async initializeCore(
    pack: PublicPack,
    tokenHash: string,
  ): Promise<void> {
    const game = packFor(pack);
    this.proofLedger = pack === colonyFrameworkProofGameId || pack === colonyFrameworkProofV2GameId
      ? createFrameworkCostLedger(this.hostEnv.IMPLEMENTATION_HASH, pack) : undefined;
    if (pack === "colony") this.owner.transactionSync(() => {
      this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_participants (
        credential_hash TEXT PRIMARY KEY, principal TEXT NOT NULL UNIQUE,
        player_id TEXT NOT NULL UNIQUE, party_id TEXT NOT NULL UNIQUE);`);
      this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_world (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), world_handle TEXT NOT NULL UNIQUE,
        pack TEXT NOT NULL, invite_hash TEXT NOT NULL);`);
    });
    const hostPrincipal = `${pack}-host`;
    const playerPrincipal = `${pack}-player`;
    const runtime = createSessionRegionRuntime({
      pack: game,
      createKernel: () => wasmKernelPort(new WasmKernel()),
      implementationHash: this.hostEnv.IMPLEMENTATION_HASH,
      ownerPrincipal: playerPrincipal,
      hostPrincipal,
      clockControllerPrincipals: parseColonyPerformanceGameId(pack) || pack === colonyFrameworkProofGameId || pack === colonyFrameworkProofV2GameId ? [playerPrincipal] : [],
      seed: 17,
      scopeForPrincipal: (principal) => {
        if (principal === hostPrincipal) return { kind: "host" };
        if (pack !== "colony" && principal === playerPrincipal) return game.localScope ?? null;
        const raw = this.owner.sql.exec("SELECT credential_hash,principal,player_id,party_id FROM hive_public_participants WHERE principal=?", principal).toArray()[0];
        if (!raw) return null;
        const participant = participantRow(raw);
        return { kind: "player", player: participant.player_id };
      },
    });
    this.resident = runtime.resident;
    const program = runtime.program;
    this.pack = pack;
    this.tokenHash = tokenHash;
    this.worldHandle = pack === "colony" ? tokenHash : undefined;
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
      if (pack === "colony") this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_participants (
        credential_hash TEXT PRIMARY KEY, principal TEXT NOT NULL UNIQUE,
        player_id TEXT NOT NULL UNIQUE, party_id TEXT NOT NULL UNIQUE);`);
      if (pack === "colony") this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_public_world (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), world_handle TEXT NOT NULL UNIQUE,
        pack TEXT NOT NULL, invite_hash TEXT NOT NULL);`);
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
    await this.initialize(row.pack as PublicPack, row.token_hash);
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
          const page = this.region.readRecords(revision, cursor, RECORD_PAGE_SIZE);
          for (const record of page.records) records.set(record.key, record.bytes);
          if (records.size > MAX_KERNEL_RECORDS) throw new Error("public-kernel-record-limit");
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
    onEncoded?: (bytes: number) => void,
  ): boolean {
    const terrain = payload.observation.terrain;
    const changes = terrain && attachment.terrainRevision !== undefined && attachment.terrainRevision !== terrain.revision
      ? this.resident.observe(payload.revision, this.region.readCommitted().state, this.residentRecords(payload.revision), session => session.terrainChanges(attachment.terrainRevision!))
      : undefined;
    const wireTerrain = terrain && !forceComplete
      ? terrainWireForRevision(terrain, attachment.terrainRevision, changes)
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
    const encodedBytes = new TextEncoder().encode(encoded).byteLength;
    onEncoded?.(encodedBytes);
    if (encodedBytes > MAX_OBSERVATION_BYTES) {
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
      const recipients = this.state.getWebSockets().flatMap(socket => {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        return attachment?.authenticated && attachment.pack === this.pack &&
          attachment.worldHandle === (this.worldHandle ?? this.tokenHash)
          ? [{ socket, attachment }] : [];
      });
      if (recipients.length === 0) {
        this.proofLedger?.publication({ revision: this.region.readCommitted().revision,
          recipients: 0, buildWallMs: 0, sendWallMs: 0, encodedBytes: 0 });
        return;
      }
      const buildStarted = performance.now();
      const payload = this.observationPayload();
      const buildWallMs = performance.now() - buildStarted;
      const sendStarted = performance.now();
      let failed = false;
      let encodedBytes = 0;
      for (const { socket, attachment } of recipients) {
        if (!this.sendObservation(socket, payload, attachment, false, bytes => { encodedBytes += bytes; })) failed = true;
      }
      this.proofLedger?.publication({ revision: payload.revision, recipients: recipients.length,
        buildWallMs, sendWallMs: performance.now() - sendStarted, encodedBytes });
      if (failed) throw new Error("observation publication failed");
    });
  }

  private reportPublicationFailure(error: unknown): void {
    console.error("public observation publication failed", error);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.authenticated || attachment.pack !== this.pack || attachment.worldHandle !== (this.worldHandle ?? this.tokenHash)) continue;
      try { socket.send(JSON.stringify({ type: "error", error: "observation-publication-failed" })); } catch {}
    }
  }

  private queueObservationPublication(): Promise<void> {
    return this.publicationQueue.request();
  }

  private async command(input: PublicCommandInput, now: number) {
    return this.serial(() => this.commandExclusive(input, now));
  }

  private async commandExclusive(input: PublicCommandInput, now: number, principal = `${this.pack}-player`, inTransaction = false) {
    if (commandKind(input) === "step") throw new Error("public-step-forbidden");
    try {
      const operation = async () => {
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
      };
      const result = inTransaction ? await operation() : await this.inTransaction(operation);
      if (!inTransaction) this.resident.accept(this.region.readCommitted().revision);
      return result;
    } catch (error) {
      try { this.resident.discard(); } catch {}
      throw error;
    }
  }

  private participant(credentialHash: string): ParticipantRow | undefined {
    const raw = this.owner.sql.exec(
      "SELECT credential_hash,principal,player_id,party_id FROM hive_public_participants WHERE credential_hash=?",
      credentialHash,
    ).toArray()[0];
    return raw ? participantRow(raw) : undefined;
  }

  /** Admission and the Region party establishment share the DO transaction. */
  private async joinColony(invite: string, credential: string, now: number) {
    const credentialHash = await sha256Hex(credential);
    const principal = `participant:${credentialHash}`;
    return this.serial(async () => {
      try {
      const result = await this.inTransaction(async () => {
        const world = this.owner.sql.exec<{ world_handle: string; pack: string; invite_hash: string }>(
          "SELECT world_handle,pack,invite_hash FROM hive_public_world WHERE singleton=1",
        ).toArray()[0];
        const inviteHash = await sha256Hex(invite);
        if (world && (world.world_handle !== this.worldHandle || world.pack !== "colony" || world.invite_hash !== inviteHash))
          throw new Error("public-invite-forbidden");
        if (!world) this.owner.sql.exec("INSERT INTO hive_public_world VALUES (1,?,?,?)", this.worldHandle!, "colony", inviteHash);
        const bindingId = await sha256Hex(`hive:colony:join:${this.worldHandle}:${credentialHash}`);
        const command = { id: `join:${bindingId}`, command: { kind: "join-party", credentialBindingId: bindingId } };
        const result = await this.commandExclusive(command, now, "colony-host", true);
        if (this.hostEnv.TEST_FAILURE_AFTER_JOIN === "1") throw new Error("test-join-injected-failure");
        const join = partyJoinResult((result.receipt.result as { results?: unknown }).results);
        const existing = this.participant(credentialHash);
        if (existing) {
          if (existing.player_id !== join.player || existing.party_id !== join.party) throw new Error("public-party-join-replay-mismatch");
          return { binding: existing, created: false, people: join.people, accepted: true };
        }
        this.owner.sql.exec("INSERT INTO hive_public_participants VALUES (?,?,?,?)", credentialHash, principal, join.player, join.party);
        return { binding: { credential_hash: credentialHash, principal, player_id: join.player, party_id: join.party } satisfies ParticipantRow, created: true, people: join.people, accepted: true };
      });
      if (result.accepted) this.resident.accept(this.region.readCommitted().revision);
      if (result.accepted && this.hostEnv.TEST_DROP_JOIN_RESPONSE === "1") throw new Error("test-join-response-lost");
      await this.renewLeaseExclusive(now);
      return { player: result.binding.player_id, party: result.binding.party_id, people: result.people };
      } catch (error) {
        try { this.resident.discard(); } catch { /* preserve transaction failure */ }
        throw error;
      }
    });
  }

  private async v2Fetch(request: Request, route: NonNullable<ReturnType<typeof colonyWorldRoute>>): Promise<Response> {
    if (route.world !== this.worldHandle) throw new Error("public-capability-conflict");
    const now = Date.now();
    if (route.operation === "join") {
      if (request.method !== "POST") return jsonResponse({ error: "not-found" }, 404, this.hostEnv.PUBLIC_ORIGIN);
      const credential = tokenFromRequest(request);
      const input = await readColonyJoin(request);
      const result = await this.joinColony(input.invite, credential, now);
      return jsonResponse(result, 200, this.hostEnv.PUBLIC_ORIGIN);
    }
    const credential = tokenFromRequest(request);
    const hash = await sha256Hex(credential);
    const binding = this.participant(hash);
    if (!binding) throw new Error("public-unauthorized");
    if (route.operation === "connect" && request.method === "GET") return jsonResponse({ handle: this.state.id.toString() }, 200, this.hostEnv.PUBLIC_ORIGIN);
    if (route.operation === "observe" && request.method === "GET") {
      await this.renewLease(now);
      return withCors(await this.observationResponse(), this.hostEnv.PUBLIC_ORIGIN);
    }
    if (route.operation === "placement" && request.method === "POST") {
      const query = await readPlacementDecision(request);
      if (query.party !== binding.party_id) throw new Error("public-unauthorized");
      const result = await this.serial(() => {
        const committed = this.region.readCommitted();
        const native = this.resident.observe(committed.revision, committed.state, this.residentRecords(committed.revision), session =>
          session.placementDecisions(binding.party_id, query.candidates));
        return { observationRevision: committed.revision, nativeRevision: native.revision, placementRevision: native.placementRevision, decisions: native.decisions };
      });
      await this.renewLease(now);
      return jsonResponse(result, 200, this.hostEnv.PUBLIC_ORIGIN);
    }
    if (route.operation === "command" && request.method === "POST") {
      const input = await readCommand(request);
      const result = await this.serial(() => this.commandExclusive(input, now, binding.principal));
      this.state.waitUntil(this.queueObservationPublication());
      return jsonResponse(result.receipt, 200, this.hostEnv.PUBLIC_ORIGIN);
    }
    return jsonResponse({ error: "not-found" }, 404, this.hostEnv.PUBLIC_ORIGIN);
  }

  private async runDue(now: number): Promise<void> {
    return this.serial(() => this.runDueExclusive(now));
  }

  private async runDueExclusive(now: number): Promise<void> {
    const sqlCost: SqlCost = { sqlWallMs: 0, rowsRead: 0, rowsWritten: 0, statements: 0 };
    this.activeSqlCost = this.proofLedger ? sqlCost : undefined;
    let dueSequence: number | null = null;
    let alarmLatenessMs = 0;
    let dispatchWallMs = 0;
    const transactionStarted = performance.now();
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
      // The next deadline is based on completion when this step overruns;
      // physical time still advances by exactly one fixed step.
      const dueDeadline = row.due_deadline_ms;
      if (dueDeadline === null || row.due_request_json === null || row.due_sequence === null) throw new Error("public-host-format");
      if (dueDeadline > now) {
        acceptedRevision = this.region.readCommitted().revision;
        await this.arm(row);
        return row;
      }
      const request = JSON.parse(row.due_request_json);
      dueSequence = row.due_sequence;
      alarmLatenessMs = Math.max(0, now - dueDeadline);
      const dispatchStarted = performance.now();
      this.region.dispatchOccurrence(`${this.pack}-host`, {
        sequence: row.due_sequence,
        request,
      });
      dispatchWallMs = performance.now() - dispatchStarted;
      const next = advanceClockOccurrence(row.due_sequence, dueDeadline, Date.now());
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
      const candidateCost = this.resident.takeCandidateCost();
      if (this.proofLedger && dueSequence !== null && acceptedRevision !== undefined && candidateCost) {
        this.proofLedger.step({ sequence: dueSequence, revision: acceptedRevision,
          alarmLatenessMs, dispatchWallMs, transactionWallMs: performance.now() - transactionStarted,
          ...candidateCost, ...sqlCost });
      }
      if (dueSequence === null) this.proofLedger?.flush();
    } catch (error) {
      try { this.resident.discard(); } catch {}
      if (this.proofLedger) this.proofLedger.failure(dueSequence, error);
      throw error;
    } finally {
      this.activeSqlCost = undefined;
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
        if (parsed?.type === "terrain-credit" && Object.keys(parsed).length === 3 && Number.isSafeInteger(parsed.requestId)) {
          const active = this.terrainStreams.get(socket);
          if (active?.requestId === parsed.requestId) active.acknowledge(parsed.received as number);
          return;
        }
        if (parsed?.type === "terrain-cancel" && Object.keys(parsed).length === 2 && Number.isSafeInteger(parsed.requestId)) {
          const active = this.terrainStreams.get(socket);
          if (active?.requestId === parsed.requestId) { active.cancel(); this.terrainStreams.delete(socket); }
          return;
        }
        if (parsed?.type === "terrain-regions") {
          const { type: _type, ...raw } = parsed;
          const request = terrainRegionRequestSchema.parse(raw);
          this.terrainStreams.get(socket)?.cancel();
          const stream = startTerrainRegionStream(request,
            key => this.serial(() => {
              const committed = this.region.readCommitted();
              return this.resident.observe(committed.revision, committed.state,
                this.residentRecords(committed.revision), session => session.terrainRegion(request, key, 0));
            }),
            event => socket.send(JSON.stringify({ type: "terrain-regions", event })));
          this.terrainStreams.set(socket, stream);
          this.state.waitUntil(stream.done.finally(() => {
            if (this.terrainStreams.get(socket) === stream) this.terrainStreams.delete(socket);
          }));
          return;
        }
        if (parsed?.type === "heartbeat" && Object.keys(parsed).length === 1) {
          await this.renewLease(Date.now());
          const payload = await this.queuedObservationPayload();
          this.sendObservation(socket, payload, attachment);
          return;
        }
      } catch { /* Malformed stream controls and heartbeats are rejected below. */ }
      try { socket.send(JSON.stringify({ type: "error", error: "public-socket-message-unsupported" })); } catch {}
      return;
    }
    try {
      const auth = attachment.pack === "colony"
        ? { token: readColonySocketMessage(message).credential }
        : readSocketMessage(message);
      const tokenHash = await sha256Hex(auth.token);
      if (!attachment?.pack) throw new Error("public-socket-state");
      if (attachment.pack === "colony") {
        if (!this.participant(tokenHash)) throw new Error("public-unauthorized");
        // Colony socket attachments retain the world routing hash. The
        // credential is checked above and is never placed in the URL.
        await this.initialize("colony", this.worldHandle!);
      } else await this.initialize(attachment.pack, tokenHash);
      const principal = attachment.pack === "colony" ? `participant:${tokenHash}` : `${attachment.pack}-player`;
      socket.serializeAttachment({ pack: attachment.pack, worldHandle: this.worldHandle ?? this.tokenHash, principal, authenticated: true, authDeadline: null } satisfies SocketAttachment);
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
    this.terrainStreams.get(socket)?.cancel(); this.terrainStreams.delete(socket);
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
    const colonyRoute = colonyWorldRoute(new URL(request.url).pathname);
    if (colonyRoute) {
      try {
        await this.ready;
        if (this.startupFailure) throw new Error(this.startupFailure);
        await this.initialize("colony", colonyRoute.world);
        if (colonyRoute.operation === "socket") {
          if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
            return jsonResponse({ error: "websocket-upgrade-required" }, 426, origin);
          const pair = new WebSocketPair();
          const server = pair[1];
          const sockets = this.state.getWebSockets();
          if (sockets.length >= 64 || sockets.filter((s) => !(s.deserializeAttachment() as SocketAttachment | null)?.authenticated).length >= 32)
            return jsonResponse({ error: "public-socket-capacity" }, 429, origin);
          server.serializeAttachment({ pack: "colony", worldHandle: colonyRoute.world, principal: "", authenticated: false, authDeadline: Date.now() + 5_000 } satisfies SocketAttachment);
          this.state.acceptWebSocket(server);
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        return this.v2Fetch(request, colonyRoute);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const forbidden = ["public-unauthorized", "public-invite-forbidden", "public-capability-conflict"].includes(message);
        return jsonResponse({ error: forbidden ? "forbidden" : "bad-request" }, forbidden ? 403 : 400, origin);
      }
    }
    const pack = packFromPath(new URL(request.url).pathname);
    if (!pack) return jsonResponse({ error: "not-found" }, 404, origin);
    try {
      await this.ready;
      if (this.startupFailure) throw new Error(this.startupFailure);
      if (new URL(request.url).pathname.includes("/socket/") && request.method === "GET") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return jsonResponse({ error: "websocket-upgrade-required" }, 426, origin);
        const pair = new WebSocketPair();
        const server = pair[1];
        const socketHandle = socketHandleFromPath(new URL(request.url).pathname);
        if (!socketHandle) throw new Error("public-socket-state");
        const sockets = this.state.getWebSockets();
        const unauthenticated = sockets.filter((candidate) => {
          const attachment = candidate.deserializeAttachment() as SocketAttachment | null;
          return !attachment?.authenticated;
        });
        if (sockets.length >= 64 || unauthenticated.length >= 32) return jsonResponse({ error: "public-socket-capacity" }, 429, origin);
        const deadline = Date.now() + 5_000;
        server.serializeAttachment({ pack, worldHandle: socketHandle, principal: "", authenticated: false, authDeadline: deadline } satisfies SocketAttachment);
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
      const operation = new URL(request.url).pathname.split("/").at(-1);
      if ((parseColonyPerformanceGameId(pack) || pack === colonyFrameworkProofGameId) && request.method === "POST" &&
          operation === "placement") {
        const query = await readPlacementDecision(request);
        // This private preset owns one pre-authored player/party. A URL or query
        // may select content, but cannot grant authority over a different party.
        if ("party" in query && query.party !== "party:1") throw new Error("public-unauthorized");
        const result = await this.serial(() => {
          const committed = this.region.readCommitted();
          return this.resident.observe(committed.revision, committed.state, this.residentRecords(committed.revision), session => {
            const native = session.placementDecisions(query.party, query.candidates);
            return { observationRevision: committed.revision, nativeRevision: native.revision,
              placementRevision: native.placementRevision, decisions: native.decisions };
          });
        });
        await this.renewLease(now);
        return jsonResponse(result, 200, origin);
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
    const colonyRoute = colonyWorldRoute(url.pathname);
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
    if (!pack && !colonyRoute) return jsonResponse({ error: "not-found" }, 404, origin);
    try {
      if (colonyRoute) {
        const id = colonyRoute.operation === "socket" && colonyRoute.socketHandle
          ? env.REGIONS.idFromString(colonyRoute.socketHandle)
          : env.REGIONS.idFromName(`colony-party-v1:${colonyRoute.world}`);
        return await env.REGIONS.get(id).fetch(request);
      }
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
