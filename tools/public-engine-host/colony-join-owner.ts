import type { RegionSqliteOwner } from "../../src/engine/region/index.ts";
type ParticipantRow = { credential_hash: string; principal: string; player_id: string; party_id: string };
export async function runColonyJoinTransaction(options: { transaction: <T>(operation: () => T | Promise<T>) => Promise<T>; owner: RegionSqliteOwner; credentialHash: string; principal: string; bindingId: string; player: string; party: string; people: readonly string[]; dispatch: () => { status: "applied" | "rejected"; result: unknown } }): Promise<{ player: string; party: string; people: readonly string[] }> {
  return options.transaction(async () => {
    const existing = options.owner.sql.exec<ParticipantRow>("SELECT * FROM hive_public_participants WHERE credential_hash=?", options.credentialHash).toArray()[0];
    if (existing) return { player: existing.player_id, party: existing.party_id, people: options.people };
    const receipt = options.dispatch();
    const results = receipt.status === "applied" && receipt.result && typeof receipt.result === "object" ? (receipt.result as { results?: unknown }).results : undefined;
    if (!Array.isArray(results) || results.length !== 1 || !(results[0] as { accepted?: unknown })?.accepted) throw new Error("party-establish-rejected");
    options.owner.sql.exec("INSERT INTO hive_public_participants VALUES (?,?,?,?)", options.credentialHash, options.principal, options.player, options.party);
    return { player: options.player, party: options.party, people: options.people };
  });
}
