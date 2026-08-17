// world.js — the WORLDBOX reducer: the mirror of DAYS, not rows. PURE: no Pixi,
// no DOM, no Math.random, no Date at call time (dates enter as day KEYS from
// date.js/feed.js). The ONE mutator is advanceWorld(world, day) — called once per
// COMPLETED local calendar day (real elapsed time integrated via day keys, never
// tick-simulated).
//
// THE NO-LIE LAW, structural: ACCOUNTING FIRST (prosperity, chops, logs — pure
// functions of f and standing trees), RNG SECOND (dress: which tree, who chops,
// weeds, slop). RNG READS the accounting; it never WRITES it.

import { mulberry32 } from "./feed.js";
import {
  SEEDS, GRID, TILE, RATES, PROSPERITY, tierAt, tierIdx,
  CHOP, TREES, GEN,
} from "./tables.js";
import { addDays } from "./date.js";

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = (x) => {
  const r = Math.round(x * 100) / 100;
  return r === 0 ? 0 : r; // a date ledger never stores −0
};

// FNV-1a → 32-bit uint seed for derived dress streams (deterministic across runs).
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const s of parts) {
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- genWorld (seeded dress)
// Placement ONLY: terrain patches, den spot, tree scatter. Never counts, never direction.
export function genWorld(seed) {
  const rng = mulberry32(seed);
  const W = GRID.W, H = GRID.H;
  const grid = new Uint8Array(W * H).fill(TILE.grass);

  const denC = { c: 6 + Math.floor(rng() * 6), r: H - 5 - Math.floor(rng() * 4) };
  const den = { x: denC.c * GRID.TILE + GRID.TILE / 2, y: denC.r * GRID.TILE + GRID.TILE / 2 };

  // pond — upper-right, ragged circle
  const pondC = { c: Math.floor(W * 0.74 + rng() * 6), r: Math.floor(H * 0.24 + rng() * 4) };
  const pondR = GEN.pondRMin + Math.floor(rng() * (GEN.pondRMax - GEN.pondRMin + 1));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const d = Math.hypot(c - pondC.c, r - pondC.r);
      if (d <= pondR || (d <= pondR + 1.4 && rng() < 0.5)) grid[r * W + c] = TILE.water;
    }
  }

  // rocks — seeded scatter on grass
  for (let i = 0; i < GEN.rocks; i++) {
    const c = Math.floor(rng() * W), r = Math.floor(rng() * H);
    if (grid[r * W + c] === TILE.grass && (c !== denC.c || r !== denC.r)) grid[r * W + c] = TILE.rock;
  }

  // dirt path — den east along the den row, then north along the forest column (L-corridor)
  const forestC = Math.floor(W * 0.72 + rng() * 4);
  const midR = Math.max(2, Math.floor((denC.r + 4) / 2));
  for (let c = denC.c; c <= forestC; c++) placePath(grid, c, denC.r, W);
  for (let r = denC.r; r >= midR; r--) placePath(grid, forestC, r, W);

  // trees — seeded scatter, away from the den
  const trees = [];
  let guard = 0;
  while (trees.length < TREES.count && guard++ < 600) {
    const c = Math.floor(rng() * W), r = Math.floor(rng() * H);
    if (grid[r * W + c] !== TILE.grass) continue;
    const x = c * GRID.TILE + GRID.TILE / 2, y = r * GRID.TILE + GRID.TILE / 2;
    if (Math.hypot(x - den.x, y - den.y) < TREES.minDistDen) continue;
    trees.push({ id: "t" + trees.length, x, y, state: "standing", felledDay: null, regrowDay: null, saplingDay: null });
  }
  return { grid, den, trees };
}

function placePath(grid, c, r, W) {
  grid[r * W + c] = TILE.path;
}

// ---------------------------------------------------------------- state + the ONE step
export function createWorld(seed = SEEDS.worldSeed) {
  const g = genWorld(seed);
  return {
    _seed: seed,
    clock: { lastSeen: null, dayKey: null },   // REAL calendar day keys, not step counts
    days: [],                                  // the date ledger — the ONLY persisted truth
    prosperity: PROSPERITY.init,
    grid: g.grid,
    den: g.den,
    trees: g.trees,
    pile: { x: g.den.x + 48, y: g.den.y + 5 }, // position stored; the COUNT is derived
    choreQueue: [],
    fx: [],
  };
}

export function advanceWorld(world, day) {
  const f = day.f;

  // ---- 1 · ACCOUNTING (the law — no RNG in this chain, in this order):
  const Δ = f === null ? 0 : round2(RATES.busy * f + RATES.idle * (1 - f)); // RATES.idle is already −1.5: busy:+1 · idle:−1.5 (heatmap)
  world.prosperity = round2(clamp(world.prosperity + Δ, PROSPERITY.floor, PROSPERITY.cap));

  const standing = world.trees.filter((t) => t.state === "standing");
  const chops = f !== null && f >= CHOP.threshold && standing.length > 0 ? CHOP.treesPerDay : 0;
  const logsAdded = chops * CHOP.logsPerTree;

  // ---- 2 · DRESS (RNG reads the accounting; never writes it):
  const rng = mulberry32(hashSeed(world._seed, day.key, tierIdx(world.prosperity)));
  if (chops > 0) {
    const tree = pickTreeDress(world, standing, rng); // WHICH tree — the count was law
    tree.state = "stump";
    tree.felledDay = day.key;
    tree.regrowDay = addDays(day.key, TREES.regrowSaplingDay); // becomes a sapling here
    tree.saplingDay = tree.regrowDay;
    world.choreQueue.push({ kind: "chop", day: day.key, treeId: tree.id });
    world.choreQueue.push({ kind: "stack", day: day.key, n: logsAdded });
  }

  // ---- 3 · time passes (dress, deterministic): stumps → saplings → standing
  regrow(world, day.key);

  // ---- 4 · the season (dress on the grid)
  dressDay(world, day, rng);

  world.days.push({ key: day.key, f, Δ, prosperityAfter: world.prosperity, logsAdded, chops });
  world.clock.dayKey = day.key;
  if (world.clock.lastSeen === null) world.clock.lastSeen = day.key;
  return world;
}

function pickTreeDress(world, standing, rng) {
  // nearest-to-pile bias, then seeded among the closest three — WHICH is dress.
  const sorted = [...standing].sort(
    (a, b) => Math.hypot(a.x - world.pile.x, a.y - world.pile.y) - Math.hypot(b.x - world.pile.x, b.y - world.pile.y)
  );
  const k = Math.min(3, sorted.length);
  return sorted[Math.floor(rng() * k)];
}

function regrow(world, key) {
  for (const t of world.trees) {
    if (t.state === "stump" && t.regrowDay && key >= t.regrowDay) {
      t.state = "sapling";
      t.regrowDay = addDays(t.regrowDay, TREES.regrowStandDay); // becomes standing here
      t.saplingDay = null;
    } else if (t.state === "sapling" && t.regrowDay && key >= t.regrowDay) {
      t.state = "standing";
      t.regrowDay = null;
    }
  }
}

function dressDay(world, day, rng) {
  const tier = tierAt(world.prosperity).name;
  const worked = day.f !== null && day.f >= CHOP.threshold;
  const idle = day.f !== null && day.f < CHOP.threshold;
  if (worked || tier === "thriving" || tier === "paradise") {
    // WORK TIDIES: a worked day clears weeds (and a healthy world stays tidy at any f)
    let cleared = 0, guard = 0;
    const target = worked ? 3 : 5;
    while (cleared < target && guard++ < 500) {
      const c = Math.floor(rng() * GRID.W), r = Math.floor(rng() * GRID.H);
      const i = r * GRID.W + c;
      if (world.grid[i] === TILE.weed) { world.grid[i] = TILE.grass; cleared++; }
    }
  }
  if (idle && (tier === "strained" || tier === "overgrown")) {
    // NEGLECT GROWS: undergrowth creeps on idle days in an already-fraying world
    const n = tier === "overgrown" ? 5 : 2;
    let placed = 0, guard = 0;
    while (placed < n && guard++ < 500) {
      const c = Math.floor(rng() * GRID.W), r = Math.floor(rng() * GRID.H);
      const i = r * GRID.W + c;
      if (world.grid[i] === TILE.grass) { world.grid[i] = TILE.weed; placed++; }
    }
  }
}

// ---------------------------------------------------------------- derived (read-only)
export function logsOf(world) { return world.days.reduce((s, d) => s + d.logsAdded, 0); }
export function fellOf(world) { return world.days.reduce((s, d) => s + d.chops, 0); }
export function weekStats(world) {
  const last7 = world.days.slice(-7);
  return {
    days: last7.length,
    worked: last7.filter((d) => d.f !== null && d.f >= CHOP.threshold).length,
    unobserved: last7.filter((d) => d.f === null).length,
  };
}
export function todaySignal(f) {
  return f === null ? "unobserved" : f >= CHOP.threshold ? `working (${f})` : `idle (${f})`;
}

export function derived(world) {
  return {
    prosperity: world.prosperity,
    tier: tierAt(world.prosperity).name,
    logs: logsOf(world),
    treesFelled: fellOf(world),
    trees: world.trees.map((t) => ({ ...t })),
    den: { ...world.den },
    pile: { ...world.pile },
    days: world.days.map((d) => ({ ...d })),
    choreQueue: world.choreQueue.map((c) => ({ ...c })),
    fx: world.fx.map((f) => ({ ...f })),
    week: weekStats(world),
    clock: { lastSeen: world.clock.lastSeen, dayKey: world.clock.dayKey },
  };
}

// ---------------------------------------------------------------- invariants (honesty gates)
export function checkInvariants(world) {
  const v = [];
  const logs = logsOf(world);
  const fell = fellOf(world);
  if (logs !== fell * CHOP.logsPerTree) v.push(`logs ${logs} !== fell ${fell} * ${CHOP.logsPerTree}`);

  // prosperity ≡ the chained replay of its own Δ ledger (per-step clamp, exactly like advanceWorld)
  let p = PROSPERITY.init;
  for (const d of world.days) {
    p = clamp(p + d.Δ, PROSPERITY.floor, PROSPERITY.cap);
    if (Math.abs(p - d.prosperityAfter) > 1e-9) v.push(`day chain broke at ${d.key}`);
  }
  if (Math.abs(world.prosperity - p) > 1e-9) v.push(`prosperity ${world.prosperity} ≠ chained replay ${p}`);

  for (const d of world.days) {
    if (d.f === null && (d.chops > 0 || d.logsAdded > 0 || d.Δ !== 0)) v.push(`unobserved day ${d.key} produced work`);
    if (d.chops > 0 && !(d.f >= CHOP.threshold)) v.push(`chop on under-threshold day ${d.key}`);
    if (d.logsAdded !== d.chops * CHOP.logsPerTree) v.push(`logsAdded mismatch ${d.key}`);
  }
  for (const c of world.choreQueue) {
    if (c.kind === "chop") {
      const t = world.trees.find((x) => x.id === c.treeId);
      if (t && t.state !== "stump" && t.state !== "sapling") v.push(`chop target ${c.treeId} not felled`);
    }
  }
  return v;
}
