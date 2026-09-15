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
    id: "wood-hearth", materialKind: "wood", quantity: 1,
    durationS: 30, smokeKg: 0.03, heatJ: 30000,
  }],
  processes: [{
    id: "herbal-ale-v1", version: 1, stationCatalog: "brew-station",
    inputs: [
      { role: "malt", port: "kettle", material: "malt", quantity: 2, policy: "portion", disposition: "consume" },
      { role: "water", port: "kettle", material: "water", quantity: 2, policy: "portion", disposition: "consume" },
      { role: "mugwort", port: "kettle", material: "mugwort", quantity: 1, policy: "whole-lot", disposition: "consume" },
      { role: "wood", port: "hearth", material: "wood", quantity: 1, policy: "portion", disposition: "emission-source" },
      { role: "barm", port: "barm", material: "barm", quantity: 1, policy: "whole-lot", disposition: "retain" },
      { role: "keg", port: "keg", material: "keg", quantity: 1, policy: "whole-lot", disposition: "retain" },
    ],
    stages: [
      { id: "prepare", mode: "attended", durationSeconds: 40, transition: { consumeRoles: ["malt", "water", "mugwort"], emission: { role: "wood", catalog: "wood-hearth" } } },
      { id: "ferment", mode: "elapsed", durationSeconds: 240, transition: {} },
      { id: "keg", mode: "attended", durationSeconds: 20, transition: { outputs: [
        { role: "ale", material: "ale", quantity: 4, destination: { kind: "retained-container", role: "keg" } },
        { role: "spent-grain", material: "spent-grain", quantity: 1, destination: { kind: "station-port", port: "tray" } },
      ] } },
    ],
  }],
  resourceSites: [{
    id: "mugwort",
    outputKind: "mugwort",
    outputQuantity: 1,
    sowSeconds: 2,
    tendSeconds: 2,
    harvestSeconds: 1,
    stages: [
      { delaySeconds: 20, waterPortions: 1 },
      { delaySeconds: 80, waterPortions: 1 },
      { delaySeconds: 240, waterPortions: 1 },
    ],
  }],
  structures: {
    maxSpanSteps: 6,
    catalog: [
      { id: "timber-floor", shape: { kind: "floor" }, workReachBelowCells: 4, materials: [{ kind: "wood", quantity: 2 }], workSeconds: 2,
        onRemove: { salvage: [{ kind: "wood", quantity: 2 }] } },
      { id: "timber-wall", shape: { kind: "wall", height: 4 }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 4 }], workSeconds: 4,
        onRemove: { salvage: [{ kind: "wood", quantity: 4 }] } },
      { id: "timber-door", shape: { kind: "aperture", height: 4, openingBottom: 0, openingHeight: 3 }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 4 }], workSeconds: 4,
        onRemove: { salvage: [{ kind: "wood", quantity: 4 }] } },
      { id: "timber-stair", shape: { kind: "stair", run: 2, rise: 4 }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 6 }], workSeconds: 6,
        onRemove: { salvage: [{ kind: "wood", quantity: 6 }] } },
      { id: "timber-roof", shape: { kind: "cover" }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 2 }], workSeconds: 3,
        onRemove: { salvage: [{ kind: "wood", quantity: 2 }] } },
      { id: "timber-bed", shape: { kind: "fixture", footprint: [[0, 0], [0, 1]] }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 2 }], workSeconds: 3,
        onRemove: { salvage: [{ kind: "wood", quantity: 2 }] } },
      { id: "timber-shelf", shape: { kind: "fixture", footprint: [[0, 0], [1, 0]] }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 3 }], workSeconds: 4,
        onComplete: { ports: [{ key: "storage", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 12 } }, { name: "hive.stockpile-cell", value: { zone: "shelves", priority: 4, filterProfile: "materials" } }] }] }, onRemove: { salvage: [{ kind: "wood", quantity: 3 }], emptyPorts: ["storage"] } },
      { id: "brew-station", shape: { kind: "fixture", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]] }, workReachBelowCells: 0, materials: [{ kind: "wood", quantity: 6 }], workSeconds: 12,
        onComplete: { ports: [
          { key: "kettle", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 5 } }] },
          { key: "hearth", at: "site-contact", components: [
            { name: "hive.container", value: { capacity: 2 } },
            { name: "hive.emitter", value: { catalog: "wood-hearth" } },
          ] },
          { key: "barm", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 1 } }] },
          { key: "keg", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 1 } }] },
          { key: "tray", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 1 } }] },
        ] },
        onRemove: { salvage: [{ kind: "wood", quantity: 3 }], emptyPorts: ["kettle", "hearth", "barm", "keg", "tray"] } },
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
  materialVolumes: [
    "water", "beer", "ale", "mud", "dirt", "piss", "shit", "dirty-mop-water",
    "wood", "bread", "malt", "mugwort", "barm", "keg", "pail", "spent-grain", "soil-spoil", "stone-spoil",
  ].map(kind => ({ kind, unitVolume: 1 })),
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
  { entity: "colony.local-party.person.0", column: [0, 0] },
  { entity: "colony.local-party.person.1", column: [0, 2] },
  { entity: "colony.cat.1", column: [1, 1] },
  { entity: "colony.guest.1", column: [3, 1] },
  { entity: "colony.local-party.starter-store", column: [4, 0] },
  { entity: "colony.tree.oak", column: [2, 2] },
  { entity: "colony.tree.pine", column: [-5, 4] },
  { entity: "colony.tree.willow", column: [4, -5] },
] as const;

export const colonyEnvironmentDefinition =
  encodeEnvironmentDefinition({
    ...colonyEnvironment,
    initialPlacements: colonyInitialPlacements,
  });
