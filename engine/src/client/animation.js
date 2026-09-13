const EPSILON = 1e-6;
const FRAME_MS = 125;

function directionFromVector(dx, dz, facing = 0) {
  if (Math.abs(dx) <= EPSILON && Math.abs(dz) <= EPSILON)
    // Original figures face +z at atlas direction zero; physics heading zero is -z.
    return Number.isFinite(facing) ? (((2 - Math.round(facing)) % 4) + 4) % 4 : 2;
  return ((Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) % 4) + 4) % 4;
}

export function createAnimationClock({ frameMs = FRAME_MS } = {}) {
  const history = new Map();
  const states = new Map();
  let phase = 0;
  let lastNow;
  return {
    sample(subjects, { now = 0, paused = false, reset = false, sequence } = {}) {
      if (reset) {
        history.clear();
        states.clear();
        phase = 0;
        lastNow = undefined;
      }
      if (paused) lastNow = undefined;
      if (!paused && Number.isFinite(now)) {
        phase += lastNow === undefined ? 0 : Math.max(0, now - lastNow);
        lastNow = now;
      }
      const live = new Set(subjects.map((subject) => subject.id));
      for (const id of history.keys()) if (!live.has(id)) history.delete(id);
      for (const id of states.keys()) if (!live.has(id)) states.delete(id);
      const sampled = [];
      for (const subject of subjects) {
        if (paused) {
          sampled.push(
            states.get(subject.id) ?? {
              id: subject.id,
              walking: false,
              direction: directionFromVector(0, 0, subject.facing),
              frame: 0,
            },
          );
          continue;
        }
        const previous = history.get(subject.id);
        const local = subject.local?.position ?? subject;
        const sameSupport = previous?.support === subject.support;
        const localDx = previous && sameSupport ? local.x - previous.x : 0;
        const localDz = previous && sameSupport ? local.z - previous.z : 0;
        const rotation = subject.local ? (subject.facing - subject.local.facing) * Math.PI / 2 : 0;
        const dx = Math.cos(rotation) * localDx - Math.sin(rotation) * localDz;
        const dz = Math.sin(rotation) * localDx + Math.cos(rotation) * localDz;
        const moved = Boolean(
          previous && (Math.abs(dx) > EPSILON || Math.abs(dz) > EPSILON),
        );
        const prior = states.get(subject.id);
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
        const state = {
          id: subject.id, walking, direction,
          frame: Math.floor(phase / (walking || subject.activity ? frameMs : frameMs * 4)),
        };
        sampled.push(state);
        history.set(subject.id, { x: local.x, y: local.y, z: local.z, support: subject.support, sequence, facing: subject.facing ?? 0, lastMotion });
        states.set(subject.id, state);
      }
      return sampled;
    },
    reset() {
      history.clear();
      states.clear();
      phase = 0;
      lastNow = undefined;
    },
  };
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
