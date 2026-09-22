const EPSILON = 1e-6;
const FRAME_MS = 125;

function directionFromVector(dx, dz, facing = 0) {
  if (Math.abs(dx) <= EPSILON && Math.abs(dz) <= EPSILON)
    // Original figures face +z at atlas direction zero; physics heading zero is -z.
    return Number.isFinite(facing) ? (((2 - Math.round(facing)) % 4) + 4) % 4 : 2;
  return ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
}

/** Samples a candidate frame without advancing the published animation history.
 * A caller may sample one subject per work unit, then publish or cancel the frame.
 * The synchronous sample API drives this same transaction. */
export function createAnimationClock({ frameMs = FRAME_MS } = {}) {
  let history = new Map(), states = new Map(), phase = 0, lastNow, pending;

  function prepare({ now = 0, paused = false, reset = false, sequence } = {}) {
    pending?.cancel();
    let oldHistory = reset ? new Map() : history;
    let oldStates = reset ? new Map() : states;
    let nextHistory = new Map(), nextStates = new Map();
    const sampledIds = new Set();
    let nextPhase = reset ? 0 : phase;
    let nextNow = reset || paused ? undefined : lastNow;
    if (!paused && Number.isFinite(now)) {
      nextPhase += nextNow === undefined ? 0 : Math.max(0, now - nextNow);
      nextNow = now;
    }
    let status = "preparing";
    const task = Object.freeze({
      sample(subject) {
        if (status !== "preparing") throw new Error(`animation frame is ${status}`);
        if (sampledIds.has(subject.id)) throw new Error(`duplicate animation subject ${subject.id}`);
        sampledIds.add(subject.id);
        const previous = oldHistory.get(subject.id), prior = oldStates.get(subject.id);
        if (paused) {
          const state = prior ?? Object.freeze({ id: subject.id, walking: false,
            direction: directionFromVector(0, 0, subject.facing), frame: 0 });
          if (previous) nextHistory.set(subject.id, previous);
          if (prior) nextStates.set(subject.id, prior);
          return state;
        }
        const local = subject.local?.position ?? subject;
        const sameSupport = previous?.support === subject.support;
        const localDx = previous && sameSupport ? local.x - previous.x : 0;
        const localDz = previous && sameSupport ? local.z - previous.z : 0;
        const rotation = subject.local ? (subject.facing - subject.local.facing) * Math.PI / 2 : 0;
        const dx = Math.cos(rotation) * localDx - Math.sin(rotation) * localDz;
        const dz = Math.sin(rotation) * localDx + Math.cos(rotation) * localDz;
        const moved = Boolean(previous && (Math.abs(dx) > EPSILON || Math.abs(dz) > EPSILON));
        const facingChanged = previous && Math.abs((subject.facing ?? 0) - previous.facing) > EPSILON;
        const lastMotion = moved ? now : previous?.lastMotion;
        const walking = moved || Boolean(sameSupport && prior?.walking && lastMotion !== undefined && now - lastMotion < 120);
        let direction = moved ? directionFromVector(dx, dz, subject.facing)
          : sameSupport && prior && !facingChanged ? prior.direction
          : directionFromVector(0, 0, subject.facing);
        if (subject.activity) {
          const [targetX, targetZ] = subject.activity.target;
          const workDx = targetX - subject.x, workDz = targetZ - subject.z;
          if (Math.abs(workDx) > EPSILON || Math.abs(workDz) > EPSILON)
            direction = directionFromVector(workDx, workDz, subject.facing);
        }
        const state = Object.freeze({ id: subject.id, walking, direction,
          frame: Math.floor(nextPhase / (walking || subject.activity ? frameMs : frameMs * 4)) });
        nextHistory.set(subject.id, { x: local.x, y: local.y, z: local.z, support: subject.support,
          sequence, facing: subject.facing ?? 0, lastMotion });
        nextStates.set(subject.id, state);
        return state;
      },
      publish() {
        if (status === "published") return;
        if (status !== "preparing") throw new Error(`animation frame is ${status}`);
        history = nextHistory; states = nextStates; phase = nextPhase; lastNow = nextNow;
        status = "published"; pending = undefined;
        oldHistory = oldStates = nextHistory = nextStates = undefined;
        sampledIds.clear();
      },
      cancel() {
        if (status !== "preparing") return;
        status = "cancelled";
        oldHistory = oldStates = nextHistory = nextStates = undefined;
        sampledIds.clear();
        if (pending === task) pending = undefined;
      },
    });
    pending = task;
    return task;
  }

  return Object.freeze({
    prepare,
    sample(subjects, options) {
      const task = prepare(options);
      try {
        const sampled = subjects.map(subject => task.sample(subject));
        task.publish();
        return sampled;
      } catch (error) { task.cancel(); throw error; }
    },
    reset() {
      pending?.cancel();
      history = new Map(); states = new Map(); phase = 0; lastNow = undefined;
    },
  });
}

export function animationFrames(figure, direction, walking) {
  if (!figure) return [];
  const idle = figure.idle?.[direction] ?? figure.idle?.[0] ?? [];
  const walk = figure.walk?.[direction] ?? figure.walk?.[0] ?? [];
  return walking && walk.length ? walk : idle;
}

/** Content chooses pose names; this owner resolves work, custody and locomotion. */
export function figureFrame(figure, binding, subject, animation) {
  const direction = animation?.direction ?? 0;
  const delivery = subject.activity?.kind === "delivery" ? subject.activity : null;
  const deliveryPose = delivery && delivery.phase === "pickup"
    ? binding.deliveryPoses?.pickup
    : delivery && delivery.phase === "putting-down"
    ? binding.deliveryPoses?.["putting-down"]
    : null;
  const deliveryFrames = deliveryPose && figure?.[deliveryPose]?.[direction];
  const workPose = subject.activity && binding.workPoses?.[subject.activity.kind];
  const work = workPose && figure?.[workPose]?.[direction];
  const held = subject.inventory?.items.find(item => item.quantity > 0 && binding.carryPoses?.[item.kind]);
  const carryPose = held && carryPoseFor(binding.carryPoses[held.kind], held);
  const carry = carryPose && figure?.[carryPose]?.[direction];
  const deliveryPoseDefinition = delivery && delivery.phase !== "pickup" && delivery.phase !== "putting-down"
    ? binding.carryPoses?.[delivery.material] : null;
  const deliveryCarryPose = typeof deliveryPoseDefinition === "string" ? deliveryPoseDefinition : null;
  const deliveryCarry = deliveryCarryPose && figure?.[deliveryCarryPose]?.[direction];
  const frames = work || deliveryFrames || deliveryCarry || carry || animationFrames(figure, direction, animation?.walking ?? false);
  const frame = (!work && (deliveryFrames || deliveryCarry || carry) && !animation?.walking) ? 0 : animation?.frame ?? 0;
  return frames[frame % Math.max(1, frames.length)];
}

function carryPoseFor(definition, item) {
  if (typeof definition === "string") return definition;
  if (!definition || !item.container) return null;
  const kind = definition.contentKind ?? definition.contentsKind;
  const quantity = item.container.contents.items
    .filter(entry => kind === undefined || entry.kind === kind)
    .reduce((total, entry) => total + entry.quantity, 0);
  if (quantity <= 0) return definition.empty;
  if (quantity >= item.container.capacity) return definition.full;
  return definition.partial ?? definition.half ?? definition.empty;
}
