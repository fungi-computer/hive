import { command, component, entity, query, system } from "../sdk/authoring";
import {
  MaterialLot,
  Position,
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
export const MealRule = component<{ recovery: number }>("survival.meal-rule", {
  version: 1,
  fields: { recovery: "number" },
});
export const survival = system({
  id: "survival.hunger",
  version: 1,
  reads: [Survivor, Condition, MaterialLot, MealRule],
  writes: [Condition],
  run(ctx) {
    for (const row of ctx.query(query(Survivor, Condition))) {
      const survivor = row.get(Survivor),
        value = row.get(Condition),
        recovery = ctx.query(query(MealRule))[0]?.get(MealRule).recovery ?? 25;
      const eaten = ctx.outcomes.reduce((total, outcome) => {
        if (
          !outcome.result.accepted ||
          outcome.action.kind !== "consume" ||
          outcome.action.entity !== row.id
        )
          return total;
        const action = outcome.action;
        const lot = ctx
          .query(query(MaterialLot))
          .find((lot) => lot.id === action.lot);
        return (
          total +
          (lot?.get(MaterialLot).kind === "bread" ? outcome.action.quantity : 0)
        );
      }, 0);
      const hunger = Math.max(
        0,
        Math.min(100, value.hunger + ctx.clock.delta * 0.5 - eaten * recovery),
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
      "survival.meal-rule": { recovery: 25 },
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
  components: [Position, MaterialLot, Survivor, Condition, MealRule],
  systems: [survival],
  commands: {
    takeFood: command({
      reads: [MaterialLot],
      writes: [],
      run(context) {
        const lot = context.query(query(MaterialLot)).find((row) => {
          const value = row.get(MaterialLot);
          return (
            value.container === lockerId &&
            value.kind === "bread" &&
            value.quantity > 0
          );
        });
        if (!lot) throw new Error("The locker is empty");
        return {
          actions: [transfer(lot.id, lockerId, survivorId, 1)],
          writes: [],
        };
      },
    }),
    eatFood: command({
      reads: [MaterialLot],
      writes: [],
      run(context) {
        const lot = context.query(query(MaterialLot)).find((row) => {
          const value = row.get(MaterialLot);
          return (
            value.container === survivorId &&
            value.kind === "bread" &&
            value.quantity > 0
          );
        });
        if (!lot) throw new Error("Pick up some bread first");
        return { actions: [consume(survivorId, lot.id, 1)], writes: [] };
      },
    }),
    setMealRule: command({
      writes: [MealRule],
      run: (_context, input) => {
        const recovery = (input as { recovery?: unknown } | null)?.recovery;
        if (recovery !== 10 && recovery !== 25)
          throw new Error("meal recovery must be ten or twenty-five");
        return {
          actions: [],
          writes: [
            { component: MealRule.id, entity: survivorId, value: { recovery } },
          ],
        };
      },
    }),
  },
  definition: encodeDefinition(
    "survival",
    [Position, MaterialLot, Survivor, Condition, MealRule],
    survivalInitial,
  ),
  presentation: {
    controls: [
      { id: "take", label: "Take bread", command: "takeFood" },
      { id: "eat", label: "Eat bread", command: "eatFood" },
      {
        id: "recovery-10",
        label: "Meal recovery 10",
        command: "setMealRule",
        input: { recovery: 10 },
      },
      {
        id: "recovery-25",
        label: "Meal recovery 25",
        command: "setMealRule",
        input: { recovery: 25 },
      },
    ],
    inspect: (context) => {
      const condition = context.query(query(Condition))[0]?.get(Condition);
      const lots = context
        .query(query(MaterialLot))
        .map((row) => row.get(MaterialLot));
      return [
        { id: "hunger", label: "Hunger", value: condition?.hunger ?? 0 },
        {
          id: "wellbeing",
          label: "Wellbeing",
          value: condition?.wellbeing ?? 0,
        },
        {
          id: "carried",
          label: "Carried bread",
          value: lots
            .filter((lot) => lot.container === survivorId)
            .reduce((sum, lot) => sum + lot.quantity, 0),
        },
        {
          id: "locker",
          label: "Locker bread",
          value: lots
            .filter((lot) => lot.container === lockerId)
            .reduce((sum, lot) => sum + lot.quantity, 0),
        },
        {
          id: "meal-recovery",
          label: "Meal recovery",
          value:
            context.query(query(MealRule))[0]?.get(MealRule).recovery ?? 25,
        },
      ];
    },
  },
};
