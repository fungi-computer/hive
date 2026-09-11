const EPSILON = 1e-6;
const MAX_CUES_PER_SAMPLE = 16;
function finite(value, name) { if (!Number.isFinite(value)) throw new Error(`${name} must be finite`); return value; }
function offsetWorld(position, offset = { x: 0, y: 0, z: 0 }) { return { x: position.x + (offset.x ?? 0), y: position.y + (offset.y ?? 0), z: position.z + (offset.z ?? 0) }; }
function rotateOffset(offset, facing = 0) {
  const angle = facing * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
  return { x: (offset?.x ?? 0) * c - (offset?.z ?? 0) * s, y: offset?.y ?? 0, z: (offset?.x ?? 0) * s + (offset?.z ?? 0) * c };
}

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
        if (motion && (!['foot','wake'].includes(motion.kind) || !Number.isFinite(motion.stride) || motion.stride<=0 ||
            (motion.localOffset && !['x','y','z'].every(key => Number.isFinite(motion.localOffset[key])))))
          throw new Error("invalid motion definition");
        const local = subject.local?.position ?? world, support = subject.support ?? null;
        const previous = history.get(subject.id);
        const discontinuity = previous && (previous.support !== support || subject.correction || Math.hypot(local.x - previous.x, local.z - previous.z) > teleport);
        const record = { x: local.x, z: local.z, world: { ...world }, support, residual: discontinuity ? 0 : previous?.residual ?? 0 };
        history.set(subject.id, record);
        if (!motion || !previous || discontinuity) continue;
        const dx = local.x - previous.x, dz = local.z - previous.z, distance = Math.hypot(dx, dz);
        if (!(distance > EPSILON)) continue;
        const angle = (subject.local ? (subject.facing ?? 0) - (subject.local.facing ?? 0) : 0) * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
        const worldDx = dx * c - dz * s, worldDz = dx * s + dz * c, worldDistance = Math.hypot(worldDx, worldDz);
        const direction = { x: worldDx / worldDistance, y: 0, z: worldDz / worldDistance };
        record.residual += distance;
        const stride = finite(motion.stride, "motion stride");
        if (stride <= 0) throw new Error("motion stride must be positive");
          while (record.residual >= stride && cues.length < maxCues) {
            record.residual -= stride;
            const travelled = Math.max(0, record.residual);
            const ratio = Math.min(1, (distance - travelled) / distance);
            const segmentWorld = { x: previous.world.x + (world.x - previous.world.x) * ratio, y: previous.world.y + (world.y - previous.world.y) * ratio, z: previous.world.z + (world.z - previous.world.z) * ratio };
            const fallback = { x: -stride, y: 0, z: 0 };
            const offset = rotateOffset(motion.localOffset ?? (motion.kind === "wake" ? fallback : undefined), subject.facing);
            cues.push({ kind: motion.kind, subject: subject.id, at: offsetWorld(segmentWorld, offset), direction, time: now });
          }
          if (record.residual >= stride) record.residual %= stride;
      }
      return cues;
    },
    reset,
  };
}
