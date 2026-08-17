// sim.js — the ONE reducer. The mirror of the ledger: every field on every entity
// derives from real row events; nothing on screen pretends to be a row it is not.
// PURE: no Pixi, no DOM, no Math.random, no Date. Same seed, same event script,
// same STEP cadence ⇒ byte-identical state (Fern's determinism contract).
//
// Systems (§4.5): applyRowEvents · motionSystem · tendSystem · resourceSystem ·
// ageFx · advanceDate — then derived() projects threads/piles/counter for render.

import { STEP_MS, DAY_TICKS, stageFor, JOB_CLASSES, GAIT, ACTS, GLANCE, CROPS } from "./tables.js";
import { gameDate } from "./ticker.js";

// ---------------------------------------------------------------- static scene
// The one glade: den (home), well, two plots, eight trees, a dormant outcrop.
// Coordinates are scene data the renderer reads; routes glide along them.
export const SITES = [
  { id: "den", kind: "den", x: 168, y: 430 },
  { id: "well", kind: "well", x: 452, y: 468 },
  { id: "plot-1", kind: "plot", x: 598, y: 434 },
  { id: "plot-2", kind: "plot", x: 700, y: 434 },
  { id: "tree-0", kind: "tree", x: 90, y: 110 },
  { id: "tree-1", kind: "tree", x: 262, y: 74 },
  { id: "tree-2", kind: "tree", x: 520, y: 96 },
  { id: "tree-3", kind: "tree", x: 852, y: 96 },
  { id: "tree-4", kind: "tree", x: 744, y: 232 },
  { id: "tree-5", kind: "tree", x: 888, y: 384 },
  { id: "tree-6", kind: "tree", x: 736, y: 500 },
  { id: "tree-7", kind: "tree", x: 470, y: 524 },
  { id: "outcrop", kind: "outcrop", x: 918, y: 512 }, // stone DORMANT — rendered only when real stone rows exist
];

// Roster: one body per roster row (Fern: the 1:1 contract). Classification (cls)
// lives in the FEED adapter (§5.2) — the sim reads the class the feed attached.
export const ROSTER = [
  { id: "w1", vid: 1, name: "Birch", cls: "water" }, // tend T2 (per §3.3)
  { id: "w2", vid: 2, name: "Maple", cls: "sow" }, // sow S1
  { id: "w3", vid: 3, name: "Cedar", cls: "water" }, // tend T1 — the stalled one
  { id: "w4", vid: 4, name: "Ash", cls: "harvest" }, // harvest H1
  { id: "w5", vid: 5, name: "Oak", cls: "wood" },
  { id: "w6", vid: 6, name: "Willow", cls: "wood" },
];

// Modes that mean "this body belongs to an executing row" (§4.6 invariant 2).
export const ACTIVE_MODES = ["WALK", "FETCH", "TEND", "SOW", "HARVEST", "CHOP", "HOLD"];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const siteOf = (state, id) => state.sites.find((s) => s.id === id);

// ---------------------------------------------------------------- boot
export function createSim() {
  return {
    clock: { steps: 0, day: 0, tod: 0, phase: "dawn", lastPoll: 0 },
    sites: SITES.map((s) => ({ ...s })),
    workers: ROSTER.map((r, i) => {
      const den = SITES.find((s) => s.id === "den");
      const col = (i % 3) - 1;
      const row = Math.floor(i / 3);
      const seat = { x: den.x + col * 16, y: den.y + row * 16 };
      return {
        id: r.id,
        vid: r.vid,
        name: r.name,
        cls: r.cls,
        mode: "SETTLED", // xderived render label; never holds truth
        home: { ...seat },
        pos: { ...seat },
        route: null, // { waypoints, legs, leg, t, onEnd }
        actT: 0,
        rowId: null,
        siteId: null,
        row: { state: "settled", attempts: 0, outcome: null, queuedAt: null },
      };
    }),
    plots: {
      "plot-1": { id: "plot-1", siteId: "plot-1", crop: null, seeded: false, harvestable: false, wateredBy: null, stubble: false },
      "plot-2": { id: "plot-2", siteId: "plot-2", crop: null, seeded: false, harvestable: false, wateredBy: null, stubble: false },
    },
    rows: {}, // live mirror: rowId → ledger row as last observed
    rowLog: [], // every terminal observation (settled / interrupted) — THE pile fuel
    fx: [],
    fxSeq: 0, // monotonic fx ids so the renderer can track them across steps
    debugDrops: 0, // executing events that found their body busy (must stay 0)
    rooster: { id: "rooster", kind: "rooster", x: 596, y: 300, phase: 0.37 },
    firstSettle: { at: null, siteId: null, rowId: null },
    glanceFired: false,
  };
}

const workerOf = (state, id) => state.workers.find((w) => w.id === id);

// ---------------------------------------------------------------- routes (pure)
function buildRoute(from, waypoints, ticksList, onEnd) {
  const legs = [];
  let prev = from;
  for (let i = 0; i < waypoints.length; i++) {
    legs.push({ dx: waypoints[i].x - prev.x, dy: waypoints[i].y - prev.y, ticks: ticksList[i] });
    prev = waypoints[i];
  }
  // t starts at -1: the tick the event arrives is t=0 of the walk (arrival at
  // exec-tick + Σlegs, exactly as the §3.3 trace numbers it).
  return { start: { ...from }, waypoints, legs, leg: 0, t: -1, onEnd };
}

function routePos(route) {
  const leg = route.legs[route.leg];
  const origin = route.leg === 0 ? route.start : route.waypoints[route.leg - 1];
  const k = Math.min(1, route.t / leg.ticks);
  return { x: origin.x + leg.dx * k, y: origin.y + leg.dy * k };
}

function claimedPlots(state) {
  return new Set(state.workers.filter((w) => ACTIVE_MODES.includes(w.mode) && w.siteId && state.plots[w.siteId]).map((w) => w.siteId));
}

function pickPlot(state, worker, want) {
  // want: 'bare' (sow) | 'crop' (harvest) | 'any' (tend) — nearest free plot of its class,
  // preferring plots not already claimed by another executing body.
  const claimed = claimedPlots(state);
  const plots = Object.values(state.plots);
  const eligible = plots.filter((p) => {
    if (want === "bare") return !p.seeded;
    if (want === "crop") return p.harvestable;
    return true;
  }).sort((a, b) => (claimed.has(a.id) ? 1 : 0) - (claimed.has(b.id) ? 1 : 0));
  let best = null;
  let bestD = Infinity;
  for (const p of eligible) {
    const s = siteOf(state, p.siteId);
    const d = dist(worker.pos, s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function pickTree(state, worker) {
  // nearest FREE tree (not claimed by another executing body)
  const claimed = new Set(state.workers.filter((w) => w.mode !== "SETTLED" && w.mode !== "RETURN" && w.siteId).map((w) => w.siteId));
  let best = null;
  let bestD = Infinity;
  for (const s of state.sites) {
    if (s.kind !== "tree") continue;
    if (claimed.has(s.id)) continue;
    const d = dist(worker.pos, s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function startWalk(state, worker, cls, siteId) {
  const clsRow = JOB_CLASSES[cls];
  const site = siteOf(state, siteId);
  let route = null;
  if (clsRow.mode === "chop") {
    route = buildRoute(worker.pos, [{ x: site.x, y: site.y }], [GAIT.denToTree], "CHOP");
  } else if (clsRow.mode === "tend") {
    const well = siteOf(state, "well");
    // den → well (fetch walk) → [fill pause at the well: a FETCH, never a water
    // tick] → well → plot (with full bucket) → TEND. The middle leg moves zero
    // pixels for GAIT.fillAct ticks — the trace's "W3 at well, filling (2)".
    route = buildRoute(
      worker.pos,
      [
        { x: well.x, y: well.y },
        { x: well.x, y: well.y },
        { x: site.x, y: site.y },
      ],
      [GAIT.denToWell, GAIT.fillAct, GAIT.wellToPlot],
      "TEND"
    );
  } else if (clsRow.mode === "sow") {
    route = buildRoute(worker.pos, [{ x: site.x, y: site.y }], [GAIT.denToPlot], "SOW");
  } else if (clsRow.mode === "harvest") {
    route = buildRoute(worker.pos, [{ x: site.x, y: site.y }], [GAIT.denToPlot], "HARVEST");
  }
  worker.route = route;
  worker.mode = "WALK";
  worker.siteId = siteId;
  worker.actT = 0;
}

// ---------------------------------------------------------------- the reducer
// step(state, events, steps) — the ONLY mutator. steps is the authoritative
// accumulated sim-time handed in by the fixed-step ticker (one honest clock).
export function step(state, events, steps) {
  applyRowEvents(state, events, steps);
  motionSystem(state);
  tendSystem(state);
  resourceSystem(state);
  ageFx(state);
  advanceDate(state, steps);
  return state;
}


// fx factory: an event wearing a body gets a monotonic id (deterministic, pure).
function fx(state, f) {
  return { id: ++state.fxSeq, ...f };
}
function applyRowEvents(state, events, steps) {
  for (const ev of events) applyRow(state, ev, steps ?? state.clock.steps);
}

function applyRow(state, ev, now) {
  state.clock.lastPoll = ev.observedAt ?? now;
  const row = state.rows[ev.rowId] || { id: ev.rowId, workerId: ev.workerId ?? null };
  row.state = ev.state;
  if (ev.attempts !== undefined) row.attempts = ev.attempts;
  if (ev.outcome !== undefined) row.outcome = ev.outcome;
  if (ev.state === "executing") {
    row.workerId = ev.workerId;
    row.queue = ev.queue ?? null;
  }
  state.rows[ev.rowId] = row;

  // ---- executing: the claim window — one body claims one row
  if (ev.state === "executing") {
    const w = workerOf(state, ev.workerId);
    if (!w || w.mode !== "SETTLED") {
      state.debugDrops += 1; // body busy: row waits (out of script; never silently reassigned)
      return;
    }
    const cls = ev.cls || w.cls;
    const clsRow = JOB_CLASSES[cls];
    w.rowId = ev.rowId;
    w.row = { state: "executing", attempts: ev.attempts || 0, outcome: null, queuedAt: null };
    let siteId = ev.siteId;
    // a site supplied by the feed must still be claimable: if another executing
    // body already holds it, fall back to nearest free (claim-gated motion).
    if (siteId) {
      const held = state.workers.some((x) => x.id !== w.id && x.mode !== "SETTLED" && x.mode !== "RETURN" && x.siteId === siteId);
      if (held) siteId = null;
    }
    if (!siteId) {
      if (clsRow.siteKind === "tree") {
        const t = pickTree(state, w);
        siteId = t && t.id;
      } else if (clsRow.siteKind === "plot") {
        const want = clsRow.mode === "sow" ? "bare" : clsRow.mode === "harvest" ? "crop" : "any";
        const p = pickPlot(state, w, want);
        siteId = p && p.id;
      }
    }
    if (!siteId) return; // no free site: body waits (honest dim patience)
    startWalk(state, w, cls, siteId);
    w.cls = cls; // the row classes the body (adapter-classified)
  }

  // ---- requeued: THE BLIP — half-step reset at the den, no walk (zero growth)
  if (ev.state === "requeued") {
    const w = workerOf(state, row.workerId);
    if (w) {
      w.mode = "SETTLED";
      w.route = null;
      w.actT = 0;
      w.siteId = null;
      w.rowId = null;
      w.pos = { ...w.home };
      w.row = { state: "requeued", attempts: ev.attempts || 1, outcome: null, queuedAt: null };
    }
    state.fx.push(fx(state, { kind: "blip", x: siteOf(state, "den").x, y: siteOf(state, "den").y, age: 0, dur: 12 }));
  }

  // ---- settled: the truth-pixel — pile credit, bloom, first-settle glance
  if (ev.state === "settled") {
    const w = workerOf(state, row.workerId);
    if (w) {
      w.rowId = null;
      w.row.state = "settled";
      // walk home: plain RETURN (walk-home TIERS are beyond this slice)
      const site = w.siteId ? siteOf(state, w.siteId) : null;
      w.route = site ? buildRoute(w.pos, [{ x: w.home.x, y: w.home.y }], [GAIT.returnHome], "SETTLED") : null;
      w.mode = site ? "RETURN" : "SETTLED";
      if (!site) w.pos = { ...w.home };
    }
    const cls = ev.cls || (w && w.cls) || (row.queue && JOB_CLASSES[row.queue] ? row.queue : null);
    const clsRow = cls && JOB_CLASSES[cls];
    row.outcome = ev.outcome || "completed";
    if (clsRow) {
      const siteId = w && w.siteId ? w.siteId : ev.siteId;
      const site = siteId ? siteOf(state, siteId) : null;
      if (clsRow.mode === "sow") {
        const plot = site && state.plots[site.id];
        if (plot) {
          plot.seeded = true;
          plot.harvestable = false;
          plot.stubble = false;
          plot.crop = { kind: "wheat", progress: 0, cropDay: 0, stage: CROPS.wheat.stages[0].name, bornAt: now };
          plot.wateredBy = null;
        }
        if (site) state.fx.push(fx(state, { kind: "bloom", x: site.x, y: site.y, age: 0, dur: 40 }));
      } else if (clsRow.mode === "harvest") {
        const plot = site && state.plots[site.id];
        if (plot) {
          plot.crop = null;
          plot.seeded = false;
          plot.harvestable = false;
          plot.stubble = true;
          plot.wateredBy = null;
        }
        if (site) state.fx.push(fx(state, { kind: "bloom", x: site.x, y: site.y, age: 0, dur: 40 }));
      } else if (site) {
        state.fx.push(fx(state, { kind: "bloom", x: site.x, y: site.y, age: 0, dur: 40 }));
      }
      // piles never store a number: rowLog IS the pile (§4.1 / §4.4)
      state.rowLog.push({ rowId: ev.rowId, queue: clsRow.queue, cls, state: "settled", outcome: row.outcome, observedAt: now });

      // the verdict's glance: first settle only, idle body, distance-decayed
      if (!state.glanceFired) {
        state.firstSettle = { at: now, siteId: site ? site.id : null, rowId: ev.rowId };
        state.glanceFired = true;
        if (site) {
          const r = state.rooster;
          const d = dist(r, site);
          if (d <= GLANCE.averageTravelPx * GLANCE.factor) {
            state.fx.push(fx(state, { kind: "glance", x: r.x, y: r.y, age: 0, dur: 32, actor: "rooster" }));
          }
        }
      }
    } else {
      state.rowLog.push({ rowId: ev.rowId, queue: row.queue, cls: null, state: "settled", outcome: row.outcome, observedAt: now });
    }
  }

  // ---- interrupted: walk home, NO pile, plot untouched (interrupt-no-grain law)
  if (ev.state === "interrupted") {
    const w = workerOf(state, row.workerId);
    if (w) {
      w.rowId = null;
      w.row.state = "interrupted";
      w.route = buildRoute(w.pos, [{ x: w.home.x, y: w.home.y }], [GAIT.returnHome], "SETTLED");
      w.mode = "RETURN";
      w.siteId = null;
    }
    state.rowLog.push({ rowId: ev.rowId, queue: row.queue, cls: null, state: "interrupted", outcome: null, observedAt: now });
  }

  // ---- queued: body sits at the den, dim patience (dim tint rides the renderer)
  if (ev.state === "queued") {
    const w = workerOf(state, row.workerId);
    if (w) {
      w.mode = "SETTLED";
      w.route = null;
      w.pos = { ...w.home };
      w.rowId = ev.rowId;
      w.row = { state: "queued", attempts: ev.attempts || 0, outcome: null, queuedAt: now };
    }
  }
}

// motionSystem: claim-gated targets; route legs advance one tick per step.
function motionSystem(state) {
  for (const w of state.workers) {
    if (w.mode === "WALK" && w.route) {
      w.route.t += 1;
      const completed = advanceLeg(w);
      if (completed) {
        w.pos = { ...w.route.waypoints[w.route.waypoints.length - 1] };
        const onEnd = w.route.onEnd;
        w.mode = onEnd;
        w.route = null;
        w.actT = 0;
      } else {
        w.pos = routePos(w.route);
      }
    } else if (ACTIVE_MODES.includes(w.mode)) {
      // act modes at the site: fetch/chop/sow/harvest count down their ACTS row,
      // then HOLD (stand ready) until the ledger resolves the row.
      if (w.mode === "HOLD") continue;
      const dur = ACTS[w.mode.toLowerCase()];
      if (dur) {
        w.actT += 1;
        if (w.actT >= dur) w.mode = "HOLD";
      }
    }
  }
  // RETURN: bodies walking home after settle / interrupt — same wheel, no claim.
  for (const w of state.workers) {
    if (w.mode !== "RETURN" || !w.route) continue;
    w.route.t += 1;
    if (advanceLeg(w)) {
      w.mode = "SETTLED";
      w.route = null;
      w.siteId = null;
      w.pos = { ...w.home };
    } else {
      w.pos = routePos(w.route);
    }
  }
}

// advance one leg of a worker route; returns true when the whole route is done.
function advanceLeg(w) {
  const route = w.route;
  const leg = route.legs[route.leg];
  if (route.t < leg.ticks) return false;
  route.leg += 1;
  route.t = 0;
  return route.leg >= route.legs.length;
}

// tendSystem — THE GROWTH LAW (§3.1): +1 progress per tick only while the row
// says executing AND the body stands at the plot in TEND mode AND the plot is
// seeded. No sow row ⇒ no crop ⇒ zero accrual. Watering bare soil does nothing.
function tendSystem(state) {
  // A plot is ONE plot: it advances exactly +1 per tended tick even if two bodies
  // stand at it (the §3.1 law: "exactly +1 progress per sim-tick on which its plot
  // is being tended"). Count tenders per plot, then accrue once per tended plot.
  const tenders = new Map();
  for (const w of state.workers) {
    if (w.mode !== "TEND") continue;
    const row = state.rows[w.rowId];
    if (!row || row.state !== "executing") continue;
    const plot = w.siteId ? state.plots[w.siteId] : null;
    if (!plot || !plot.crop) continue;
    tenders.set(w.siteId, (tenders.get(w.siteId) || 0) + 1);
  }
  for (const [siteId, n] of tenders) {
    if (n < 1) continue;
    const plot = state.plots[siteId];
    plot.crop.progress += 1;
    plot.crop.cropDay = Math.floor(plot.crop.progress / DAY_TICKS);
    plot.crop.stage = CROPS[plot.crop.kind].stages[stageFor(plot.crop.kind, plot.crop.cropDay)].name;
    if (plot.crop.stage === CROPS[plot.crop.kind].stages[CROPS[plot.crop.kind].stages.length - 1].name) {
      plot.harvestable = true;
    }
  }
  for (const w of state.workers) {
    if (w.mode === "TEND" && state.plots[w.siteId]) state.plots[w.siteId].wateredBy = w.id;
  }
}

// resourceSystem — piles are a pure projection of settled rows (see getPiles);
// nothing here mints a number. It exists so settle→pile stays a single code path.
function resourceSystem(state) {
  // (piles are derived in getPiles; this system is where settle-fx land)
}

// ageFx: fx are events wearing bodies — one array, one age tick.
function ageFx(state) {
  for (const f of state.fx) f.age += 1;
  state.fx = state.fx.filter((f) => f.age < f.dur);
}

// advanceDate: the clock is a pure read of the accumulator's step count.
function advanceDate(state, steps) {
  const d = gameDate(steps);
  state.clock.steps = steps;
  state.clock.day = d.day;
  state.clock.tod = d.tod;
  state.clock.phase = d.phase;
}

// ---------------------------------------------------------------- piles (derived)
// The pile IS the rows (§4.4): count = settled rows of the class; amount = rows ×
// class yield. Stone rows would count when real stone rows exist; none do (DORMANT).
export function getPiles(state) {
  const piles = { wood: { rows: 0, amount: 0 }, water: { rows: 0, amount: 0 }, grain: { rows: 0, amount: 0 }, stone: { rows: 0, amount: 0 } };
  for (const r of state.rowLog) {
    if (r.state !== "settled") continue;
    const clsRow = r.cls && JOB_CLASSES[r.cls];
    if (!clsRow || !clsRow.pile) continue;
    piles[clsRow.pile].rows += 1;
    piles[clsRow.pile].amount += clsRow.yield;
  }
  return piles;
}

// ---------------------------------------------------------------- derived()
// Read-only projection for the renderer: threads, counter line, plot phenotypes.
// A thread exists ⇔ a row says executing (§4.6.3) — it is a theorem, not a draw.
export function derived(state) {
  const executingRows = Object.values(state.rows).filter((r) => r.state === "executing");
  const threads = executingRows.map((r) => {
    const w = workerOf(state, r.workerId);
    const site = w && w.siteId ? siteOf(state, w.siteId) : null;
    return {
      rowId: r.id,
      cls: w ? w.cls : null,
      queue: r.queue,
      from: w ? { x: w.pos.x, y: w.pos.y } : null,
      to: site ? { x: site.x, y: site.y } : null,
    };
  });
  const piles = getPiles(state);
  const settledRows = state.rowLog.filter((r) => r.state === "settled").length;
  const activeWorkers = state.workers.filter((w) => ACTIVE_MODES.includes(w.mode)).length;
  const counter = {
    day: state.clock.day,
    phase: state.clock.phase,
    tod: state.clock.tod,
    wood: piles.wood.amount,
    water: piles.water.amount,
    grain: piles.grain.amount,
    settledRows,
    executing: executingRows.length,
    activeWorkers,
    pollAgeSec: state.clock.steps - state.clock.lastPoll,
    steps: state.clock.steps,
  };
  const plots = Object.fromEntries(
    Object.entries(state.plots).map(([id, p]) => [
      id,
      {
        id,
        seeded: p.seeded,
        harvestable: p.harvestable,
        stubble: p.stubble,
        crop: p.crop ? { kind: p.crop.kind, progress: p.crop.progress, cropDay: p.crop.cropDay, stage: p.crop.stage } : null,
        wateredBy: p.wateredBy,
      },
    ])
  );
  // bodies as a read-only projection for the renderer (mode is a render label;
  // the sprite never holds truth). bob = deterministic idle phase, no random.
  const workers = state.workers.map((w) => ({
    id: w.id,
    vid: w.vid,
    name: w.name,
    cls: w.cls,
    mode: w.mode,
    pos: { x: Math.round(w.pos.x * 10) / 10, y: Math.round(w.pos.y * 10) / 10 },
    home: { x: w.home.x, y: w.home.y },
    rowId: w.rowId,
    siteId: w.siteId,
    row: { state: w.row.state, attempts: w.row.attempts, outcome: w.row.outcome },
    bob: ((w.vid * 37) % 13) / 13,
  }));
  return { threads, counter, piles, plots, workers, fx: state.fx.map((f) => ({ ...f })), rooster: { ...state.rooster }, firstSettle: { ...state.firstSettle }, glanceFired: state.glanceFired };
}

// ---------------------------------------------------------------- invariants (§4.6)
// Run after every step in tests; any violation = the game is lying.
export function checkInvariants(state) {
  const v = [];
  const piles = getPiles(state);

  // 1. piles[cls].rows === settled rows of that class (pile = settled rows)
  for (const cls of Object.keys(JOB_CLASSES)) {
    const clsRow = JOB_CLASSES[cls];
    if (!clsRow.pile) continue;
    const settledOfCls = state.rowLog.filter((r) => r.state === "settled" && r.cls === cls).length;
    if (piles[clsRow.pile].rows !== settledOfCls) v.push(`pile ${clsRow.pile}.rows ${piles[clsRow.pile].rows} !== settled ${cls} rows ${settledOfCls}`);
    if (piles[clsRow.pile].amount !== settledOfCls * clsRow.yield) v.push(`pile ${clsRow.pile}.amount ${piles[clsRow.pile].amount} !== ${settledOfCls} * ${clsRow.yield}`);
  }

  // 2. |active bodies| === |executing rows|
  const active = state.workers.filter((w) => ACTIVE_MODES.includes(w.mode)).length;
  const executing = Object.values(state.rows).filter((r) => r.state === "executing").length;
  if (active !== executing) v.push(`active ${active} !== executing rows ${executing}`);

  // 3. thread exists ⇔ some row is executing (threads recorded in derived())
  const threads = derived(state).threads.length;
  if (threads !== executing) v.push(`threads ${threads} !== executing ${executing}`);

  // 4. plot.crop.stage === STAGES[kind][stageFor(cropDay)] — growth is a lookup
  for (const p of Object.values(state.plots)) {
    if (!p.crop) continue;
    const want = CROPS[p.crop.kind].stages[stageFor(p.crop.kind, p.crop.cropDay)].name;
    if (p.crop.stage !== want) v.push(`plot ${p.id} stage ${p.crop.stage} !== table ${want} (cropDay ${p.crop.cropDay})`);
  }
  return v;
}
