import { component, entity, query, system } from "../sdk/authoring";
import {
  Carrying,
  FoodLot,
  Position,
  Selected,
  consume,
  encodeDefinition,
  transfer,
} from "../sdk/common";
import type { GamePack } from "../contracts";

export const Survivor = component<{ controlled: boolean }>(
  "survival.survivor",
  { version: 1, fields: { controlled: "boolean" } },
);
export const Condition = component<{ hunger: number; wellbeing: number }>(
  "survival.condition",
  { version: 1, fields: { hunger: "number", wellbeing: "number" } },
);
export const survival = system({
  id: "survival.hunger",
  version: 1,
  reads: [Survivor, Condition, Carrying, FoodLot],
  writes: [Condition],
  run(ctx) {
    for (const row of ctx.query(query(Survivor, Condition))) {
      const survivor = row.get(Survivor),
        value = row.get(Condition);
      const eaten = ctx.outcomes.reduce((total, outcome) => {
        if (
          !outcome.result.accepted ||
          outcome.action.kind !== "consume" ||
          outcome.action.entity !== row.id
        )
          return total;
        const action = outcome.action;
        const lot = ctx
          .query(query(FoodLot))
          .find((lot) => lot.id === action.lot);
        return (
          total +
          (lot?.get(FoodLot).kind === "bread" ? outcome.action.quantity : 0)
        );
      }, 0);
      const hunger = Math.max(
        0,
        Math.min(100, value.hunger + ctx.clock.delta * 0.5 - eaten * 25),
      );
      ctx.write(Condition, row.id, {
        hunger,
        wellbeing:
          hunger > 80
            ? Math.max(0, value.wellbeing - ctx.clock.delta)
            : value.wellbeing,
      });
    }
  },
});
const survivorId = entity("survival.survivor.1"),
  lockerId = entity("survival.locker"),
  foodId = entity("survival.food.1");
const survivalInitial = [
  {
    id: survivorId,
    components: {
      "hive.position": { x: 0, y: 0, z: 0, facing: 0 },
      "hive.body": { speed: 2 },
      "hive.container": { capacity: 2 },
      "hive.visual": { sprite: "goblin.survivor", label: "Survivor" },
      "survival.survivor": { controlled: true },
      "survival.condition": { hunger: 40, wellbeing: 100 },
    },
  },
  {
    id: lockerId,
    components: {
      "hive.position": { x: 2, y: 0, z: 0, facing: 0 },
      "hive.container": { capacity: 12 },
      "hive.visual": { sprite: "crate", label: "Locker" },
    },
  },
  {
    id: foodId,
    components: {
      "hive.lot": { quantity: 8, kind: "bread", container: lockerId },
    },
  },
];
export const survivalPack: GamePack = {
  id: "survival",
  version: 1,
  components: [Position, FoodLot, Carrying, Selected, Survivor, Condition],
  systems: [survival],
  definition: encodeDefinition(
    "survival",
    [Position, FoodLot, Carrying, Selected, Survivor, Condition],
    survivalInitial,
  ),
};
export const takeFood = () => transfer(foodId, lockerId, survivorId, 1);
export const eatFood = () => consume(survivorId, foodId, 1);
