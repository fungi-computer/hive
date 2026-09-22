import { prepareSpatialDrawScene, prepareSpatialDrawSceneSteps } from "./spatial-draw-order.js";
import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";

const keyOf = record => `${record.id}\u0000${record.part ?? ""}`;
const sameDisplay = (a, b) => a.display === b.display && a.terrainBatch === b.terrainBatch;

/** Owns one published painting/picking view and at most one prepared successor.
 * prepare/advance never alter published order or hit records. publish is a
 * pointer swap after all validation, indexing and graph work has completed.
 * Static suppliers and input records describe a pinned, read-only snapshot;
 * callers stage matching display objects before publishing it. A revision
 * covers static membership, geometry and contacts. Projection is immutable.
 * Returned records are a borrowed read-only array, refreshed only on publish.
 */
export function createSpatialSceneOwner({ projection, clock = () => performance.now() } = {}) {
  prepareSpatialDrawScene([], { projection, clock });
  let revision, scene, records = [], latestWork = null, generation = 0, pending = null;
  let preparationMs = 0, sliceStarted = null;
  const preparationClock = () => preparationMs + (sliceStarted === null ? 0 : Math.max(0, clock() - sliceStarted));
  const counts = { compile: 0, staticRebuild: 0, dynamicInsert: 0, applyOrder: 0,
    staticFaceComparisons: 0, dynamicFaceComparisons: 0, candidateVisits: 0, topologyBuilds: 0, topologyReuses: 0,
    staticPreparedNew: 0, staticPreparedReused: 0, staticRelationsReused: 0 };
  const tasks = { started: 0, ready: 0, published: 0, cancelled: 0, failed: 0, advances: 0, operations: 0,
    preparationMs: 0, cancelledPreparationMs: 0, publicationMs: 0, maxAdvanceMs: 0 };
  const times = { compileMs: 0, staticRebuildMs: 0, dynamicInsertMs: 0, topologyUpdateMs: 0, orderReuseMs: 0, applyOrderMs: 0 };
  const samples = { staticRebuildMs: [], dynamicInsertMs: [], topologyUpdateMs: [], orderReuseMs: [], applyOrderMs: [] };
  function measured(name, elapsed) {
    elapsed = Math.max(0, elapsed); times[name] += elapsed; samples[name].push(elapsed);
    if (samples[name].length > 512) samples[name].shift();
  }

  function prepare({ revision: nextRevision, staticRecords, currentStaticRecords = [], dynamicRecords = [] } = {}) {
    if (nextRevision === undefined || nextRevision === null) throw new Error("spatial scene requires a static revision");
    if (typeof staticRecords !== "function" || !Array.isArray(currentStaticRecords) || !Array.isArray(dynamicRecords))
      throw new Error("spatial scene requires a lazy static supplier and current/static dynamic arrays");
    pending?.cancel();
    const expectedGeneration = generation, staticRebuilt = !scene || nextRevision !== revision, dynamicCount = dynamicRecords.length;
    let status = "pending", prepared = null, iterator = steps();
    const work = { advances: 0, operations: 0, preparationMs: 0, maxAdvanceMs: 0, phases: {} };
    tasks.started++;
    function* steps() {
      const started = preparationClock();
      const nextScene = staticRebuilt
        ? (scene ? yield* scene.withStaticRecordsSteps(staticRecords())
          : yield* prepareSpatialDrawSceneSteps(staticRecords(), { projection, clock: preparationClock }))
        : scene;
      const staticFinished = preparationClock();
      const result = yield* nextScene.stageCompile(dynamicRecords, currentStaticRecords);
      const reused = !staticRebuilt && result.metrics.topologyReuses > 0;
      let physicalOrderChanged = !reused && records.length !== result.records.length, displayOrderChanged = physicalOrderChanged;
      if (!reused && !physicalOrderChanged) for (let index = 0; index < records.length; index++) {
        if (keyOf(records[index]) !== keyOf(result.records[index])) physicalOrderChanged = true;
        if (!sameDisplay(records[index], result.records[index])) displayOrderChanged = true;
        yield "publication-check";
      }
      if (reused) for (const { previous, current } of result.recordChanges) {
        if (!sameDisplay(previous, current)) displayOrderChanged = true;
        yield "publication-check";
      }
      displayOrderChanged ||= physicalOrderChanged;
      const metrics = Object.freeze({ ...result.metrics, staticRebuilt,
        staticFaceComparisons: staticRebuilt ? nextScene.metrics.faceComparisons : 0,
        staticWork: staticRebuilt ? nextScene.metrics : null });
      return { nextScene, result, staticMs: staticFinished - started,
        dynamicMs: preparationClock() - staticFinished,
        view: Object.freeze({ records: result.records, stagedRecords: result.stagedRecords, recordChanges: result.recordChanges,
          physicalOrderChanged, displayOrderChanged, applyOrderRequired: staticRebuilt || physicalOrderChanged || displayOrderChanged,
          staticRebuilt, metrics }) };
    }
    function release() {
      iterator?.return(); iterator = null; prepared = null;
      staticRecords = null; currentStaticRecords = null; dynamicRecords = null;
      if (pending === task) pending = null;
    }
    function cancel() {
      if (status !== "pending" && status !== "ready") return false;
      status = "cancelled"; tasks.cancelled++; tasks.cancelledPreparationMs += work.preparationMs;
      release(); return true;
    }
    const task = Object.freeze({
      get status() { return status; },
      get result() { return prepared?.view ?? null; },
      metrics: () => Object.freeze({ ...work, status, phases: Object.freeze({ ...work.phases }) }),
      advance({ maxOperations = 2048, deadline = Infinity } = {}) {
        if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 || (deadline !== Infinity && !Number.isFinite(deadline)))
          throw new Error("spatial preparation requires a positive operation budget and finite deadline");
        if (expectedGeneration !== generation) cancel();
        if (status !== "pending") return Object.freeze({ status, operations: 0, result: prepared?.view ?? null });
        const started = clock(); sliceStarted = started;
        let operations = 0;
        try {
          while (operations < maxOperations && clock() < deadline) {
            const next = iterator.next();
            if (next.done) {
              prepared = next.value; iterator = null; status = "ready"; tasks.ready++; break;
            }
            operations++; work.phases[next.value] = (work.phases[next.value] ?? 0) + 1;
          }
        } catch (error) {
          status = "failed"; tasks.failed++; release(); throw error;
        } finally {
          const elapsed = Math.max(0, clock() - started); preparationMs += elapsed; sliceStarted = null;
          work.advances++; work.operations += operations; work.preparationMs += elapsed; work.maxAdvanceMs = Math.max(work.maxAdvanceMs, elapsed);
          tasks.advances++; tasks.operations += operations; tasks.preparationMs += elapsed; tasks.maxAdvanceMs = Math.max(tasks.maxAdvanceMs, elapsed);
        }
        return Object.freeze({ status, operations, result: prepared?.view ?? null });
      },
      cancel,
      // The owner alone accepts publication; callers cannot publish a compiler
      // result against a different owner or a superseded generation.
      publish() {
        if (expectedGeneration !== generation) cancel();
        if (pending !== task || status !== "ready") throw new Error("spatial scene preparation is not ready or is stale");
        const started = clock(), { nextScene, result, view, staticMs, dynamicMs } = prepared;
        result.publish(); records = result.records; scene = nextScene; revision = nextRevision; generation++;
        counts.compile++;
        if (staticRebuilt) {
          counts.staticRebuild++; counts.staticPreparedNew += scene.metrics.preparedNew; counts.staticPreparedReused += scene.metrics.preparedReused;
          counts.staticRelationsReused += scene.metrics.relationsReused; counts.topologyBuilds += scene.metrics.topologyBuilds;
          counts.staticFaceComparisons += scene.metrics.faceComparisons; counts.candidateVisits += scene.metrics.candidateVisits;
          measured("staticRebuildMs", staticMs);
        }
        counts.dynamicInsert += dynamicCount; counts.dynamicFaceComparisons += result.metrics.faceComparisons;
        counts.candidateVisits += result.metrics.candidateVisits; counts.topologyBuilds += result.metrics.topologyBuilds;
        counts.topologyReuses += result.metrics.topologyReuses;
        measured("dynamicInsertMs", dynamicMs); measured(result.metrics.topologyReuses ? "orderReuseMs" : "topologyUpdateMs", dynamicMs);
        times.compileMs += work.preparationMs; latestWork = view.metrics;
        tasks.published++; tasks.publicationMs += Math.max(0, clock() - started);
        status = "published"; release();
        const { stagedRecords: _stagedRecords, ...publishedView } = view;
        return Object.freeze(publishedView);
      },
    });
    pending = task;
    return task;
  }

  return Object.freeze({
    prepare,
    publish(task) {
      if (pending !== task) throw new Error("spatial scene preparation belongs to another owner or is stale");
      return task.publish();
    },
    // Reference/test convenience. Production schedules advance across frames.
    update(options) {
      const task = prepare(options);
      while (task.status === "pending") task.advance({ maxOperations: Number.MAX_SAFE_INTEGER });
      return task.publish();
    },
    pick(point) { return pickVoxelDrawRecord(records, point); },
    measureApplyOrder(apply) {
      if (typeof apply !== "function") throw new Error("spatial scene apply callback required");
      const started = clock(), result = apply(); counts.applyOrder++; measured("applyOrderMs", clock() - started); return result;
    },
    metrics: () => Object.freeze({ counts: Object.freeze({ ...counts }), times: Object.freeze({ ...times }), tasks: Object.freeze({ ...tasks }),
      latest: latestWork,
      retained: scene?.retained() ?? Object.freeze({ staticRecords: 0, staticRelations: 0, staticBins: 0, dynamicRecords: 0, currentRecords: 0 }),
      samples: Object.freeze(Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, Object.freeze([...values])]))),
    }),
    reset() { pending?.cancel(); generation++; revision = undefined; scene = undefined; records = []; latestWork = null; },
  });
}
