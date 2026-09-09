import { z } from "zod";
import { decode, encode, type Json } from "./codec.ts";

export type { Json } from "./codec.ts";
type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
/** Native host capability, structurally compatible with the DO and Watchdog owner. */
export type RegionSqliteOwner = {
  sql: {
    exec<Row extends Record<string, SqlValue> = Record<string, SqlValue>>(
      statement: string,
      ...bindings: SqlValue[]
    ): { toArray(): readonly Row[] };
  };
  transactionSync<A>(operation: () => A): A;
};
export type RegionTransition =
  | { status: "applied"; result: Json; events: readonly Json[] }
  | { status: "rejected"; result: Json };
/** Registered trusted code. Change id whenever state/command meaning changes.
 * Parsers are pure; callbacks must not mutate other owners or perform external I/O.
 */
export type RegionProgram<State, Command> = {
  id: string;
  initial(): State;
  parseState(value: unknown): State;
  parseCommand(value: unknown): Command;
  authorize(
    principal: string,
    command: Readonly<Command>,
    state: Readonly<State>,
  ): boolean;
  execute(candidate: State, command: Command): RegionTransition;
};
export type RegionReceipt = {
  region: string;
  principal: string;
  commandId: string;
  status: "applied" | "rejected";
  revision: number;
  result: Json;
};
const identity = z.string().min(1).max(160);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const inputSchema = z
  .object({ id: identity, expectedRevision: integer, command: z.unknown() })
  .strict();
const limitsSchema = z
  .object({
    stateBytes: z
      .number()
      .int()
      .min(1024)
      .max(4 * 1024 * 1024)
      .default(256 * 1024),
    commandBytes: z
      .number()
      .int()
      .min(256)
      .max(64 * 1024)
      .default(8192),
    resultBytes: z
      .number()
      .int()
      .min(256)
      .max(64 * 1024)
      .default(8192),
    eventBytes: z
      .number()
      .int()
      .min(256)
      .max(64 * 1024)
      .default(8192),
    receipts: z.number().int().min(1).max(65_536).default(4096),
    events: z.number().int().min(1).max(65_536).default(4096),
    storageBytes: z
      .number()
      .int()
      .min(1024)
      .max(64 * 1024 * 1024)
      .default(8 * 1024 * 1024),
  })
  .strict();
type RegionRow = {
  region_id: string;
  program_id: string;
  limits_json: string;
  revision: number;
  state_json: string;
  receipt_count: number;
  event_count: number;
  event_sequence: number;
  state_bytes: number;
  receipt_bytes: number;
  event_bytes: number;
};

/** One region's native transaction owns state, command replay and committed events.
 * No canonical RAM is retained: candidates are detached and discarded on failure.
 * Host alarms/execution and authenticated principal construction remain outside.
 */
export function openRegion<State, Command>(options: {
  owner: RegionSqliteOwner;
  region: string;
  program: RegionProgram<State, Command>;
  limits?: z.input<typeof limitsSchema>;
}) {
  const { owner } = options;
  // Capture the registered functions. Later reassignment of the caller's options
  // cannot silently change this instance's meaning under an unchanged program ID.
  const program = Object.freeze({ ...options.program });
  const region = identity.parse(options.region);
  const programId = identity.parse(program.id);
  const limits = limitsSchema.parse(options.limits ?? {});
  const policy = encode(limits, 4096);
  const stateWire = (state: unknown) =>
    encode(program.parseState(state), limits.stateBytes);
  const stateFrom = (wire: string) =>
    program.parseState(decode(wire, limits.stateBytes));
  const bytes = (wire: string) => new TextEncoder().encode(wire).byteLength;
  function row(): RegionRow {
    const found = owner.sql
      .exec<RegionRow>("SELECT * FROM hive_region WHERE singleton = 1")
      .toArray()[0];
    if (!found || found.region_id !== region || found.program_id !== programId)
      throw new Error("region-identity-conflict");
    if (found.limits_json !== policy) throw new Error("region-policy-conflict");
    integer.parse(found.revision);
    for (const value of [
      found.receipt_count,
      found.event_count,
      found.event_sequence,
      found.state_bytes,
      found.receipt_bytes,
      found.event_bytes,
    ])
      integer.parse(value);
    if (
      found.event_count > found.event_sequence ||
      found.state_bytes !== bytes(found.state_json)
    )
      throw new Error("region-storage-metadata");
    if (
      found.state_bytes + found.receipt_bytes + found.event_bytes >
      limits.storageBytes
    )
      throw new Error("region-storage-budget");
    return found;
  }
  owner.transactionSync(() => {
    owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_region (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), region_id TEXT NOT NULL,
      program_id TEXT NOT NULL, limits_json TEXT NOT NULL,
      revision INTEGER NOT NULL, state_json TEXT NOT NULL,
      receipt_count INTEGER NOT NULL, event_count INTEGER NOT NULL,
      event_sequence INTEGER NOT NULL, state_bytes INTEGER NOT NULL,
      receipt_bytes INTEGER NOT NULL, event_bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS hive_region_receipts (
      principal TEXT NOT NULL, command_id TEXT NOT NULL, input_json TEXT NOT NULL,
      receipt_json TEXT NOT NULL, PRIMARY KEY(principal,command_id));
      CREATE TABLE IF NOT EXISTS hive_region_events (
      sequence INTEGER PRIMARY KEY, event_json TEXT NOT NULL);`);
    if (
      !owner.sql
        .exec("SELECT singleton FROM hive_region WHERE singleton=1")
        .toArray().length
    ) {
      const initial = stateWire(program.initial());
      owner.sql.exec(
        "INSERT INTO hive_region VALUES (1,?,?,?,0,?,0,0,0,?,0,0)",
        region,
        programId,
        policy,
        initial,
        bytes(initial),
      );
    }
    const current = row();
    stateFrom(current.state_json);
    if (
      current.receipt_count > limits.receipts ||
      current.event_count > limits.events
    )
      throw new Error("region-retention-budget");
  });

  function saveReceipt(
    principal: string,
    id: string,
    input: string,
    receipt: RegionReceipt,
  ) {
    const wire = encode(receipt, limits.resultBytes);
    const addedBytes =
      bytes(principal) + bytes(id) + bytes(input) + bytes(wire);
    const current = row();
    if (
      current.state_bytes +
        current.receipt_bytes +
        current.event_bytes +
        addedBytes >
      limits.storageBytes
    )
      throw new Error("region-storage-budget");
    owner.sql.exec(
      "INSERT INTO hive_region_receipts VALUES (?,?,?,?)",
      principal,
      id,
      input,
      wire,
    );
    owner.sql.exec(
      "UPDATE hive_region SET receipt_count = receipt_count + 1, receipt_bytes = receipt_bytes + ? WHERE singleton=1",
      addedBytes,
    );
    return JSON.parse(wire) as RegionReceipt;
  }
  function dispatch(principalInput: string, raw: unknown): RegionReceipt {
    const principal = identity.parse(principalInput);
    // Bound input before handing it to a consumer parser. Only checked input defines replay.
    const input = inputSchema.parse(
      decode(encode(raw, limits.commandBytes), limits.commandBytes),
    );
    const command = program.parseCommand(input.command);
    const canonical = encode({ ...input, command }, limits.commandBytes);
    return owner.transactionSync(() => {
      const current = row();
      const prior = owner.sql
        .exec<{ input_json: string; receipt_json: string }>(
          "SELECT input_json,receipt_json FROM hive_region_receipts WHERE principal=? AND command_id=?",
          principal,
          input.id,
        )
        .toArray()[0];
      if (prior) {
        if (prior.input_json !== canonical)
          throw new Error("region-command-conflict");
        return decode(
          prior.receipt_json,
          limits.resultBytes,
        ) as unknown as RegionReceipt;
      }
      if (current.receipt_count >= limits.receipts)
        throw new Error("region-receipt-capacity");
      // The host authenticates principal identity. Existing receipts above replay
      // even if the completed action changed current action eligibility.
      const checkedCommand = () =>
        program.parseCommand(JSON.parse(canonical).command);
      if (
        !program.authorize(
          principal,
          checkedCommand(),
          stateFrom(current.state_json),
        )
      )
        throw new Error("region-forbidden");
      const base = {
        region,
        principal,
        commandId: input.id,
        revision: current.revision,
      };
      if (input.expectedRevision !== current.revision)
        return saveReceipt(principal, input.id, canonical, {
          ...base,
          status: "rejected",
          result: { reason: "stale-revision" },
        });
      // Authorization gets disposable values; accidental writes cannot alter the
      // canonical command or the candidate that becomes physical truth.
      const candidate = stateFrom(current.state_json);
      const transition = program.execute(candidate, checkedCommand());
      if (transition.status === "rejected")
        return saveReceipt(principal, input.id, canonical, {
          ...base,
          status: "rejected",
          result: transition.result,
        });
      const revision = integer.parse(current.revision + 1);
      if (
        transition.events.length > 32 ||
        current.event_count + transition.events.length > limits.events
      )
        throw new Error("region-event-capacity");
      const wire = stateWire(candidate);
      const events = transition.events.map((payload, index) => ({
        sequence: integer.parse(current.event_sequence + index + 1),
        wire: encode(
          { id: `${region}:${revision}:${index}`, revision, payload },
          limits.eventBytes,
        ),
      }));
      const eventBytes = events.reduce(
        (sum, event) => sum + bytes(event.wire),
        0,
      );
      owner.sql.exec(
        "UPDATE hive_region SET revision=?,state_json=?,state_bytes=?,event_count=?,event_sequence=?,event_bytes=? WHERE singleton=1 AND revision=?",
        revision,
        wire,
        bytes(wire),
        current.event_count + transition.events.length,
        current.event_sequence + transition.events.length,
        current.event_bytes + eventBytes,
        current.revision,
      );
      for (const event of events) {
        owner.sql.exec(
          "INSERT INTO hive_region_events VALUES (?,?)",
          event.sequence,
          event.wire,
        );
      }
      return saveReceipt(principal, input.id, canonical, {
        ...base,
        revision,
        status: "applied",
        result: transition.result,
      });
    });
  }
  return Object.freeze({
    dispatch,
    /** Trusted host checkpoint, not an unfiltered player/agent observation API. */
    readCommitted() {
      const current = row();
      return {
        region,
        programId,
        revision: current.revision,
        state: stateFrom(current.state_json),
      };
    },
    /** Trusted host cursor; caller applies knowledge/grants before exposing events. */
    readEvents(after: number, limit = 32) {
      integer.parse(after);
      if (!Number.isInteger(limit) || limit < 1 || limit > 128)
        throw new Error("region-page-budget");
      return owner.sql
        .exec<{ sequence: number; event_json: string }>(
          "SELECT sequence,event_json FROM hive_region_events WHERE sequence>? ORDER BY sequence LIMIT ?",
          after,
          limit,
        )
        .toArray()
        .map(({ sequence, event_json }) => ({
          sequence,
          event: decode(event_json, limits.eventBytes),
        }));
    },
  });
}
