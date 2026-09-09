import {
  materialPortionsSchema,
  type MaterialPortion,
} from "../materials/index.ts";
import { z } from "zod";
export const workProgressSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("acquire") }).strict(),
  z.object({ phase: z.literal("draw") }).strict(),
  z
    .object({ phase: z.literal("deliver"), contents: materialPortionsSchema })
    .strict(),
  z
    .object({
      phase: z.literal("attend"),
      elapsed: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type WorkProgress = z.infer<typeof workProgressSchema>;
export type WorkDefinition =
  | { kind: "vessel"; interruption: "park" }
  | { kind: "portion"; interruption: "release"; attendTicks: number };
export type AccessOutcome = "ready" | "pending" | "invalid";
export type WorkOutcome = "pending" | "interrupted" | "completed";
export type WorkProgressRecord = { execution: WorkProgress };
export type WorkHost = {
  acquire(): AccessOutcome;
  draw():
    | { status: "ready"; contents: MaterialPortion[] }
    | { status: "pending" | "invalid" };
  deliver(contents: MaterialPortion[]): AccessOutcome;
  consume(): boolean;
};
function vesselStep(record: WorkProgressRecord, host: WorkHost): WorkOutcome {
  if (record.execution.phase === "draw") {
    const drawn = host.draw();
    if (drawn.status !== "ready") return accessResult(drawn.status);
    record.execution = { phase: "deliver", contents: drawn.contents };
  }
  if (record.execution.phase !== "deliver") return "interrupted";
  const delivered = host.deliver(record.execution.contents);
  return delivered === "ready" ? "completed" : accessResult(delivered);
}
function portionStep(
  record: WorkProgressRecord,
  ticks: number,
  host: WorkHost,
): WorkOutcome {
  if (record.execution.phase !== "attend") return "interrupted";
  if (++record.execution.elapsed < ticks) return "pending";
  return host.consume() ? "completed" : "interrupted";
}
function accessResult(outcome: "pending" | "invalid"): WorkOutcome {
  return outcome === "invalid" ? "interrupted" : "pending";
}
/** Shared synchronous phase owner. Host operations own movement and material/effect
 * joins; no host function or callback is stored in the execution record. */
export function advanceFiniteWork(
  record: WorkProgressRecord,
  definition: WorkDefinition,
  host: WorkHost,
): WorkOutcome {
  if (workProgressProblem(record.execution, definition)) return "interrupted";
  // A parked vessel retains its phase but must reacquire physical custody first.
  const acquired = host.acquire();
  if (acquired !== "ready") return accessResult(acquired);
  if (record.execution.phase === "acquire") {
    if (definition.kind === "portion") {
      record.execution = { phase: "attend", elapsed: 0 };
      return "pending"; // Portion pickup yields before the first attendance tick.
    }
    record.execution = { phase: "draw" };
  }
  return definition.kind === "vessel"
    ? vesselStep(record, host)
    : portionStep(record, definition.attendTicks, host);
}
export function workProgressProblem(
  progress: WorkProgress,
  definition: WorkDefinition,
): string | null {
  if (!workProgressSchema.safeParse(progress).success)
    return "invalid-progress";
  if (
    definition.kind === "portion" &&
    (!Number.isSafeInteger(definition.attendTicks) ||
      definition.attendTicks <= 0)
  )
    return "invalid-attendance";
  if (definition.kind === "vessel")
    return progress.phase === "attend" ? "vessel-attendance" : null;
  return progress.phase === "draw" || progress.phase === "deliver"
    ? "portion-draw"
    : progress.phase === "attend" && progress.elapsed >= definition.attendTicks
      ? "settled-attendance"
      : null;
}
