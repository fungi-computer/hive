// Datum metadata for retained original art. This is descriptive export data:
// it never grants a physical capability or changes native structure facts.
const PLACEMENTS = Object.freeze({
  bed: Object.freeze({ kind: "footprint", bakedFootprint: [[0, 0], [0, 1]], rotationPivot: [0, 0] }),
  stair: Object.freeze({ kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], rotationPivot: [0, 0, 0] }),
  "brew-station": Object.freeze({ kind: "footprint", bakedFootprint: [[0, 0], [1, 0], [0, 1], [1, 1]], rotationPivot: [0.5, 0.5] }),
});

export function placementForStaticPath(path) {
  if (!Array.isArray(path) || path[0] !== "buildings") return undefined;
  return PLACEMENTS[path[1]];
}
