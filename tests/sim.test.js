// tests/sim.test.js — node, no Pixi, no DOM. Run: node tests/sim.test.js
// The slice's test gates (§7.7):
//   1. the §3.3 trace as a test vector (tick-exact)
//   2. the §4.6 mirror invariants as property tests after EVERY step
//   3. requeue-stall zero-growth assertion (the "no" law #1)
//   4. interrupt-no-grain assertion (the "no" law #2)
// Plus: determinism (same seed ⇒ same state) and the purity greps (no
// Math.random / Date / Pixi / DOM inside sim/ticker/tables).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createSim, step, derived, getPiles, checkInvariants } from "../src/sim.js";
import { createFeed, mulberry32 } from "../src/feed.js";
import { DAY_TICKS, SEED } from "../src/tables.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- harness (async-safe)
let passed = 0;
let failed = 0;
const failures = [];
const queue = [];
function test(name, fn) {
  queue.push({ name, fn });
}
async function main() {
  for (const { name, fn } of queue) {
    try {
      await fn();
      passed += 1;
      console.log(`  ok  ${name}`);
    } catch (e) {
      failed += 1;
      failures.push({ name, e });
      console.log(`FAIL  ${name}\n      ${e.message.split("\n")[0]}`);
    }
  }
}

const SITE = (id) => createSim().sites.find((s) => s.id === id);

// Deterministic runner: steps 0..end, feeding the script's events, checking the
// §4.6 invariants after every single step.
function runScript(script, endT) {
  const sim = createSim();
  const eventsAt = new Map();
  for (const s of script) {
    if (!eventsAt.has(s.at)) eventsAt.set(s.at, []);
    eventsAt.get(s.at).push({ ...s.ev, observedAt: s.at });
  }
  const violations = [];
  for (let t = 0; t <= endT; t++) {
    step(sim, eventsAt.get(t) || [], t);
    const v = checkInvariants(sim);
    if (v.length) violations.push({ t, v });
  }
  return { sim, violations };
}

// ---------------------------------------------------------------- fixtures
const traceScript = () => createFeed().script;
const traceEnd = () => Math.max(...createFeed().script.map((s) => s.at));

test("§3.3 trace runs with ZERO invariant violations over every step", () => {
  const { sim, violations } = runScript(traceScript(), traceEnd());
  assert.deepEqual(violations, [], "invariants broken mid-run: " + JSON.stringify(violations.slice(0, 3)));
  assert.equal(sim.debugDrops, 0, "an executing event found its body busy");
});

test("§3.3 trace vector — the exact trace table, step by step", () => {
  const feed = createFeed();
  const eventsAt = new Map();
  for (const s of feed.script) {
    if (!eventsAt.has(s.at)) eventsAt.set(s.at, []);
    eventsAt.get(s.at).push({ ...s.ev, observedAt: s.at });
  }
  const sim = createSim();
  let cursor = -1;
  // step continuously 0..t so every intermediate tick runs (playback, not jumps)
  const stepT = (t) => {
    for (let k = cursor + 1; k <= t; k++) step(sim, eventsAt.get(k) || [], k);
    cursor = Math.max(cursor, t);
    return sim;
  };
  const crop = () => sim.plots["plot-1"].crop;
  const pile = () => getPiles(sim);
  const w = (id) => sim.workers.find((x) => x.id === id);

  // t=0: sow S1 executing — W2 walks den→plot (40)
  stepT(0);
  assert.equal(sim.rows.S1.state, "executing");
  assert.equal(w("w2").mode, "WALK");
  assert.equal(crop(), null, "no crop before any sow row settles");

  // t=40: W2 AT plot-1, planting
  stepT(40);
  assert.equal(w("w2").mode, "SOW");
  assert.ok(Math.abs(w("w2").pos.x - SITE("plot-1").x) < 0.01, "W2 stands at plot-1");

  // t=43: sow S1 settled — plot seeded, progress 0, NO pile credit (sow has none)
  stepT(43);
  assert.equal(sim.rows.S1.state, "settled");
  assert.equal(sim.plots["plot-1"].seeded, true);
  assert.equal(crop().progress, 0);
  assert.equal(crop().cropDay, 0);
  assert.equal(crop().stage, "seed");
  assert.deepEqual(pile(), { wood: { rows: 0, amount: 0 }, water: { rows: 0, amount: 0 }, grain: { rows: 0, amount: 0 }, stone: { rows: 0, amount: 0 } });
  assert.equal(sim.firstSettle.at, 43, "the first settle is the crop's birth");
  assert.equal(sim.firstSettle.siteId, "plot-1");

  // t=50: tend T1 executing (attempt 1) — W3 walks den→well
  stepT(50);
  assert.equal(w("w3").mode, "WALK");

  // t=70: W3 AT the well, filling
  stepT(70);
  const well = SITE("well");
  assert.ok(Math.abs(w("w3").pos.x - well.x) < 0.01 && Math.abs(w("w3").pos.y - well.y) < 0.01, "W3 at well");

  // t=80: REQUeued (attempt 1) — THE STALL: blip home, zero progress, zero water
  stepT(80);
  assert.equal(sim.rows.T1.state, "requeued");
  assert.equal(w("w3").mode, "SETTLED");
  assert.ok(Math.abs(w("w3").pos.x - w("w3").home.x) < 0.01, "W3 blipped home (no walk)");
  assert.equal(crop().progress, 0, "zero growth during requeue");
  assert.equal(pile().water.amount, 0, "zero water during requeue");

  // stall continues through attempt-2's walk: still zero at t=166
  stepT(119);
  assert.equal(crop().progress, 0);
  stepT(120); // attempt 2 executing
  stepT(166);
  assert.equal(crop().progress, 0, "no accrual before W3 stands at the plot");

  // t=167: W3 AT plot-1 in TEND — accrual begins
  stepT(167);
  assert.equal(w("w3").mode, "TEND");
  assert.equal(crop().progress, 1, "the very first watering tick");

  // t=429: 263 watered ticks (167..429)
  stepT(429);
  assert.equal(crop().progress, 263);

  // t=430: tend T1 settled — water += 40; cropDay 2 ⇒ sprout; game-day 3 · dusk
  stepT(430);
  assert.equal(pile().water.amount, 40);
  assert.equal(pile().water.rows, 1);
  assert.equal(crop().progress, 263);
  assert.equal(crop().cropDay, Math.floor(263 / DAY_TICKS));
  assert.equal(crop().stage, "sprout");
  const d = derived(sim).counter;
  assert.equal(d.day, 3, "game-day and watered-day are deliberately different clocks");
  assert.equal(d.phase, "dusk");

  // t=433: tend T2 executing (W1); t=479: still 263 (not at plot yet)
  stepT(433);
  stepT(479);
  assert.equal(crop().progress, 263, "no growth while W1 fetches");

  // t=480: W1 at plot → 480 ticks of water (480..959)
  stepT(480);
  assert.equal(w("w1").mode, "TEND");
  stepT(959);
  assert.equal(crop().progress, 263 + 480, "743 crop progress");

  // t=960: tend T2 settled — water 80; cropDay 6 ⇒ gold (ready ≥ 5)
  stepT(960);
  assert.equal(pile().water.amount, 80);
  assert.equal(pile().water.rows, 2);
  assert.equal(crop().progress, 743);
  assert.equal(crop().cropDay, 6);
  assert.equal(crop().stage, "gold");
  assert.equal(sim.plots["plot-1"].harvestable, true);

  // t=1000: harvest H1 executing (W4); t=1043: settled — grain 3, plot cleared
  stepT(1000);
  assert.equal(w("w4").mode, "WALK");
  stepT(1043);
  assert.equal(pile().grain.amount, 3);
  assert.equal(pile().grain.rows, 1);
  assert.equal(sim.plots["plot-1"].crop, null);
  assert.equal(sim.plots["plot-1"].seeded, false);
  assert.equal(sim.plots["plot-1"].stubble, true);
});

test("§3.3 trace vector — the 10 seeded wood chops settle to exactly 10 wood", () => {
  const feed = createFeed();
  const woodRows = feed.script.filter((s) => s.ev.queue === "wood" && s.ev.state === "settled");
  assert.equal(woodRows.length, 10, "the slice's 14 classed rows include 10 chops");
  const atTicks = woodRows.map((s) => s.at);
  assert.deepEqual(atTicks, atTicks.map((_, i) => 52 + i * 24 + 27), "chop settles land at start+27 (walk 24 + act 3)");
  const { sim } = runScript(traceScript(), traceEnd());
  assert.equal(getPiles(sim).wood.amount, 10);
  assert.equal(getPiles(sim).wood.rows, 10);
  assert.equal(derived(sim).counter.grain, 3);
  assert.equal(derived(sim).counter.water, 80);
});

test("§4.6 property test — determinism: same seed ⇒ char-identical projection", () => {
  const a = runScript(traceScript(), traceEnd()).sim;
  const b = runScript(traceScript(), traceEnd()).sim;
  assert.equal(JSON.stringify(derived(a)), JSON.stringify(derived(b)));
  assert.equal(JSON.stringify(a.rows), JSON.stringify(b.rows));
  assert.equal(JSON.stringify(a.rowLog), JSON.stringify(b.rowLog));
});

test("§4.6 property test — idle drift keeps invariants (sun moves, nothing breaks)", () => {
  const sim = createSim();
  const feed = createFeed();
  const eventsAt = new Map();
  for (const s of feed.script) {
    if (!eventsAt.has(s.at)) eventsAt.set(s.at, []);
    eventsAt.get(s.at).push({ ...s.ev, observedAt: s.at });
  }
  for (let t = 0; t <= traceEnd() + 200; t++) {
    step(sim, eventsAt.get(t) || [], t);
    const v = checkInvariants(sim);
    assert.deepEqual(v, [], `invariant break at t=${t}: ${v.join("; ")}`);
  }
  const d = derived(sim).counter;
  assert.equal(d.day, Math.floor((traceEnd() + 200) / DAY_TICKS));
});

test("§4.6 property test — batch of seeded schedules never break an invariant", () => {
  const rng = mulberry32(7); // different seed, still deterministic
  for (let batch = 0; batch < 12; batch++) {
    const script = [];
    let t = 10;
    // classed, deterministic: never more plot-rows than plots, never more wood
    // rows than trees, workers free by construction ⇒ the invariants must hold.
    const plan = ["wood", "wood", "sow", "water", "wood", "wood", "wood", "sow", "wood"];
    for (let i = 0; i < plan.length; i++) {
      const queue = plan[i];
      const rowId = `X${batch}-${i}`;
      const worker = queue === "wood" ? (i % 2 ? "w6" : "w5") : queue === "sow" ? "w2" : i % 2 ? "w3" : "w1";
      const siteId = queue === "wood" ? "tree-" + Math.floor(rng() * 8) : null;
      script.push({ at: t, ev: { kind: "row", rowId, queue, state: "executing", workerId: worker, cls: queue, siteId, attempts: 0, outcome: null } });
      if (queue === "water" && rng() < 0.4) {
        script.push({ at: t + 8, ev: { kind: "row", rowId, queue, state: "requeued", workerId: worker, cls: queue, attempts: 1, outcome: null } });
        script.push({ at: t + 14, ev: { kind: "row", rowId, queue, state: "executing", workerId: worker, cls: queue, attempts: 1, outcome: null } });
        script.push({ at: t + 14 + 47, ev: { kind: "row", rowId, queue, state: "settled", workerId: worker, cls: queue, outcome: "completed", attempts: 1 } });
      } else {
        const dur = queue === "wood" ? 27 : queue === "sow" ? 43 : 90;
        script.push({ at: t + dur, ev: { kind: "row", rowId, queue, state: "settled", workerId: worker, cls: queue, outcome: "completed", attempts: 0 } });
      }
      t += 30;
    }
    const { violations } = runScript(script, t);
    assert.deepEqual(violations, [], `batch ${batch}: ${JSON.stringify(violations.slice(0, 2))}`);
  }
});

test("stall law — requeue contributes ZERO progress and ZERO water", () => {
  const sim = createSim();
  const w = (id) => sim.workers.find((x) => x.id === id);
  const crop = () => sim.plots["plot-1"].crop;
  // sow seeds plot-1
  step(sim, [{ kind: "row", rowId: "S1", queue: "sow", cls: "sow", state: "executing", workerId: "w2", attempts: 0, outcome: null }], 0);
  step(sim, [], 1); // ... walk 40
  step(sim, [{ kind: "row", rowId: "S1", queue: "sow", cls: "sow", state: "settled", workerId: "w2", outcome: "completed" }], 40);
  step(sim, [], 41);
  assert.equal(sim.plots["plot-1"].seeded, true);
  // tend attempt 1 → requeue BEFORE arrival: zero growth
  step(sim, [{ kind: "row", rowId: "T1", queue: "water", cls: "water", state: "executing", workerId: "w3", attempts: 0, outcome: null }], 50);
  step(sim, [], 60);
  assert.equal(crop().progress, 0);
  assert.equal(w("w3").mode, "WALK");
  step(sim, [{ kind: "row", rowId: "T1", queue: "water", cls: "water", state: "requeued", workerId: "w3", attempts: 1, outcome: null }], 80);
  step(sim, [], 119);
  assert.equal(crop().progress, 0, "progress DID NOT move across the requeue window");
  step(sim, [], 120);
  assert.equal(getPiles(sim).water.amount, 0, "water pile DID NOT move");
  assert.equal(crop().stage, "seed", "stage held at seed — honest stasis, no fabrication");
});

test("interrupt law — an interrupted water row yields NO grain and NO water", () => {
  const sim = createSim();
  const w = (id) => sim.workers.find((x) => x.id === id);
  // sow plot-1
  step(sim, [{ kind: "row", rowId: "S1", queue: "sow", cls: "sow", state: "executing", workerId: "w2", attempts: 0, outcome: null }], 0);
  step(sim, [{ kind: "row", rowId: "S1", queue: "sow", cls: "sow", state: "settled", workerId: "w2", outcome: "completed" }], 40);
  // tend executes, waters for a while, then is INTERRUPTED
  step(sim, [{ kind: "row", rowId: "T1", queue: "water", cls: "water", state: "executing", workerId: "w3", attempts: 0, outcome: null }], 50);
  for (let t = 51; t < 200; t++) step(sim, [], t); // 167..199 → ~33 watered ticks
  step(sim, [], 200);
  const waterBefore = getPiles(sim).water.amount;
  const progressBefore = sim.plots["plot-1"].crop.progress;
  assert.ok(progressBefore > 0, "the crop DID grow while the row honestly executed");
  step(sim, [{ kind: "row", rowId: "T1", queue: "water", cls: "water", state: "interrupted", workerId: "w3", outcome: null }], 201);
  step(sim, [], 202);
  assert.equal(getPiles(sim).water.amount, waterBefore, "interrupt contributed zero water");
  assert.equal(getPiles(sim).grain.amount, 0, "interrupt contributed zero grain");
  assert.equal(sim.rows.T1.state, "interrupted");
  assert.equal(w("w3").mode, "RETURN", "interrupt = walk home, no pile credit");
  // honest labor is kept: waterings that REALLY happened stay; nothing fabricated after
  assert.equal(sim.plots["plot-1"].crop.progress, progressBefore, "the interrupt itself changed no crop state");
  step(sim, [], 250);
  assert.equal(getPiles(sim).water.amount, waterBefore, "and nothing mints afterwards");
});

test("interrupt of a HARVEST row yields zero grain too", () => {
  const sim = createSim();
  const harvestRow = { kind: "row", rowId: "H1", queue: "harvest", cls: "harvest", state: "executing", workerId: "w4", attempts: 0, outcome: null };
  step(sim, [harvestRow], 0);
  step(sim, [{ kind: "row", rowId: "H1", queue: "harvest", cls: "harvest", state: "interrupted", workerId: "w4", outcome: null }], 10);
  assert.equal(getPiles(sim).grain.amount, 0, "no grain for an interrupted harvest");
});

test("purity gates — sim/ticker/tables are free of Math.random, Date, Pixi, DOM", () => {
  for (const f of ["sim.js", "ticker.js", "tables.js"]) {
    const src = readFileSync(join(__dirname, "..", "src", f), "utf8");
    // match actual CALLS, not doc comments that say "no Math.random"
    assert.ok(!/Math\.random\s*\(/.test(src), `${f} must not call Math.random`);
    assert.ok(!/new\s+Date\s*\(/.test(src), `${f} must not construct a Date`);
    assert.ok(!/Date\.now\s*\(/.test(src), `${f} must not read wall-clock directly`);
    assert.ok(!/from\s+["']pixi\.js|require\s*\(\s*["']pixi\.js/.test(src), `${f} must not import Pixi`);
    assert.ok(!/document\.|window\.|\.innerHTML|getElementById/.test(src), `${f} must not touch the DOM`);
  }
});

test("ticker purity + snap contract: clamp+accumulate, one step per 1000ms, no catch-up", async () => {
  const { createTicker, push, gameDate } = await import("../src/ticker.js");
  const tk = createTicker();
  // ~59 frames of 16ms ≈ 944ms → no step yet
  for (let i = 0; i < 59; i++) assert.equal(push(tk, 16), 0);
  assert.equal(tk.steps, 0);
  // one more frame crosses 1000ms ⇒ exactly ONE step (the fixed step is a contract)
  assert.equal(push(tk, 60), 1);
  assert.equal(tk.steps, 1);
  assert.ok(tk.acc < 1000, "residual accumulates, never rewinds");
  // a 5-second tab-throttle spike is clamped to 100ms ⇒ at most one step: SNAP,
  // never a catch-up spiral of 5 invented steps
  assert.equal(push(tk, 5000), 0);
  assert.equal(tk.steps, 1);
  assert.equal(tk.lastDeltaMs, 100, "the clamp is visible to the renderer");
  // game-date derivation (a pure function of accumulated steps)
  assert.deepEqual(gameDate(0), { day: 0, tod: 0, phase: "dawn" });
  assert.deepEqual(gameDate(10), { day: 0, tod: 10, phase: "day" });
  assert.deepEqual(gameDate(70), { day: 0, tod: 70, phase: "dusk" });
  assert.deepEqual(gameDate(90), { day: 0, tod: 90, phase: "night" });
  assert.deepEqual(gameDate(429), { day: 3, tod: 69, phase: "day" });
  assert.deepEqual(gameDate(430), { day: 3, tod: 70, phase: "dusk" });
  assert.deepEqual(gameDate(960), { day: 8, tod: 0, phase: "dawn" });
  assert.deepEqual(gameDate(1043), { day: 8, tod: 83, phase: "dusk" });
});

test("stone stays DORMANT — zero stone rows scheduled, zero stone pile", () => {
  const feed = createFeed();
  assert.equal(feed.script.filter((s) => s.ev.queue === "stone").length, 0);
  const { sim } = runScript(traceScript(), traceEnd());
  assert.equal(getPiles(sim).stone.rows, 0);
  assert.equal(getPiles(sim).stone.amount, 0);
});

test("sequence check — the slice emits exactly 14 classed rows", () => {
  const feed = createFeed();
  const rows = new Set(feed.script.map((s) => s.ev.rowId));
  assert.equal(rows.size, 14, "10 chops + S1 + T1 + T2 + H1");
});

// ---------------------------------------------------------------- summary
await main();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.e.message.split("\n")[0]}`);
  process.exit(1);
}
