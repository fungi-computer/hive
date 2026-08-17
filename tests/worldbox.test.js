// tests/worldbox.test.js — THE 8 GATES of the chop-logs MVP (the lift's §7). node,
// no Pixi, no DOM. Run: node tests/worldbox.test.js
//
// The soul: prosperity/logs/tier are pure functions of (real day keys, real fleet
// fractions) — RNG dresses below the direction line and is proven never to write it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createWorld, advanceWorld, derived, checkInvariants, logsOf, weekStats, todaySignal } from "../src/world.js";
import { createDayFeed, resolveGap } from "../src/feed.js";
import { addDays, daysBetween } from "../src/date.js";
import { PROSPERITY, CHOP, RATES, TILE, SEEDS, MAX_GAP, dayMsFor, POC_TIMESCALE, TIMESCALE_REAL } from "../src/tables.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- harness (same shape as the POC)
let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, e });
    console.log(`FAIL  ${name}\n      ${(e.message || e).split("\n")[0]}`);
  }
}

// one fixed week of completed local day keys (real calendar, deterministic fixtures)
const KEYS7 = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];
const daysOf = (fs) => fs.map((f, i) => ({ key: KEYS7[i], f }));

// integrate day-by-day; invariants after EVERY day (any violation = the game is lying)
function runDays(world, days) {
  for (const d of days) {
    advanceWorld(world, d);
    const v = checkInvariants(world);
    if (v.length) throw new Error(`invariant @ ${d.key}: ${v.join("; ")}`);
  }
  return world;
}

const weeds = (w) => [...w.grid].filter((v) => v === TILE.weed).length;

// ---------------------------------------------------------------- gate 1 — direction law
test("gate1: worked-week → logs accumulate, prosperity up, tidy — never collapses (any seed)", () => {
  for (const seed of [1, 7, 42, 999]) {
    const w = runDays(createWorld(seed), daysOf([1, 1, 1, 1, 1, 1, 1]));
    assert.equal(logsOf(w), 7 * CHOP.logsPerTree, `seed ${seed}: logs`);
    assert.equal(derived(w).treesFelled, 7, `seed ${seed}: felled`);
    assert.equal(w.prosperity, PROSPERITY.init + 7 * RATES.busy, `seed ${seed}: prosperity`);
    assert.equal(w.trees.filter((t) => t.state !== "standing").length, 7, `seed ${seed}: stumps`);
    assert.equal(weeds(w), 0, `seed ${seed}: a worked week shows NO weeds (work tidies)`);
    assert.ok(w.days.every((d) => d.logsAdded >= 0), "logs never go negative");
  }
});

// ---------------------------------------------------------------- gate 2 — idle-week decay
test("gate2: idle-week → decay, ZERO logs, weeds — no miracle (any seed)", () => {
  for (const seed of [1, 7, 42, 999]) {
    const w = runDays(createWorld(seed), daysOf([1, 1, 1, 1, 1, 1, 1]));
    const logsBefore = logsOf(w);
    runDays(w, daysOf([0, 0, 0, 0, 0, 0, 0]));
    assert.equal(w.prosperity, PROSPERITY.init + 7 * RATES.busy + 7 * RATES.idle, `seed ${seed}: decay`);
    assert.equal(logsOf(w), logsBefore, `seed ${seed}: idle week adds ZERO logs`);
    assert.ok(w.days.slice(7).every((d) => d.logsAdded === 0), "no miracle growth while idle");
    assert.ok(weeds(w) > 0, `seed ${seed}: neglect shows as undergrowth`);
  }
});

// ---------------------------------------------------------------- gate 3 — heatmap exact trace
test("gate3: heatmap partial credit exact trace (Δ and logs, tick-exact style)", () => {
  const w = runDays(createWorld(42), daysOf([0.6, 1, 0.4, 0.2, 1, 0.5, 0.9]));
  const dEs = [0.0, 1.0, -0.5, -1.0, 1.0, -0.25, 0.75]; // busy·f − idle·(1−f), rounded
  assert.deepEqual(w.days.map((d) => d.Δ), dEs, "exact daily deltas");
  assert.equal(w.prosperity, PROSPERITY.init + dEs.reduce((a, b) => a + b, 0), "prosperity = init + ΣΔ");
  assert.equal(logsOf(w), 5 * CHOP.logsPerTree, "threshold 0.5 → exactly 5 chopped days → 15 logs");
});

// ---------------------------------------------------------------- gate 4 — reopen-gap integration
test("gate4: reopen-gap — integrate once, idempotent, unobserved flat, today never scored", () => {
  const gapA = resolveGap("2026-08-02", "2026-08-10"); // completed days 08-03..08-09
  assert.equal(gapA.length, 7);
  const gapB = resolveGap("2026-08-02", "2026-08-10");
  assert.deepEqual(gapA, gapB, "day-feed deterministic per window (seeded emulator)");

  const w1 = runDays(createWorld(42), gapA);
  const w2 = createWorld(42);
  runDays(w2, gapA);
  runDays(w2, []); // a second open with no new days
  assert.equal(w1.prosperity, w2.prosperity, "reopen twice ≡ once");
  assert.equal(logsOf(w1), logsOf(w2));
  assert.deepEqual(
    derived(w1).trees.map((t) => `${t.id}:${t.state}`),
    derived(w2).trees.map((t) => `${t.id}:${t.state}`),
    "tree states idempotent"
  );

  const w3 = createWorld(42);
  runDays(w3, [{ key: "2026-08-03", f: null }]);
  assert.equal(w3.prosperity, PROSPERITY.init, "unobserved day moves NOTHING (never punished as idle)");
  assert.equal(logsOf(w3), 0);
  assert.equal(w3.days[0].Δ, 0);

  assert.deepEqual(resolveGap("2026-08-09", "2026-08-10"), [], "today is never scored (gap stops at yesterday)");
  assert.equal(daysBetween(addDays("2026-01-01", 100), "2026-01-01"), 100, "day-key arithmetic pure");
  assert.equal(daysBetween("2027-01-01", "2026-01-01"), 365, "year-span ordinal math");
  assert.ok(MAX_GAP >= 30, "MAX_GAP cap present (main compacts older history, never catches up)");
});

// ---------------------------------------------------------------- gate 5 — seed-stability of dress
test("gate5: seeded dress — same seed+trace ≡ char-identical; different seed: same law, different which", () => {
  const mk = (seed) => derived(runDays(createWorld(seed), daysOf([1, 1, 1, 0, 1, 1, 1])));
  const a = mk(42);
  const b = mk(42);
  assert.deepEqual(a.days, b.days, "whole ledger char-identical for the same seed+trace");
  assert.deepEqual(
    a.trees.map((t) => `${t.id}:${t.state}`),
    b.trees.map((t) => `${t.id}:${t.state}`),
    "tree fate char-identical (which trees fell is dress, and it is stable)"
  );

  const c = mk(43);
  assert.equal(c.logs, a.logs, "different seed: SAME logs (the law)");
  assert.equal(c.prosperity, a.prosperity, "different seed: SAME prosperity (the law)");
  const felledA = a.trees.filter((t) => t.state !== "standing").map((t) => t.id).join(",");
  const felledC = c.trees.filter((t) => t.state !== "standing").map((t) => t.id).join(",");
  assert.notEqual(felledA, felledC, "different seed: different which-trees (dress varies, direction never)");
  assert.equal(a.logs, a.treesFelled * CHOP.logsPerTree, "pile ≡ 3 × stumps");
});

// ---------------------------------------------------------------- gate 6 — RNG never writes the direction
test("gate6: RNG never writes the direction — 50 seeds × 4 trajectories: identical prosperity/logs/tier", () => {
  const trajs = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0],
    [0.6, 1, 0.4, 0.2, 1, 0.5, 0.9],
    [1, 0.6, 1, 0.6, 1, 0.6, 1],
  ];
  for (const fs of trajs) {
    const days = daysOf(fs);
    const base = derived(runDays(createWorld(1), days));
    for (let s = 1; s <= 50; s++) {
      const d = derived(runDays(createWorld(s), days));
      assert.equal(d.prosperity, base.prosperity, `seed ${s}: prosperity`);
      assert.equal(d.logs, base.logs, `seed ${s}: logs`);
      assert.equal(d.tier, base.tier, `seed ${s}: tier`);
    }
  }
});

// ---------------------------------------------------------------- gate 7 — purity
test("gate7: purity — no Math.random / no Date in world.js + tables.js; same seed ⇒ same world", () => {
  for (const f of ["world.js", "tables.js"]) {
    const src = readFileSync(join(__dirname, "..", "src", f), "utf8");
    assert.ok(!/Math\.random\s*\(/.test(src), `${f} must not call Math.random`);
    assert.ok(!/new\s+Date\s*\(/.test(src), `${f} must not construct a Date`);
    assert.ok(!/Date\.now\s*\(/.test(src), `${f} must not read wall-clock directly`);
  }
  const src = readFileSync(join(__dirname, "..", "src", "feed.js"), "utf8");
  assert.ok(/mulberry32/.test(src), "feed keeps the seeded PRNG (the only RNG)");

  const w1 = derived(runDays(createWorld(42), daysOf([1, 0, 0.8, 1, 0.4, 1, 1])));
  const w2 = derived(runDays(createWorld(42), daysOf([1, 0, 0.8, 1, 0.4, 1, 1])));
  assert.deepEqual(w1, w2, "same seed + same days ⇒ byte-identical world");
});

// ---------------------------------------------------------------- gate 8 — referee honesty
test("gate8: referee honesty — every number traces to days[]; unobserved labeled, never a work-day", () => {
  const w = createWorld(42);
  runDays(w, [{ key: "2026-08-03", f: null }, { key: "2026-08-04", f: 1 }, { key: "2026-08-05", f: 0 }]);
  assert.deepEqual(weekStats(w), { days: 3, worked: 1, unobserved: 1 });
  assert.equal(todaySignal(null), "unobserved");
  assert.match(todaySignal(1), /^working/);
  assert.match(todaySignal(0), /^idle/);
  assert.equal(logsOf(w), w.days.reduce((s, d) => s + d.logsAdded, 0), "pile count recomputes from the ledger only");
  const fresh = createWorld(7);
  assert.equal(logsOf(fresh), 0);
  assert.equal(derived(fresh).tier, "strained"); // init 15 → tier strained (fresh world is unbuilt, not ruined)
  assert.equal(weekStats(fresh).days, 0);
});

// ---------------------------------------------------------------- gate 9 — the POC speed knob
test("gate9: POC speed knob — compress the CLOCK, never the RULES (pinned math)", () => {
  assert.equal(dayMsFor(TIMESCALE_REAL), 86400000, "1:1 real-date mode is one real day");
  assert.equal(dayMsFor(POC_TIMESCALE), 3000, "POC default FAST: a day every ~3s");
  assert.equal(dayMsFor(2), 43200000, "2x demo: a day every 12 hours");
  assert.ok(POC_TIMESCALE > TIMESCALE_REAL, "the POC defaults to fast, not 1:1");
});

// ---------------------------------------------------------------- summary
console.log(`\nworldbox gates: ${passed} passed${failed ? `, ${failed} FAILED` : ""} (${passed + failed} total)`);
if (failed > 0) {
  for (const { name, e } of failures) console.log(`  FAILED: ${name} — ${e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : e}`);
  process.exit(1);
}
