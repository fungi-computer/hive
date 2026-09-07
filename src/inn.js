// Inn-specific gameplay. libcolony owns assignment; this state owns routes,
// work and service. Pixi only projects it, as in retained Hive.
import { createFeed, nextGuest } from "./feed.js";
export const HEARTH = { x: 1, z: 2 };
export const TABLE = { x: 4, z: 3 };
const SEAT = { x: 5, z: 3 };
const SERVE = { x: 6, z: 3 };
const ENTRY = { x: 1, z: 6 };
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
const WALK_TICKS = 8,
  HAPPY_TICKS = 35;
export const PREP_TICKS = 50,
  EAT_TICKS = 45;
const key = (p) => `${Math.round(p.x)},${Math.round(p.z)}`;
// Four-neighbor search over the single 7×7 room, with fixed tie order.
export function route(from, to, occupied = new Set()) {
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
        occupied.has(k) ||
        prev.has(k)
      )
        continue;
      prev.set(k, p);
      queue.push(q);
    }
  }
  return null;
}
function body(at) {
  return {
    ...at,
    dir: 0,
    mode: "idle",
    path: [],
    leg: 0,
    work: 0,
    carrying: false,
  };
}
export function createInn(seed = 42) {
  return {
    tick: 0,
    paused: false,
    keeper: body({ x: 3, z: 4 }),
    guest: null,
    feed: createFeed(seed),
    commands: [],
    assignment: null,
    prepared: 0,
    served: 0,
    satisfied: 0,
    departed: 0,
    celebration: null,
    notice: "Click Pip, then the hearth to prepare a warm welcome.",
  };
}
function beginWalk(p, path, mode) {
  p.path = path;
  p.leg = 0;
  p.work = 0;
  p.mode = mode;
}
// Both bodies use the same movement, never renderer callbacks or tween truth.
function walk(p) {
  if (!p.path.length) return true;
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
  }
  return p.path.length === 0;
}
export function canCommand(inn, kind) {
  const p = inn.keeper,
    g = inn.guest;
  if (inn.paused || p.mode !== "idle") return false;
  if (kind === "prepare")
    return !p.carrying && !["arriving", "leaving"].includes(g?.mode);
  return kind === "deliver" && p.carrying && g?.mode === "waiting";
}
function assignCommand(inn, colony, kind) {
  const p = inn.keeper,
    g = inn.guest;
  if (!canCommand(inn, kind)) {
    if (kind === "prepare" && p.mode === "idle" && !p.carrying)
      inn.notice = "Let the traveler pass, then use the hearth.";
    return;
  }
  const target = kind === "prepare" ? HEARTH : SERVE;
  const path = route(p, target, g ? new Set([key(g)]) : new Set());
  if (!path) {
    inn.notice = "The way is blocked. Try again when it is clear.";
    return;
  }
  const task = kind === "prepare" ? "prepare-soup" : `deliver-${g.id}`;
  const cost = colony.compute_cost({
    travel_time: path.length * WALK_TICKS,
    work_time: kind === "prepare" ? PREP_TICKS : 1,
    priority: 1,
  });
  // Explicit orders determine eligibility. Only the requested pawn/task pair is
  // offered; the selected engine owns assignment, never a local optimizer.
  const assigned = colony.optimize([{ character: "pip", task, cost }]);
  const chosen = assigned.find((a) => a.character === "pip" && a.task === task);
  if (!chosen) return;
  inn.assignment = { ...chosen };
  p.task = kind;
  p.guestId = kind === "deliver" ? g.id : null;
  beginWalk(p, path, "walk");
  inn.notice =
    kind === "prepare"
      ? "Pip is on the way to the hearth."
      : `One hot bowl, coming to ${g.name}.`;
}
function arriveKeeper(inn) {
  const p = inn.keeper;
  if (p.task === "prepare") {
    p.mode = "work";
    p.dir = 2;
    inn.notice = "A pinch of moss. A slow stir.";
    return;
  }
  const g = inn.guest;
  // A bowl is transferred once, only beside its waiting recipient.
  if (g?.id === p.guestId && g.mode === "waiting" && p.carrying) {
    p.carrying = false;
    g.carrying = true;
    g.mode = "eating";
    g.work = 0;
    g.dir = 0;
    inn.served++;
    inn.notice = `${g.name} has a warm bowl of mushroom soup.`;
  }
  p.mode = "idle";
  p.dir = 3;
  inn.assignment = null;
}
export function step(inn, colony, commands = []) {
  if (inn.paused) return;
  inn.tick++;
  const p = inn.keeper;
  for (const kind of commands) {
    inn.commands.push({ tick: inn.tick, kind });
    assignCommand(inn, colony, kind);
  }
  // The small shared corridor carries one moving body at a time. Explicit work
  // takes priority; arrivals wait outside until Pip has reached a station.
  const incomingPath =
    !inn.guest && p.mode !== "walk" && inn.tick >= inn.feed.nextAt
      ? route(ENTRY, SEAT, new Set([key(p)]))
      : null;
  const arrival = nextGuest(inn.feed, inn.tick, !!incomingPath);
  if (arrival) {
    const guest = { ...body(ENTRY), ...arrival };
    beginWalk(guest, incomingPath, "arriving");
    inn.guest = guest;
    inn.notice = `${guest.name} has come in from the mossy road.`;
  }
  if (p.mode === "walk") {
    if (walk(p)) arriveKeeper(inn);
  } else if (p.mode === "work") {
    if (++p.work === PREP_TICKS) {
      p.mode = "idle";
      p.carrying = true;
      p.dir = 0;
      inn.prepared++;
      inn.assignment = null;
      inn.notice = "Soup is ready. Give Pip a delivery task.";
    }
  }
  const g = inn.guest;
  if (!g) return;
  if (g.mode === "arriving" && walk(g)) {
    g.mode = "waiting";
    g.dir = 3;
    inn.notice = `${g.name}: “Mushroom soup, please!”`;
  } else if (g.mode === "eating" && ++g.work === EAT_TICKS) {
    g.mode = "happy";
    g.carrying = false;
    g.work = 0;
    inn.satisfied++;
    inn.celebration = { tick: inn.tick, name: g.name };
    inn.notice = `${g.name} loved it. Another happy guest!`;
  } else if (
    g.mode === "happy" &&
    ++g.work >= HAPPY_TICKS &&
    p.mode !== "walk"
  ) {
    const exitPath = route(g, ENTRY, new Set([key(p)]));
    if (exitPath) beginWalk(g, exitPath, "leaving");
  } else if (g.mode === "leaving" && walk(g)) {
    inn.departed++;
    inn.guest = null;
    inn.notice = `${g.name} leaves happy. The table is free again.`;
  }
}
