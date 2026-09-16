import { createIsometricSorter, pickFromOrdered } from "./isometric-sorter.js";
import { materialCoverage, terrainFaceRecords } from "./terrain-visibility.js";
import { createTerrainBatchMeshes } from "./terrain-face-batches.js";

/** First-shape R2 composition boundary. R1 supplies checked complete coverage;
 * the existing art owner supplies its textures/UVs and full-pose art records.
 * The caller mounts returned displays in one sortable Pixi parent. All terrain
 * and art coordinates must use this projection; pan/zoom can transform that
 * parent and inverse-transform pointer coordinates without changing geometry.
 */
export function createCutTerrainView({ projection, appearance, parent, maxMeshes = 512 }) {
  if (typeof appearance !== "function") throw new Error("cut terrain view requires terrain appearance");
  const sorter = createIsometricSorter({ projection });
  const meshes = createTerrainBatchMeshes({ maxMeshes, parent });
  let savedIdentity, faces = [], ordered = [], disposed = false;
  return {
    update(snapshot, { level, artRecords = [], viewport, generatedTops } = {}) {
      if (disposed) throw new Error("cut terrain view is disposed");
      const identity = `${snapshot.epoch}:${snapshot.terrainRevision}:${level}:${JSON.stringify(viewport)}`;
      const nextFaces = identity === savedIdentity ? faces
        : terrainFaceRecords(materialCoverage(snapshot), { level, projection, viewport, appearance, generatedTops });
      const nextOrder = sorter.order([...nextFaces, ...artRecords]);
      const displays = meshes.update(nextOrder);
      savedIdentity = identity;
      faces = nextFaces; ordered = nextOrder;
      return { records: ordered, displays, faceCount: faces.length, meshCount: meshes.size };
    },
    pick(point, alphaCandidates = []) {
      if (disposed) return null;
      return pickFromOrdered(ordered, [...faces.filter(face => face.contains(point)), ...alphaCandidates.filter(candidate => candidate.contains?.(point) === true)]);
    },
    dispose() {
      if (disposed) return;
      meshes.dispose(); sorter.invalidate(); savedIdentity = undefined; faces = []; ordered = []; disposed = true;
    },
  };
}
