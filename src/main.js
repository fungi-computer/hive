// main.js — THE WORLDBOX MVP boot. Date-based BirdDog-driven: ONE real input
// (fleet busy/idle per DAY), ONE real clock (calendar DATE — the pane closes, real
// time passes, the world answers on reopen), prosperity = a pure function of
// (daysWorked, daysIdle); RNG dresses everything below the direction line.
//
// Persistence: ONLY { seed, lastSeen, days[], prosperity } — terrain, trees and
// piles are deterministic projections of (seed + days[]) and re-derive on boot;
// nothing else is stored (the mesh can never drift from truth).

import { createGlade, initWorld, renderGlade, playChop } from "./glade.js";
import { createWorld, advanceWorld, derived, checkInvariants, logsOf, todaySignal } from "./world.js";
import { resolveGap, pickBirddogSource, createDayFeed } from "./feed.js";
import { dayKey, addDays } from "./date.js";
import { SEEDS, MAX_GAP, TILE, STACK, POC_TIMESCALE, TIMESCALE_REAL, dayMsFor } from "./tables.js";
import { createMetrics, sampleMetrics } from "./metrics.js";

const STORE_KEY = "worldbox.v1";

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode / storage blocked — the world still lives for the session
  }
}

function saveWorld(world) {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        seed: world._seed,
        lastSeen: world.clock.lastSeen,
        days: world.days,
        prosperity: world.prosperity,
      })
    );
  } catch {
    /* session-only, honest */
  }
}

// ---------------------------------------------------------------- boot: the reopen gap
const today = dayKey();
const saved = loadSaved();
const world = createWorld((saved && saved.seed) || SEEDS.worldSeed);

// replay persisted days (idempotent by construction — the reopen gate)
if (saved && Array.isArray(saved.days) && saved.days.length > 0) {
  for (const d of saved.days) advanceWorld(world, d);
  const drift = Math.abs(world.prosperity - (typeof saved.prosperity === "number" ? saved.prosperity : -1));
  if (drift > 1e-9) console.warn("[worldbox] stored prosperity ≠ replay — store tampered? rebuilt from days[], honesty kept");
  world.choreQueue.length = 0; // the montage only plays NEW days' chores, never re-enacts history
}

// ---- clock mode: FAST POC (scaled days) vs REAL (1:1). Compress the CLOCK, never the RULES.
const clockFast = currentTimescale() > TIMESCALE_REAL;
let gap = [];
let compacted = false;
let danceBudget = 1; // fast: every rolled day earns its one chop on stage
if (clockFast) {
  // the VIRTUAL clock takes over: anchor to the ledger — today (or the last session's
  // anchor day) completes first; further days roll one per dayMsFor() of real time.
  world.clock.lastSeen = world.clock.lastSeen || today;
} else {
  // REAL 1:1 (the production reopen-gap, unchanged): integrate the closed gap.
  const lastSeen = (saved && saved.lastSeen) || today;
  gap = resolveGap(lastSeen, today);
  compacted = gap.length > MAX_GAP;
  if (compacted) gap = gap.slice(gap.length - MAX_GAP);
  for (const d of gap) advanceWorld(world, d);
  world.clock.lastSeen = today;
  danceBudget = Math.min(3, gap.reduce((s, d) => s + d.chops, 0));
}

// today is a LOOK, never scored
function todayF() {
  const d = resolveGap(addDays(today, -1), addDays(today, 1)); // the emulated feed's deterministic schedule
  return d[0] ? d[0].f : null;
}

// ---------------------------------------------------------------- render boot
const glade = await createGlade(document.getElementById("stage"));
initWorld(glade, world);

const refereeEl = document.getElementById("referee");
const tickEl = document.getElementById("tick");

// ---- METRICS (always-on — Levi's ruling): the zero-dep sampler lives, re-aimed at
// the date world. One windowed FPS/frame-ms snapshot per second; every number traces
// to measured frame time (performance.now) and derived(world) — never invented.
const metrics = createMetrics(1000);
const metricHook = { steps: 0 }; // the date world has no fixed-step sim counter — steps stay 0, honestly
let metricsSnap = null;
const r1 = (x) => Math.round(x * 10) / 10;

function countWeeds() {
  let n = 0;
  for (const v of world.grid) if (v === TILE.weed) n++;
  return n;
}
function countNodes(c) {
  let n = c.children.length;
  for (const ch of c.children) n += countNodes(ch);
  return n;
}
function updateMetricsSurface(d, snap) {
  const el = document.getElementById("metrics");
  if (!el || !snap) return;
  const standing = d.trees.filter((t) => t.state === "standing").length;
  const saplings = d.trees.filter((t) => t.state === "sapling").length;
  const stumps = d.trees.length - standing - saplings;
  const pixiFps = typeof glade.app.ticker.FPS === "number" ? ` · pixi FPS ${r1(glade.app.ticker.FPS)}` : "";
  el.innerHTML =
    `<div><b>render</b> FPS ${snap.fps} · frame ms ${snap.frameMs.avg} (min ${snap.frameMs.min} / max ${snap.frameMs.max})${pixiFps} · display objects ${countNodes(glade.app.stage)}</div>` +
    `<div><b>day</b> ${d.clock.dayKey} · now ${dayKey()} · lastSeen ${d.clock.lastSeen || "—"} · ${isFast() ? "next" : "today"} ${todaySignal(isFast() ? nextDayF() : todayF())} · this week ${d.week.worked}/${Math.max(1, d.week.days - d.week.unobserved)} worked · birddog ${pickBirddogSource()} · timescale x${currentTimescale()} (${dayMs()}ms/day)</div>` +
    `<div><b>world</b> prosperity ${d.prosperity} · tier ${d.tier} · logs ${d.logs} · pile pool ${Math.min(d.logs, STACK.pool)} · stumps ${stumps} · saplings ${saplings} · standing ${standing} · weeds ${countWeeds()}</div>`;
}
(() => {
  const el = document.getElementById("metrics");
  if (el) el.style.display = "block"; // always-on (Levi), not a debug toggle
})();

function updateReferee(d) {
  const wk = d.week;
  const scale = currentTimescale();
  const tSig = isFast() ? `next: ${todaySignal(nextDayF())}` : `today: ${todaySignal(todayF())}`;
  const notes = [];
  if (compacted) notes.push("older history compacted");
  if (wk.unobserved > 0) notes.push(`unobserved ${wk.unobserved}d`);
  refereeEl.textContent =
    `day ${d.clock.dayKey} · this week ${wk.worked}/${Math.max(1, wk.days - wk.unobserved)} worked · ` +
    `${tSig} · world: ${d.tier} · logs ${d.logs} · seed ${world._seed} · ` +
    `${scale > 1 ? `POC x${scale} (${dayMs()}ms/day)` : "real 1:1"}` +
    (notes.length ? ` · ${notes.join(" · ")}` : "");
}

// ---------------------------------------------------------------- chore → montage
function processQueue(glade, world) {
  if (glade.busy) return;
  const chore = world.choreQueue.shift();
  if (!chore) return;
  if (chore.kind === "stack") return; // pile already shows the derived count — synchronized
  if (danceBudget <= 0) return; // consumed silently: stumps/weeds are already in the state
  danceBudget--;
  playChop(glade, world, chore);
}

// ------------------------------------------------ the date clock — POC SPEED KNOB
// Compress the CLOCK, never the RULES: a world-day completes every dayMsFor(scale) of
// REAL wall time and is then scored through the SAME pure advanceWorld (a COMPLETED day
// — busy:+1/chop/logs, idle:decay). FAST by default (one day per ~3s) so chops, logs,
// weeds and the montage visibly happen within seconds of opening the pane; 1:1 is the
// real product; live override: window.__TIMESCALE = <number ≥ 1>.
function currentTimescale() {
  const w = typeof window !== "undefined" ? window.__TIMESCALE : undefined;
  if (typeof w === "number" && Number.isFinite(w) && w >= 1) return w;
  return POC_TIMESCALE;
}
function dayMs() {
  return dayMsFor(currentTimescale());
}
const isFast = () => currentTimescale() > TIMESCALE_REAL;

let virtualToday = world.clock.lastSeen || dayKey(); // fast: continues from the ledger, never rewinds
let dayAcc = 0;
let clockLast = performance.now();

// the next day's LOOK (fast mode) — a look, never scored
function nextDayF() {
  const base = world.clock.dayKey || virtualToday;
  const d = resolveGap(base, addDays(base, 2)); // completed days in [base+1 .. base+1]
  return d[0] ? d[0].f : null;
}

// roll on the VIRTUAL clock (fast): RAW wall time accumulates into dayAcc — hidden
// time counts, so opening the pane after a minute shows a minute's worth of days.
// Each roll integrates exactly ONE just-completed day via the same feed contract.
function rollAccumulated(nowRaw) {
  dayAcc += nowRaw - clockLast;
  clockLast = nowRaw;
  const msDay = dayMs();
  let rolled = 0;
  let guard = 0;
  while (dayAcc >= msDay && guard++ < 5000) {
    dayAcc -= msDay;
    const ds = createDayFeed({ from: virtualToday, to: virtualToday }); // exactly 1 seeded day
    for (const d of ds) {
      advanceWorld(world, d);
      danceBudget = 1; // each rolled day earns its one chop on stage
      rolled++;
    }
    world.clock.lastSeen = virtualToday;
    virtualToday = addDays(virtualToday, 1);
  }
  if (rolled > 0) saveWorld(world);
  return rolled;
}

// REAL 1:1 path — the real-midnight roll (production semantics, unchanged)
function msToNextMidnight() {
  const n = new Date();
  const nn = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  return nn.getTime() - n.getTime() + 250;
}
let rollTimer = null;
function scheduleRoll() {
  clearTimeout(rollTimer);
  rollTimer = setTimeout(dayCheck, msToNextMidnight());
}
function dayCheck() {
  const t2 = dayKey();
  const g2 = resolveGap(world.clock.lastSeen, t2); // at most [yesterday], integrated ONCE
  if (g2.length) {
    for (const d of g2) advanceWorld(world, d);
    world.clock.lastSeen = t2;
    danceBudget = 1; // a live day earns its one chop on stage
    saveWorld(world);
  }
  scheduleRoll();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(rollTimer);
    saveWorld(world);
  } else if (!isFast()) {
    dayCheck(); // real mode re-anchors on sight; fast mode just resumes accumulating raw time
  }
});

// ---------------------------------------------------------------- animation loop
// The ticker animates ONLY — it NEVER calls advanceWorld directly; the world moves
// on COMPLETED days (fast: the virtual-clock accumulator; real: the midnight roll).
let animLast = performance.now();
glade.app.ticker.add(() => {
  const now = performance.now();
  const dt = Math.min(100, now - animLast); // render dt clamped (animation only)
  animLast = now;

  if (isFast()) rollAccumulated(now); // raw wall time accumulates the virtual clock
  processQueue(glade, world);
  const d = derived(world);
  renderGlade(glade, d, { t: now / 1000, dt: dt / 1000, grid: world.grid });
  updateReferee(d);
  metricsSnap = sampleMetrics(metrics, metricHook);
  if (metricsSnap) updateMetricsSurface(d, metricsSnap); // one rendered panel line-set per closed window
});

const d0 = derived(world);
renderGlade(glade, d0, { t: 0, dt: 0, grid: world.grid });
updateReferee(d0);
saveWorld(world);
if (tickEl) tickEl.textContent = isFast() ? `POC speed x${currentTimescale()} — a day every ${dayMs()}ms` : "real 1:1 — a day per local midnight";
if (!isFast()) scheduleRoll();

// ---------------------------------------------------------------- debug handle
window.__BIRDDOG = window.__BIRDDOG || { source: "fake" }; // the knob — flip to "real" in console, then reopen
window.__WORLDBOX = {
  seed: world._seed,
  today: dayKey(),
  get days() { return world.days.map((d) => ({ ...d })); },
  get prosperity() { return world.prosperity; },
  get tier() { return derived(world).tier; },
  get logs() { return logsOf(world); },
  get trees() { return derived(world).trees; },
  get lastSeen() { return world.clock.lastSeen; },
  get invariants() { return checkInvariants(world); },
  get choreQueue() { return derived(world).choreQueue; },
  get birddog() { return pickBirddogSource(); },
  get timescale() { return currentTimescale(); },
  get dayMs() { return dayMs(); },
};
