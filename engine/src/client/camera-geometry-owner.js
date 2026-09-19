import { camera as artCamera } from "../../../src/art/prop-camera.js";
import { createTerrainPicker } from "./geometry.js";
import { createOrderingProjection } from "./ordering-projection.js";

const SIGNS = Object.freeze([[1, 1], [-1, 1], [-1, -1], [1, -1]]);

/** One client's camera owns drawing projection and every inverse world hit. */
export function createCameraGeometryOwner() {
  let turn = 0, view, projection, picker;
  function install() {
    const camera = artCamera(640, 400, 1.03, 256);
    const [x, z] = SIGNS[turn];
    camera.position.x = Math.abs(camera.position.x) * x;
    camera.position.z = Math.abs(camera.position.z) * z;
    camera.lookAt(0, 1.03, 0);
    camera.updateMatrixWorld();
    view = camera;
    projection = createOrderingProjection(view);
    picker?.dispose();
    picker = createTerrainPicker(view);
  }
  install();
  function project(x, y, z) { return projection.project({ x, y, z }); }
  function planePoint(x, y, height) {
    const { origin, direction } = projection.ray({ x, y });
    const distance = (height - origin.y) / direction.y;
    return { x: origin.x + direction.x * distance, y: height, z: origin.z + direction.z * distance };
  }
  function groundPoint(x, y) {
    const point = planePoint(x, y, 0);
    return { x: Math.round(point.x), y: 0, z: Math.round(point.z) };
  }
  function terrainPlaneCell(x, y, level, verticalMetres) {
    if (!Number.isSafeInteger(level) || !(verticalMetres > 0))
      throw new Error("invalid terrain selection plane");
    const point = planePoint(x, y, (level + 0.5) * verticalMetres);
    return [Math.round(point.x), level, Math.round(point.z)];
  }
  function surfacePoint(x, y, fact) {
    const { pose, surface } = fact;
    if (!pose || !surface) return null;
    const world = planePoint(x, y, pose.position.y + surface.height);
    const angle = (pose.facing * Math.PI) / 2;
    const dx = world.x - pose.position.x, dz = world.z - pose.position.z;
    const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
    const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
    if (localX < surface.minX - 1e-8 || localX > surface.maxX + 1e-8 ||
        localZ < surface.minZ - 1e-8 || localZ > surface.maxZ + 1e-8) return null;
    return { x: Math.min(surface.maxX, Math.max(surface.minX, localX)), y: surface.height,
      z: Math.min(surface.maxZ, Math.max(surface.minZ, localZ)), frame: fact.id };
  }
  return Object.freeze({
    get turn() { return turn; },
    get projection() { return projection; },
    project, planePoint, groundPoint, terrainPlaneCell, surfacePoint,
    hit: (x, y, terrain, epoch) => picker.hit(x, y, terrain, epoch),
    point: (x, y, terrain, epoch) => picker.point(x, y, terrain, epoch),
    reset: () => picker.reset(),
    rotate(delta) {
      if (!Number.isSafeInteger(delta)) throw new Error("camera turn must be an integer");
      turn = ((turn + delta) % 4 + 4) % 4;
      install();
      return projection;
    },
    dispose() { picker.dispose(); },
  });
}
