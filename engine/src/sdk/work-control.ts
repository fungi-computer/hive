import { component } from "./authoring";

/** Player participation policy for the shared automatic work owner. */
export const WorkParticipation = component<{ automatic: boolean }>(
  "hive.work-participation",
  { version: 1, fields: { automatic: "boolean" } },
);
