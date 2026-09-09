/** One display mapping for generated terrain, original site art and global air.
 * Terrain faces use local tile centers. Global voxel IDs map back to that same
 * horizontal center; their vertical coordinate remains the physical cell center.
 */
export function createRoomDisplayFrame(scene) {
  const centerX =
      (scene.terrain.bounds.min[0] + scene.terrain.bounds.max[0] - 1) / 2,
    centerZ =
      (scene.terrain.bounds.min[1] + scene.terrain.bounds.max[1] - 1) / 2,
    horizontalX = scene.metric[0],
    horizontalZ = scene.metric[2],
    vertical = scene.metric[1];
  const originX = centerX * horizontalX,
    originZ = centerZ * horizontalZ;
  return Object.freeze({
    surface({ x, y, z }) {
      return [x * horizontalX - originX, y, z * horizontalZ - originZ];
    },
    column({ x, height, z }) {
      return [x * horizontalX - originX, height, z * horizontalZ - originZ];
    },
    site({ x, z, level }) {
      return [
        x * horizontalX - originX,
        level * scene.frame.storeyVoxels * vertical,
        z * horizontalZ - originZ,
      ];
    },
    cell(at) {
      return [
        (at[0] - scene.frame.x) * horizontalX - originX,
        (at[1] - scene.frame.y + 0.5) * vertical,
        (at[2] - scene.frame.z) * horizontalZ - originZ,
      ];
    },
    zFace({ x, y, z }) {
      return [
        x * horizontalX - originX,
        y * vertical,
        (z - 0.5) * horizontalZ - originZ,
      ];
    },
  });
}
