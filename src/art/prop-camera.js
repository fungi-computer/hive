// Shared art camera. Pure geometry: usable by the game bake and asset tools.
import * as THREE from "three";

const PIXELS_PER_UNIT = 16 * Math.SQRT2;

export function camera(width, height, targetY = 1.03, depth = 80) {
  const c = new THREE.OrthographicCamera(
    -width / PIXELS_PER_UNIT / 2,
    width / PIXELS_PER_UNIT / 2,
    height / PIXELS_PER_UNIT / 2,
    -height / PIXELS_PER_UNIT / 2,
    0.1,
    depth,
  );
  c.position.set(12, Math.sqrt(288) * Math.tan(Math.PI / 6) + targetY, 12);
  c.lookAt(0, targetY, 0);
  if (!Number.isFinite(depth) || depth < 80) throw new Error("invalid art camera depth");
  // Moving an orthographic camera along its view direction preserves pixel scale.
  // Larger world bakes need the camera outside the map, not inside its front half.
  if (depth > 80) {
    const direction = c.getWorldDirection(new THREE.Vector3());
    c.position.addScaledVector(direction, -(depth - 80) / 2);
  }
  c.updateMatrixWorld();
  return c;
}
