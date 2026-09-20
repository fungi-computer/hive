import { uprightImageGeometry } from "./asset-draw-geometry.js";
// Checked pack styles are immutable. Retain the crop with its source style so
// camera rebuilds preserve batch identity without retaining historical worlds.
const opaqueStyles = new WeakMap();
function opaquePicture(style, at) {
  let crop = opaqueStyles.get(style);
  if (!crop) {
    const silhouette = style.hitArea?.silhouette;
    let left = 0, top = 0, right = 64, bottom = 64, width = 64, height = 64;
    let empty = false;
    if (silhouette) {
      ({ width, height } = silhouette);
      left = width; top = height; right = bottom = 0;
      for (let y = 0; y < height; y++) {
        for (let pair = silhouette.rows[y]; pair < silhouette.rows[y + 1]; pair++) {
          left = Math.min(left, silhouette.spans[pair * 2]);
          right = Math.max(right, silhouette.spans[pair * 2 + 1] + 1);
          top = Math.min(top, y); bottom = y + 1;
        }
      }
      empty = right <= left || bottom <= top;
      if (empty) left = top = right = bottom = 0;
    }
    const anchor = style.hitArea?.anchor ?? { x: .5, y: .5 };
    const pixels = [[left,top],[left,bottom],[right,bottom],[right,top]];
    const uvs = pixels.flatMap(([x,y]) => {
      const u = x / width, v = y / height, values = style.uvs;
      return [0,1].map(axis => values[axis] * (1-u)*(1-v) + values[2+axis] * (1-u)*v
        + values[4+axis] * u*v + values[6+axis] * u*(1-v));
    });
    const trimmed = left !== 0 || top !== 0 || right !== width || bottom !== height;
    crop = { style: trimmed ? Object.freeze({ ...style, uvs }) : style, empty,
      offsets: pixels.map(([x,y]) => ({ x: x - anchor.x * width, y: y - anchor.y * height })) };
    opaqueStyles.set(style, crop);
  }
  return { terrainBatch: crop.style,
    projected: crop.offsets.map(offset => ({ x: at.x + offset.x, y: at.y + offset.y })),
    ...(crop.empty ? { visible: false } : {}) };
}

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
    return opaquePicture(pack.body({ art, face: terrainArtFace(face, turn), cell, seed }), root);
  }
  function cover({ cover, mask, root, seed, projection, surfaceY }) {
    const at = projection.project({ x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 });
    const terrainBatch = pack.cover({ ...cover, mask: terrainArtMask(mask, turn), root, seed });
    const point = { x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 };
    return { ...opaquePicture(terrainBatch, at),
      ...(terrainBatch.hitArea ? { orderGeometry: uprightImageGeometry(terrainBatch.hitArea, at, point, projection), supportY: surfaceY } : {}),
      ...(terrainBatch.hitArea ? { contains: point => terrainBatch.hitArea.contains(point.x - at.x, point.y - at.y) } : {}) };
  }
  return Object.freeze({ body, cover });
}
