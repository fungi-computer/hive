// Retained fixed-order grid navigation and fixed-tick travel from the inn MVP.
export const WALK_TICKS = 8;
export const cellKey = (p) => `${Math.round(p.x)},${Math.round(p.z)}`;
const neighbors = (p) =>
  [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ].map(([x, z]) => ({ x: p.x + x, z: p.z + z }));
function route(from, to, blocked) {
  const start = { x: Math.round(from.x), z: Math.round(from.z) };
  const queue = [start],
    prev = new Map([[cellKey(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (cellKey(p) === cellKey(to)) {
      const path = [];
      let cur = p;
      while (prev.get(cellKey(cur))) {
        path.unshift(cur);
        cur = prev.get(cellKey(cur));
      }
      return path;
    }
    for (const q of neighbors(p)) {
      const k = cellKey(q);
      if (
        q.x < 0 ||
        q.z < 0 ||
        q.x > 6 ||
        q.z > 6 ||
        blocked.has(k) ||
        prev.has(k)
      )
        continue;
      prev.set(k, p);
      queue.push(q);
    }
  }
  return null;
}
export function approach(from, target, blocked) {
  return (
    neighbors(target)
      .filter((p) => !blocked.has(cellKey(p)))
      .map((p) => route(from, p, blocked))
      .filter((path) => path !== null)
      .sort((a, b) => a.length - b.length)[0] ?? null
  );
}
export function face(p, target) {
  const dx = target.x - p.x,
    dz = target.z - p.z;
  p.dir = dx > 0 ? 1 : dx < 0 ? 3 : dz < 0 ? 2 : 0;
}
export function beginWalk(p, path) {
  p.path = path;
  p.leg = 0;
  p.work = 0;
  p.mode = "walk";
}
export function walk(p) {
  if (!p.path.length) return true;
  const target = p.path[0];
  if (p.leg === 0) {
    p.from = { x: p.x, z: p.z };
    face(p, target);
  }
  p.leg++;
  p.x = p.from.x + ((target.x - p.from.x) * p.leg) / WALK_TICKS;
  p.z = p.from.z + ((target.z - p.from.z) * p.leg) / WALK_TICKS;
  if (p.leg === WALK_TICKS) {
    p.path.shift();
    p.leg = 0;
  }
  return p.path.length === 0;
}
