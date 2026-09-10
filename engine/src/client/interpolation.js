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
      anchor = receivedAt - frame.time * 1000;
      awaitingAnchor = false;
      starved = false;
      frozen = undefined;
    } else if (paused) {
      awaitingAnchor = true;
    }
    return true;
  }

  function publish(facts) {
    displayed = copyFacts(facts);
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
    const target = Math.min(latest.time, Math.max(displayedTime, (now - anchor - delayMs) / 1000));
    displayedTime = target;
    const first = frames[0];
    if (target <= first.time) return publish(first.facts);
    if (target >= latest.time) {
      starved = true;
      anchor = now - latest.time * 1000 - delayMs;
      return publish(latest.facts);
    }

    let before = first;
    let after = latest;
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
    const next = new Map(after.facts.map((fact) => [fact.id, fact]));
    return publish(
      before.facts.map((fact) =>
        next.has(fact.id)
          ? interpolate(fact, next.get(fact.id), amount)
          : copyFact(fact),
      ),
    );
  }

  return { push, render, reset, size: () => frames.length };
}
