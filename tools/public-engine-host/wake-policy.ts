import { hostStatusSchema, type HostStatus } from "../../engine/src/runtime/host-status";
import { STEP_MS } from "./protocol.ts";

/** Presence is not physical activity. Current native systems have no quiet proof. */
export type ClockDemand = { readonly kind: "quiet" } | { readonly kind: "active" };
export function sessionClockDemand(session: { readonly paused: boolean }): ClockDemand {
  return session.paused ? { kind: "quiet" } : { kind: "active" };
}

export const RECOVERY_WAKE_MS = 1_000;
export function nextWakeDeadline(demand: ClockDemand, now: number): number | null {
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - STEP_MS)
    throw new Error("public-host-format");
  return demand.kind === "quiet" ? null : now + STEP_MS;
}

/**
 * Commit a separate rescue alarm before an occurrence consumes its current alarm.
 * A failed transaction/rearm leaves this future alarm, even after automatic retries.
 * Failure to persist this rescue alarm must propagate: no application can promise
 * progress through an unavailable durable storage service.
 */
export async function withRecoveryWake<T>(
  storage: { setAlarm(at: number): Promise<void> },
  now: number,
  run: () => Promise<T>,
): Promise<T> {
  await storage.setAlarm(now + RECOVERY_WAKE_MS);
  return run();
}

/** Nonretryable engine admission/identity failures cannot improve on another tick. */
export function failedHostAttempt(previous: HostStatus, sequence: number, error: unknown, now: number): HostStatus {
  const message = error instanceof Error ? error.message : "";
  const invariant = /^(region|session|kernel|public-host|public-kernel|public-scheduled|occurrence-driver)-[a-z0-9-]+$/.test(message) && message.length <= 96;
  const attempts = previous.state === "running" ? 1 : previous.attempts + 1;
  if (previous.state === "faulted" || previous.state !== "running" && previous.sequence !== sequence)
    throw new Error("public-host-retry-identity");
  const code = invariant ? message : error instanceof Error && error.name === "ZodError" ? "host-invalid-occurrence" : "host-transient-failure";
  if (invariant || code === "host-invalid-occurrence" || attempts >= 5)
    return hostStatusSchema.parse({ state: "faulted", sequence, attempts, code });
  return hostStatusSchema.parse({ state: "retrying", sequence, attempts, code, retryAt: now + RECOVERY_WAKE_MS * 2 ** (attempts - 1) });
}

export function clockWakeAt(status: HostStatus, due: number | null): number | null {
  if (status.state === "faulted") return null;
  if (due === null) return null;
  return status.state === "retrying" ? Math.max(due, status.retryAt) : due;
}
