export const environmentFixture = {
  world: { seed: "seed-a", identity: "demo", bounds: { minX: -8, maxX: 8, minY: -8, maxY: 40, minZ: -8, maxZ: 8 },
    slots: { air: 0, soil: 1, stone: 2 }, seaLevel: 12, verticalMetres: 0.54 },
  structures: { maxSpanSteps: 6, catalog: [] },
  materials: [
    { slot: 0, solid: false, diggable: false, water: { kind: "open" } },
    { slot: 1, solid: true, diggable: true, water: { kind: "porous", rule: {
      id: "soil", porosity: 0.4, retention: 0.1, absorbMPerS: 0.1, seepMPerS: 0.1 } } },
    { slot: 2, solid: true, diggable: true, water: { kind: "closed" } },
  ],
  water: { id: "w", cells: [[0, -7, 0], [0, -6, 0], [0, 39, 0]], fallMPerS: 0.1, spreadMPerS: 0.1 },
};
