import { component } from "./authoring";

/** Player participation policy for the shared automatic work owner. */
export const WorkParticipation = component<{ automatic: boolean }>(
  "hive.work-participation",
  { version: 1, fields: { automatic: "boolean" } },
);
export const WorkPolicy = component<{ pool: string; priority: number; enabled: boolean }>("hive.work-policy", {
  version: 1,
  fields: { pool: "entity", priority: "number", enabled: "boolean" },
});
export const WorkSchedule = component<{ nextReviewTick: number; lastConsidered: number }>("hive.work-schedule", {
  version: 1,
  fields: { nextReviewTick: "number", lastConsidered: "number" },
});
