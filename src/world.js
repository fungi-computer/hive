import { placementFooting, worldView, samePlacement } from "./game-space.ts";
import { TERRAIN_FRAME } from "./terrain.ts";
// Physical occupants use one signed world-voxel frame. Site helpers below
// explicitly retain authored placement coordinates.
import { terrainCell, terrainColumn } from "./terrain.ts";
export const SIZE = 15;
export const WATCHER = { x: 13, z: 2, level: 0 };
export const ROCKS = [
  { x: 1, z: 1, level: 0 },
  { x: 13, z: 12, level: 0 },
  { x: 2, z: 13, level: 0 },
  { x: 12, z: 1, level: 0 },
];
export const TREE_CELLS = [
  [3, 4],
  [10, 3],
  [3, 9],
  [11, 10],
  [6, 2],
  [1, 6],
  [6, 12],
  [12, 6],
];
export const cellKey = (p) => `${p.x},${p.y},${p.z}`;
export const sameCell = (a, b) => cellKey(a) === cellKey(b);
/** Horizontal clearing membership only; live support/vertical bounds belong to
 * the registered physical query used for admission and restore. */
export function inside(p) {
  return (
    [p.x, p.y, p.z].every(Number.isSafeInteger) &&
    p.x >= TERRAIN_FRAME.x &&
    p.x < TERRAIN_FRAME.x + SIZE &&
    p.z >= TERRAIN_FRAME.z &&
    p.z < TERRAIN_FRAME.z + SIZE
  );
}
export function stairCells(site) {
  return [0, 1, 2].map((distance) => ({
    x: site.x + (site.direction === 1 ? distance : 0),
    z: site.z + (site.direction === 1 ? 0 : distance),
    level: site.level,
  }));
}
export function stairLanding(site) {
  const cells = stairCells(site);
  const top = cells[2];
  return { x: top.x, z: top.z, level: site.level + 1 };
}
export function stairHeadroom(site) {
  return stairCells(site).map((cell) => ({
    x: cell.x,
    z: cell.z,
    level: site.level + 1,
  }));
}
function siteCells(site) {
  if (site.type === "stair") return stairCells(site);
  if (site.type === "brew-station")
    return [
      { x: site.x, z: site.z, level: site.level },
      { x: site.x + 1, z: site.z, level: site.level },
      { x: site.x, z: site.z + 1, level: site.level },
      { x: site.x + 1, z: site.z + 1, level: site.level },
    ];
  const cells = [{ x: site.x, z: site.z, level: site.level }];
  if (site.type === "bed")
    cells.push({
      x: site.x + (site.direction === 1 ? 1 : 0),
      z: site.z + (site.direction === 1 ? 0 : 1),
      level: site.level,
    });
  return cells;
}
/** Returns every physical loose lot at this exact cell; hand and stored lots do not occupy terrain. */
export function groundLotsAt(state, at) {
  return state.materials.lots.filter(
    (lot) => lot.location.kind === "ground" && sameCell(lot.location, at),
  );
}

/** Finite sources are terrain occupants even when sealed or depleted. */
export function sourceAt(state, at) {
  return (state.sources ?? []).find((source) => sameCell(source, at)) ?? null;
}

/** Work never stands inside a basin/cache body. Movement owns route choice. */
export function sourceAccessCells(source) {
  return neighbors(source).filter(inside);
}

/** @param {string|null} [excludeId] */
export function placementOccupant(state, at, excludeId = null) {
  if (sourceAt(state, at)) return "source";
  if (state.trees.some((tree) => sameCell(tree, at))) return "tree";
  if (state.rocks.some((rock) => sameCell(rock, at))) return "rock";
  if (
    state.sites.some((site) =>
      siteCells(site).some((cell) => sameCell(placementFooting(cell), at)),
    )
  )
    return "site";
  if (sameCell(state.watcher, at)) return "watcher";
  if (groundLotsAt(state, at).some((lot) => lot.material === "wood"))
    return "pile";
  if (state.herbs?.some((herb) => herb.id !== excludeId && sameCell(herb, at)))
    return "herb";
  if (
    groundLotsAt(state, at).some(
      (lot) => lot.id !== excludeId && lot.material === "mugwort",
    )
  )
    return "herb-bundle";
  return null;
}
/** Occupancy is checked separately from terrain geometry so completion can revalidate it. */
export function terrainEditProblem(state, at) {
  if (!inside(at) || at.y !== TERRAIN_FRAME.y)
    return "That is outside the current standing level.";
  const body = [...Object.values(state.actors), state.cat];
  if (body.some((pawn) => sameCell(pawn, at)))
    return "Someone is standing there.";
  if (
    body.some((pawn) =>
      pawn.traversal?.edge.sweep.some((cell) => sameCell(cell, at)),
    )
  )
    return "Someone is crossing that ground.";
  if (sourceAt(state, at)) return "A source occupies that ground.";
  if (state.trees.some((tree) => sameCell(tree, at)))
    return "A tree or stump occupies that ground.";
  if (state.rocks.some((rock) => sameCell(rock, at)))
    return "A rock occupies that ground.";
  if (sameCell(state.watcher, at)) return "The watcher occupies that ground.";
  if (
    state.sites.some((site) =>
      siteCells(site).some((cell) => sameCell(placementFooting(cell), at)),
    )
  )
    return "A structure occupies or depends on that ground.";
  if (state.herbs.some((herb) => sameCell(herb, at)))
    return "An herb occupies that ground.";
  if (groundLotsAt(state, at).length) return "Loose goods occupy that ground.";
  return null;
}
/** Safe cardinal rim cells; workers remain on the registered standing datum. */
export function terrainRimCells(state, at) {
  const terrainTargets = new Set(
    state.jobs
      .filter((job) => job.kind === "dig")
      .map((job) => cellKey(placementFooting(terrainColumn(job.voxel)))),
  );
  return neighbors(at).filter(
    (cell) =>
      inside(cell) &&
      cell.y === TERRAIN_FRAME.y &&
      !terrainTargets.has(cellKey(cell)) &&
      terrainCell(state.terrain, worldView(cell).x, worldView(cell).z).support,
  );
}
export function neighbors(p) {
  return [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ].map(([x, z]) => ({ x: p.x + x, y: p.y, z: p.z + z }));
}
export function builtSurface(state, at) {
  return state.sites.some(
    (site) =>
      site.finishedAt !== null &&
      ((site.type === "floor" && samePlacement(site, at)) ||
        (site.type === "stair" && samePlacement(stairLanding(site), at))),
  );
}
