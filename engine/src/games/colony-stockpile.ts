import { query, system } from "../sdk/authoring";
import { DeliveryTask } from "../sdk/delivery";
import { GroundStock } from "../sdk/ground-stock";
import { Container, MaterialLot, Position } from "../sdk/common";
import { SealedContainer } from "../sdk/construction";
import { StockpileCell, planStockpileDeliveries, type StockpileFilterProfile } from "../sdk/stockpile";

/** Colony composition hook; delivery/work ownership stays in the shared provider. */
export function createColonyStockpileSystem(filterProfiles: Readonly<Record<string, StockpileFilterProfile>>) {
  return system({
    id: "colony.stockpile", version: 1,
    reads: [StockpileCell, GroundStock, MaterialLot, DeliveryTask, Container, Position, SealedContainer],
    writes: [DeliveryTask],
    run(context) { planStockpileDeliveries(context, { filterProfiles }); },
  });
}
