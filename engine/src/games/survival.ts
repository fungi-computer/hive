import { component, query, system } from "../sdk/authoring";
import { Carrying, FoodLot, Position, Selected, consume, encodeDefinition } from "../sdk/common";
import type { GamePack } from "../contracts";

export const Survivor = component<{ controlled: boolean }>("survival.survivor", { version: 1, fields: { controlled: "boolean" } });
export const Condition = component<{ hunger: number; wellbeing: number }>("survival.condition", { version: 1, fields: { hunger: "number", wellbeing: "number" } });
export const survival = system({ id: "survival.hunger", version: 1, reads: [Survivor, Condition, Carrying, FoodLot], writes: [Condition], run(ctx) {
  for (const row of ctx.query(query<{ controlled: boolean; hunger: number; wellbeing: number }>(Survivor, Condition))) {
    const value = row.value as { hunger: number; wellbeing: number };
    const hunger = Math.min(100, value.hunger + ctx.clock.delta * 0.5);
    ctx.write(Condition, row.id, { hunger, wellbeing: hunger > 80 ? Math.max(0, value.wellbeing - ctx.clock.delta) : value.wellbeing });
    const lot = ctx.query(query(FoodLot))[0];
    if (row.value.controlled && lot && hunger > 60) ctx.action(consume(row.id, lot.id, 1));
  }
});
export const survivalPack: GamePack = { id: "survival", version: 1, components: [Position, FoodLot, Carrying, Selected, Survivor, Condition], systems: [survival], definition: encodeDefinition("survival", [Position, FoodLot, Carrying, Selected, Survivor, Condition]) };
