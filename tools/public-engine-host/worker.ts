import { DurableObject } from "cloudflare:workers";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createSessionRegionProgram } from "../../engine/src/runtime/region-program";
import type { SessionRegionState } from "../../engine/src/runtime/region-program";
import { GameSession } from "../../engine/src/runtime/session";
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
  corsHeaders,
  packFromPath,
  readCommand,
  tokenFromRequest,
  withCors,
  type PublicCommandInput,
  type PublicPack,
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
  if (row.paused === 1 && allPresent) throw new Error("public-host-format");
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
    const expectedRevision = request.expectedRevision;
    if (
      typeof id !== "string" ||
      id.length < 1 ||
      id.length > 160 ||
      typeof expectedRevision !== "number" ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
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
  private pack!: PublicPack;
  private tokenHash!: string;
  private readonly owner: RegionSqliteOwner;
  private initialized = false;
  private readonly ready: Promise<void>;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Environment,
  ) {
    super(state, env);
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
      if (!/^[a-f0-9]{64}$/.test(env.IMPLEMENTATION_HASH))
        throw new Error("missing immutable implementation hash");
      initSync({ module: wasmBytes });
      if (this.hasHostTable()) {
        const persisted = this.hostRow();
        if (persisted)
          await this.initializeCore(
            persisted.pack as PublicPack,
            persisted.token_hash,
          );
      }
    });
  }

  private async initialize(pack: PublicPack, tokenHash: string): Promise<void> {
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
    const program = createSessionRegionProgram({
      pack: game,
      createKernel: () => wasmKernelPort(new WasmKernel()),
      implementationHash: this.env.IMPLEMENTATION_HASH,
      ownerPrincipal: playerPrincipal,
      hostPrincipal,
      seed: 17,
    });
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

  private nextDue(row: HostRow, revision: number, now: number) {
    if (row.paused || row.lease_until_ms === null || row.lease_until_ms <= now)
      return null;
    if (row.due_sequence !== null) return row;
    const sequence = row.next_sequence;
    const request = JSON.stringify({
      id: `clock-${sequence}`,
      expectedRevision: revision,
      command: { kind: "step", delta: STEP_MS / 1000 },
    });
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
    if (row.lease_until_ms === null || row.due_deadline_ms === null)
      return null;
    return Math.min(row.lease_until_ms, row.due_deadline_ms);
  }

  private async arm(row: HostRow): Promise<void> {
    const at = this.alarmAt(row);
    if (at === null) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(at);
  }

  private async observe(now: number): Promise<Response> {
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
        this.nextDue(renewed, this.region.readCommitted().revision, now) ??
        renewed;
      await this.arm(next);
      return next;
    });
    return this.observationResponse(row);
  }

  private observationResponse(_row: HostRow): Response {
    const committed = this.region.readCommitted();
    const port = wasmKernelPort(new WasmKernel());
    try {
      const session = new GameSession({
        port,
        pack: packFor(this.pack),
        seed: 17,
      });
      session.restore(committed.state.session);
      const observation = buildObservation(session, {
        epoch: 0,
        sequence: committed.revision,
      });
      return Response.json({ revision: committed.revision, observation });
    } finally {
      port.dispose();
    }
  }

  private async command(input: PublicCommandInput, now: number) {
    if (commandKind(input) === "step") throw new Error("public-step-forbidden");
    const result = await this.inTransaction(async () => {
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
        this.nextDue(next, this.region.readCommitted().revision, now) ?? next;
      await this.arm(armed);
      return { receipt, row: armed };
    });
    return result;
  }

  private async runDue(now: number): Promise<void> {
    await this.inTransaction(async () => {
      const row = this.hostRow();
      if (!row) throw new Error("public-host-state");
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
      const dueDeadline = row.due_deadline_ms;
      if (dueDeadline === null) throw new Error("public-host-format");
      if (dueDeadline > now) {
        await this.arm(row);
        return row;
      }
      const request = JSON.parse(row.due_request_json);
      const receipt = this.region.dispatchOccurrence(`${this.pack}-host`, {
        sequence: row.due_sequence,
        request,
      });
      const sequence = row.due_sequence + 1;
      const nextRequest = JSON.stringify({
        id: `clock-${sequence}`,
        expectedRevision: receipt.revision,
        command: { kind: "step", delta: STEP_MS / 1000 },
      });
      const deadline = Math.max(
        now + STEP_MS,
        (row.due_deadline_ms ?? now) + STEP_MS,
      );
      this.owner.sql.exec(
        "UPDATE hive_public_host SET next_sequence=?,due_sequence=?,due_request_json=?,due_deadline_ms=? WHERE singleton=1",
        sequence,
        sequence,
        nextRequest,
        deadline,
      );
      const advanced = {
        ...row,
        next_sequence: sequence,
        due_sequence: sequence,
        due_request_json: nextRequest,
        due_deadline_ms: deadline,
      };
      await this.arm(advanced);
      return advanced;
    });
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.initializeStored();
    if (!this.initialized) return;
    await this.runDue(Date.now());
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const origin = this.env.PUBLIC_ORIGIN;
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
      const token = tokenFromRequest(request);
      const tokenHash = await sha256Hex(token);
      await this.initialize(pack, tokenHash);
      const now = Date.now();
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
      const token = tokenFromRequest(request);
      const hash = await sha256Hex(token);
      const id = env.REGIONS.idFromName(`${pack}:${hash}`);
      return env.REGIONS.get(id).fetch(request);
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
