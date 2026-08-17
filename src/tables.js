// tables.js — the entire farm economy as DATA rows. PURE: no Pixi, no DOM, no Math.random.
// Every law of the slice (§3 - §5 of the consultant's design) reads from these tables;
// a new job or crop is +1 row here, never a new code branch.

export const SEED = 42;

export const STEP_MS = 1000; // one fixed sim-step ≡ one sim-second
export const DAY_TICKS = 120; // one game-day ≈ 2 real minutes (dawn/day/dusk/night)

// The date spine (§2). phase is a pure function of tick-of-day.
export const PHASE = [
  { name: "dawn", min: 0, max: 10 },
  { name: "day", min: 10, max: 70 },
  { name: "dusk", min: 70, max: 90 },
  { name: "night", min: 90, max: 120 },
];

export function phaseAt(tod) {
  if (tod < PHASE[0].max) return PHASE[0].name;
  if (tod < PHASE[1].max) return PHASE[1].name;
  if (tod < PHASE[2].max) return PHASE[2].name;
  return PHASE[3].name;
}

// Crop economy (§3.2). stageFor(cropDay) → index into stages.
// cropDay = floor(progress / DAY_TICKS): a crop ages with WATER, never with the sun.
export const CROPS = {
  wheat: {
    stages: [
      { day: 0, name: "seed", frames: "wheat-seed" }, // seeded, dormant
      { day: 1, name: "sprout", frames: "wheat-sprout" }, // cropDays 1..2
      { day: 3, name: "tall", frames: "wheat-tall" }, // cropDays 3..4
      { day: 5, name: "gold", frames: "wheat-gold", ready: true }, // cropDay ≥ 5
    ],
    yield: 3, // grains per settled harvest row
  },
};

export function stageFor(cropKind, cropDay) {
  const stages = CROPS[cropKind].stages;
  let idx = 0;
  for (let i = 0; i < stages.length; i++) if (cropDay >= stages[i].day) idx = i;
  return idx;
}

// Job classes (§3.2 / §4.4). stone stays DORMANT: it renders only once real stone
// rows exist (freezer law, demonstrated by never scheduling one in this slice).
export const JOB_CLASSES = {
  wood: { queue: "wood", pile: "wood", siteKind: "tree", mode: "chop", yield: 1 },
  water: { queue: "water", pile: "water", siteKind: "plot", mode: "tend", yield: 40 }, // water per settled tend row
  sow: { queue: "sow", pile: null, siteKind: "plot", mode: "sow", yield: null }, // seeds a plot; 3-tick act
  harvest: { queue: "harvest", pile: "grain", siteKind: "plot", mode: "harvest", yield: 3 },
  stone: { queue: "stone", pile: "stone", siteKind: "outcrop", mode: "quarry", yield: 1 }, // DORMANT
};

// Gait / wait rows (§3.3). Durations are CONTRACTS (Fern: "durations are contracts");
// the fixed step is what makes them true. Walk route = waypoint sequence with these
// tick durations; the renderer glides the sprite along the pixel path to fill the time.
export const GAIT = {
  denToWell: 20, // walk den → well (fetch)
  fillAct: 2, // fill the bucket at the well (a FETCH tick, never a water tick)
  wellToPlot: 25, // walk well → plot (with full bucket)
  denToPlot: 40, // direct den → plot (sow / harvest)
  denToTree: 24, // walk den → tree (chop)
  chopAct: 3, // chop wiggle at the tree
  sowAct: 3, // plant act
  harvestAct: 3, // cut act
  returnHome: 18, // walk home on settle (plain; walk-home TIERS are beyond this slice)
};

// Per-mode act durations (ticks at the site). A fetch is a FETCH, never a water tick.
export const ACTS = {
  fetch: GAIT.fillAct,
  chop: GAIT.chopAct,
  sow: GAIT.sowAct,
  harvest: GAIT.harvestAct,
};

// The glance law (§4.3): idle body within ~1.3× real average travel of a settle
// does its 4-frame head-rotate. Eligibility is pure logic; the frames are soul.
export const GLANCE = { averageTravelPx: 180, factor: 1.3 };

export const TEND_YIELD = JOB_CLASSES.water.yield; // 40 — water credited per settled tend row

// Outcome → grain atlas-frame variant (§4.4: look only, NEVER the count).
export const OUTCOME_VARIANT = { completed: "whole", error: "cracked", cancelled: "chipped" };

// Row states consumed verbatim from the runs feed (run-status.ts).
export const ROW_STATES = [
  "queued",
  "executing",
  "requeued",
  "settled",
  "interrupted",
  "never_ran",
  "unreachable",
];

// ============================ WORLDBOX LAYER (chop-logs MVP) ============================
// The date-based product: ONE real input (fleet busy/idle per DAY), ONE real clock
// (calendar date); prosperity is a pure function of (daysWorked, daysIdle); RNG
// dresses everything below the direction line. See worldbox-mvp-chop-logs.md (the
// lift) + worldbox-direction-consult.md REVISED/RULINGS. PURE DATA — no Math.random,
// no Date, no callable code beyond the tiny pure helpers kept here.

export const SEEDS = { worldSeed: 42 }; // world + dress derive from it; prosperity NEVER does

export const GRID = { W: 96, H: 60, TILE: 8 }; // 768×480 god-view — 8px tiles: a bigger world, tiny bodies (Worldbox scale-dissonance)
export const TILE = { water: 0, grass: 1, dirt: 2, path: 3, rock: 4, weed: 5 };

// Prosperity contract (RULING 1): HEATMAP partial credit. Δ(day) = busy·f + idle·(1−f)
// where RATES.idle is NEGATIVE (−1.5): a busy day nets +1, an idle day nets −1.5.
export const RATES = { busy: +1, idle: -1.5 }; // decay > growth — a week off reads as ruin
export const PROSPERITY = { init: 15, floor: 0, cap: 100 };
export const TIERS = [
  { at: 75, name: "paradise" },
  { at: 50, name: "thriving" },
  { at: 25, name: "steady" },
  { at: 8, name: "strained" },
  { at: 0, name: "overgrown" },
];
export function tierAt(p) {
  for (const t of TIERS) if (p >= t.at) return t;
  return TIERS[TIERS.length - 1];
}
export function tierIdx(p) {
  for (let i = 0; i < TIERS.length; i++) if (p >= TIERS[i].at) return i;
  return TIERS.length - 1;
}

// Chops are DISCRETE (a tree falls or it doesn't) — a table row, never RNG.
export const CHOP = { threshold: 0.5, logsPerTree: 3, treesPerDay: 1 };

// Forest: seeded scatter; REGROW is DETERMINISTIC on purpose — standing-tree
// availability must be seed-independent so chops/logs trajectories are (gate 6).
// count 20 + minDistDen 64 keep a forested god-view at the 8px tile scale (dress,
// not a rule change).
export const TREES = { count: 20, minDistDen: 64, regrowSaplingDay: 7, regrowStandDay: 7 };

// Pile dress: the COUNT is truth (derived from days[]); the ARRANGEMENT is slop.
// perLog 6×4 — small sticks at the ant-god-view scale.
export const STACK = { perLog: { w: 6, h: 4 }, pool: 12 };
export const SLOP = { paradise: 0, thriving: 0, steady: 0, strained: 1, overgrown: 2 };

// Villager population per tier (dress — the visible honesty axis; never a roster).
// 6–8px ants: a denser crowd reads on the bigger pane (render-scale dress only).
export const POPULATION = { paradise: 10, thriving: 8, steady: 6, strained: 3, overgrown: 2 };

// Reopen-gap cap: older history is compacted (printed), never caught up.
export const MAX_GAP = 90;

// Terrain gen knobs (seeded placement only — never counts). Pond/rocks scaled to
// the 8px tile so the topography keeps its god-view share of the pane.
export const GEN = { pondRMin: 5, pondRMax: 8, rocks: 26, pathJitter: 2 };

// ============================ POC SPEED KNOB (Levi, 2026-08-17) ============================
// Compress the CLOCK, never the RULES: a "world day" completes every dayMsFor(scale)
// of REAL wall time, and each rolled day is a real COMPLETED day scored through the
// SAME pure advanceWorld (busy:+1 → chop → logs; idle → decay). POC DEFAULT = FAST so
// chops/logs/weeds visibly happen within seconds of opening the pane. Real-date mode
// = 1:1 (dayMsFor(1) === 86400000). Live override: __TIMESCALE on the global object
// (a number ≥ 1 — read live in main.js). The sim never sees the scale — days just
// arrive at it, one completed day at a time.
export const POC_TIMESCALE = 28800; // default: 1 real second = 8 world hours ⇒ one day every 3s
export const TIMESCALE_REAL = 1;
export function dayMsFor(scale) { return Math.round(86400000 / scale); }
