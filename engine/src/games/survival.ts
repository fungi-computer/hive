import { command, component, entity, query, system } from "../sdk/authoring";
import {
  Body,
  MaterialLot,
  Position,
  consume,
  encodeDefinition,
  transfer,
} from "../sdk/common";
import type { GamePack } from "../contracts";
import { z } from "zod";
const emptyInput = z.union([z.undefined(), z.object({}).strict()]);
const mealRuleInput = z.object({ recovery: z.union([z.literal(10), z.literal(25)]) }).strict();

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
export const Fatigue = component<{
  value: number;
  lastX: number;
  lastY: number;
  lastZ: number;
}>("survival.fatigue", {
  version: 1,
  fields: {
    value: "number",
    lastX: "number",
    lastY: "number",
    lastZ: "number",
  },
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
export const fatigue = system({
  id: "survival.fatigue",
  version: 1,
  reads: [Position, Body, Fatigue],
  writes: [Fatigue],
  run(ctx) {
    for (const row of ctx.query(query(Position, Body, Fatigue))) {
      const position = row.get(Position);
      const previous = row.get(Fatigue);
      const moved =
        position.x !== previous.lastX ||
        position.y !== previous.lastY ||
        position.z !== previous.lastZ;
      ctx.write(Fatigue, row.id, {
        value: Math.max(
          0,
          Math.min(
            100,
            previous.value +
              (moved ? ctx.clock.delta * 5 : -ctx.clock.delta * 2),
          ),
        ),
        lastX: position.x,
        lastY: position.y,
        lastZ: position.z,
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
      "survival.fatigue": { value: 0, lastX: 0, lastY: 0, lastZ: 0 },
    },
  },
  {
    id: lockerId,
    components: {
      "hive.position": { x: 2, y: 0, z: 0, facing: 0 },
      "hive.container": { capacity: 12 },
      "hive.obstacle": { occupied: true },
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
const survivalComponents = [
  Position,
  Body,
  MaterialLot,
  Survivor,
  Condition,
  MealRule,
  Fatigue,
] as const;
export const survivalPack: GamePack = {
  id: "survival",
  version: 1,
  components: survivalComponents,
  systems: [survival, fatigue],
  commands: {
    takeFood: command({
      input: emptyInput,
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
      input: emptyInput,
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
      input: mealRuleInput,
      writes: [MealRule],
      run: (_context, { recovery }) => {
        return {
          actions: [],
          writes: [
            { component: MealRule.id, entity: survivorId, value: { recovery } },
          ],
        };
      },
    }),
  },
  definition: encodeDefinition("survival", survivalComponents, survivalInitial),
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
      const fatigue = context.query(query(Fatigue))[0]?.get(Fatigue);
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
        {
          id: "fatigue",
          label: "Fatigue",
          value: fatigue?.value ?? 0,
        },
      ];
    },
  },
};
