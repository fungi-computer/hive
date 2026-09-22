import { terrainRegionLayout } from "./terrain-region-materials.js";

/** Small exact fixture; callers may supply a larger world and material oracle. */
export function materialPatch(
  [rx, rz, slab = 0],
  world = {
    minX: rx * 8,
    maxX: rx * 8 + 1,
    minY: 0,
    maxY: 1,
    minZ: rz * 8,
    maxZ: rz * 8 + 1,
  },
  sample = () => 0,
) {
  const key = [rx, rz, slab],
    layout = terrainRegionLayout(world, key);
  if (!layout) throw new Error("fixture outside world");
  const columns = [],
    c = layout.coverage;
  for (let x = c.minX; x < c.maxX; x++)
    for (let z = c.minZ; z < c.maxZ; z++) {
      const runs = [];
      for (let y = c.minY; y < c.maxY; y++) {
        const slot = sample([x, y, z]),
          previous = runs.at(-1);
        if (previous?.[1] === slot) previous[0] = y + 1;
        else runs.push([y + 1, slot]);
      }
      columns.push({ x, z, runs });
    }
  return { key, ...layout, columns, surfaces: [] };
}
