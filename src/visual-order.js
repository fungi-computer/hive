import { footprint } from "./construction.js";
import { TERRAIN_FRAME, TERRAIN_VOXEL_METRIC } from "./terrain.ts";
const storeyM = TERRAIN_FRAME.storeyVoxels * TERRAIN_VOXEL_METRIC.verticalM;
export function visualDepth(at, offset = 0) {
  return at.x + at.z + (at.level ?? 0) * 0.35 + offset;
}
export function structureDepth(site) {
  return visualDepth(site, site.type === "roof" ? 0.6 : 0.15);
}
function covers(site, surface) {
  return footprint(site).some(
    (cell) => cell.x === surface.x && cell.z === surface.z,
  );
}
function supportingTop(site, surface) {
  return (
    site.finishedAt !== null &&
    ["floor", "roof"].includes(site.type) &&
    covers(site, surface) &&
    surface.height >= site.level * storeyM &&
    surface.height <= site.level * storeyM + TERRAIN_VOXEL_METRIC.verticalM
  );
}
/** A surface stays just above its actual support, without moving whole furniture
 * sprites or changing the existing actor/structure order. */
export function waterDepth(surface, sites) {
  let depth = visualDepth(
    { ...surface, level: surface.height / storeyM },
    0.16,
  );
  for (const site of sites)
    if (supportingTop(site, surface))
      depth = Math.max(depth, structureDepth(site) + 0.01);
  return depth;
}
/** Only a covering structure whose authored anchor sorts behind this water needs
 * an explicit silhouette cutout. Foreground sprites already occlude in Pixi. */
export function waterBehindStructure(surface, depth, site) {
  if (
    supportingTop(site, surface) ||
    site.type === "floor" ||
    site.type === "roof"
  )
    return false;
  const base = site.level * storeyM;
  return (
    covers(site, surface) &&
    surface.height >= base &&
    surface.height < base + storeyM &&
    structureDepth(site) <= depth
  );
}
