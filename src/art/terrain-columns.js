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
const DEFAULT_CHUNK_SIZE = 8;

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
      !Number.isInteger(surface.material)
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
  function quad(colour, vertices) {
    let points = buckets.get(colour);
    if (!points) buckets.set(colour, (points = []));
    for (const index of [0, 1, 2, 0, 2, 3]) points.push(...vertices[index]);
  }
  for (const face of terrainFaces(surfaces, verticalMetres, columnIndex)) {
    const soil = face.surface.material === soilMaterial;
    quad(
      soil ? (face.top ? colours.grass : colours.soil) : colours.stone,
      face.vertices,
    );
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
      surfaces: nextSurfaces,
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
