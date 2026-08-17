// feed.js — the ONLY place I/O (and randomness) lives. In this slice it is the
// SEED-42 EMULATOR: a predetermined row-event script in the exact shape the real
// runs feed will emit (§5.1) — { kind:'row', rowId, queue, state, outcome, attempts,
// observedAt }. mulberry32(SEED) builds the schedule up front (the POC's ethos);
// the sim never sees a random number and cannot tell this adapter from the real one.
//
// The script IS the re-tasked POC schedule: 14 rows total, classed —
//   10 wood chops (coexistence proof; round-robin over wood workers, seeded trees)
//   1 requeued tend stutter (the stall law made visible)
//   1 sow → tend → harvest cycle (the full loop, tick-exact from §3.3)
//   stone: DORMANT — never scheduled (the freezer law, demonstrated).

import { SEED, GAIT } from "./tables.js";
import { dayKey, addDays, daysBetween, dayOrdinal, parseKey } from "./date.js";

// mulberry32 — seeded PRNG (moved here from the POC's main.js; the POC's
// "every load plays the exact same schedule" promise survives verbatim).
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rowEvent(rowId, queue, state, workerId, outcome = null, attempts = 0, siteId = null, cls = queue) {
  return { kind: "row", rowId, queue, state, outcome, attempts, workerId, cls, siteId };
}

// The re-task: classed dispatches + the pinned trace cycle.
export function buildScript() {
  const perRow = [];
  const push = (at, ev) => perRow.push({ at, ev });
  const rand = mulberry32(SEED);

  // ---- THE CYCLE — the §3.3 trace, tick-exact (pinned design, not rng)
  push(0, rowEvent("S1", "sow", "executing", "w2")); // W2 walks den→plot-1 (40)
  push(43, rowEvent("S1", "sow", "settled", "w2", "completed")); // plot seeded — THE FIRST SETTLE
  push(50, rowEvent("T1", "water", "executing", "w3")); // attempt 1: den→well(20)→fill(2)→well→plot
  push(80, rowEvent("T1", "water", "requeued", "w3", null, 1)); // THE STALL — blip home, zero growth
  push(120, rowEvent("T1", "water", "executing", "w3", null, 1)); // attempt 2: arrives plot t=167
  push(430, rowEvent("T1", "water", "settled", "w3", "completed")); // water += 40; progress 263
  push(433, rowEvent("T2", "water", "executing", "w1")); // arrives plot t=480
  push(960, rowEvent("T2", "water", "settled", "w1", "completed")); // water += 40; progress 743
  push(1000, rowEvent("H1", "harvest", "executing", "w4")); // walk den→plot (40)
  push(1043, rowEvent("H1", "harvest", "settled", "w4", "completed")); // grain += 3; plot cleared

  // ---- 10 classed wood dispatches (the POC's round-robin, re-classed to wood).
  // Round-robin across the two wood workers; seeded tree pick; steady cadence.
  // The first chop starts after the sow settle so the ROOSTER GLANCE lands on the
  // very first settle (the crop's birth at plot-1).
  const TREES = 8;
  const WOOD_WORKERS = ["w5", "w6"];
  for (let k = 0; k < 10; k++) {
    const start = 52 + k * 24; // cadence ≥ occupancy (24 walk + 3 act + 18 return = 45) ⇒ no drops
    const worker = WOOD_WORKERS[k % 2];
    const tree = "tree-" + Math.floor(rand() * TREES);
    const rowId = "C" + (k + 1);
    push(start, rowEvent(rowId, "wood", "executing", worker, null, 0, tree));
    push(start + GAIT.denToTree + GAIT.chopAct, rowEvent(rowId, "wood", "settled", worker, "completed")); // +27
  }
  // stone: NEVER scheduled here — JOB_CLASSES.stone stays DORMANT by demonstration.

  return perRow;
}

export function createFeed() {
  const script = buildScript();
  return {
    script,
    // drain(steps) → the row events observed AT this exact step count.
    drain(steps) {
      const out = [];
      for (const s of script) if (s.at === steps) out.push({ ...s.ev, observedAt: steps });
      return out;
    },
  };
}

// ============================ WORLDBOX: THE DAY-FEED ============================
// One FLEET-LEVEL signal per completed local day: { key, f } where
//   f = clamp(activeRunRowsBucketed(day) / rosterCapacity, 0, 1)
//   f = null ⇔ UNOBSERVED (no data) — Δ=0, never punished as idle, never rewarded as work.
// The REAL rule (zero new server fields — thesis law 1, POC feed contract intact):
// while the pane is OPEN, day-buckets accumulate from the existing visibility-gated
// runs poll/SSE; for a CLOSED gap, on reopen fetch GET /agents/:id/runs rows (already
// shipped; rows carry startedAt/settledAt) and bucket by LOCAL day key. This MVP runs
// the EMULATOR below — deterministic per (from,to) window — behind the SAME contract;
// the sim cannot tell it from the real adapter.

export const ROSTER_CAP = 8; // MVP constant; the real wiring refreshes from the drawer on open

// ============================ THE FAKE BIRDBOG ============================
// A deterministic dev source for the fleet busy/idle signal — the old SEED-42 row
// feed's role, re-aimed at DAYS. Scripted THEMED WEEKS (working → golden → neglect,
// incl. one unobserved day) with seeded within-day jitter, repeating every 21 days,
// so the pane VISIBLY chops on busy days and decays on idle days, and any window is
// deterministic on its own keys. Same contract as the real runs adapter: the world
// only ever sees { key, f } — it can never tell the fake from the real lane.
export const POC_FAKE_WEEKS = [
  [1.0, 0.7, 1.0, 0.5, 0.9, 0.2, 0.0], // working week — logs stack
  [1.0, 1.0, 0.8, 1.0, 0.9, 1.0, 0.6], // golden week — thriving
  [0.0, 0.1, 0.0, 0.3, 0.0, 0.0, null], // neglect — decay + one unobserved day
];
export function createDayFeed({ from = addDays(dayKey(), -21), to = addDays(dayKey(), -1) } = {}) {
  const rng = mulberry32(7); // jitter seed — NOT the worldSeed, NOT the dress seed
  const days = [];
  let k = from;
  let i = 0;
  while (daysBetween(to, k) >= 0 && i++ < 500) {
    const slot = dayOrdinal(parseKey(k)) % 21; // stable 21-day cycle slot
    const base = POC_FAKE_WEEKS[Math.floor(slot / 7)][slot % 7];
    let f = base;
    if (f !== null && rng() < 0.35) {
      f = Math.min(1, Math.max(0, Math.round((f + (rng() * 0.2 - 0.1)) * 10) / 10)); // seeded variety
    }
    days.push({ key: k, f: f === null ? null : Math.round(f * 10) / 10 });
    k = addDays(k, 1);
  }
  return days;
}

// ============================ BIRDBOG SOURCE KNOB ============================
// Config-visible: POC DEFAULTS to the FAKE. Flip the constant, or set
//   window.__BIRDDOG = { source: "real" }   (console / before boot)
// to select the REAL runs lane. The real lane can never fabricate a direction: any
// day it cannot answer returns f:null (UNOBSERVED ⇒ flat, labeled, never idle).
export const BIRDDOG_SOURCE = "fake"; // "fake" | "real"
export function pickBirddogSource() {
  if (typeof window !== "undefined" && window.__BIRDDOG && window.__BIRDDOG.source === "real") return "real";
  return BIRDDOG_SOURCE;
}

// The REAL adapter — reads the existing runs lane (zero new server fields): bucket
// GET /agents/:id/runs rows (startedAt/settledAt) by LOCAL day key;
// f = clamp(rowsOverlapping(day) / ROSTER_CAP, 0, 1). Until the rows lane is wired in
// this POC, the lane is UNAVAILABLE ⇒ every gap day comes back f:null (honest flat).
function realFleetForGap(from, to) {
  const out = [];
  let k = from;
  let i = 0;
  while (daysBetween(to, k) >= 0 && i++ < 500) {
    out.push({ key: k, f: null });
    k = addDays(k, 1);
  }
  return out;
}

// Completed days strictly after lastSeen, up to YESTERDAY — today is never scored.
export function resolveGap(lastSeen, today) {
  const from = addDays(lastSeen, 1);
  const to = addDays(today, -1);
  if (daysBetween(to, from) < 0) return [];
  return pickBirddogSource() === "real" ? realFleetForGap(from, to) : createDayFeed({ from, to });
}
