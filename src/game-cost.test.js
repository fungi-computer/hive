import test from "node:test";
import assert from "node:assert/strict";
import { createGameCost, GAME_COST_LIMITS } from "./game-cost.js";
const frame = (tick = 0, paused = false) => ({
  tick,
  paused,
  speed: 1,
  width: 1280,
  height: 900,
});

test("recorder observes real spans and raw submission stalls without advancing a clock", () => {
  let now = 0;
  const recorder = createGameCost(() => now);
  recorder.beginFrame(frame(10, true));
  assert.equal(recorder.read().phase, "armed");
  recorder.beginFrame(frame(10));
  const step = recorder.mark();
  now = 5;
  recorder.span("step", step, 10, 11);
  const hud = recorder.mark();
  now = 7;
  recorder.span("hud", hud, 11, 11);
  const view = recorder.mark();
  now = 10;
  recorder.span("view", view, 11, 11);
  now = 12;
  recorder.endMain(11);
  now = 15;
  recorder.submitted(11);
  const outside = recorder.mark();
  now = 18;
  recorder.span("hud", outside, 11, 11);
  now = 1000;
  recorder.beginFrame(frame(11));
  now = 1002;
  recorder.endMain(11);
  now = 1005;
  recorder.submitted(11);
  const result = recorder.read();
  assert.equal(result.advancedTicks, 1);
  assert.equal(result.stepCalls, 1);
  assert.equal(result.spans.stepSyncMs.totalMs, 5);
  assert.equal(result.spans.hudSyncMs.totalMs, 5);
  assert.equal(result.outsideFrameSpans, 1);
  assert.equal(result.unattributedMainSyncMs.totalMs, 4);
  assert.equal(result.renderSubmissionGapMs.maxMs, 990);
  assert.equal(result.gapsOverMs[50], 1);
  assert.equal(result.limits.numericBytes, 360448);
  assert.throws(() => {
    result.start.tick = 99;
  }, TypeError);
  assert.equal(recorder.read().start.tick, 10);
});

test("buffers stop at bounded frames and disclose span overflow", () => {
  let now = 0;
  const recorder = createGameCost(() => now);
  recorder.beginFrame(frame());
  for (let i = 0; i < GAME_COST_LIMITS.spans + 1; i++)
    recorder.span("hud", recorder.mark(), 0, 0);
  recorder.endMain(0);
  recorder.submitted(0);
  for (let i = 1; i < GAME_COST_LIMITS.frames; i++) {
    now++;
    recorder.beginFrame(frame(i));
    recorder.endMain(i);
    recorder.submitted(i);
  }
  const result = recorder.read();
  assert.equal(result.phase, "stopped");
  assert.equal(result.final.reason, "frame-limit");
  assert.equal(result.spanCount, GAME_COST_LIMITS.spans);
  assert.equal(result.overflow, 1);
  assert.equal(result.frameCount, GAME_COST_LIMITS.frames);
  recorder.beginFrame(frame(9999));
  assert.deepEqual(recorder.read(), result);
});

test("reset/hidden/disposal are terminal and startup records are detached", () => {
  for (const reason of ["reset", "hidden", "dispose"]) {
    let now = 0;
    const recorder = createGameCost(() => now++);
    const stages = [
      { id: "game", status: "complete", startedAt: 1, completedAt: 2 },
    ];
    recorder.startup(stages);
    stages[0].completedAt = 999;
    recorder.beginFrame(frame(7));
    now = 2;
    recorder.endMain(7);
    recorder.submitted(7);
    const submittedAt = now - 1;
    recorder.stop(reason);
    const result = recorder.read();
    now = 100;
    recorder.beginFrame(frame(20));
    recorder.stop("different");
    assert.deepEqual(recorder.read(), result);
    assert.equal(result.startup[0].completedAt, 2);
    assert.equal(result.final.lastTick, 7);
    assert.equal(result.final.terminalGapMs, result.final.atMs - submittedAt);
    assert.equal(result.final.terminalGapMs, 1);
  }
});

test("the terminal submission retains a stall across the wall-duration limit", () => {
  let now = 0;
  const recorder = createGameCost(() => now);
  recorder.beginFrame(frame());
  recorder.endMain(0);
  recorder.submitted(0);
  now = GAME_COST_LIMITS.durationMs + 1000;
  recorder.beginFrame(frame());
  recorder.endMain(0);
  recorder.submitted(0);
  assert.equal(recorder.read().final.reason, "duration-limit");
  assert.equal(recorder.read().renderSubmissionGapMs.maxMs, now);
});
