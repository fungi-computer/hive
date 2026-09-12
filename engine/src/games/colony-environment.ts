import {
  encodeEnvironmentDefinition,
  type EnvironmentDefinition,
} from "../sdk/environment";

const colonyWorldBounds = Object.freeze({
  minX: -32,
  maxX: 32,
  minY: -32,
  maxY: 40,
  minZ: -32,
  maxZ: 32,
});

/** Generated 64×64 Colony. Initial water observations surround the arrival;
 * finite groundwater awakens wherever players dig, throughout the world bounds.
 * Undisturbed groundwater is generated from geology once, never a refill rate.
 */
export const colonyEnvironment: EnvironmentDefinition = {
  world: {
    seed: "colony-world-v1",
    identity: "colony",
    bounds: colonyWorldBounds,
    slots: { air: 0, soil: 1, stone: 2 },
    seaLevel: 12,
    verticalMetres: 0.54,
  },
  // Smoke samples use the same full world bounds as terrain. Outside
  // this domain is unmodeled, never reported as smoke-free air.
  atmosphere: {
    regionId: "colony-village-air",
    min: { x: colonyWorldBounds.minX, y: colonyWorldBounds.minY, z: colonyWorldBounds.minZ },
    max: { x: colonyWorldBounds.maxX, y: colonyWorldBounds.maxY, z: colonyWorldBounds.maxZ },
    exterior: "WorldTop",
    ambientTemperatureC: 20,
    spreadPerSecond: 1,
    riseBias: 0.1,
    wind: [0, 0, 0],
    outdoorLossPerSecond: 0.1,
    heatCapacityJPerM3K: 1200,
  },
  emissions: [{
    id: "wood-hearth", materialKind: "wood", quantity: 2,
    durationS: 30, smokeKg: 0.03, heatJ: 30000,
  }],
  structures: {
    maxSpanSteps: 6,
    catalog: [
      { id: "timber-floor", shape: { kind: "floor" }, materials: [{ kind: "wood", quantity: 2 }], workSeconds: 2 },
      { id: "timber-wall", shape: { kind: "wall", height: 4 }, materials: [{ kind: "wood", quantity: 4 }], workSeconds: 4 },
      { id: "timber-stair", shape: { kind: "stair", run: 4, rise: 4 }, materials: [{ kind: "wood", quantity: 6 }], workSeconds: 6 },
    ],
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
  { entity: "colony.brew-station", column: [1, -1] },
  { entity: "colony.worker.1", column: [0, 0] },
  { entity: "colony.worker.2", column: [0, 2] },
  { entity: "colony.guest.1", column: [3, 1] },
  { entity: "colony.pantry", column: [-2, 0] },
  { entity: "colony.lumber", column: [-3, 1] },
] as const;

export const colonyEnvironmentDefinition =
  encodeEnvironmentDefinition({
    ...colonyEnvironment,
    initialPlacements: colonyInitialPlacements,
  });
