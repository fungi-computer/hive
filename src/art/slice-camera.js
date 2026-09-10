import * as THREE from "three";

/** Extend only the view-depth interval. Orthographic x/y projection and the
 * original authoring camera remain unchanged, even for geometry behind it. */
export function sliceCamera(original, vertices) {
  const camera = original.clone();
  const forward = original.getWorldDirection(new THREE.Vector3());
  let nearest = Infinity,
    farthest = -Infinity;
  for (const { x, y, z } of vertices) {
    const point = new THREE.Vector3(x - 7, y, z - 7);
    const depth = point.sub(original.position).dot(forward);
    nearest = Math.min(nearest, depth);
    farthest = Math.max(farthest, depth);
  }
  if (!Number.isFinite(nearest) || !Number.isFinite(farthest))
    throw new Error("Slice camera requires finite geometry.");
  const clearance = 1;
  const retreat = Math.max(0, clearance - nearest);
  camera.position.addScaledVector(forward, -retreat);
  camera.near = Math.max(0.01, nearest + retreat - clearance);
  camera.far = farthest + retreat + clearance;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
