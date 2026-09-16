import { component } from "./authoring";
import type { ActionRequest, EntityId, EntityRecord } from "../contracts";

/** Stable player ownership of one work/travel group. */
export const Party = component<{ ownerPlayer: string }>("hive.party", {
  version: 1,
  fields: { ownerPlayer: "string" },
});

/** A person belongs to this party without duplicating their physical identity. */
export const PartyMember = component<{ party: EntityId }>(
  "hive.party-member",
  { version: 1, fields: { party: "entity" } },
);

/** Party ownership for property and stationary stores. */
export const OwnedByParty = component<{ party: EntityId }>(
  "hive.owned-by-party",
  { version: 1, fields: { party: "entity" } },
);

export function establishParty(
  bindingId: string,
  expectedSequence: number,
  records: readonly EntityRecord[],
): ActionRequest {
  return { kind: "establish-party", bindingId, expectedSequence, records };
}
