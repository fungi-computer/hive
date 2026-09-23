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
export function exposeTerrainFaces({
  bounds,
  core,
  level,
  sample,
  columnTop,
  maxFaces = 32768,
}) {
  const highest = Math.min(level, bounds.maxY - 1);
  if (
    !Number.isSafeInteger(level) ||
    highest - bounds.minY + 1 > MAX_TERRAIN_REGION_HEIGHT ||
    (core.maxX - core.minX) *
      (core.maxZ - core.minZ) *
      Math.max(0, highest - bounds.minY + 1) >
      MAX_TERRAIN_REGION_SAMPLES
  )
    throw new RangeError("terrain region exceeds exposure work budget");
  const faces = [];
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
      if (top === null) continue;
      for (let y = bounds.minY; y <= Math.min(highest, top); y++) {
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
          if (faces.length === maxFaces)
            throw new RangeError("terrain region exceeds face budget");
          faces.push({
            cell,
            face,
            material: material.material,
            cap: atCut && (neighbor.kind !== "known" || neighbor.solid),
          });
        }
      }
    }
  return faces;
}
