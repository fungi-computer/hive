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
  if (
    !Number.isSafeInteger(level) ||
    !Number.isFinite(verticalMetres) ||
    verticalMetres <= 0
  )
    throw new Error("invalid terrain selection plane");
  const point = planePoint(x, y, (level + 0.5) * verticalMetres);
  return [Math.round(point.x), level, Math.round(point.z)];
}

/** Pick a displayed horizontal support; native admission checks the returned order. */
export function surfacePoint(x, y, fact) {
  const { pose, surface } = fact;
  if (!pose || !surface) return null;
  const world = planePoint(x, y, pose.position.y + surface.height);
  const angle = (pose.facing * Math.PI) / 2;
  const dx = world.x - pose.position.x;
  const dz = world.z - pose.position.z;
  const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
  const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
  if (
    localX < surface.minX - 1e-8 ||
    localX > surface.maxX + 1e-8 ||
    localZ < surface.minZ - 1e-8 ||
    localZ > surface.maxZ + 1e-8
  )
    return null;
  return {
    x: Math.min(surface.maxX, Math.max(surface.minX, localX)),
    y: surface.height,
    z: Math.min(surface.maxZ, Math.max(surface.minZ, localZ)),
    frame: fact.id,
  };
}

/** Authored floors are faces, never earth columns or invented side walls. */
function* pickingFaces(terrain) {
  for (const face of terrainFaces(terrain.surfaces, terrain.verticalMetres))
    yield { ...face, source: "terrain" };
  for (const surface of terrain.structureSurfaces) {
    const [x, y, z] = surface.cell;
    const height = (y + 0.5) * terrain.verticalMetres;
    yield {
      surface,
      source: "structure",
      top: true,
      vertices: [
        [x - 0.5, height, z - 0.5],
        [x - 0.5, height, z + 0.5],
        [x + 0.5, height, z + 0.5],
        [x + 0.5, height, z - 0.5],
      ],
    };
  }
}

const PICK_BUCKET_SIZE = 32;

function bucketKey(x, y) {
  return `${x},${y}`;
}

function addTriangleBuckets(buckets, triangle, bounds) {
  const minX = Math.floor(bounds.left / PICK_BUCKET_SIZE);
  const maxX = Math.floor(bounds.right / PICK_BUCKET_SIZE);
  const minY = Math.floor(bounds.top / PICK_BUCKET_SIZE);
  const maxY = Math.floor(bounds.bottom / PICK_BUCKET_SIZE);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const key = bucketKey(x, y);
      let entries = buckets.get(key);
      if (!entries) buckets.set(key, (entries = []));
      entries.push(triangle);
    }
}

function triangleRecord(face, vertices, indices, order) {
  const values = new Float64Array(9);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (let index = 0; index < 3; index++) {
    const [x, y, z] = vertices[indices[index]];
    values[index * 3] = x;
    values[index * 3 + 1] = y;
    values[index * 3 + 2] = z;
    const point = new Vector3(x, y, z).project(view);
    const projected = {
      x: ((point.x + 1) * WIDTH) / 2,
      y: ((1 - point.y) * HEIGHT) / 2,
    };
    left = Math.min(left, projected.x);
    top = Math.min(top, projected.y);
    right = Math.max(right, projected.x);
    bottom = Math.max(bottom, projected.y);
  }
  return { face, values, order, bounds: { left, top, right, bottom } };
}

function makePickerState(terrain) {
  const buckets = new Map();
  let order = 0;
  for (const face of pickingFaces(terrain)) {
    for (const indices of [
      [0, 1, 2],
      [0, 2, 3],
    ]) {
      const triangle = triangleRecord(face, face.vertices, indices, order++);
      addTriangleBuckets(buckets, triangle, triangle.bounds);
    }
  }
  return { buckets };
}

function rayFor(x, y, origin, far, ray) {
  const ndc = new Vector3((x / WIDTH) * 2 - 1, 1 - (y / HEIGHT) * 2, -1);
  origin.copy(ndc).unproject(view);
  far.copy(ndc).setZ(1).unproject(view);
  ray.origin.copy(origin);
  ray.direction.copy(far).sub(origin).normalize();
}

function hitPickerState(x, y, terrain, state, origin, far, ray, hit, a, b, c) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const candidates = new Set();
  const bucketX = Math.floor(x / PICK_BUCKET_SIZE),
    bucketY = Math.floor(y / PICK_BUCKET_SIZE);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      for (const triangle of state.buckets.get(
        bucketKey(bucketX + dx, bucketY + dy),
      ) ?? [])
        candidates.add(triangle);
  const ordered = [...candidates].sort(
    (left, right) => left.order - right.order,
  );
  rayFor(x, y, origin, far, ray);
  let picked = null,
    nearest = Infinity;
  for (const triangle of ordered) {
    const values = triangle.values;
    a.set(values[0], values[1], values[2]);
    b.set(values[3], values[4], values[5]);
    c.set(values[6], values[7], values[8]);
    if (!ray.intersectTriangle(a, b, c, true, hit)) continue;
    const distance = origin.distanceToSquared(hit);
    if (distance >= nearest) continue;
    nearest = distance;
    const face = triangle.face,
      [cx, cy, cz] = face.surface.cell;
    picked = {
      kind:
        face.source === "structure"
          ? "structure-top"
          : face.top
            ? "terrain-top"
            : "terrain-side",
      surface: face.surface,
      column: face.surface.cell,
      position: { x: hit.x, y: hit.y, z: hit.z },
      standingPoint: face.top
        ? { x: cx, y: (cy + 0.5) * terrain.verticalMetres, z: cz, frame: null }
        : null,
    };
  }
  return picked;
}

/** Retained per-client terrain picker; never shared across worlds or clients. */
export function createTerrainPicker() {
  let surfaces, structureSurfaces, verticalMetres, epoch, state;
  const origin = new Vector3(),
    far = new Vector3(),
    hit = new Vector3();
  const ray = new Ray(new Vector3(), new Vector3());
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  function reset() {
    surfaces = undefined;
    structureSurfaces = undefined;
    verticalMetres = undefined;
    epoch = undefined;
    state = undefined;
  }
  function ensure(terrain, nextEpoch) {
    if (!terrain) {
      reset();
      return false;
    }
    if (
      terrain.surfaces === surfaces &&
      terrain.structureSurfaces === structureSurfaces &&
      terrain.verticalMetres === verticalMetres &&
      nextEpoch === epoch
    )
      return true;
    reset();
    surfaces = terrain.surfaces;
    structureSurfaces = terrain.structureSurfaces;
    verticalMetres = terrain.verticalMetres;
    epoch = nextEpoch;
    state = makePickerState(terrain);
    return true;
  }
  function hitTerrain(x, y, terrain, nextEpoch) {
    if (!ensure(terrain, nextEpoch)) return null;
    return hitPickerState(x, y, terrain, state, origin, far, ray, hit, a, b, c);
  }
  return {
    hit: hitTerrain,
    point(x, y, terrain, nextEpoch) {
      const found = hitTerrain(x, y, terrain, nextEpoch);
      return found?.standingPoint
        ? { cell: found.column, point: found.standingPoint }
        : null;
    },
    reset,
    dispose: reset,
  };
}

/** Nearest published face. Side faces identify a displayed column, not hidden material. */
export function terrainHit(x, y, terrain) {
  return createTerrainPicker().hit(x, y, terrain);
}

/** Movement consumes standing surfaces; inspection can consume the complete hit. */
export function terrainPoint(x, y, terrain) {
  return createTerrainPicker().point(x, y, terrain);
}
