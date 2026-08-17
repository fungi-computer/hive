// ticker.js — the ONE honest clock: a fixed-step accumulator turning wall-clock
// deltas into deterministic sim steps, then deriving the game-date as a pure
// function of them. PURE: no Pixi, no DOM, no Math.random.
//
// "Fixed-step is not polish; durations are contracts." (Fern)
// On tab return we SNAP (zero the accumulator), never catch up: missed ticks are
// missed, and the referee prints the poll gap honestly.

import { STEP_MS, DAY_TICKS, phaseAt } from "./tables.js";

export const MAX_FRAME_DELTA_MS = 100; // clamp tab-throttle spikes

export function createTicker() {
  return { acc: 0, steps: 0, lastDeltaMs: 0 };
}

// Feed one frame-time in. Returns the number of sim steps that tick produced
// (0..n). The accumulator is the ONLY door wall-clock enters the sim through.
export function push(ticker, deltaMS) {
  const dt = Math.min(Math.max(deltaMS, 0), MAX_FRAME_DELTA_MS);
  ticker.lastDeltaMs = dt;
  ticker.acc += dt;
  let n = 0;
  while (ticker.acc >= STEP_MS) {
    ticker.acc -= STEP_MS;
    ticker.steps += 1; // steps never rewind
    n += 1;
  }
  return n;
}

// game-date is a pure function of accumulated steps — never stored, never tuned.
export function gameDate(steps) {
  const tod = steps % DAY_TICKS;
  return { day: Math.floor(steps / DAY_TICKS), tod, phase: phaseAt(tod) };
}
