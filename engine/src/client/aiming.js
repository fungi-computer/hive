import { groundPoint } from "./geometry.js";

const MAX_PREVIEW_BYTES = 16 * 1024;

function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function checkedPoint(point) {
  if (!point || typeof point !== "object") throw new Error("aim point required");
  return {
    x: finite(point.x, "aim point x"),
    y: finite(point.y ?? 0, "aim point y"),
    z: finite(point.z, "aim point z"),
  };
}

/** Convert a canvas point into the shared signed ground plane. */
export function aimGroundPoint(screen, camera, zoom = camera?.zoom ?? 1) {
  if (!screen || !camera || !Number.isFinite(zoom) || zoom <= 0)
    throw new Error("aimGroundPoint requires a camera and positive zoom");
  return groundPoint((screen.x - camera.x) / zoom, (screen.y - camera.y) / zoom);
}

/** Calculate the horizontal heading and preserve a bounded elevation setting. */
export function aimVelocity(origin, target, elevation = 0.12, speed = 8) {
  const from = checkedPoint(origin), to = checkedPoint(target);
  finite(elevation, "elevation");
  finite(speed, "speed");
  if (speed <= 0 || elevation < 0 || elevation > 1)
    throw new Error("invalid aim speed or elevation");
  const dx = to.x - from.x, dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) throw new Error("aim target is too close to launcher");
  const horizontal = speed * Math.cos(elevation);
  return {
    x: (dx / length) * horizontal,
    y: speed * Math.sin(elevation),
    z: (dz / length) * horizontal,
  };
}

/**
 * Keep preview work outside the render loop. The injected function is the
 * native deterministic projectile predictor; this helper only caches its JSON
 * input/output and never decides a hit or mutates the world.
 */
export function createPreviewCache({ preview, now = () => performance.now(), minInterval = 50 } = {}) {
  if (typeof preview !== "function") throw new Error("preview_projectile function required");
  if (!Number.isFinite(minInterval) || minInterval < 0) throw new Error("invalid preview interval");
  let key, result, lastAt = -Infinity;
  return {
    get(input) {
      const serialized = JSON.stringify(input);
      if (serialized.length > MAX_PREVIEW_BYTES) throw new Error("aim preview input too large");
      const stamp = now();
      if (serialized === key && result !== undefined) return result;
      if (stamp - lastAt < minInterval && result !== undefined) return result;
      const next = preview(serialized);
      if (typeof next === "string") {
        if (next.length > MAX_PREVIEW_BYTES) throw new Error("aim preview result too large");
        result = JSON.parse(next);
      } else result = next;
      key = serialized;
      lastAt = stamp;
      return result;
    },
    clear() { key = undefined; result = undefined; lastAt = -Infinity; },
  };
}

/** Fire input is deliberately the same velocity used for the preview. */
export function fireInput({ launcherId, command = "fire", origin, target, elevation, speed }) {
  if (typeof launcherId !== "string" || launcherId.length === 0) throw new Error("launcherId required");
  const velocity = aimVelocity(origin, target, elevation, speed);
  return { launcherId, command, velocity };
}
