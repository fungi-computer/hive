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
import { terrainPatchEmissions, cliffEmissions } from "./terrain-patches.js";

// Original clearing palette, shared by generated terrain and asset authoring.
const colours = { soil: "#9a744f", stone: "#777b68" };
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
    polygon(
      soil ? colours.soil : colours.stone,
      face.vertices,
    );
  }
  const result = new THREE.Group();
  for (const placement of terrainPatchPlacements(surfaces, columnIndex, soilMaterial, verticalMetres))
    for (const emission of terrainPatchEmissions(placement.kind, placement.mask, placement.variant))
      polygon(emission.color, emission.vertices.map(([x, y, z]) => [x + placement.x + 0.5, y + placement.y, z + placement.z + 0.5]));
  for (const placement of terrainCliffPlacements(surfaces, columnIndex, soilMaterial, verticalMetres)) {
    for (const emission of cliffEmissions(placement.kind, placement.facing, placement.variant)) {
      const angle = placement.facing * Math.PI / 2;
      polygon(emission.color, emission.vertices.map(([x, y, z]) => [placement.x + x * Math.cos(angle) + z * Math.sin(angle), placement.y + y, placement.z - x * Math.sin(angle) + z * Math.cos(angle)]));
    }
  }
  for (const [colour, points] of buckets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    mesh(result, geometry, colour, 0, 0, 0);
  }
  return result;
}

function terrainKind(surface, soilMaterial) {
  if (!surface) return null;
  if (surface.material === soilMaterial)
    return surface.cell[1] === surface.generatedTop ? "grass" : "earth";
  return surface.material === 2 ? "rock" : "earth";
}

function stableVariant(x, z) {
  return ((Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0) % 3;
}

/** Pure dual-grid placement facts. Missing or stepped corners stay bare. */
export function terrainPatchPlacements(surfaces, columnIndex = terrainColumnMap(surfaces), soilMaterial = 1, verticalMetres = 0.54) {
  const placements = [];
  const vertices = new Set();
  for (const { cell: [x, y, z] } of surfaces) for (const [dx, dz] of [[0, 0], [1, 0], [1, 1], [0, 1]]) vertices.add(`${x + dx},${y},${z + dz}`);
  for (const key of [...vertices].sort()) {
    const [vx, y, vz] = key.split(",").map(Number), x = vx - 1, z = vz - 1;
    const neighbors = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]].map(([cx, cz]) => columnIndex.get(`${cx},${cz}`));
    const kinds = neighbors.map((neighbor) => neighbor?.cell[1] === y ? terrainKind(neighbor, soilMaterial) : null);
    for (const kind of ["grass", "rock"]) {
      const mask = kinds.reduce((bits, value, index) => bits | (value === kind ? 1 << index : 0), 0);
      if (mask) placements.push({ x, y: (y + 0.5) * verticalMetres, z, kind, mask, variant: stableVariant(x, z) });
    }
  }
  return placements;
}

/** Pure exposed-face placement facts; buried neighboring stacks get no lip. */
export function terrainCliffPlacements(surfaces, columnIndex = terrainColumnMap(surfaces), soilMaterial = 1, verticalMetres = 0.54) {
  const placements = [];
  const selected = [...surfaces].sort((a, b) => a.cell[0] - b.cell[0] || a.cell[2] - b.cell[2]);
  for (const surface of selected) {
    const [x, y, z] = surface.cell;
    const top = (y + 0.5) * verticalMetres;
    const variant = stableVariant(x, z);
    const kind = surface.material === 2 ? "stone" : "earth";
    for (const [dx, dz, facing] of [[-1, 0, 3], [1, 0, 1], [0, -1, 2], [0, 1, 0]]) {
      const neighbor = columnIndex.get(`${x + dx},${z + dz}`);
      const bottom = neighbor ? neighbor.cell[1] : y - 1;
      if (bottom >= y) continue;
      for (let segment = 0; segment < y - bottom; segment++) {
        const segmentTop = top - segment * verticalMetres;
        placements.push({ x: x + dx * 0.5, y: segmentTop, z: z + dz * 0.5, kind, facing, variant, segment });
        if (segment === 0 && terrainKind(surface, soilMaterial) === "grass")
          placements.push({ x: x + dx * 0.5, y: segmentTop, z: z + dz * 0.5, kind: "grass-lip", facing, variant, segment });
      }
    }
  }
  return placements;
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

/** Build one sortable presentation band while retaining neighboring columns
 * for correct cliff side faces. This is presentation-only; the full column
 * index remains the canonical geometry context. */
export function terrainBandScene(
  surfaces,
  level,
  { verticalMetres, soilMaterial = 1, columnIndex = terrainColumnMap(surfaces) } = {},
) {
  validateScale(verticalMetres);
  validateSurfaces(surfaces);
  if (!Number.isSafeInteger(level)) throw new Error("invalid terrain band level");
  const selected = surfaces.filter(({ cell: [, y] }) => y === level);
  const result = scene();
  result.add(buildChunk(selected, verticalMetres, soilMaterial, columnIndex));
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
