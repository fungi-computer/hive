// Logical positions stay on cells. Only the renderer interpolates between them.
import { cellKey, inside, neighbors, topologyNeighbors } from "./world.js";
export const WALK_TICKS = 6;
export const STAIR_TICKS = 18;
export function edgeTicks(from, to) {
  return from.level === to.level ? WALK_TICKS : STAIR_TICKS;
}
export function pathTicks(from, path) {
  let current = from;
  let ticks = 0;
  for (const next of path) {
    ticks += edgeTicks(current, next);
    current = next;
  }
  return ticks;
}
/** @param {import("./model.ts").Clearing|null} [state] */
export function route(from, to, blocked, state = null) {
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
    for (const next of state
      ? topologyNeighbors(state, cell)
      : neighbors(cell)) {
      const key = cellKey(next);
      if (!inside(next) || blocked.has(key) || previous.has(key)) continue;
      previous.set(key, cell);
      queue.push(next);
    }
  }
  return null;
}
/** @param {import("./model.ts").Clearing|null} [state] */
export function approach(from, target, blocked, state = null) {
  return (
    neighbors(target)
      .map((p) => route(from, p, blocked, state))
      .filter((p) => p !== null)
      .sort((a, b) => pathTicks(from, a) - pathTicks(from, b))[0] ?? null
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
/** @param {import("./model.ts").Clearing|null} [state] */
export function walk(pawn, blocked, state = null) {
  if (!pawn.path.length) return "arrived";
  const next = pawn.path[0];
  const edgeStillOpen =
    !state ||
    topologyNeighbors(state, pawn).some(
      (candidate) => cellKey(candidate) === cellKey(next),
    );
  if (blocked.has(cellKey(next)) || !edgeStillOpen) {
    pawn.path = [];
    pawn.leg = 0;
    return "blocked";
  }
  face(pawn, next);
  if (++pawn.leg < edgeTicks(pawn, next)) return "moving";
  Object.assign(pawn, next);
  pawn.path.shift();
  pawn.leg = 0;
  return pawn.path.length ? "moving" : "arrived";
}
export function visualPosition(pawn) {
  const next = pawn.path[0];
  if (!next || !pawn.leg) return pawn;
  const fraction = pawn.leg / edgeTicks(pawn, next);
  return {
    x: pawn.x + (next.x - pawn.x) * fraction,
    z: pawn.z + (next.z - pawn.z) * fraction,
    level: pawn.level + (next.level - pawn.level) * fraction,
  };
}
