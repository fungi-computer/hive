// Shared art camera. Pure geometry: usable by the game bake and asset tools.
import * as THREE from "three";

const PIXELS_PER_UNIT = 16 * Math.SQRT2;

export function camera(width, height, targetY = 1.03) {
  const c = new THREE.OrthographicCamera(
    -width / PIXELS_PER_UNIT / 2,
    width / PIXELS_PER_UNIT / 2,
    height / PIXELS_PER_UNIT / 2,
    -height / PIXELS_PER_UNIT / 2,
    0.1,
    80,
  );
  c.position.set(12, Math.sqrt(288) * Math.tan(Math.PI / 6) + targetY, 12);
  c.lookAt(0, targetY, 0);
  c.updateMatrixWorld();
  return c;
}
