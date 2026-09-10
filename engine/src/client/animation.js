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
        const repeated = sequence !== undefined && previous?.sequence === sequence;
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
        const direction = directionFromVector(dx, dz, subject.facing);
        const state = {
          id: subject.id,
          walking: repeated ? states.get(subject.id)?.walking ?? false : moved,
          direction: repeated ? states.get(subject.id)?.direction ?? direction : direction,
          frame: (repeated ? states.get(subject.id)?.walking : moved)
            ? Math.floor(phase / frameMs)
            : Math.floor(phase / (frameMs * 4)),
        };
        sampled.push(state);
        history.set(subject.id, { x: local.x, y: local.y, z: local.z, support: subject.support, sequence });
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
