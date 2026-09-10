const MAX_FRAMES = 32;
const MAX_FACTS = 512;

function copyFact(fact) {
  return {
    ...fact,
    pose: fact.pose
      ? { ...fact.pose, position: { ...fact.pose.position } }
      : undefined,
  };
}
function copyFacts(facts) {
  return facts.map(copyFact);
}
function interpolate(a, b, amount) {
  if (!a.pose?.position || !b.pose?.position)
    return copyFact(amount < 0.5 ? a : b);
  return {
    ...copyFact(a),
    pose: {
      ...b.pose,
      position: {
        x: a.pose.position.x + (b.pose.position.x - a.pose.position.x) * amount,
        y: a.pose.position.y + (b.pose.position.y - a.pose.position.y) * amount,
        z: a.pose.position.z + (b.pose.position.z - a.pose.position.z) * amount,
      },
    },
  };
}

export function createInterpolationBuffer({ delayMs = 66 } = {}) {
  const frames = [];
  let epoch;
  let latestSequence = -1;
  let anchor;
  let paused = false;
  let awaitingAnchor = false;
  let frozen;
  function reset(nextEpoch) {
    frames.length = 0;
    epoch = nextEpoch;
    latestSequence = -1;
    anchor = undefined;
    awaitingAnchor = false;
    frozen = undefined;
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
    if (epoch === undefined) epoch = frame.epoch;
    if (frame.sequence <= latestSequence) return false;
    const discontinuity =
      latestSequence >= 0 && frame.sequence !== latestSequence + 1;
    latestSequence = frame.sequence;
    if (anchor === undefined && Number.isFinite(receivedAt)) {
      anchor = receivedAt - frame.time * 1000;
      awaitingAnchor = false;
    }
    frames.push({
      epoch: frame.epoch,
      sequence: frame.sequence,
      time: frame.time,
      discontinuity,
      facts: copyFacts(frame.facts),
    });
    if (frames.length > MAX_FRAMES) frames.shift();
    return true;
  }
  function render(
    now = performance.now(),
    { paused: nextPaused = paused } = {},
  ) {
    if (!frames.length) return [];
    if (nextPaused) {
      paused = true;
      frozen ??= copyFacts(frames.at(-1).facts);
      return copyFacts(frozen);
    }
    if (paused) {
      paused = false;
      anchor = undefined;
      awaitingAnchor = true;
      frozen = undefined;
    }
    const latest = frames.at(-1);
    if (awaitingAnchor) return copyFacts(latest.facts);
    anchor ??= now - latest.time * 1000;
    const target = (now - anchor - delayMs) / 1000;
    let before = frames[0],
      after = latest;
    for (let index = 1; index < frames.length; index++) {
      if (frames[index].time >= target) {
        after = frames[index];
        before = frames[index - 1];
        break;
      }
      before = frames[index];
    }
    if (
      after.discontinuity ||
      after.time <= before.time ||
      target >= latest.time
    )
      return copyFacts(before.facts);
    const amount = Math.max(
      0,
      Math.min(1, (target - before.time) / (after.time - before.time)),
    );
    const next = new Map(after.facts.map((fact) => [fact.id, fact]));
    return before.facts.map((fact) =>
      next.has(fact.id)
        ? interpolate(fact, next.get(fact.id), amount)
        : copyFact(fact),
    );
  }
  return { push, render, reset, size: () => frames.length };
}
