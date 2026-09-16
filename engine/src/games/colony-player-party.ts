import type { EntityId, GameCommandContext } from "../contracts";
import { query } from "../sdk/authoring";
import { OwnedBy, Party } from "../sdk/party";

/** Goblin policy: each player currently owns exactly one Colony party. */
export function colonyPartyForPlayer(
  context: Pick<GameCommandContext, "query" | "scope">,
): EntityId {
  if (context.scope.kind !== "player")
    throw new Error("Colony command requires an authenticated player");
  const parties = context
    .query(query(Party, OwnedBy))
    .filter((row) => row.get(OwnedBy).player === context.scope.player);
  if (parties.length !== 1)
    throw new Error("Player must own exactly one Colony party");
  return parties[0]!.id;
}
