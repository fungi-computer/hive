// Logical positions stay on cells. Only the renderer interpolates between them.
import { cellKey, inside, neighbors } from "./world.js";
export const WALK_TICKS = 6;
export function route(from, to, blocked) {
  if (!inside(to) || blocked.has(cellKey(to))) return null;
  const start = { x: from.x, z: from.z, level: from.level ?? 0 };
  const queue = [start],
    previous = new Map([[cellKey(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (cellKey(cell) === cellKey(to)) {
      const path = [];
      for (let p = cell; previous.get(cellKey(p)); p = previous.get(cellKey(p)))
        path.unshift(p);
      return path;
    }
    for (const next of neighbors(cell)) {
      const key = cellKey(next);
      if (!inside(next) || blocked.has(key) || previous.has(key)) continue;
      previous.set(key, cell);
      queue.push(next);
    }
  }
  return null;
}
export function approach(from, target, blocked) {
  return (
    neighbors(target)
      .map((p) => route(from, p, blocked))
      .filter((p) => p !== null)
      .sort((a, b) => a.length - b.length)[0] ?? null
  );
}
export function face(pawn, target) {
  const dx = target.x - pawn.x,
    dz = target.z - pawn.z;
  pawn.dir = dx > 0 ? 1 : dx < 0 ? 3 : dz < 0 ? 2 : 0;
}
export function beginWalk(pawn, path) {
  pawn.path = path;
  pawn.leg = 0;
  pawn.mode = "walk";
}
export function walk(pawn, blocked) {
  if (!pawn.path.length) return "arrived";
  const next = pawn.path[0];
  if (blocked.has(cellKey(next))) {
    pawn.path = [];
    pawn.leg = 0;
    return "blocked";
  }
  face(pawn, next);
  if (++pawn.leg < WALK_TICKS) return "moving";
  Object.assign(pawn, next);
  pawn.path.shift();
  pawn.leg = 0;
  return pawn.path.length ? "moving" : "arrived";
}
export function visualPosition(pawn) {
  const next = pawn.path[0];
  if (!next || !pawn.leg) return pawn;
  const fraction = pawn.leg / WALK_TICKS;
  return {
    x: pawn.x + (next.x - pawn.x) * fraction,
    z: pawn.z + (next.z - pawn.z) * fraction,
    level: pawn.level,
  };
}
