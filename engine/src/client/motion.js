const EPSILON = 1e-6;

/**
 * Disposable presentation motion owner. Distances are measured in presented
 * local coordinates, so a moving support does not make its crew walk. A new
 * entity, support change, sequence gap, teleport, pause, or reset establishes
 * a baseline and emits no contact.
 */
export function createMotionCueOwner({ stride = 0.85, teleport = 2.5, wakeStride = 1.6 } = {}) {
  const history = new Map();
  if (!(stride > 0) || !(teleport > stride) || !(wakeStride > 0)) throw new Error("invalid motion cue distances");
  function reset() { history.clear(); }
  return {
    sample(subjects, { now = 0, paused = false, reset: clear = false, sequence } = {}) {
      if (clear || paused) { reset(); return []; }
      const live = new Set(subjects.map(subject => subject.id));
      for (const id of history.keys()) if (!live.has(id)) history.delete(id);
      const cues = [];
      for (const subject of subjects) {
        const local = subject.local?.position ?? subject.pose?.position ?? subject;
        const previous = history.get(subject.id);
        history.set(subject.id, { x: local.x, z: local.z, support: subject.support ?? null, sequence });
        if (!previous || previous.support !== (subject.support ?? null) ||
          (Number.isSafeInteger(sequence) && Number.isSafeInteger(previous.sequence) && sequence !== previous.sequence + 1)) continue;
        const dx = local.x - previous.x, dz = local.z - previous.z;
        const distance = Math.hypot(dx, dz);
        if (!(distance > EPSILON) || distance > teleport) continue;
        const steps = Math.min(4, Math.floor(distance / stride));
        for (let index = 0; index < steps; index++) cues.push({ kind: "foot", subject: subject.id, at: { x: local.x - dx * (steps - index - 1) / steps, y: local.y ?? 0, z: local.z - dz * (steps - index - 1) / steps }, direction: { x: dx / distance, y: 0, z: dz / distance }, time: now });
        if (subject.visual === "pirate.ship" && distance >= wakeStride) cues.push({ kind: "wake", subject: subject.id, at: { x: local.x, y: local.y ?? 0, z: local.z }, direction: { x: dx / distance, y: 0, z: dz / distance }, time: now });
      }
      return cues;
    },
    reset,
  };
}
