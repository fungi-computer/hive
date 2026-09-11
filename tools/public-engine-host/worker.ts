import { DurableObject } from "cloudflare:workers";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createSessionRegionRuntime, type SessionResident } from "../../engine/src/runtime/region-program";
import type { SessionRegionState } from "../../engine/src/runtime/region-program";
import { buildObservation } from "../../engine/src/runtime/observation";
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
} from "./protocol";
import wasmBytes from "../../engine/generated/hive_kernel_bg.wasm";

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
type SocketAttachment = { readonly pack: PublicPack; readonly tokenHash: string; readonly authenticated: boolean; readonly authDeadline: number | null; readonly retired?: boolean };

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
  private readonly owner: RegionSqliteOwner;
  private initialized = false;
  private startupFailure: string | undefined;
  private readonly ready: Promise<void>;
  private residentQueue: Promise<void> = Promise.resolve();

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

  private async initializeCore(
    pack: PublicPack,
    tokenHash: string,
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
    });
    this.resident = runtime.resident;
    const program = runtime.program;
    this.pack = pack;
    this.tokenHash = tokenHash;
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

  private async observe(now: number): Promise<Response> {
    return this.serial(() => this.observeExclusive(now));
  }

  private async observeExclusive(now: number): Promise<Response> {
    const row = await this.inTransaction(async () => {
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
      return next;
    });
    return this.observationResponse();
  }

  private observationPayload() {
    const committed = this.region.readCommitted();
    return this.resident.observe(committed.revision, committed.state, this.residentRecords(committed.revision), (session) => {
      const observation = buildObservation(session, {
        epoch: 0,
        sequence: committed.revision,
      });
      return { revision: committed.revision, observation };
    });
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

  private observationResponse(): Response {
    return Response.json(this.observationPayload());
  }

  private publishObservation(): Promise<void> {
    return this.serial(() => {
      const payload = JSON.stringify({ type: "observation", ...this.observationPayload() });
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (!attachment?.authenticated || attachment.pack !== this.pack || attachment.tokenHash !== this.tokenHash) continue;
        try { socket.send(payload); } catch { /* lifecycle removes failed sockets */ }
      }
    });
  }

  private async command(input: PublicCommandInput, now: number) {
    return this.serial(() => this.commandExclusive(input, now));
  }

  private async commandExclusive(input: PublicCommandInput, now: number) {
    if (commandKind(input) === "step") throw new Error("public-step-forbidden");
    try {
      const result = await this.inTransaction(async () => {
        const committed = this.region.readCommitted();
        this.resident.begin(committed.revision, committed.state, this.residentRecords(committed.revision));
        const receipt = this.region.dispatch(`${this.pack}-player`, input);
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
      const armed =
        this.nextDue(next, now) ?? next;
      await this.arm(armed);
        return { receipt, row: armed };
      });
      this.resident.accept(this.region.readCommitted().revision);
      return result;
    } catch (error) {
      this.resident.discard();
      throw error;
    }
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
      const committed = this.region.readCommitted();
      this.resident.begin(committed.revision, committed.state, this.residentRecords(committed.revision));
      acceptedRevision = committed.revision;
      // Bounded catch-up preserves scheduled time across late native alarms.
      // Every occurrence remains individually identified inside this transaction.
      for (let steps = 0; steps < 5; steps++) {
        const dueDeadline = row.due_deadline_ms;
        if (dueDeadline === null || row.due_request_json === null || row.due_sequence === null) throw new Error("public-host-format");
        if (dueDeadline > now) {
          await this.arm(row);
          return row;
        }
        const request = JSON.parse(row.due_request_json);
        this.region.dispatchOccurrence(`${this.pack}-host`, {
          sequence: row.due_sequence,
          request,
        });
        const sequence = row.due_sequence + 1;
        const nextRequest = JSON.stringify(clockRequest(sequence));
        const deadline = dueDeadline + STEP_MS;
        this.owner.sql.exec(
          "UPDATE hive_public_host SET next_sequence=?,due_sequence=?,due_request_json=?,due_deadline_ms=? WHERE singleton=1",
          sequence,
          sequence,
          nextRequest,
          deadline,
        );
        const advanced: HostRow = {
          ...row,
          next_sequence: sequence,
          due_sequence: sequence,
          due_request_json: nextRequest,
          due_deadline_ms: deadline,
        };
        row = advanced;
      }
      await this.arm(row);
      acceptedRevision = this.region.readCommitted().revision;
      return row;
      });
      if (acceptedRevision !== undefined) this.resident.accept(acceptedRevision);
    } catch (error) {
      this.resident.discard();
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
    if (this.initialized) await this.publishObservation();
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
          await this.observe(Date.now());
          socket.send(JSON.stringify({ type: "observation", ...this.observationPayload() }));
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
      await this.initialize(attachment.pack, tokenHash);
      socket.serializeAttachment({ pack: attachment.pack, tokenHash, authenticated: true, authDeadline: null } satisfies SocketAttachment);
      await this.observe(Date.now());
      socket.send(JSON.stringify({ type: "ready", game: attachment.pack }));
      socket.send(JSON.stringify({ type: "observation", ...this.observationPayload() }));
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
      )
        return withCors(await this.observe(now), origin);
      if (
        new URL(request.url).pathname.endsWith("/command") &&
        request.method === "POST"
      ) {
        const input = await readCommand(request);
        const result = await this.command(input, now);
        this.publishObservation();
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
