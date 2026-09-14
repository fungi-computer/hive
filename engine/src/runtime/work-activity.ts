import { z } from "zod";
import type { ActivityBinding, DeliveryActivityPhase, ReadContext, RenderFact, WorkActivityRef } from "../contracts";
import { query } from "../sdk/authoring";
import { ExcavationWork, Position } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";
import { DeliveryTask } from "../sdk/delivery";

/** Native terrain work uses one-metre horizontal coordinates. Art owns poses. */
export const workActivitySchema = z.object({
  kind: z.enum(["dig", "build", "chop"]),
  target: z.tuple([z.number().finite(), z.number().finite()]),
  progress: z.number().min(0).max(1).optional(),
}).strict();
export const deliveryActivitySchema = z.object({
  kind: z.literal("delivery"),
  phase: z.enum(["pickup", "carrying", "to-destination", "putting-down"]),
  material: z.string().min(1).max(128),
  target: z.tuple([z.number().finite(), z.number().finite()]),
  progress: z.number().min(0).max(1).optional(),
}).strict();
/** Complete activity shape shared by observation producers and consumers. */
export const activitySchema = z.union([workActivitySchema, deliveryActivitySchema]);
export type WorkActivity = z.infer<typeof activitySchema>;
const boundedProgress = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;

const deliveryPhase = (activity: WorkActivityRef): DeliveryActivityPhase | null => {
  if (activity.kind === "route") return "carrying";
  if (activity.kind === "material-transfer") return "to-destination";
  if (activity.kind === "material-drop") return "putting-down";
  return null;
};

/** Read committed work attendance, never a queued designation or client timer. */
export function decorateWorkActivity(
  facts: readonly RenderFact[],
  context: Pick<ReadContext, "query" | "workAttempts">,
  extra: readonly ActivityBinding[] = [],
): readonly RenderFact[] {
  const activity = new Map<string, WorkActivity>();
  for (const row of context.query(query(ExcavationWork))) {
    const work = row.get(ExcavationWork);
    activity.set(row.id, { kind: "dig", target: [work.x, work.z] });
  }
  // Construction attendance is projected by its native WorkAttempt below.
  const positions = new Map(context.query(query(Position)).map(row => [row.id, row.get(Position)]));
  for (const row of context.query(query(DeliveryTask))) {
    const attempt = context.workAttempts?.([row.id])?.[0];
    if (!attempt) continue;
    if (activity.has(attempt.worker)) throw new Error("actor has competing work attendance");
    const operation = attempt.phase.kind === "executing" || attempt.phase.kind === "outcome" ? attempt.phase.activity : null;
    if (!operation || !["material-transfer", "material-drop", "route"].includes(operation.kind)) continue;
    const destination = operation.kind === "route" ? operation.destination : positions.get(attempt.worker);
    if (!destination) continue;
    const phase = deliveryPhase(operation); if (!phase) continue;
    activity.set(attempt.worker, { kind: "delivery", phase, material: row.get(DeliveryTask).material, target: [destination.x, destination.z] });
  }
  for (const binding of extra) {
    const progress = boundedProgress(binding.progress);
    const current = activity.get(binding.actor);
    if (current) {
      if (current.kind !== binding.kind) throw new Error("actor has competing work attendance");
      activity.set(binding.actor, { ...current, ...(progress === undefined ? {} : { progress }) });
    } else activity.set(binding.actor, { kind: binding.kind, target: [...binding.target], ...(progress === undefined ? {} : { progress }) });
  }
  return facts.map(fact => {
    const work = activity.get(fact.id);
    return work ? { ...fact, activity: work } : fact;
  });
}
