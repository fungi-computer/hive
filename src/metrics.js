// metrics.js — a zero-dep REAL-TIME metrics sampler for the referee surface.
// NOT part of the pure sim (the sim never sees it and purity gates don't cover
// it): every number traces to measured frame time (performance.now), the
// fixed-step ticker, or sim rows handed in — nothing is invented, and the render
// FPS is kept visibly distinct from the sim's fixed-step date clock.
//
// The honesty law holds on this surface exactly as on the farm: a debug panel
// may show meters, but every meter must show its working.

const r1 = (x) => Math.round(x * 10) / 10;

export function createMetrics(windowMs = 1000) {
  const now = performance.now();
  return {
    windowMs,
    t0: now,
    last: now,
    frames: 0,
    win: { min: Infinity, max: 0, sum: 0, n: 0 }, // per-window frame-ms accumulators
    dtMs: 0, // last measured frame delta (real, not clamped)
    snap: null, // the last closed window's snapshot
  };
}

// Call once per rendered frame. hook = { steps } (a mutable object) lets the
// caller hand sim-step counts in; stepsPerSec is measured over the SAME window
// as the FPS, so the two rates sit next to each other without being conflated.
// Returns the current snapshot; a fresh snapshot object is produced each window.
export function sampleMetrics(m, hook = null) {
  const now = performance.now();
  const dt = now - m.last;
  m.last = now;
  m.dtMs = r1(dt);
  m.frames += 1;
  m.win.min = Math.min(m.win.min, dt);
  m.win.max = Math.max(m.win.max, dt);
  m.win.sum += dt;
  m.win.n += 1;

  if (now - m.t0 < m.windowMs) return m.snap; // window still open

  const span = now - m.t0;
  const snap = {
    fps: r1((m.frames * 1000) / span), // measured frames per second over the window
    frameMs: { min: r1(m.win.min), max: r1(m.win.max), avg: r1(m.win.sum / m.win.n) },
    frames: m.frames,
    spanMs: r1(span),
    dtMs: m.dtMs, // last frame's delta inside the closed window
    stepsPerSec: hook && hook.steps ? r1(hook.steps / (span / 1000)) : 0,
  };
  if (hook) hook.steps = 0;
  m.frames = 0;
  m.t0 = now;
  m.win = { min: Infinity, max: 0, sum: 0, n: 0 };
  m.snap = snap;
  return snap;
}
