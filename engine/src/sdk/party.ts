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

/** Kernel-owned replay proof for one atomic party establishment. */
export const PartyReceipt = component<{
  bindingId: string;
  player: string;
  party: EntityId;
  digest: string;
}>("hive.party-receipt", {
  version: 1,
  fields: {
    bindingId: "string",
    player: "string",
    party: "entity",
    digest: "string",
  },
});

export function establishParty(
  bindingId: string,
  player: string,
  party: EntityId,
  records: readonly EntityRecord[],
): ActionRequest {
  return { kind: "establish-party", bindingId, player, party, records };
}
