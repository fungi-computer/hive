import type { ContainerId, ItemLot, LotId, PositiveInt } from "./model.ts";
import type { ContainerSpec } from "./materials.ts";

/** Portable container facts live with the two authored portable items. */
type PortableContainerDefinition = {
  readonly material: "pail" | "keg";
  readonly capacity: PositiveInt;
  readonly accepts: readonly ("water" | "ale")[];
  readonly bulk: Readonly<Partial<Record<"water" | "ale", PositiveInt>>>;
};

const PORTABLE_CONTAINERS = [
  {
    material: "pail",
    capacity: 2 as PositiveInt,
    accepts: ["water"],
    bulk: { water: 1 as PositiveInt },
  },
  {
    material: "keg",
    capacity: 4 as PositiveInt,
    accepts: ["ale"],
    bulk: { ale: 1 as PositiveInt },
  },
] as const satisfies readonly PortableContainerDefinition[];

export function vesselContainer(lot: LotId): ContainerId {
  return `vessel:${lot}`;
}

export function portableContainerInterior(lot: ItemLot): ContainerSpec | null {
  if (lot.quantity !== 1 || (lot.material !== "pail" && lot.material !== "keg"))
    return null;
  const definition = PORTABLE_CONTAINERS.find(
    (candidate) => candidate.material === lot.material,
  );
  return definition
    ? {
        id: vesselContainer(lot.id),
        capacity: definition.capacity,
        accepts: definition.accepts,
        bulk: definition.bulk,
      }
    : null;
}
