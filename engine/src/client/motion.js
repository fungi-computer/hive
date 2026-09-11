const EPSILON = 1e-6;
const MAX_CUES_PER_SAMPLE = 16;
function finite(value, name) { if (!Number.isFinite(value)) throw new Error(`${name} must be finite`); return value; }
function offsetWorld(position, offset = { x: 0, y: 0, z: 0 }) { return { x: position.x + (offset.x ?? 0), y: position.y + (offset.y ?? 0), z: position.z + (offset.z ?? 0) }; }

/** Presented distance contacts. Without an explicit correction signal, jumps
 * above teleport are conservatively muted rather than presented as footsteps. */
export function createMotionCueOwner({ teleport = 2.5, maxCues = MAX_CUES_PER_SAMPLE } = {}) {
  const history = new Map();
  if (!(teleport > 0) || !Number.isSafeInteger(maxCues) || maxCues < 1) throw new Error("invalid motion cue limits");
  function reset() { history.clear(); }
  return {
    sample(subjects, { now = 0, paused = false, reset: clear = false } = {}) {
      if (clear || paused) { reset(); return []; }
      const live = new Set(subjects.map(subject => subject.id));
      for (const id of history.keys()) if (!live.has(id)) history.delete(id);
      const cues = [];
      for (const subject of subjects) {
        const motion = subject.motion, world = subject.pose?.position ?? subject;
        const local = subject.local?.position ?? world, support = subject.support ?? null;
        const previous = history.get(subject.id);
        const record = { x: local.x, z: local.z, support, residual: previous?.residual ?? 0 };
        history.set(subject.id, record);
        if (!motion || !previous || previous.support !== support || subject.correction) continue;
        const dx = local.x - previous.x, dz = local.z - previous.z, distance = Math.hypot(dx, dz);
        if (!(distance > EPSILON) || distance > teleport) continue;
        const direction = { x: dx / distance, y: 0, z: dz / distance };
        record.residual += distance;
        const stride = finite(motion.stride, "motion stride");
        if (stride <= 0) throw new Error("motion stride must be positive");
        while (record.residual >= stride && cues.length < maxCues) {
          record.residual -= stride;
          const offset = motion.kind === "wake" ? motion.localOffset ?? { x: -direction.x * stride, y: 0, z: -direction.z * stride } : motion.localOffset;
          cues.push({ kind: motion.kind, subject: subject.id, at: offsetWorld(world, offset), direction, time: now });
        }
      }
      return cues;
    },
    reset,
  };
}
