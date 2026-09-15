import { component } from "../sdk/authoring";
import type { EntityId } from "../contracts";

/** Content identity for a finite resource. Native facts remain authoritative. */
export const ColonyTree = component<{ kind: string }>("colony.tree", {
  version: 1,
  fields: { kind: "string" },
});

/** Player intent binding for one durable job occurrence. */
export const ColonyTreePolicy = component<{ designated: boolean; party: EntityId | null; job: EntityId | null }>(
  "colony.tree-policy",
  { version: 3, fields: { designated: "boolean", party: "nullable-entity", job: "nullable-entity" } },
);
