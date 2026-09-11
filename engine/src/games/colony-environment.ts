import {
  encodeEnvironmentDefinition,
  type EnvironmentDefinition,
} from "../sdk/environment";

/**
 * Authored terrain envelope for the future Colony environment join.
 *
 * The three water coordinates are the admitted cells from the native
 * environment fixture (environment_definition.rs and runtime/fixtures). They
 * remain provisional until a generated Colony-world proof confirms their
 * material and initial stock behavior under this larger bound.
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
      water: { kind: "closed" },
      excavation: {
        workSeconds: 4,
        outputKind: "stone-spoil",
        unitsPerCell: 3,
      },
    },
  ],
  water: {
    id: "colony-water-v1",
    cells: [[0, -7, 0], [0, -6, 0], [0, 39, 0]],
    fallMPerS: 0.1,
    spreadMPerS: 0.1,
  },
};

export const colonyEnvironmentDefinition =
  encodeEnvironmentDefinition(colonyEnvironment);
