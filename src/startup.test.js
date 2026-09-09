import test from "node:test";
import assert from "node:assert/strict";
import { createStartupReporter, renderStartup } from "./startup.js";

test("independent real startup promises expose the pending stage without inventing completion", async () => {
  let release;
  let clock = 10;
  const reporter = createStartupReporter(
    () => {},
    () => clock++,
  );
  const art = reporter.run(
    "art",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const optimizer = reporter.run("optimizer", () => "optimizer-result");
  assert.equal(await optimizer, "optimizer-result");
  reporter.progress("art", {
    detail: "rowan walk",
    completedTextures: 33,
    waitingFor: "animation-frame",
  });
  const state = reporter.snapshot();
  assert.equal(state.find((s) => s.id === "art").status, "running");
  assert.equal(state.find((s) => s.id === "art").completedTextures, 33);
  assert.equal(state.find((s) => s.id === "art").completedAt, null);
  assert.equal(state.find((s) => s.id === "optimizer").status, "complete");
  assert.equal(state.find((s) => s.id === "display").startedAt, null);
  state[0].status = "complete";
  assert.equal(reporter.snapshot()[0].status, "running");
  release("art-result");
  assert.equal(await art, "art-result");
  assert.equal(reporter.snapshot()[0].status, "complete");
});

test("startup preserves the original async or synchronous failure and does not complete a failed stage", async () => {
  for (const work of [
    () => {
      throw failure;
    },
    () => Promise.reject(failure),
  ]) {
    const reporter = createStartupReporter(() => {});
    await assert.rejects(
      reporter.run("art", work),
      (error) => error === failure,
    );
    const art = reporter.snapshot()[0];
    assert.equal(art.status, "failed");
    assert.equal(art.completedAt, null);
    assert.equal(art.detail, "draw failed");
  }
});
const failure = new Error("draw failed");

test("visible loading text is plain while DOM diagnostics retain bounded actual progress", () => {
  const small = { textContent: "" };
  const loading = { dataset: {}, querySelector: () => small };
  const reporter = createStartupReporter(
    (stages) => renderStartup(loading, stages),
    () => 0,
  );
  reporter.start("art");
  reporter.progress("art", {
    detail: "x".repeat(1000),
    completedTextures: 73,
    waitingFor: "animation-frame",
  });
  assert.equal(small.textContent, "Drawing the clearing");
  const stages = JSON.parse(loading.dataset.startup);
  assert.equal(stages[0].detail.length, 128);
  assert.equal(stages[0].completedTextures, 73);
  assert.equal(stages[0].waitingFor, "animation-frame");
  assert(loading.dataset.startup.length < 4096);
});
