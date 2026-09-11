import { terrainFaces } from "../../../src/art/terrain-faces.js";
import { Ray, Vector3 } from "three";
import { camera } from "../../../src/art/prop-camera.js";

// Retained art/scale projection, centered on the shared bank's 15-cell ground.
// Fresh scenes use signed coordinates about that center instead of Goblin cells.
export const WIDTH = 640,
  HEIGHT = 400;
const view = camera(WIDTH, HEIGHT, 1.03, 256);
export function project(x, y, z) {
  const point = new Vector3(x, y, z).project(view);
  return {
    x: ((point.x + 1) * WIDTH) / 2,
    y: ((1 - point.y) * HEIGHT) / 2,
  };
}
const origin = project(0, 0, 0);
const axisX = project(1, 0, 0);
const axisZ = project(0, 0, 1);
const basisX = { x: axisX.x - origin.x, y: axisX.y - origin.y };
const basisZ = { x: axisZ.x - origin.x, y: axisZ.y - origin.y };
const determinant = basisX.x * basisZ.y - basisZ.x * basisX.y;
function planePoint(x, y, height) {
  const planeOrigin = project(0, height, 0);
  const dx = x - planeOrigin.x;
  const dy = y - planeOrigin.y;
  return {
    x: (dx * basisZ.y - basisZ.x * dy) / determinant,
    y: height,
    z: (basisX.x * dy - dx * basisX.y) / determinant,
  };
}
export function groundPoint(x, y) {
  const point = planePoint(x, y, 0);
  return { x: Math.round(point.x), y: 0, z: Math.round(point.z) };
}

/** Drag on the initially picked voxel plane; never ray-pick a different layer. */
export function terrainPlaneCell(x, y, level, verticalMetres) {
  if (!Number.isSafeInteger(level) || !Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("invalid terrain selection plane");
  const point = planePoint(x, y, (level + 0.5) * verticalMetres);
  return [Math.round(point.x), level, Math.round(point.z)];
}

/** Pick a displayed horizontal support; native admission checks the returned order. */
export function surfacePoint(x, y, fact) {
  const { pose, surface } = fact;
  if (!pose || !surface) return null;
  const world = planePoint(x, y, pose.position.y + surface.height);
  const angle = pose.facing * Math.PI / 2;
  const dx = world.x - pose.position.x;
  const dz = world.z - pose.position.z;
  const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
  const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
  if (localX < surface.minX - 1e-8 || localX > surface.maxX + 1e-8 ||
      localZ < surface.minZ - 1e-8 || localZ > surface.maxZ + 1e-8) return null;
  return { x: Math.min(surface.maxX, Math.max(surface.minX, localX)),
    y: surface.height,
    z: Math.min(surface.maxZ, Math.max(surface.minZ, localZ)), frame: fact.id };
}

/** Authored floors are faces, never earth columns or invented side walls. */
function* pickingFaces(terrain) {
  for (const face of terrainFaces(terrain.surfaces, terrain.verticalMetres))
    yield { ...face, source: "terrain" };
  for (const surface of terrain.structureSurfaces) {
    const [x, y, z] = surface.cell;
    const height = (y + 0.5) * terrain.verticalMetres;
    yield { surface, source: "structure", top: true, vertices: [
      [x - 0.5, height, z - 0.5], [x - 0.5, height, z + 0.5],
      [x + 0.5, height, z + 0.5], [x + 0.5, height, z - 0.5],
    ] };
  }
}

/** Nearest published face. Side faces identify a displayed column, not hidden material. */
export function terrainHit(x, y, terrain) {
  let picked = null;
  let nearest = Infinity;
  const ndc = new Vector3(x / WIDTH * 2 - 1, 1 - y / HEIGHT * 2, -1);
  const origin = ndc.clone().unproject(view);
  const far = ndc.clone().setZ(1).unproject(view);
  const ray = new Ray(origin, far.sub(origin).normalize());
  const hit = new Vector3();
  for (const face of pickingFaces(terrain)) {
    const vertices = face.vertices.map(vertex => new Vector3(...vertex));
    for (const indices of [[0,1,2],[0,2,3]]) {
      if (!ray.intersectTriangle(...indices.map(index => vertices[index]), true, hit)) continue;
      const distance = origin.distanceToSquared(hit);
      if (distance >= nearest) continue;
      nearest = distance;
      const [cx,cy,cz] = face.surface.cell;
      picked = {
        kind: face.source === "structure" ? "structure-top" : face.top ? "terrain-top" : "terrain-side",
        surface: face.surface,
        column: face.surface.cell,
        position: {x:hit.x,y:hit.y,z:hit.z},
        standingPoint: face.top ? {x:cx,y:(cy+0.5)*terrain.verticalMetres,z:cz,frame:null} : null,
      };
    }
  }
  return picked;
}

/** Movement consumes standing surfaces; inspection can consume the complete hit. */
export function terrainPoint(x, y, terrain) {
  const hit = terrainHit(x,y,terrain);
  return hit?.standingPoint ? {cell:hit.column,point:hit.standingPoint} : null;
}
