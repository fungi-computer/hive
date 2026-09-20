import { prepareSpatialDrawScene } from "./spatial-draw-order.js";
import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";

const keyOf = record => `${record.id}\u0000${record.part ?? ""}`;
const sameOrder = (a, b) => a.length === b.length && a.every((record, index) => keyOf(record) === keyOf(b[index]));
const sameDisplay = (a, b) => a.display === b.display && a.terrainBatch === b.terrainBatch;

/** Owns retained geometry/order and the current shared painting/picking view.
 * Revision changes cover static membership, geometry, contacts and projection.
 * The supplied projection is immutable; camera changes create a new owner.
 * currentStaticRecords may refresh any subset of static display/hit records;
 * changed ordering data is rejected unless the caller advances the revision.
 * All records/geometry are read-only to callers while retained by this owner.
 * Returned records are a borrowed view; unchanged geometry refreshes current
 * record references in that view without copying or scanning the whole scene.
 */
export function createSpatialSceneOwner({ projection, clock = () => performance.now() } = {}) {
  // Validate the projection at construction, even before the first frame.
  prepareSpatialDrawScene([], { projection, clock });
  let revision, scene, records = [], latestWork = null;
  const counts = { compile: 0, staticRebuild: 0, dynamicInsert: 0, applyOrder: 0,
    staticFaceComparisons: 0, dynamicFaceComparisons: 0, candidateVisits: 0, topologyBuilds: 0, topologyReuses: 0, staticPreparedNew: 0, staticPreparedReused: 0, staticRelationsReused: 0 };
  const times = { compileMs: 0, staticRebuildMs: 0, dynamicInsertMs: 0, topologyUpdateMs: 0, orderReuseMs: 0, applyOrderMs: 0 };
  const samples = { staticRebuildMs: [], dynamicInsertMs: [], topologyUpdateMs: [], orderReuseMs: [], applyOrderMs: [] };
  function measured(name, started, finished = clock()) {
    const elapsed = Math.max(0, finished - started);
    times[name] += elapsed;
    samples[name].push(elapsed);
    if (samples[name].length > 512) samples[name].shift();
  }

  return Object.freeze({
    update({ revision: nextRevision, staticRecords, currentStaticRecords = [], dynamicRecords = [] } = {}) {
      if (nextRevision === undefined || nextRevision === null)
        throw new Error("spatial scene requires a static revision");
      if (typeof staticRecords !== "function" || !Array.isArray(currentStaticRecords) || !Array.isArray(dynamicRecords))
        throw new Error("spatial scene requires a lazy static supplier and current/static dynamic arrays");
      const started = clock(), staticRebuilt = !scene || nextRevision !== revision;
      // Stage the next scene so malformed input cannot replace the last valid
      // painted/picked state or acknowledge a failed revision.
      const nextScene = staticRebuilt
        ? (scene ? scene.withStaticRecords(staticRecords()) : prepareSpatialDrawScene(staticRecords(), { projection, clock }))
        : scene;
      const staticFinished = clock();
      const result = nextScene.compile(dynamicRecords, currentStaticRecords);
      const reused = !staticRebuilt && result.metrics.topologyReuses > 0;
      const physicalOrderChanged = !reused && !sameOrder(records, result.records);
      const displayOrderChanged = physicalOrderChanged || (reused
        ? result.recordChanges.some(({ previous, current }) => !sameDisplay(previous, current))
        : records.some((record, index) => !sameDisplay(record, result.records[index])));
      records = result.records; scene = nextScene; revision = nextRevision;
      counts.compile++;
      if (staticRebuilt) {
        counts.staticRebuild++;
        counts.staticPreparedNew += scene.metrics.preparedNew;
        counts.staticPreparedReused += scene.metrics.preparedReused;
        counts.staticRelationsReused += scene.metrics.relationsReused;
        counts.topologyBuilds += scene.metrics.topologyBuilds;
        counts.staticFaceComparisons += scene.metrics.faceComparisons;
        counts.candidateVisits += scene.metrics.candidateVisits;
        measured("staticRebuildMs", started, staticFinished);
      }
      counts.dynamicInsert += dynamicRecords.length;
      counts.dynamicFaceComparisons += result.metrics.faceComparisons;
      counts.candidateVisits += result.metrics.candidateVisits;
      counts.topologyBuilds += result.metrics.topologyBuilds;
      counts.topologyReuses += result.metrics.topologyReuses;
      const finished = clock();
      measured("dynamicInsertMs", staticFinished, finished);
      measured(result.metrics.topologyReuses ? "orderReuseMs" : "topologyUpdateMs", staticFinished, finished);
      times.compileMs += Math.max(0, clock() - started);
      latestWork = Object.freeze({ ...result.metrics, staticRebuilt,
        staticFaceComparisons: staticRebuilt ? scene.metrics.faceComparisons : 0,
        staticWork: staticRebuilt ? scene.metrics : null });
      return Object.freeze({ records, physicalOrderChanged, displayOrderChanged,
        applyOrderRequired: staticRebuilt || physicalOrderChanged || displayOrderChanged,
        staticRebuilt, metrics: latestWork });
    },
    pick(point) { return pickVoxelDrawRecord(records, point); },
    measureApplyOrder(apply) {
      if (typeof apply !== "function") throw new Error("spatial scene apply callback required");
      const started = clock(), result = apply();
      counts.applyOrder++; measured("applyOrderMs", started);
      return result;
    },
    metrics: () => Object.freeze({ counts: Object.freeze({ ...counts }), times: Object.freeze({ ...times }),
      latest: latestWork,
      retained: scene?.retained() ?? Object.freeze({ staticRecords: 0, staticRelations: 0, staticBins: 0, dynamicRecords: 0, currentRecords: 0 }),
      samples: Object.freeze(Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, Object.freeze([...values])]))),
    }),
    reset() { revision = undefined; scene = undefined; records = []; latestWork = null; },
  });
}
