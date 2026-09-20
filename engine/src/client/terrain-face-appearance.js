import { uprightImageGeometry } from "./asset-draw-geometry.js";
const spriteQuad = ({ x, y }, width = 64, height = 64) => [
  { x: x - width / 2, y: y - height / 2 },
  { x: x - width / 2, y: y + height / 2 },
  { x: x + width / 2, y: y + height / 2 },
  { x: x + width / 2, y: y - height / 2 },
];

const NORMALS = Object.freeze({ east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] });
function viewAxes([x, z], turn) {
  return [[x, z], [z, -x], [-x, -z], [-z, x]][turn];
}
export function terrainArtFace(face, turn) {
  if (face === "top") return face;
  const normal = NORMALS[face];
  if (!normal || !Number.isSafeInteger(turn) || turn < 0 || turn > 3)
    throw new Error("invalid terrain art view");
  const [x, z] = viewAxes(normal, turn);
  if (x === 1 && z === 0) return "east";
  if (x === 0 && z === 1) return "south";
  throw new Error("terrain face is not visible from the selected view");
}

export function terrainArtMask(mask, turn) {
  if (!Number.isSafeInteger(mask) || mask < 0 || mask > 15 ||
      !Number.isSafeInteger(turn) || turn < 0 || turn > 3)
    throw new Error("invalid terrain cover view");
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  let result = 0;
  corners.forEach((corner, index) => {
    if (!(mask & (1 << index))) return;
    const [x,z] = viewAxes(corner, turn);
    const target = corners.findIndex(([a,b]) => a === x && b === z);
    result |= 1 << target;
  });
  return result;
}

/** Selects checked baked frames. Geometry and ordering remain owned by the
 * terrain records; transparent atlas padding never becomes ordering geometry.
 */
export function createTerrainFaceAppearance({ pack, turn = 0 } = {}) {
  if (!pack?.body || !pack?.cover) throw new Error("terrain appearance requires a living terrain pack");
  function body({ cell, face, art, seed, projection, verticalMetres }) {
    if (!art) throw new Error(`terrain material ${cell.join(",")} has no art definition`);
    const root = projection.project({ x: cell[0], y: (cell[1] + 0.5) * verticalMetres, z: cell[2] });
    return { terrainBatch: pack.body({ art, face: terrainArtFace(face, turn), cell, seed }), projected: spriteQuad(root) };
  }
  function cover({ cover, mask, root, seed, projection, surfaceY }) {
    const at = projection.project({ x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 });
    const terrainBatch = pack.cover({ ...cover, mask: terrainArtMask(mask, turn), root, seed });
    const point = { x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 };
    return { terrainBatch, projected: spriteQuad(at),
      ...(terrainBatch.hitArea ? { orderGeometry: uprightImageGeometry(terrainBatch.hitArea, at, point, projection), supportY: surfaceY } : {}),
      ...(terrainBatch.hitArea ? { contains: point => terrainBatch.hitArea.contains(point.x - at.x, point.y - at.y) } : {}) };
  }
  return Object.freeze({ body, cover });
}
