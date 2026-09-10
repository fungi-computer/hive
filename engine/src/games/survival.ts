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
export const survival = system({
  id: "survival.hunger",
  version: 1,
  reads: [Survivor, Condition, MaterialLot],
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
          .query(query(MaterialLot))
          .find((lot) => lot.id === action.lot);
        return (
          total +
          (lot?.get(MaterialLot).kind === "bread" ? outcome.action.quantity : 0)
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
  components: [Position, MaterialLot, Survivor, Condition],
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
  },
  definition: encodeDefinition(
    "survival",
    [Position, MaterialLot, Survivor, Condition],
    survivalInitial,
  ),
};
