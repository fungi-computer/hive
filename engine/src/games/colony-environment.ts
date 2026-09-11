import {
  encodeEnvironmentDefinition,
  type EnvironmentDefinition,
} from "../sdk/environment";

/** Generated 64×64 Colony with a bounded near-surface water domain.
 * The actual native sample for this seed places the central surface at y=13.
 * Admit five connected layers including air above it, so removing soil can
 * expose groundwater without teleporting stock from the deep cave fixture.
 */
export const colonyEnvironment: EnvironmentDefinition = {
  world: {
    seed: "colony-world-v1",
    identity: "colony",
    bounds: {
      minX: -32,
      maxX: 32,
      minY: -32,
      maxY: 40,
      minZ: -32,
      maxZ: 32,
    },
    slots: { air: 0, soil: 1, stone: 2 },
    seaLevel: 12,
    verticalMetres: 0.54,
  },
  materials: [
    {
      slot: 0,
      solid: false,
      diggable: false,
      water: { kind: "open" },
    },
    {
      slot: 1,
      solid: true,
      diggable: true,
      water: {
        kind: "porous",
        rule: {
          id: "soil",
          porosity: 0.4,
          retention: 0.1,
          absorbMPerS: 0.1,
          seepMPerS: 0.1,
        },
      },
      excavation: {
        workSeconds: 2,
        outputKind: "soil-spoil",
        unitsPerCell: 3,
      },
    },
    {
      slot: 2,
      solid: true,
      diggable: true,
      // Fractured stone stores groundwater too; soil is not the only reservoir.
      water: { kind: "porous", rule: {
        id: "fractured-stone", porosity: 0.05, retention: 0.01,
        absorbMPerS: 0.01, seepMPerS: 0.01,
      } },
      excavation: {
        workSeconds: 4,
        outputKind: "stone-spoil",
        unitsPerCell: 3,
      },
    },
  ],
  water: {
    id: "colony-water-v1",
    cells: Array.from({ length: 5 }, (_, x) => x - 2).flatMap(x =>
      Array.from({ length: 5 }, (_, z) => z - 2).flatMap(z =>
        Array.from({ length: 5 }, (_, y) => [x, y + 10, z] as const),
      ),
    ),
    fallMPerS: 0.1,
    spreadMPerS: 0.1,
  },
};

const colonyInitialPlacements = [
  { entity: "colony.worker.1", column: [0, 0] },
  { entity: "colony.worker.2", column: [0, 2] },
  { entity: "colony.guest.1", column: [3, 1] },
  { entity: "colony.pantry", column: [-2, 0] },
] as const;

export const colonyEnvironmentDefinition =
  encodeEnvironmentDefinition({
    ...colonyEnvironment,
    initialPlacements: colonyInitialPlacements,
  } as EnvironmentDefinition & {
    readonly initialPlacements: readonly {
      readonly entity: string;
      readonly column: readonly [number, number];
    }[];
  });
