import { z } from "zod";
import type { EntityId, ReadContext } from "../contracts";
import { query } from "../sdk/authoring";
import { MaterialLot } from "../sdk/common";
import { ConstructionSite } from "../sdk/construction";
import { StagedProcess } from "../sdk/process-supply";

const emissionFactsSchema = z
  .object({
    emissions: z.array(
      z
        .object({
          source: z.string(),
          catalog: z.string(),
          elapsedS: z.number().finite().nonnegative(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const profiles = new Set([
  "empty",
  "stock-w0-b0-k0",
  "stock-w1-b0-k0",
  "stock-w0-b1-k0",
  "stock-w1-b1-k0",
  "stock-w0-b0-k1",
  "stock-w1-b0-k1",
  "stock-w0-b1-k1",
  "stock-w1-b1-k1",
  "prepare",
  "prepare-attended",
  "ferment",
  "ferment-burning",
  "keg",
  "settled",
]);

function total(
  lots: readonly { kind: string; quantity: number; container: EntityId }[],
  container: EntityId,
  kind: string,
): number {
  return lots.reduce(
    (sum, lot) =>
      sum +
      (lot.container === container && lot.kind === kind ? lot.quantity : 0),
    0,
  );
}

/** Select retained art from canonical process, custody, and paid-emission facts. */
export function colonyBrewStationProfiles(
  context: Pick<ReadContext, "query" | "environmentFacts">,
): ReadonlyMap<EntityId, string> {
  const lots = context
    .query(query(MaterialLot))
    .map((row) => row.get(MaterialLot));
  const processes = new Map(
    context
      .query(query(StagedProcess))
      .map((row) => [row.get(StagedProcess).station, row.get(StagedProcess)]),
  );
  const burning = new Set(
    emissionFactsSchema
      .parse(context.environmentFacts())
      .emissions.map((row) => row.source),
  );
  const result = new Map<EntityId, string>();
  for (const row of context.query(query(ConstructionSite))) {
    const site = row.get(ConstructionSite);
    if (site.catalog !== "brew-station" || site.phase !== "finished") continue;
    const process = processes.get(row.id);
    let profile: string;
    if (
      total(lots, `${row.id}:tray` as EntityId, "spent-grain") > 0 ||
      process?.phase === "complete"
    )
      profile = "settled";
    else if (process?.stageIndex === 0)
      profile = process.phase === "working" ? "prepare-attended" : "prepare";
    else if (process?.stageIndex === 1)
      profile = burning.has(`${row.id}:hearth`) ? "ferment-burning" : "ferment";
    else if (process?.stageIndex === 2) profile = "keg";
    else {
      const water =
        total(lots, `${row.id}:kettle` as EntityId, "water") > 0 ? 1 : 0;
      const barm =
        total(lots, `${row.id}:barm` as EntityId, "barm") > 0 ? 1 : 0;
      const keg = total(lots, `${row.id}:keg` as EntityId, "keg") > 0 ? 1 : 0;
      profile =
        water || barm || keg ? `stock-w${water}-b${barm}-k${keg}` : "empty";
    }
    if (!profiles.has(profile))
      throw new Error("Unknown retained brew-station profile");
    result.set(row.id, profile);
  }
  return result;
}
