import { hostStatusSchema, RUNNING_HOST, type HostStatus } from "../../engine/src/runtime/host-status";
import { STEP_MS, clockRequest } from "./protocol.ts";

/** Durable scheduling projection owned by the public Region host. */
export type HostCadenceRow = {
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
  wake_json: string;
};

export type HostDemand = { readonly kind: "quiet" } | { readonly kind: "active" };
type CadenceSql = { exec(statement: string, ...bindings: (string | number | null)[]): unknown };
export const RECOVERY_WAKE_MS = 1_000;

function safeTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function status(row: Pick<HostCadenceRow, "wake_json">): HostStatus {
  return hostStatusSchema.parse(JSON.parse(row.wake_json));
}

/**
 * The cadence owner keeps the durable request identity, its deadline, retry
 * state, and the next alarm as one transition. A due occurrence survives an
 * expired lease; only admitting its successor requires current demand.
 */
export const hostCadence = Object.freeze({
  status,

  withStatus(row: HostCadenceRow, value: HostStatus): HostCadenceRow {
    return { ...row, wake_json: JSON.stringify(hostStatusSchema.parse(value)) };
  },

  persist(sql: CadenceSql, row: HostCadenceRow): void {
    this.validate(row);
    sql.exec("UPDATE hive_public_host SET paused=?,next_sequence=?,lease_until_ms=?,due_sequence=?,due_request_json=?,due_deadline_ms=?,wake_json=? WHERE singleton=1",
      row.paused, row.next_sequence, row.lease_until_ms, row.due_sequence, row.due_request_json, row.due_deadline_ms, row.wake_json);
  },

  validate(row: HostCadenceRow): void {
    const wake = status(row);
    if (wake.state !== "running" && (wake.sequence !== row.due_sequence || row.due_request_json === null)) throw new Error("public-host-retry-identity");
    if (row.format_version !== 2 || (row.paused !== 0 && row.paused !== 1) ||
        !Number.isSafeInteger(row.next_sequence) || row.next_sequence < 0 ||
        row.lease_until_ms !== null && !safeTime(row.lease_until_ms)) throw new Error("public-host-format");
    const due = [row.due_sequence, row.due_request_json, row.due_deadline_ms];
    const allNull = due.every(value => value === null);
    const allPresent = due.every(value => value !== null);
    if ((!allNull && !allPresent) || row.paused === 1 && allPresent) throw new Error("public-host-format");
    if (allNull) return;
    const sequence = row.due_sequence;
    const deadline = row.due_deadline_ms;
    const request = row.due_request_json;
    if (sequence === null || deadline === null || typeof request !== "string" ||
        !Number.isSafeInteger(sequence) || sequence < 0 || sequence !== row.next_sequence ||
        !safeTime(deadline) || new TextEncoder().encode(request).byteLength > 8192) throw new Error("public-host-format");
    try {
      const value = JSON.parse(request) as Record<string, unknown>;
      const command = value.command as { kind?: unknown; delta?: unknown } | undefined;
      if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 160 ||
          value.expectedRevision !== undefined || !command || Array.isArray(command) || command.kind !== "step" ||
          typeof command.delta !== "number" || !Number.isFinite(command.delta) || command.delta < 0 || command.delta > 1)
        throw new Error("invalid");
    } catch { throw new Error("public-host-format"); }
  },

  demand(paused: boolean, leaseUntil: number | null, now: number): HostDemand {
    if (!safeTime(now) || leaseUntil !== null && !safeTime(leaseUntil)) throw new Error("public-host-format");
    return paused || leaseUntil === null || leaseUntil <= now ? { kind: "quiet" } : { kind: "active" };
  },

  admit(row: HostCadenceRow, paused: boolean, now: number, earliestDeadline = now + STEP_MS): HostCadenceRow | null {
    if (status(row).state !== "running") return row;
    if (row.due_sequence !== null) return row;
    if (this.demand(paused, row.lease_until_ms, now).kind === "quiet") return null;
    if (!safeTime(now) || !safeTime(earliestDeadline)) throw new Error("public-host-format");
    const sequence = row.next_sequence;
    return { ...row, due_sequence: sequence, due_request_json: JSON.stringify(clockRequest(sequence)), due_deadline_ms: earliestDeadline };
  },

  renew(row: HostCadenceRow, now: number, leaseMs: number, paused: boolean): HostCadenceRow {
    if (!safeTime(now) || !Number.isSafeInteger(leaseMs) || leaseMs < 0 || now > Number.MAX_SAFE_INTEGER - leaseMs) throw new Error("public-host-format");
    const renewed = { ...row, lease_until_ms: now + leaseMs };
    return this.admit(renewed, paused, now) ?? renewed;
  },

  pause(row: HostCadenceRow, leaseUntil: number): HostCadenceRow {
    if (!safeTime(leaseUntil)) throw new Error("public-host-format");
    return { ...row, paused: 1, lease_until_ms: leaseUntil, due_sequence: null, due_request_json: null, due_deadline_ms: null };
  },

  resume(row: HostCadenceRow, leaseUntil: number, now: number): HostCadenceRow {
    if (!safeTime(leaseUntil) || !safeTime(now)) throw new Error("public-host-format");
    return { ...row, paused: 0, lease_until_ms: leaseUntil };
  },

  dueWake(row: HostCadenceRow): number | null {
    const wake = status(row);
    if (wake.state === "faulted" || row.due_deadline_ms === null) return null;
    return wake.state === "retrying" ? Math.max(row.due_deadline_ms, wake.retryAt) : row.due_deadline_ms;
  },

  alarmAt(row: HostCadenceRow, socketDeadline: number | null): number | null {
    const clockDeadline = this.dueWake(row);
    const values = [socketDeadline, clockDeadline].filter((value): value is number => value !== null);
    return values.length === 0 ? null : Math.min(...values);
  },

  complete(row: HostCadenceRow, completedAt: number, paused: boolean): HostCadenceRow {
    const sequence = row.due_sequence;
    const deadline = row.due_deadline_ms;
    if (sequence === null || deadline === null || row.due_request_json === null || sequence !== row.next_sequence || !safeTime(completedAt) || completedAt < deadline)
      throw new Error("public-host-format");
    const nextSequence = sequence + 1;
    if (!Number.isSafeInteger(nextSequence)) throw new Error("public-host-format");
    const cleared: HostCadenceRow = { ...row, next_sequence: nextSequence, due_sequence: null, due_request_json: null, due_deadline_ms: null, wake_json: JSON.stringify(RUNNING_HOST), paused: paused ? 1 : 0 };
    const earliestNext = Math.max(deadline + STEP_MS, completedAt + STEP_MS);
    if (!safeTime(earliestNext)) throw new Error("public-host-format");
    return this.admit(cleared, paused, completedAt, earliestNext) ?? cleared;
  },

  failed(previous: HostStatus, sequence: number, error: unknown, now: number): HostStatus {
    if (!safeTime(now)) throw new Error("public-host-format");
    const message = error instanceof Error ? error.message : "";
    const invariant = /^(region|session|kernel|public-host|public-kernel|public-scheduled|occurrence-driver)-[a-z0-9-]+$/.test(message) && message.length <= 96;
    const attempts = previous.state === "running" ? 1 : previous.attempts + 1;
    if (previous.state === "faulted" || previous.state !== "running" && previous.sequence !== sequence) throw new Error("public-host-retry-identity");
    const code = invariant ? message : error instanceof Error && error.name === "ZodError" ? "host-invalid-occurrence" : "host-transient-failure";
    if (invariant || code === "host-invalid-occurrence" || attempts >= 5) return hostStatusSchema.parse({ state: "faulted", sequence, attempts, code });
    const delay = RECOVERY_WAKE_MS * 2 ** (attempts - 1);
    if (now > Number.MAX_SAFE_INTEGER - delay) throw new Error("public-host-format");
    return hostStatusSchema.parse({ state: "retrying", sequence, attempts, code, retryAt: now + delay });
  },
});

/** Persist a second wake before consuming the current alarm. */
export async function withRecoveryWake<T>(storage: { setAlarm(at: number): Promise<void> }, now: number, run: () => Promise<T>): Promise<T> {
  if (!safeTime(now) || now > Number.MAX_SAFE_INTEGER - RECOVERY_WAKE_MS) throw new Error("public-host-format");
  await storage.setAlarm(now + RECOVERY_WAKE_MS);
  return run();
}
