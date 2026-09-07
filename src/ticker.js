// Adapted from Hive 14cfa809: the fixed-step accumulator remains the sole door
// from wall time to gameplay. The inn needs 50 ms movement steps, no calendar.
export const STEP_MS = 50;
export const MAX_FRAME_DELTA_MS = 100;
export function createTicker() {
  return { acc: 0, steps: 0, lastDeltaMs: 0 };
}
export function push(ticker, deltaMS) {
  const dt = Math.min(Math.max(deltaMS, 0), MAX_FRAME_DELTA_MS);
  ticker.lastDeltaMs = dt;
  ticker.acc += dt;
  let n = 0;
  while (ticker.acc >= STEP_MS) {
    ticker.acc -= STEP_MS;
    ticker.steps += 1;
    n += 1;
  }
  return n;
}
