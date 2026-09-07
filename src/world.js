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
      ...ROCKS,
      WATCHER,
      ...state.trees.filter((t) => t.felledAt === null),
      // A wall blueprint reserves its cell, keeping routes out of future walls.
      ...state.sites.filter((s) => s.type === "wall"),
    ].map(cellKey),
  );
}
