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
  // The village's 16×16 active air domain includes deep cells and the real sky
  // boundary. Outside it is unmodeled, never reported as smoke-free air.
  atmosphere: {
    regionId: "colony-village-air",
    min: { x: -8, y: -32, z: -8 },
    max: { x: 8, y: 40, z: 8 },
    ambient: { pressurePa: 101325, temperatureK: 293.15 },
    exterior: "WorldTop",
    model: {
      specificGasConstantJkgK: 287.05, heatCapacityJkgK: 1005,
      mixingVelocityMps: 1, buoyancyVelocityMpsK: 0.1,
      pressureVelocityMpsPa: 0.001, maxStepS: 0.2,
      maxExchangeFraction: 0.5, maxPressureRatio: 4,
      maxTemperatureDeltaK: 100, maxSmokeMassFraction: 0.01,
    },
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
  { entity: "colony.hearth", column: [1, -1] },
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
