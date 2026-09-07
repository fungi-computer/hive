// Inn-specific gameplay. libcolony owns assignment; this state owns routes,
// work and the resulting bowl. Pixi only projects it, as in retained Hive.
export const HEARTH = { x: 1, z: 2 };
export const TABLE = { x: 4, z: 3 };
export const BLOCKED = new Set([
  "0,0",
  "1,0",
  "2,0",
  "0,1",
  "1,1",
  "2,1",
  "0,3",
  "0,4",
  "5,0",
  "6,0",
  "5,1",
  "6,1",
  "4,3",
]);
export const WALK_TICKS = 8,
  PREP_TICKS = 50;
const key = (p) => `${p.x},${p.z}`;
// Four-neighbor search over the single 7×7 room, with fixed tie order.
export function route(from, to) {
  const start = { x: Math.round(from.x), z: Math.round(from.z) };
  const queue = [start],
    prev = new Map([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (key(p) === key(to)) {
      const path = [];
      let cur = p;
      while (prev.get(key(cur))) {
        path.unshift(cur);
        cur = prev.get(key(cur));
      }
      return path;
    }
    for (const [dx, dz] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      const q = { x: p.x + dx, z: p.z + dz },
        k = key(q);
      if (
        q.x < 0 ||
        q.z < 0 ||
        q.x > 6 ||
        q.z > 6 ||
        BLOCKED.has(k) ||
        prev.has(k)
      )
        continue;
      prev.set(k, p);
      queue.push(q);
    }
  }
  return null;
}
export function createInn() {
  return {
    tick: 0,
    paused: false,
    keeper: {
      x: 3,
      z: 4,
      dir: 0,
      mode: "idle",
      path: [],
      leg: 0,
      work: 0,
      carrying: false,
    },
    commands: [],
    assignment: null,
    prepared: 0,
    notice: "Click the goblin to select your innkeeper.",
  };
}
export function step(inn, colony, commands = []) {
  if (inn.paused) return;
  inn.tick++;
  const p = inn.keeper;
  for (const kind of commands) {
    inn.commands.push({ tick: inn.tick, kind });
    if (kind !== "prepare" || p.mode !== "idle" || p.carrying) continue;
    const path = route(p, HEARTH);
    if (!path) {
      inn.notice = "The hearth is out of reach.";
      continue;
    }
    const cost = colony.compute_cost({
      travel_time: path.length * WALK_TICKS,
      work_time: PREP_TICKS,
      priority: 1,
    });
    const assigned = colony.optimize([
      { character: "pip", task: "prepare-soup", cost },
    ]);
    inn.assignment = assigned[0] ?? null;
    if (
      inn.assignment?.character !== "pip" ||
      inn.assignment.task !== "prepare-soup"
    )
      continue;
    p.path = path;
    p.leg = 0;
    p.work = 0;
    p.mode = path.length ? "walk" : "work";
    inn.notice = "Pip is on the way to the hearth.";
  }
  if (p.mode === "walk") {
    const target = p.path[0];
    if (p.leg === 0) p.from = { x: p.x, z: p.z };
    p.leg++;
    const dx = target.x - p.from.x,
      dz = target.z - p.from.z;
    p.dir = dx > 0 ? 1 : dx < 0 ? 3 : dz < 0 ? 2 : 0;
    p.x = p.from.x + (dx * p.leg) / WALK_TICKS;
    p.z = p.from.z + (dz * p.leg) / WALK_TICKS;
    if (p.leg === WALK_TICKS) {
      p.path.shift();
      p.leg = 0;
      if (!p.path.length) {
        p.mode = "work";
        p.dir = 2;
        inn.notice = "A pinch of moss. A slow stir.";
      }
    }
  } else if (p.mode === "work") {
    p.work++;
    if (p.work === PREP_TICKS) {
      p.mode = "idle";
      p.carrying = true;
      p.dir = 0;
      inn.prepared++;
      inn.notice = "One warm bowl, ready to serve.";
      inn.assignment = null;
    }
  }
}
