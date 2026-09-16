import { createIsometricSorter, pickFromOrdered } from "./isometric-sorter.js";
import { materialCoverage, terrainFaceRecords } from "./terrain-visibility.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";

/** First-shape R2 composition boundary. R1 supplies checked complete coverage;
 * the existing art owner supplies its textures/UVs and full-pose art records.
 * The caller mounts returned displays in one sortable Pixi parent. All terrain
 * and art coordinates must use this projection; pan/zoom can transform that
 * parent and inverse-transform pointer coordinates without changing geometry.
 */
export function createCutTerrainView({ projection, appearance, maxMeshes = 512 }) {
  const sorter = createIsometricSorter({ projection });
  const meshes = createTerrainBatchMeshes({ maxMeshes });
  let savedSnapshot, savedLevel, savedViewport, faces = [], ordered = [], disposed = false;
  return {
    update(snapshot, { level, artRecords = [], viewport } = {}) {
      if (disposed) throw new Error("cut terrain view is disposed");
      const viewportKey = JSON.stringify(viewport);
      const nextFaces = snapshot === savedSnapshot && level === savedLevel && viewportKey === savedViewport ? faces
        : terrainFaceRecords(materialCoverage(snapshot), { level, projection, viewport, appearance });
      const nextOrder = sorter.order([...nextFaces, ...artRecords]);
      const displays = meshes.update(nextOrder);
      savedSnapshot = snapshot; savedLevel = level; savedViewport = viewportKey;
      faces = nextFaces; ordered = nextOrder;
      return { records: ordered, displays, faceCount: faces.length, meshCount: meshes.size };
    },
    pick(point, alphaCandidates = []) {
      if (disposed) return null;
      return pickFromOrdered(ordered, [...faces.filter(face => face.contains(point)), ...alphaCandidates]);
    },
    dispose() {
      if (disposed) return;
      meshes.dispose(); sorter.invalidate(); savedSnapshot = undefined; faces = []; ordered = []; disposed = true;
    },
  };
}
