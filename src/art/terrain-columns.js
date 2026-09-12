import {
  terrainFaces,
  terrainColumnKey,
  terrainColumnMap,
  changedTerrainColumns,
  affectedTerrainColumns,
  terrainChunkKey,
  terrainChunkKeys,
} from "./terrain-faces.js";
import * as THREE from "three";
import { scene, mesh } from "./geometry.js";

// Original clearing palette, shared by generated terrain and asset authoring.
const colours = { grass: "#758947", soil: "#9a744f", stone: "#777b68" };
const greens = ["#758947", "#8f9e53", "#a7ad60", "#627b46"];
const DEFAULT_CHUNK_SIZE = 8;
export const TERRAIN_DETAIL_HEIGHT = 0.25;

function validateSurfaces(surfaces) {
  if (!Array.isArray(surfaces) || surfaces.length > 4096)
    throw new Error("invalid terrain art input");
  const seen = new Set();
  for (const surface of surfaces) {
    if (
      !surface ||
      !Array.isArray(surface.cell) ||
      surface.cell.length !== 3 ||
      !surface.cell.every(Number.isSafeInteger) ||
      !Number.isInteger(surface.material) ||
      !Number.isSafeInteger(surface.generatedTop)
    )
      throw new Error("invalid terrain art surface");
    const key = terrainColumnKey(surface);
    if (seen.has(key)) throw new Error("duplicate terrain art column");
    seen.add(key);
  }
}

function validateScale(verticalMetres) {
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("invalid terrain art input");
}

function chunkIndex(columnIndex, chunkSize) {
  const chunks = new Map();
  for (const surface of columnIndex.values()) {
    const key = terrainChunkKey(surface.cell[0], surface.cell[2], chunkSize);
    let columns = chunks.get(key);
    if (!columns) chunks.set(key, (columns = []));
    columns.push(surface);
  }
  return chunks;
}

function buildChunk(surfaces, verticalMetres, soilMaterial, columnIndex) {
  const buckets = new Map();
  function polygon(colour, vertices) {
    let points = buckets.get(colour);
    if (!points) buckets.set(colour, (points = []));
    for (let index = 1; index < vertices.length - 1; index++)
      points.push(...vertices[0], ...vertices[index], ...vertices[index + 1]);
  }
  for (const face of terrainFaces(surfaces, verticalMetres, columnIndex)) {
    const soil = face.surface.material === soilMaterial;
    const intact = soil && face.surface.cell[1] === face.surface.generatedTop;
    polygon(
      soil ? (face.top ? intact ? colours.grass : "#806143" : colours.soil) : colours.stone,
      face.vertices,
    );
    if (face.top && intact) groundCover(face.surface, face.vertices[0][1], polygon);
  }
  const result = new THREE.Group();
  for (const [colour, points] of buckets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    geometry.computeVertexNormals();
    mesh(result, geometry, colour, 0, 0, 0);
  }
  return result;
}

/** Original palette and low-poly detail on the real surface, batched with its chunk.
 * This is cosmetic paint, not another world generator or plant inventory. */
function groundCover(surface, height, polygon) {
  const [x, , z] = surface.cell;
  let seed = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  seed = (seed ^ (seed >>> 16)) >>> 0;
  const y = height + 0.003;
  const cx = x + (((seed >>> 5) & 7) - 3) * 0.018;
  const cz = z + (((seed >>> 9) & 7) - 3) * 0.018;
  const vertices = Array.from({ length: 7 }, (_, index) => {
    const angle = -index * Math.PI * 2 / 7 + (seed % 13) * 0.1;
    const radius = 0.58 + ((seed >>> (index * 3)) & 7) * 0.024;
    // Keep paint on its own physical top; neighboring holes stay bare.
    return [Math.max(x - 0.5, Math.min(x + 0.5, cx + Math.cos(angle) * radius)), y,
      Math.max(z - 0.5, Math.min(z + 0.5, cz + Math.sin(angle) * radius))];
  });
  polygon(greens[seed % greens.length], vertices);
  if (seed % 3 !== 0) return;
  const tx = x + (((seed >>> 3) & 7) - 3) * 0.1;
  const tz = z + (((seed >>> 7) & 7) - 3) * 0.1;
  const tip = [tx + 0.045, y + 0.17 + (seed % 4) * 0.025, tz];
  const base = [[tx - 0.065, y, tz - 0.04], [tx + 0.065, y, tz - 0.04], [tx, y, tz + 0.075]];
  for (let index = 0; index < 3; index++)
    polygon(greens[(seed + index) % greens.length], [base[(index + 1) % 3], base[index], tip]);
}

function disposeObject(object) {
  object.traverse((child) => child.geometry?.dispose());
  object.parent?.remove(object);
}

function replaceRetainedChunk(retained, old, built) {
  const index = old ? retained.children.indexOf(old) : retained.children.length;
  if (old) disposeObject(old);
  if (!built.children.length) return false;
  retained.add(built);
  if (index < retained.children.length - 1) {
    retained.remove(built);
    retained.children.splice(index, 0, built);
    built.parent = retained;
  }
  return true;
}

function reorderChunks(retained, chunks) {
  const ordered = [...chunks.entries()]
    .sort(([left], [right]) => {
      const [lx, lz] = left.split(",").map(Number),
        [rx, rz] = right.split(",").map(Number);
      return lx - rx || lz - rz;
    })
    .map(([, child]) => child);
  for (const child of ordered) retained.remove(child);
  for (const child of ordered) retained.add(child);
}

/** Original full terrain scene owner, retained for callers that need one bake. */
export function terrainColumnsScene(
  surfaces,
  { verticalMetres, soilMaterial = 1 } = {},
) {
  validateScale(verticalMetres);
  validateSurfaces(surfaces);
  const result = scene();
  result.add(
    buildChunk(
      surfaces,
      verticalMetres,
      soilMaterial,
      terrainColumnMap(surfaces),
    ),
  );
  return result;
}

/** Retain one complete lit scene while replacing only bounded 8x8 geometry patches. */
export function createTerrainSceneCache({
  verticalMetres,
  soilMaterial = 1,
  chunkSize = DEFAULT_CHUNK_SIZE,
} = {}) {
  validateScale(verticalMetres);
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize > 64)
    throw new Error("invalid terrain chunk size");
  const retained = scene();
  const chunks = new Map();
  let surfaces = [];
  let columnIndex = new Map();
  let retainedVerticalMetres = verticalMetres;
  let ready = false;
  let disposed = false;

  function update(nextSurfaces, nextVerticalMetres = verticalMetres) {
    if (disposed) throw new Error("terrain scene cache is disposed");
    validateScale(nextVerticalMetres);
    validateSurfaces(nextSurfaces);
    const previous = surfaces;
    const previousIndex = columnIndex;
    const nextIndex = terrainColumnMap(nextSurfaces);
    const nextChunks = chunkIndex(nextIndex, chunkSize);
    const sameScale = nextVerticalMetres === retainedVerticalMetres;
    const changedColumns =
      ready && sameScale
        ? changedTerrainColumns(columnIndex, nextIndex)
        : nextSurfaces.map(({ cell: [x, , z] }) => ({ x, z }));
    const affectedColumns =
      ready && sameScale
        ? affectedTerrainColumns(changedColumns)
        : changedColumns;
    const dirtyChunks = terrainChunkKeys(affectedColumns, chunkSize);
    if (!ready || !sameScale) {
      for (const old of chunks.values()) disposeObject(old);
      chunks.clear();
    }
    for (const key of dirtyChunks) {
      const old = chunks.get(key);
      const built = buildChunk(
        nextChunks.get(key) ?? [],
        nextVerticalMetres,
        soilMaterial,
        nextIndex,
      );
      if (replaceRetainedChunk(retained, old, built)) chunks.set(key, built);
      else chunks.delete(key);
    }
    reorderChunks(retained, chunks);
    surfaces = nextSurfaces;
    columnIndex = nextIndex;
    retainedVerticalMetres = nextVerticalMetres;
    const initial = !ready || !sameScale;
    ready = true;
    return {
      initial,
      previous,
      previousIndex,
      surfaces: nextSurfaces,
      columnIndex: nextIndex,
      changedColumns,
      affectedColumns,
      dirtyChunks,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const child of chunks.values()) disposeObject(child);
    chunks.clear();
    retained.clear();
  }

  return {
    scene: retained,
    update,
    dispose,
    get surfaces() {
      return surfaces;
    },
    get ready() {
      return ready;
    },
  };
}
