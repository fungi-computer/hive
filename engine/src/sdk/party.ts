import { component, relation } from "./authoring";
import type { ActionRequest, ActorInstantiationPlan, EntityId } from "../contracts";

/** Stable player ownership of one work/travel group. */
export const Party = component<{ ownerPlayer: string }>("hive.party", {
  version: 1,
  fields: { ownerPlayer: "string" },
});

/** A person belongs to this party without duplicating their physical identity. */
export const PartyMember = relation<{ party: EntityId }>(
  "hive.party-member",
  {
    version: 1,
    fields: { party: "entity" },
    targetField: "party",
    targetRequires: [Party],
    onTargetRemoved: "detach",
  },
);

/** Party ownership for property and stationary stores. */
export const OwnedByParty = component<{ party: EntityId }>(
  "hive.owned-by-party",
  { version: 1, fields: { party: "entity" } },
);

export function instantiateActors(
  bindingId: string,
  expectedSequence: number,
  plan: ActorInstantiationPlan,
): ActionRequest {
  return { kind: "instantiate-actors", bindingId, expectedSequence, plan };
}
