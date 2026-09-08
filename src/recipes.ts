import type { ContainerId, PositiveInt } from "./model.ts";
import type { ContainerSpec } from "./materials.ts";

/** Pinned authored facts; container capacity is deliberately not recipe yield. */
export const HERBAL_ALE_V1 = {
  id: "herbal-ale-v1",
  inputs: {
    malt: 2 as PositiveInt,
    water: 2 as PositiveInt,
    mugwort: 1 as PositiveInt,
    wood: 1 as PositiveInt,
  },
  output: { material: "ale" as const, quantity: 4 as PositiveInt },
  byproduct: { material: "spent-grain" as const, quantity: 1 as PositiveInt },
  timings: {
    prepare: 40 as PositiveInt,
    ferment: 240 as PositiveInt,
    keg: 20 as PositiveInt,
    tap: 12 as PositiveInt,
  },
} as const;

/** The tray is a recipe-owned station destination, not a second inventory. */
export function herbalAleTray(station: string): ContainerSpec {
  return {
    id: `brew-tray:${station}` as ContainerId,
    capacity: 1 as PositiveInt,
    accepts: ["spent-grain"],
    bulk: { "spent-grain": 1 as PositiveInt },
  };
}
