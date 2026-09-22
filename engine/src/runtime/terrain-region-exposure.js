import { validateTerrainMaterialPatch } from "./terrain-region-materials.js";
const DIRECTIONS = Object.freeze([
  ["top", [0, 1, 0]],
  ["bottom", [0, -1, 0]],
  ["east", [1, 0, 0]],
  ["west", [-1, 0, 0]],
  ["south", [0, 0, 1]],
  ["north", [0, 0, -1]],
]);
export const MAX_TERRAIN_REGION_HEIGHT = 1024;
export const MAX_TERRAIN_REGION_SAMPLES = 65536;

/** Pure world-space exposure. Unknown and outside cells never become air.
 * columnTop is optional authoritative highest-solid metadata, never a guessed
 * heightmap: it only skips known empty space, not any buried voxel or cave.
 */
export function* terrainExposureSteps({
  bounds,
  core,
  level,
  sample,
  columnTop,
  maxFaces = 32768,
}) {
  const lowest = Math.max(core.minY ?? bounds.minY, bounds.minY);
  const highest = Math.min(
    level,
    (core.maxY ?? bounds.maxY) - 1,
    bounds.maxY - 1,
  );
  if (
    !Number.isSafeInteger(level) ||
    highest - lowest + 1 > MAX_TERRAIN_REGION_HEIGHT ||
    (core.maxX - core.minX) *
      (core.maxZ - core.minZ) *
      Math.max(0, highest - lowest + 1) >
      MAX_TERRAIN_REGION_SAMPLES
  )
    throw new RangeError("terrain region exceeds exposure work budget");
  let faceCount = 0;
  const inside = ([x, y, z]) =>
    x >= bounds.minX &&
    x < bounds.maxX &&
    y >= bounds.minY &&
    y < bounds.maxY &&
    z >= bounds.minZ &&
    z < bounds.maxZ;
  for (let x = core.minX; x < core.maxX; x++)
    for (let z = core.minZ; z < core.maxZ; z++) {
      const top = columnTop ? columnTop(x, z) : highest;
      const faces = [];
      for (let y = lowest; top !== null && y <= Math.min(highest, top); y++) {
        const cell = [x, y, z],
          material = sample(cell);
        if (material.kind !== "known" || !material.solid) continue;
        for (const [face, offset] of DIRECTIONS) {
          const adjacent = cell.map((value, index) => value + offset[index]);
          const neighbor = inside(adjacent)
            ? sample(adjacent)
            : { kind: "outside" };
          const atCut = face === "top" && y === level;
          if (!atCut && (neighbor.kind !== "known" || neighbor.solid)) continue;
          if (faceCount++ === maxFaces)
            throw new RangeError("terrain region exceeds face budget");
          faces.push({
            cell,
            face,
            material: material.material,
            cap: atCut && (neighbor.kind !== "known" || neighbor.solid),
          });
        }
      }
      yield faces;
    }
}

/** Reference collector; presentation owners consume steps to schedule work. */
export function exposeTerrainFaces(input) {
  return [...terrainExposureSteps(input)].flat();
}

/** One bounded core column (at most 128 cells) per step. These reads only derive
 * faces from known resident material; neither camera nor simulation advances.
 * Setup validates at most 100 columns / 13,000 runs and builds no dense volume. */
export function* terrainPatchExposureSteps({ patch, baseline, level }) {
  validateTerrainMaterialPatch(patch, baseline);
  const palette = new Map(
    baseline.materials.map((material) => [material.slot, material.solid]),
  );
  const c = patch.coverage,
    depth = c.maxZ - c.minZ;
  const sample = ([x, y, z]) => {
    if (
      x < c.minX ||
      x >= c.maxX ||
      y < c.minY ||
      y >= c.maxY ||
      z < c.minZ ||
      z >= c.maxZ
    )
      return { kind: "unknown" };
    const column = patch.columns[(x - c.minX) * depth + z - c.minZ];
    if (!column) return { kind: "unknown" };
    let lo = 0,
      hi = column.runs.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (column.runs[mid][0] <= y) lo = mid + 1;
      else hi = mid;
    }
    if (lo === column.runs.length) return { kind: "unknown" };
    const material = column.runs[lo][1];
    return { kind: "known", solid: palette.get(material), material };
  };
  yield* terrainExposureSteps({
    bounds: baseline.bounds,
    core: patch.bounds,
    level,
    sample,
  });
}

export function exposeTerrainPatch(input) {
  return [...terrainPatchExposureSteps(input)].flat();
}
