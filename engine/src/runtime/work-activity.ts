import { z } from "zod";
import type { ActivityBinding, DeliveryActivityPhase, ReadContext, RenderFact } from "../contracts";
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
const deliveryActivitySchema = z.object({
  kind: z.literal("delivery"),
  phase: z.enum(["pickup", "carrying", "to-destination", "putting-down"]),
  material: z.string().min(1).max(128),
  target: z.tuple([z.number().finite(), z.number().finite()]),
  progress: z.number().min(0).max(1).optional(),
}).strict();
export type WorkActivity = z.infer<typeof workActivitySchema> | z.infer<typeof deliveryActivitySchema>;
const boundedProgress = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;

const deliveryPhase = (phase: string, atSource: boolean): DeliveryActivityPhase | null => {
  if (phase === "to-source") return atSource ? "pickup" : null;
  if (phase === "carrying") return "carrying";
  if (phase === "to-destination") return "to-destination";
  if (phase === "putting-down") return "putting-down";
  return null;
};

/** Read committed work attendance, never a queued designation or client timer. */
export function decorateWorkActivity(
  facts: readonly RenderFact[],
  context: Pick<ReadContext, "query">,
  extra: readonly ActivityBinding[] = [],
): readonly RenderFact[] {
  const activity = new Map<string, WorkActivity>();
  for (const row of context.query(query(ExcavationWork))) {
    const work = row.get(ExcavationWork);
    activity.set(row.id, { kind: "dig", target: [work.x, work.z] });
  }
  for (const row of context.query(query(ConstructionSite))) {
    const site = row.get(ConstructionSite);
    if (site.phase !== "working" || site.worker === null) continue;
    if (activity.has(site.worker)) throw new Error("actor has competing native work attendance");
    activity.set(site.worker, { kind: "build", target: [site.x, site.z] });
  }
  const positions = new Map(context.query(query(Position)).map(row => [row.id, row.get(Position)]));
  for (const row of context.query(query(DeliveryTask))) {
    const task = row.get(DeliveryTask);
    if (task.actor === null || activity.has(task.actor)) {
      if (task.actor !== null && activity.has(task.actor)) throw new Error("actor has competing work attendance");
      continue;
    }
    const actor = positions.get(task.actor), source = positions.get(task.source), destination = positions.get(task.destination);
    if (!actor || !source || !destination) continue;
    const atSource = Math.hypot(actor.x - source.x, actor.z - source.z) <= 1;
    const phase = deliveryPhase(task.phase, atSource);
    if (!phase) continue;
    const target = phase === "pickup" ? source : destination;
    activity.set(task.actor, { kind: "delivery", phase, material: task.material, target: [target.x, target.z] });
  }
  for (const binding of extra) {
    if (activity.has(binding.actor)) throw new Error("actor has competing work attendance");
    const progress = boundedProgress(binding.progress);
    activity.set(binding.actor, { kind: binding.kind, target: [...binding.target], ...(progress === undefined ? {} : { progress }) });
  }
  return facts.map(fact => {
    const work = activity.get(fact.id);
    return work ? { ...fact, activity: work } : fact;
  });
}
