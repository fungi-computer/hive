// One finite clearing. Logical storeys are explicit; rendering may interpolate
// between them, but simulation positions remain integer cells.
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
export const cellKey = (p) => `${p.x},${p.z},${p.level ?? 0}`;
export const sameCell = (a, b) => cellKey(a) === cellKey(b);
export function inside(p) {
  return (
    Number.isInteger(p.x) &&
    Number.isInteger(p.z) &&
    Number.isInteger(p.level ?? 0) &&
    p.x >= 0 &&
    p.z >= 0 &&
    p.x < SIZE &&
    p.z < SIZE &&
    (p.level ?? 0) >= 0 &&
    (p.level ?? 0) <= 1
  );
}
export function stairCells(site) {
  return [0, 1, 2].map((distance) => ({
    x: site.x + (site.direction === 1 ? distance : 0),
    z: site.z + (site.direction === 1 ? 0 : distance),
    level: 0,
  }));
}
export function stairLanding(site) {
  const cells = stairCells(site);
  const top = cells[2];
  return { x: top.x, z: top.z, level: 1 };
}
export function stairHeadroom(site) {
  return stairCells(site).map((cell) => ({
    x: cell.x,
    z: cell.z,
    level: 1,
  }));
}
function siteCells(site) {
  if (site.type === "stair") return stairCells(site);
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
      siteCells(site).some((cell) => sameCell(cell, at)),
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
export function neighbors(p) {
  return [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ].map(([x, z]) => ({ x: p.x + x, z: p.z + z, level: p.level ?? 0 }));
}
export function upperSurface(state, at) {
  if (at.level !== 1) return false;
  return state.sites.some(
    (site) =>
      site.finishedAt !== null &&
      ((site.type === "floor" && sameCell(site, at)) ||
        (site.type === "stair" && sameCell(stairLanding(site), at))),
  );
}
export function topologyNeighbors(state, p) {
  const next = neighbors(p);
  const stair = state.sites.find(
    (site) => site.type === "stair" && site.finishedAt !== null,
  );
  if (!stair) return next;
  const lower = stairCells(stair)[0];
  const upper = stairLanding(stair);
  if (sameCell(p, lower)) next.push(upper);
  else if (sameCell(p, upper)) next.push(lower);
  return next;
}
export function blockedCells(state) {
  const blocked = new Set(
    [
      ...state.rocks,
      state.watcher,
      ...state.trees.filter((t) => t.felledAt === null),
      ...(state.sources ?? []),
      // A wall blueprint reserves its cell, keeping routes out of future walls.
      ...state.sites.filter((s) => s.type === "wall"),
    ].map(cellKey),
  );
  for (const stair of state.sites)
    if (stair.type === "stair")
      for (const cell of stairCells(stair).slice(1)) blocked.add(cellKey(cell));
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      const cell = { x, z, level: 1 };
      if (!upperSurface(state, cell)) blocked.add(cellKey(cell));
    }
  return blocked;
}
