import { box, scene } from "./geometry.js";
import { EDGE_WALL_FAMILY, edgeWallPlacement, validateEdgeWallPlacement } from "./edge-wall-contract.js";
import { edgeWallGeometry } from "./edge-wall-geometry.js";

export function edgeWall(placement) {
  const resolved = validateEdgeWallPlacement(placement);
  const s = scene();
  for (const primitive of edgeWallGeometry(resolved).boxes)
    box(s, primitive.color, primitive.x, primitive.y, primitive.z, primitive.w, primitive.h, primitive.d);
  s.userData.edgeWallPlacement = resolved;
  return s;
}

export { edgeWallPlacement };
