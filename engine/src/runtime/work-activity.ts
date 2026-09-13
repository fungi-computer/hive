import { z } from "zod";
import type { ActivityBinding, ReadContext, RenderFact } from "../contracts";
import { query } from "../sdk/authoring";
import { ExcavationWork } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";

/** Native terrain work uses one-metre horizontal coordinates. Art owns poses. */
export const workActivitySchema = z.object({
  kind: z.enum(["dig", "build", "chop"]),
  target: z.tuple([z.number().finite(), z.number().finite()]),
}).strict();
export type WorkActivity = z.infer<typeof workActivitySchema>;

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
  for (const binding of extra) {
    if (activity.has(binding.actor)) throw new Error("actor has competing work attendance");
    activity.set(binding.actor, { kind: binding.kind, target: [...binding.target] });
  }
  return facts.map(fact => {
    const work = activity.get(fact.id);
    return work ? { ...fact, activity: work } : fact;
  });
}
