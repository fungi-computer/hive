import { Vector3 } from "three";
import { camera as artCamera } from "../../../src/art/prop-camera.js";

/** One orthographic camera supplies both raster positions and ordering rays. */
export function createOrderingProjection(camera = artCamera(640, 400, 1.03, 256), width = 640, height = 400, transform = { x: 0, y: 0, scale: 1 }) {
  if (!camera.isOrthographicCamera || !(width > 0 && height > 0 && transform.scale > 0))
    throw new Error("ordering requires an orthographic camera and positive viewport scale");
  camera.updateMatrixWorld();
  // Own a snapshot: callers replace this projection on rotation/zoom, so cached
  // relations cannot silently change underneath their geometry signatures.
  const view = camera.clone();
  const { x: offsetX, y: offsetY, scale } = transform;
  const direction = view.getWorldDirection(new Vector3());
  return Object.freeze({
    direction: Object.freeze({ x: direction.x, y: direction.y, z: direction.z }),
    project({ x, y, z }) {
      const p = new Vector3(x, y, z).project(view);
      return { x: ((p.x + 1) * width / 2) * scale + offsetX, y: ((1 - p.y) * height / 2) * scale + offsetY };
    },
    ray({ x, y }) {
      const origin = new Vector3(((x - offsetX) / scale / width) * 2 - 1, 1 - ((y - offsetY) / scale / height) * 2, -1).unproject(view);
      return { origin, direction };
    },
  });
}
