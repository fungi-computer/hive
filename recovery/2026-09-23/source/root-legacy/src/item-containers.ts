import type {
  ContainerId,
  ItemLot,
  LotId,
  Material,
  PositiveInt,
} from "./model.ts";
import type { ContainerSpec } from "./materials.ts";
import {
  checkedMaterialDefinitions,
  resolvePortableInterior,
} from "./engine/materials/definitions.ts";

/** Goblin's physical content capabilities. Visual assets confer no capability. */
export const MATERIAL_DEFINITIONS = checkedMaterialDefinitions<Material>({
  wood: { carry: "portion" },
  mugwort: { carry: "portion" },
  water: { carry: "contained" },
  pail: {
    carry: "whole",
    interior: {
      capacity: 2 as PositiveInt,
      accepts: ["water"],
      bulk: { water: 1 as PositiveInt },
    },
  },
  malt: { carry: "portion" },
  barm: { carry: "portion" },
  keg: {
    carry: "portion",
    interior: {
      capacity: 4 as PositiveInt,
      accepts: ["ale"],
      bulk: { ale: 1 as PositiveInt },
    },
  },
  ale: { carry: "portion" },
  "spent-grain": { carry: "portion" },
  soil: { carry: "portion" },
  ration: { carry: "portion" },
});
export function vesselContainer(lot: LotId): ContainerId {
  return `vessel:${lot}`;
}
export function portableContainerInterior(lot: ItemLot): ContainerSpec | null {
  return resolvePortableInterior(MATERIAL_DEFINITIONS, lot);
}
