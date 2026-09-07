// One finite clearing. Cell elevation is explicit; this slice navigates level 0.
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
    p.x >= 0 &&
    p.z >= 0 &&
    p.x < SIZE &&
    p.z < SIZE &&
    (p.level ?? 0) === 0
  );
}
function siteCells(site) {
  const cells = [{ x: site.x, z: site.z, level: site.level }];
  if (site.type === "bed")
    cells.push({
      x: site.x + (site.direction === 1 ? 1 : 0),
      z: site.z + (site.direction === 1 ? 0 : 1),
      level: site.level,
    });
  return cells;
}
/** @param {string|null} [excludeId] */
export function placementOccupant(state, at, excludeId = null) {
  if (state.trees.some((tree) => sameCell(tree, at))) return "tree";
  if (state.rocks.some((rock) => sameCell(rock, at))) return "rock";
  if (
    state.sites.some((site) =>
      siteCells(site).some((cell) => sameCell(cell, at)),
    )
  )
    return "site";
  if (sameCell(state.watcher, at)) return "watcher";
  if (state.piles.some((pile) => pile.amount > 0 && sameCell(pile, at)))
    return "pile";
  if (state.herbs?.some((herb) => herb.id !== excludeId && sameCell(herb, at)))
    return "herb";
  if (
    state.herbBundles?.some(
      (bundle) => bundle.id !== excludeId && sameCell(bundle, at),
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
export function blockedCells(state) {
  return new Set(
    [
      ...state.rocks,
      state.watcher,
      ...state.trees.filter((t) => t.felledAt === null),
      // A wall blueprint reserves its cell, keeping routes out of future walls.
      ...state.sites.filter((s) => s.type === "wall"),
    ].map(cellKey),
  );
}
