const MAX_FRAMES = 32;
const MAX_FACTS = 512;
const DEFAULT_LOCAL_DELAY_MS = 66;
const DEFAULT_ONLINE_SAMPLE_MS = 100;

function copyPoint(point) {
  return point ? { x: point.x, y: point.y, z: point.z } : point;
}
function copyFact(fact) {
  return {
    ...fact,
    pose: fact.pose
      ? { ...fact.pose, position: copyPoint(fact.pose.position) }
      : undefined,
    local: fact.local
      ? { ...fact.local, position: copyPoint(fact.local.position) }
      : undefined,
    surface: fact.surface ? { ...fact.surface } : fact.surface,
  };
}
function copyFacts(facts) {
  return facts.map(copyFact);
}
function interpolatePose(a, b, amount) {
  if (!a?.position || !b?.position) return amount < 0.5 ? a : b;
  let turn = (b.facing - a.facing) % 4;
  if (turn > 2) turn -= 4;
  if (turn < -2) turn += 4;
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * amount,
      y: a.position.y + (b.position.y - a.position.y) * amount,
      z: a.position.z + (b.position.z - a.position.z) * amount,
    },
    facing: a.facing + turn * amount,
  };
}
function interpolateFact(a, b, amount) {
  if (!a || !b) return copyFact(a ?? b);
  if ((a.support ?? null) !== (b.support ?? null))
    return copyFact(amount < 0.5 ? a : b);
  const next = copyFact(a);
  next.pose = interpolatePose(a.pose, b.pose, amount);
  if (a.local || b.local)
    next.local = {
      ...(amount < 0.5 ? a.local : b.local),
      ...interpolatePose(a.local, b.local, amount),
    };
  next.support = amount < 0.5 ? a.support : b.support;
  return next;
}
function composeSupported(
  fact,
  facts,
  cache = new Map(),
  visiting = new Set(),
) {
  if (!fact?.support || !fact.local?.position) return copyFact(fact);
  if (cache.has(fact.id)) return cache.get(fact.id);
  if (visiting.has(fact.id)) return copyFact(fact);
  visiting.add(fact.id);
  const parent = facts.get(fact.support);
  const composedParent = parent
    ? composeSupported(parent, facts, cache, visiting)
    : undefined;
  const result = copyFact(fact);
  if (composedParent?.pose?.position) {
    const angle = ((composedParent.pose.facing ?? 0) * Math.PI) / 2;
    const { x, y, z } = fact.local.position;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    result.pose = {
      ...result.pose,
      position: {
        x: composedParent.pose.position.x + cos * x - sin * z,
        y: composedParent.pose.position.y + y,
        z: composedParent.pose.position.z + sin * x + cos * z,
      },
      facing: (composedParent.pose.facing ?? 0) + (fact.local.facing ?? 0),
    };
  }
  visiting.delete(fact.id);
  cache.set(fact.id, result);
  return result;
}
function composeFacts(facts) {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const cache = new Map();
  return facts.map((fact) => composeSupported(fact, byId, cache));
}

/**
 * Server-time snapshot interpolation. Online playback buffers two 100ms
 * publications by default; local Worker playback retains its 66ms delay.
 * The buffer never extrapolates and reanchors only after a committed sample.
 */
export function createInterpolationBuffer({
  cadence = "local",
  sampleIntervalMs = DEFAULT_ONLINE_SAMPLE_MS,
  delayMs = cadence === "online"
    ? sampleIntervalMs * 2
    : DEFAULT_LOCAL_DELAY_MS,
} = {}) {
  if (cadence !== "local" && cadence !== "online")
    throw new Error("unknown interpolation cadence");
  if (
    !Number.isFinite(sampleIntervalMs) ||
    sampleIntervalMs < 25 ||
    sampleIntervalMs > 1000
  )
    throw new Error("invalid interpolation sample interval");
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 2000)
    throw new Error("invalid interpolation delay");
  const frames = [];
  let epoch;
  let latestSequence = -1;
  let latestTime = -1;
  let anchor;
  let paused = false;
  let awaitingAnchor = false;
  let starved = false;
  let frozen;
  let displayed = [];
  let displayedTime = -Infinity;
  function reset(nextEpoch) {
    frames.length = 0;
    epoch = nextEpoch;
    latestSequence = -1;
    latestTime = -1;
    anchor = undefined;
    paused = false;
    awaitingAnchor = false;
    starved = false;
    frozen = undefined;
    displayed = [];
    displayedTime = -Infinity;
  }
  function push(frame, receivedAt = performance.now()) {
    if (
      !Number.isInteger(frame.sequence) ||
      !Number.isFinite(frame.time) ||
      frame.time < 0 ||
      !Array.isArray(frame.facts) ||
      frame.facts.length > MAX_FACTS
    )
      return false;
    if (epoch !== undefined && frame.epoch !== epoch) return false;
    if (frame.time < latestTime || frame.sequence <= latestSequence)
      return false;
    if (epoch === undefined) epoch = frame.epoch;
    latestSequence = frame.sequence;
    latestTime = frame.time;
    frames.push({
      epoch: frame.epoch,
      sequence: frame.sequence,
      time: frame.time,
      facts: copyFacts(frame.facts),
    });
    if (frames.length > MAX_FRAMES) frames.shift();
    if (
      !paused &&
      Number.isFinite(receivedAt) &&
      (anchor === undefined || starved || awaitingAnchor)
    ) {
      // `anchor` maps the server clock onto the local receipt clock.  Keep
      // presentation delay in render(), otherwise it would cancel itself
      // when a new sample reanchors the timeline.
      anchor = receivedAt - frame.time * 1000;
      awaitingAnchor = false;
      starved = false;
      frozen = undefined;
    } else if (paused) awaitingAnchor = true;
    return true;
  }
  function publish(facts) {
    displayed = composeFacts(copyFacts(facts));
    return copyFacts(displayed);
  }
  function render(
    now = performance.now(),
    { paused: nextPaused = paused } = {},
  ) {
    if (!frames.length) return [];
    const latest = frames.at(-1);
    if (nextPaused) {
      if (!paused) {
        paused = true;
        frozen = copyFacts(displayed.length ? displayed : latest.facts);
      }
      return copyFacts(frozen ?? latest.facts);
    }
    if (paused) {
      paused = false;
      anchor = undefined;
      awaitingAnchor = true;
    }
    if (awaitingAnchor) return copyFacts(frozen ?? displayed ?? latest.facts);
    anchor ??= now - latest.time * 1000;
    const target = Math.min(
      latest.time,
      Math.max(displayedTime, (now - anchor - delayMs) / 1000),
    );
    displayedTime = target;
    if (target >= latest.time) {
      starved = true;
      return publish(latest.facts);
    }
    const first = frames[0];
    if (target <= first.time) return publish(first.facts);
    let before = first,
      after = latest;
    for (let index = 1; index < frames.length; index++) {
      if (frames[index].time >= target) {
        after = frames[index];
        before = frames[index - 1];
        break;
      }
      before = frames[index];
    }
    if (after.time === target || after.time <= before.time)
      return publish(after.facts);
    const amount = Math.max(
      0,
      Math.min(1, (target - before.time) / (after.time - before.time)),
    );
    const afterById = new Map(after.facts.map((fact) => [fact.id, fact]));
    const sampled = before.facts
      .filter((fact) => afterById.has(fact.id))
      .map((fact) => interpolateFact(fact, afterById.get(fact.id), amount));
    return publish(sampled);
  }
  return { push, render, reset, size: () => frames.length, cadence, delayMs };
}
