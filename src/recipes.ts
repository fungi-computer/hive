import type {
  BrewStationSlot,
  Material,
  PositiveInt,
  RecipeId,
} from "./model.ts";

type PortionRequirement = {
  readonly role: string;
  readonly material: Material;
  readonly quantity: PositiveInt;
  readonly slot: BrewStationSlot;
  readonly quantityPolicy: "portion" | "whole-lot";
};
type RetainedRequirement = PortionRequirement;
type PromiseRequirement =
  | {
      readonly role: string;
      readonly material: Material;
      readonly quantity: PositiveInt;
      readonly destination: {
        readonly kind: "station-slot";
        readonly slot: BrewStationSlot;
      };
    }
  | {
      readonly role: string;
      readonly material: Material;
      readonly quantity: PositiveInt;
      readonly destination: {
        readonly kind: "retained-interior";
        readonly role: string;
      };
    };

export type RecipeDefinition = {
  readonly id: RecipeId;
  readonly stationSlot: BrewStationSlot;
  readonly consumed: readonly PortionRequirement[];
  readonly retained: readonly RetainedRequirement[];
  readonly promises: readonly PromiseRequirement[];
  readonly timings: {
    readonly prepare: PositiveInt;
    readonly ferment: PositiveInt;
    readonly keg: PositiveInt;
    readonly tap: PositiveInt;
  };
  readonly tap: {
    readonly outputRole: string;
    readonly material: Material;
    readonly quantity: PositiveInt;
  };
};

/** Pinned authored facts; station capacity is deliberately not recipe yield. */
export const HERBAL_ALE_V1 = {
  id: "herbal-ale-v1",
  stationSlot: "kettle",
  consumed: [
    {
      role: "malt",
      material: "malt",
      quantity: 2 as PositiveInt,
      slot: "kettle",
      quantityPolicy: "portion",
    },
    {
      role: "water",
      material: "water",
      quantity: 2 as PositiveInt,
      slot: "kettle",
      quantityPolicy: "portion",
    },
    {
      role: "mugwort",
      material: "mugwort",
      quantity: 1 as PositiveInt,
      slot: "kettle",
      quantityPolicy: "whole-lot",
    },
    {
      role: "fuel",
      material: "wood",
      quantity: 1 as PositiveInt,
      slot: "hearth",
      quantityPolicy: "portion",
    },
  ],
  retained: [
    {
      role: "catalyst",
      material: "barm",
      quantity: 1 as PositiveInt,
      slot: "barm",
      quantityPolicy: "whole-lot",
    },
    {
      role: "package",
      material: "keg",
      quantity: 1 as PositiveInt,
      slot: "keg",
      quantityPolicy: "whole-lot",
    },
  ],
  promises: [
    {
      role: "ale",
      material: "ale",
      quantity: 4 as PositiveInt,
      destination: { kind: "retained-interior", role: "package" },
    },
    {
      role: "spent-grain",
      material: "spent-grain",
      quantity: 1 as PositiveInt,
      destination: { kind: "station-slot", slot: "tray" },
    },
  ],
  timings: {
    prepare: 40 as PositiveInt,
    ferment: 240 as PositiveInt,
    keg: 20 as PositiveInt,
    tap: 12 as PositiveInt,
  },
  tap: {
    outputRole: "ale",
    material: "ale",
    quantity: 1 as PositiveInt,
  },
} as const satisfies RecipeDefinition;

export function recipeDefinition(id: RecipeId): RecipeDefinition {
  if (id === HERBAL_ALE_V1.id) return HERBAL_ALE_V1;
  throw new Error(`unknown recipe ${id}`);
}
