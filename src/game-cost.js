/** Optional client observations. No simulation state, timer, or scheduling owner. */
export const GAME_COST_LIMITS = Object.freeze({
  spans: 4096,
  frames: 2048,
  durationMs: 30000,
  // Float64: seven span columns and eight frame columns, allocated once.
  numericBytes: (4096 * 7 + 2048 * 8) * Float64Array.BYTES_PER_ELEMENT,
});
const kinds = Object.freeze(["step", "hud", "view"]);
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
function distribution(values) {
  if (!values.length)
    return { count: 0, totalMs: 0, p50Ms: null, p95Ms: null, maxMs: null };
  const sorted = values.toSorted((a, b) => a - b);
  return {
    count: values.length,
    totalMs: values.reduce((sum, value) => sum + value, 0),
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
  };
}
export function createGameCost(now = () => performance.now()) {
  const spans = new Float64Array(GAME_COST_LIMITS.spans * 7);
  const frames = new Float64Array(GAME_COST_LIMITS.frames * 8);
  let observedAdvancedTicks = 0;
  let phase = "armed",
    startup = null,
    start = null,
    final = null;
  let spanCount = 0,
    frameCount = 0,
    overflow = 0,
    incompleteFrames = 0,
    current = null,
    priorSubmission = null,
    lastTick = null;
  function stop(reason) {
    if (phase === "stopped") return;
    final = {
      reason,
      atMs: now(),
      lastTick,
      terminalGapMs: priorSubmission === null ? null : now() - priorSubmission,
    };
    phase = "stopped";
    if (current) incompleteFrames++;
    current = null;
  }
  return Object.freeze({
    startup(stages) {
      if (startup === null)
        startup = stages
          .slice(0, 5)
          .map(({ id, status, startedAt, completedAt }) => ({
            id: String(id).slice(0, 32),
            status: String(status).slice(0, 16),
            startedAt,
            completedAt,
          }));
    },
    beginFrame({ tick, paused, speed, width, height }) {
      if (phase === "stopped" || (phase === "armed" && paused)) return;
      const at = now();
      if (phase === "armed") {
        start = { atMs: at, tick, speed, width, height };
        phase = "recording";
      }
      if (frameCount >= GAME_COST_LIMITS.frames) {
        stop("frame-limit");
        return;
      }
      if (current) {
        stop("incomplete-frame");
        return;
      }
      lastTick = tick;
      current = {
        at,
        tick,
        endTick: tick,
        speed,
        steps: 0,
        mainMs: 0,
        mainOpen: true,
      };
    },
    mark() {
      return phase === "recording" ? now() : null;
    },
    span(kind, at, beforeTick, afterTick, failed = false) {
      if (at === null || phase !== "recording") return;
      const id = kinds.indexOf(kind);
      if (id < 0) throw new Error("unknown game cost span");
      const elapsed = now() - at;
      if (kind === "step") {
        observedAdvancedTicks += afterTick - beforeTick;
        if (current?.mainOpen) current.steps++;
      }
      if (spanCount === GAME_COST_LIMITS.spans) {
        overflow++;
        return;
      }
      spans.set(
        [
          id,
          at - start.atMs,
          elapsed,
          current?.mainOpen ? frameCount : -1,
          beforeTick,
          afterTick,
          Number(failed),
        ],
        spanCount++ * 7,
      );
    },
    endMain(tick) {
      if (!current || phase !== "recording") return;
      current.mainMs = now() - current.at;
      current.endTick = tick;
      lastTick = tick;
      current.mainOpen = false;
    },
    submitted(tick) {
      if (!current || phase !== "recording") return;
      const at = now();
      lastTick = tick;
      frames.set(
        [
          current.at - start.atMs,
          current.mainMs,
          priorSubmission === null ? -1 : at - priorSubmission,
          current.tick,
          tick,
          current.steps,
          current.speed,
          at - start.atMs,
        ],
        frameCount++ * 8,
      );
      priorSubmission = at;
      current = null;
      if (at - start.atMs >= GAME_COST_LIMITS.durationMs)
        stop("duration-limit");
      else if (frameCount === GAME_COST_LIMITS.frames) stop("frame-limit");
    },
    stop,
    read() {
      const byKind = Object.fromEntries(kinds.map((kind) => [kind, []]));
      const frameSpans = new Float64Array(frameCount);
      let outsideFrameSpans = 0,
        failedSpans = 0,
        advancedTicks = 0;
      for (let i = 0; i < spanCount; i++) {
        const offset = i * 7,
          frame = spans[offset + 3];
        byKind[kinds[spans[offset]]].push(spans[offset + 2]);
        if (frame >= 0 && frame < frameCount)
          frameSpans[frame] += spans[offset + 2];
        else outsideFrameSpans++;
        failedSpans += spans[offset + 6];
        if (spans[offset] === 0)
          advancedTicks += spans[offset + 5] - spans[offset + 4];
      }
      const outsideHud = [];
      for (let i = 0; i < spanCount; i++) {
        const offset = i * 7;
        if (spans[offset] === 1 && spans[offset + 3] === -1)
          outsideHud.push(spans[offset + 2]);
      }
      const main = [],
        gaps = [],
        remainder = [];
      let stepCalls = 0,
        overlappingSpanExcessMs = 0;
      for (let i = 0; i < frameCount; i++) {
        const offset = i * 8;
        main.push(frames[offset + 1]);
        if (frames[offset + 2] >= 0) gaps.push(frames[offset + 2]);
        remainder.push(Math.max(0, frames[offset + 1] - frameSpans[i]));
        overlappingSpanExcessMs += Math.max(
          0,
          frameSpans[i] - frames[offset + 1],
        );
        stepCalls += frames[offset + 5];
      }
      const captureWallMs = frameCount ? frames[(frameCount - 1) * 8 + 7] : 0;
      return freeze({
        phase,
        start: start && { ...start },
        final: final && { ...final },
        startup: startup?.map((stage) => ({ ...stage })) ?? null,
        limits: { ...GAME_COST_LIMITS },
        spanCount,
        frameCount,
        overflow,
        failedSpans,
        outsideFrameSpans,
        incompleteFrames,
        overlappingSpanExcessMs,
        advancedTicks: observedAdvancedTicks,
        retainedAdvancedTicks: advancedTicks,
        stepCalls,
        captureWallMs,
        ticksPerWallSecond:
          captureWallMs && !current && !incompleteFrames
            ? (observedAdvancedTicks * 1000) / captureWallMs
            : null,
        spans: Object.fromEntries(
          kinds.map((kind) => [kind + "SyncMs", distribution(byKind[kind])]),
        ),
        outsideFrameHudSyncMs: distribution(outsideHud),
        mainSyncMs: distribution(main),
        unattributedMainSyncMs: distribution(remainder),
        renderSubmissionGapMs: distribution(gaps),
        gapsOverMs: Object.fromEntries(
          [16.67, 33.33, 50].map((limit) => [
            limit,
            gaps.filter((value) => value > limit).length,
          ]),
        ),
        semantics:
          "Synchronous elapsed spans and completed Pixi submission cadence; not OS CPU, GPU completion or presented frames. Remainder includes uninstrumented work; overflow makes attribution incomplete.",
      });
    },
  });
}
