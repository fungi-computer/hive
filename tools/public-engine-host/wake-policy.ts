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
