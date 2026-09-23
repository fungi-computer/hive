import { command, component, entity, query } from "../sdk/authoring";
import { action, actor, behavior } from "../sdk/behavior";
import {
  Body,
  Container,
  MaterialLot,
  Position,
  consume,
  encodeDefinition,
  transfer,
} from "../sdk/common";
import type { GamePack } from "../contracts";
import { z } from "zod";
const emptyInput = z.null();
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
const advanceHunger = action("survival.advance-hunger", {
  reads: [MaterialLot],
  writes: [Condition],
  run(subject, world) {
    const value = subject.get(Condition);
    const recovery = subject.get(MealRule).recovery;
    const lots = new Map(world.query(query(MaterialLot)).map((lot) => [lot.id, lot.get(MaterialLot)]));
    const eaten = world.outcomes.reduce((total, outcome) => {
      if (!outcome.result.accepted || outcome.action.kind !== "consume" || outcome.action.entity !== subject.id)
        return total;
      return total + (lots.get(outcome.action.lot)?.kind === "bread" ? outcome.action.quantity : 0);
    }, 0);
    const hunger = Math.max(0, Math.min(100, value.hunger + world.clock.delta * 0.5 - eaten * recovery));
    world.write(Condition, subject.id, {
      hunger,
      wellbeing: hunger > 80 ? Math.max(0, value.wellbeing - world.clock.delta) : value.wellbeing,
    });
  },
});

export const survival = behavior("survival.hunger", (scene) => {
  scene.find(Survivor, Condition, MealRule).do(advanceHunger);
});

const advanceFatigue = action("survival.advance-fatigue", {
  reads: [Position, Body, Fatigue],
  writes: [Fatigue],
  run(subject, world) {
    const position = subject.get(Position);
    const previous = subject.get(Fatigue);
    const moved = position.x !== previous.lastX || position.y !== previous.lastY || position.z !== previous.lastZ;
    world.write(Fatigue, subject.id, {
      value: Math.max(0, Math.min(100, previous.value + (moved ? world.clock.delta * 5 : -world.clock.delta * 2))),
      lastX: position.x,
      lastY: position.y,
      lastZ: position.z,
    });
  },
});

export const fatigue = behavior("survival.fatigue", (scene) => {
  scene.find(Position, Body, Fatigue).do(advanceFatigue);
});

export const survivorActor = actor("survival.survivor")
  .with(Survivor, { controlled: true })
  .with(Condition, { hunger: 40, wellbeing: 100 })
  .with(MealRule, { recovery: 25 })
  .with(Position)
  .with(Body, { speed: 2 })
  .with(Fatigue, { value: 0, lastX: 0, lastY: 0, lastZ: 0 })
  .behaves(survival, fatigue);
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
  Container,
  MaterialLot,
  Survivor,
  Condition,
  MealRule,
  Fatigue,
] as const;
export const survivalPack: GamePack = {
  id: "survival",
  version: 1,
  localScope: { kind: "player", player: "local" },
  components: survivalComponents,
  systems: [survival, fatigue],
  commands: {
    takeFood: command({
      title: "Take bread", category: "Survival", description: "Take one bread portion from the locker.",
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
      title: "Eat bread", category: "Survival", description: "Eat one carried bread portion.",
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
      title: "Set meal recovery", category: "Survival", description: "Choose how much wellbeing one meal restores.",
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
  definition: encodeDefinition("survival", survivalComponents, survivalInitial, []),
  presentation: {
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
