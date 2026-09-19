import { compileVoxelDrawStream, compareVoxelDrawDescriptors, voxelDrawDescriptors, voxelDrawRecordKey } from "./voxel-draw-stream.js";
import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";

function sameValues(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function mergeDescriptors(statics, dynamics) {
  const output = [];
  let left = 0, right = 0;
  while (left < statics.length && right < dynamics.length) {
    if (compareVoxelDrawDescriptors(dynamics[right], statics[left]) < 0) output.push(dynamics[right++]);
    else output.push(statics[left++]);
  }
  return output.concat(statics.slice(left), dynamics.slice(right));
}

function staticInsertionIndex(statics, dynamic) {
  let low = 0, high = statics.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compareVoxelDrawDescriptors(dynamic, statics[middle]) < 0) high = middle;
    else low = middle + 1;
  }
  return low;
}

function assertDynamicRecords(records) {
  for (const record of records) {
    if (record?.moving !== true || !["supported", "surface-mark"].includes(record?.attachment?.kind))
      throw new Error(`retained voxel stream dynamic record ${voxelDrawRecordKey(record)} must be a moving actor or world guide`);
  }
}

/**
 * Retains the compiled terrain/cover/water/static-structure stream and inserts
 * only moving supported actors on ordinary presentation frames. A changed cut,
 * viewport, terrain, water, cover, or static structure supplies a new explicit
 * static revision and rebuilds the complete static stream in this first slice.
 */
export function createVoxelDrawStreamOwner({ direction, verticalMetres, clock = () => performance.now(),
  verifyAgainstOracle = false } = {}) {
  if (!direction || !(verticalMetres > 0)) throw new Error("retained voxel draw stream requires projection and scale");
  let staticRevision, staticDescriptors = [], staticDescriptorIndexes = new Map();
  let retainedStaticRecords = [], retainedStaticIndexes = new Map();
  let previousDescriptors = [], previousRecords = [], previousPlacements = [];
  let recordIndexes = new Map(), dynamicIndexes = new Map();
  const counts = { compile: 0, staticRebuild: 0, dynamicInsert: 0, applyOrder: 0 };
  const times = { compileMs: 0, staticRebuildMs: 0, dynamicInsertMs: 0, applyOrderMs: 0 };
  const samples = { staticRebuildMs: [], dynamicInsertMs: [], applyOrderMs: [] };
  const recordSample = (name, value) => {
    samples[name].push(value);
    if (samples[name].length > 512) samples[name].shift();
  };

  function compile(records) {
    const started = clock();
    const result = compileVoxelDrawStream(records, { direction, verticalMetres });
    counts.compile++;
    times.compileMs += Math.max(0, clock() - started);
    return result;
  }

  function update({ revision, staticRecords, currentStaticRecords = [], dynamicRecords = [] } = {}) {
    if (revision === undefined || revision === null) throw new Error("retained voxel draw stream requires a static revision");
    if (typeof staticRecords !== "function" || !Array.isArray(currentStaticRecords) || !Array.isArray(dynamicRecords))
      throw new Error("retained voxel draw stream requires a lazy static supplier and current/static dynamic record arrays");
    assertDynamicRecords(dynamicRecords);
    const staticChanged = revision !== staticRevision;
    if (staticChanged) {
      const started = clock();
      const suppliedStaticRecords = staticRecords();
      if (!Array.isArray(suppliedStaticRecords)) throw new Error("retained voxel draw stream static supplier must return records");
      retainedStaticRecords = [...suppliedStaticRecords];
      staticDescriptors = voxelDrawDescriptors(compile(retainedStaticRecords));
      staticDescriptorIndexes = new Map(staticDescriptors.map((value, index) => [value.key, index]));
      retainedStaticIndexes = new Map(retainedStaticRecords.map((record, index) => [voxelDrawRecordKey(record), index]));
      staticRevision = revision;
      counts.staticRebuild++;
      const elapsed = Math.max(0, clock() - started);
      times.staticRebuildMs += elapsed;
      recordSample("staticRebuildMs", elapsed);
    }

    const started = clock();
    let refreshedDisplay = false;
    if (!staticChanged) for (const record of currentStaticRecords) {
      const key = voxelDrawRecordKey(record), descriptorIndex = staticDescriptorIndexes.get(key);
      const retainedIndex = retainedStaticIndexes.get(key);
      if (descriptorIndex === undefined || retainedIndex === undefined)
        throw new Error(`retained voxel stream static record ${key} changed without a revision`);
      const old = staticDescriptors[descriptorIndex];
      if (old.record.display !== record.display) refreshedDisplay = true;
      staticDescriptors[descriptorIndex] = Object.freeze({ ...old, record });
      retainedStaticRecords[retainedIndex] = record;
      const outputIndex = recordIndexes.get(key);
      if (outputIndex >= 0) {
        previousDescriptors[outputIndex] = staticDescriptors[descriptorIndex];
        previousRecords[outputIndex] = record;
      }
    }
    const supportOwners = new Set(dynamicRecords.map(record => record.attachment.support).filter(value => value != null).map(String));
    const supportParts = supportOwners.size ? retainedStaticRecords.filter(record =>
      record.attachment?.kind === "part" && supportOwners.has(String(record.attachment.owner))) : [];
    const dynamicDescriptors = dynamicRecords.length
      ? voxelDrawDescriptors(compile([...supportParts, ...dynamicRecords])).filter(value => value.record.moving === true)
      : [];
    counts.dynamicInsert += dynamicRecords.length;
    const placements = dynamicDescriptors.map((value, rank) =>
      `${value.key}\u0000${staticInsertionIndex(staticDescriptors, value)}\u0000${rank}`);
    const physicalOrderChanged = staticChanged || !sameValues(placements, previousPlacements);
    let displayOrderChanged = staticChanged || refreshedDisplay;
    if (physicalOrderChanged) {
      previousDescriptors = mergeDescriptors(staticDescriptors, dynamicDescriptors);
      previousRecords = previousDescriptors.map(value => value.record);
      recordIndexes = new Map(previousDescriptors.map((value, index) => [value.key, index]));
      dynamicIndexes = new Map();
      previousDescriptors.forEach((value, index) => {
        if (value.record.moving === true) dynamicIndexes.set(value.key, index);
      });
    } else {
      // Keep the retained array and replace only moving references. This keeps
      // picking on the current actor records without walking cached terrain.
      for (const value of dynamicDescriptors) {
        const index = dynamicIndexes.get(value.key);
        if (index === undefined) throw new Error(`retained voxel stream lost dynamic ${value.key}`);
        if (previousRecords[index].display !== value.record.display) displayOrderChanged = true;
        previousDescriptors[index] = value;
        previousRecords[index] = value.record;
      }
    }
    previousPlacements = placements;
    const dynamicElapsed = Math.max(0, clock() - started);
    times.dynamicInsertMs += dynamicElapsed;
    recordSample("dynamicInsertMs", dynamicElapsed);

    if (verifyAgainstOracle) {
      const oracle = compileVoxelDrawStream([...retainedStaticRecords, ...dynamicRecords], { direction, verticalMetres });
      const expected = oracle.records.map(voxelDrawRecordKey), actual = previousDescriptors.map(value => value.key);
      if (!sameValues(actual, expected))
        throw new Error(`retained voxel draw stream diverged from compiler oracle\nactual: ${actual.join(",")}\nexpected: ${expected.join(",")}`);
    }

    return Object.freeze({
      records: previousRecords,
      physicalOrderChanged,
      displayOrderChanged,
      applyOrderRequired: staticChanged || physicalOrderChanged || displayOrderChanged,
      staticRebuilt: staticChanged,
    });
  }

  function measureApplyOrder(apply) {
    if (typeof apply !== "function") throw new Error("retained voxel draw stream apply callback required");
    const started = clock();
    const result = apply();
    counts.applyOrder++;
    const elapsed = Math.max(0, clock() - started);
    times.applyOrderMs += elapsed;
    recordSample("applyOrderMs", elapsed);
    return result;
  }

  return Object.freeze({
    update,
    pick(point) { return pickVoxelDrawRecord(previousRecords, point); },
    measureApplyOrder,
    metrics: () => Object.freeze({ counts: Object.freeze({ ...counts }), times: Object.freeze({ ...times }),
      samples: Object.freeze(Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, Object.freeze([...values])]))),
    }),
    reset() {
      staticRevision = undefined; staticDescriptors = []; retainedStaticRecords = [];
      staticDescriptorIndexes = new Map(); retainedStaticIndexes = new Map();
      previousDescriptors = []; previousRecords = []; previousPlacements = [];
      recordIndexes = new Map(); dynamicIndexes = new Map();
    },
  });
}
