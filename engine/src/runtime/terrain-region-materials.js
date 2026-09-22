/** Bounded, cut-independent authoritative material coverage. Slabs start at the
 * world's minimum Y, so a short world needs one slab regardless of its cut. */
export const TERRAIN_REGION_EDGE = 8;
export const TERRAIN_REGION_HEIGHT = 128;
export const MAX_TERRAIN_REGION_COLUMNS = 100;
export const MAX_TERRAIN_REGION_RUNS = TERRAIN_REGION_HEIGHT + 2;

export function terrainRegionLayout(world, [rx, rz, slab]) {
  const bounds = {
    minX: Math.max(rx * TERRAIN_REGION_EDGE, world.minX),
    maxX: Math.min((rx + 1) * TERRAIN_REGION_EDGE, world.maxX),
    minY: world.minY + slab * TERRAIN_REGION_HEIGHT,
    maxY: Math.min(world.minY + (slab + 1) * TERRAIN_REGION_HEIGHT, world.maxY),
    minZ: Math.max(rz * TERRAIN_REGION_EDGE, world.minZ),
    maxZ: Math.min((rz + 1) * TERRAIN_REGION_EDGE, world.maxZ),
  };
  if (
    slab < 0 ||
    bounds.minX >= bounds.maxX ||
    bounds.minY >= bounds.maxY ||
    bounds.minZ >= bounds.maxZ
  )
    return null;
  const coverage = {};
  for (const axis of ["X", "Y", "Z"]) {
    coverage[`min${axis}`] = Math.max(
      bounds[`min${axis}`] - 1,
      world[`min${axis}`],
    );
    coverage[`max${axis}`] = Math.min(
      bounds[`max${axis}`] + 1,
      world[`max${axis}`],
    );
  }
  return { bounds, coverage };
}

/** Validate complete canonical coverage. Missing cells are never inferred air.
 * The optional baseline also verifies clipped halos and the material palette. */
export function validateTerrainMaterialPatch(patch, baseline) {
  const {
    bounds: b,
    coverage: c,
    key: [rx, rz, slab],
    columns,
    surfaces,
  } = patch;
  if (
    slab < 0 ||
    b.minX >= b.maxX ||
    b.minY >= b.maxY ||
    b.minZ >= b.maxZ ||
    b.minX < rx * TERRAIN_REGION_EDGE ||
    b.maxX > (rx + 1) * TERRAIN_REGION_EDGE ||
    b.minZ < rz * TERRAIN_REGION_EDGE ||
    b.maxZ > (rz + 1) * TERRAIN_REGION_EDGE ||
    b.maxY - b.minY > TERRAIN_REGION_HEIGHT
  )
    throw new Error("invalid terrain region bounds");
  for (const axis of ["X", "Y", "Z"]) {
    if (
      c[`min${axis}`] > b[`min${axis}`] ||
      c[`min${axis}`] < b[`min${axis}`] - 1 ||
      c[`max${axis}`] < b[`max${axis}`] ||
      c[`max${axis}`] > b[`max${axis}`] + 1
    )
      throw new Error("invalid terrain material coverage halo");
  }
  if (columns.length !== (c.maxX - c.minX) * (c.maxZ - c.minZ))
    throw new Error("incomplete terrain material columns");
  let index = 0;
  for (let x = c.minX; x < c.maxX; x++)
    for (let z = c.minZ; z < c.maxZ; z++) {
      const column = columns[index++];
      if (column.x !== x || column.z !== z)
        throw new Error("terrain material columns must be in canonical order");
      let end = c.minY,
        previous;
      for (const [next, slot] of column.runs) {
        if (
          !Number.isInteger(next) ||
          next <= end ||
          next > c.maxY ||
          slot === previous
        )
          throw new Error("invalid or noncanonical terrain material run");
        if (!Number.isInteger(slot) || slot < 0 || slot > 65535)
          throw new Error("invalid terrain material slot");
        end = next;
        previous = slot;
      }
      if (end !== c.maxY)
        throw new Error("incomplete terrain material run coverage");
    }
  const supports = new Set();
  for (const surface of surfaces) {
    const [x, , z] = surface.cell,
      id = `${x},${z}`;
    if (
      x < c.minX ||
      x >= c.maxX ||
      z < c.minZ ||
      z >= c.maxZ ||
      supports.has(id)
    )
      throw new Error("invalid terrain region support halo");
    supports.add(id);
  }
  if (baseline) {
    const layout = terrainRegionLayout(baseline.bounds, patch.key);
    if (
      !layout ||
      ["bounds", "coverage"].some((field) =>
        Object.keys(layout[field]).some(
          (k) => layout[field][k] !== patch[field][k],
        ),
      )
    )
      throw new Error(
        "terrain material coverage does not match authoritative bounds",
      );
    const slots = new Set(baseline.materials.map((material) => material.slot));
    if (
      columns.some((column) => column.runs.some(([, slot]) => !slots.has(slot)))
    )
      throw new Error("terrain material coverage contains unknown slot");
    if (
      surfaces.some(
        (surface) =>
          surface.cell[1] < baseline.bounds.minY ||
          surface.cell[1] >= baseline.bounds.maxY ||
          !slots.has(surface.material),
      )
    )
      throw new Error(
        "terrain support exceeds authoritative bounds or palette",
      );
  }
}

/** Cached facts are borrowed by presentation; transport cloning must not give
 * a consumer permission to mutate another cut's future input. */
export function freezeTerrainMaterialPatch(patch) {
  for (const column of patch.columns) {
    for (const run of column.runs) Object.freeze(run);
    Object.freeze(column.runs);
    Object.freeze(column);
  }
  for (const surface of patch.surfaces) {
    Object.freeze(surface.cell);
    if (surface.cover) Object.freeze(surface.cover);
    Object.freeze(surface);
  }
  Object.freeze(patch.columns);
  Object.freeze(patch.surfaces);
  Object.freeze(patch.bounds);
  Object.freeze(patch.coverage);
  Object.freeze(patch.key);
  return Object.freeze(patch);
}
