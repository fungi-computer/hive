const CHUNK_EDGE = 8;
const DEFAULT_CAPACITY = 2048;
const REQUEST_LIMIT = 8;
const MIN_I32 = -2147483648;
const MAX_I32 = 2147483647;

function checkedKey(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some(axis =>
    !Number.isInteger(axis) || axis < MIN_I32 || axis > MAX_I32))
    throw new Error("terrain chunk key must contain three signed integers");
  return Object.freeze([value[0], value[1], value[2]]);
}

function keyId(key) { return `${key[0]},${key[1]},${key[2]}`; }
function horizontalId(x, z) { return `${x},${z}`; }
function chunkAxis(cell) { return Math.floor(cell / CHUNK_EDGE); }

/**
 * Disposable derived-view state. Authoritative terrain remains in the runtime;
 * this owner only retains checked complete chunk replies for presentation.
 */
export function createTerrainChunkCache({ runtime, capacity = DEFAULT_CAPACITY } = {}) {
  if (!runtime || typeof runtime.terrainChunks !== "function")
    throw new Error("terrain chunk cache requires a runtime terrain reader");
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > DEFAULT_CAPACITY)
    throw new Error("terrain chunk cache capacity must be between 1 and 2048");

  const cache = new Map();
  let epoch;
  let revision;
  let baseline;
  let demand = [];
  let completeView = [];
  let inFlight;
  let requestSequence = 0;
  let disposed = false;
  let viewBudget = false;
  let cachedSnapshot;

  function reset(nextEpoch, nextRevision, nextBaseline) {
    cachedSnapshot = undefined;
    cache.clear();
    completeView = [];
    epoch = nextEpoch;
    revision = nextRevision;
    baseline = nextBaseline;
    viewBudget = false;
  }

  function evict() {
    const pinned = new Set(completeView);
    for (const id of cache.keys()) {
      if (cache.size <= capacity) break;
      if (!pinned.has(id)) cache.delete(id);
    }
    if (cache.size > capacity) throw new Error("terrain chunk cache pin budget exceeded");
  }

  function invalidate(changes) {
    if (!changes) { cache.clear(); completeView = []; return; }
    if (changes.kind === "full-reset") { cache.clear(); completeView = []; return; }
    if (changes.kind !== "changed-columns" || changes.revision !== revision)
      throw new Error("invalid terrain chunk change set");
    const dirty = new Set();
    for (const column of changes.columns) {
      if (!Array.isArray(column) || column.length !== 2 || column.some(value => !Number.isInteger(value)))
        throw new Error("invalid terrain changed column");
      // A dual-grid cover vertex depends on four cells, including diagonals.
      // Invalidate the full local 3×3 cell neighborhood across chunk seams.
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        dirty.add(horizontalId(chunkAxis(column[0] + dx), chunkAxis(column[1] + dz)));
    }
    let invalidatedView = false;
    for (const [id, entry] of cache) {
      if (!dirty.has(horizontalId(entry.key[0], entry.key[2]))) {
        entry.revision = revision;
        continue;
      }
      cache.delete(id);
      if (completeView.includes(id)) invalidatedView = true;
    }
    if (invalidatedView) completeView = [];
  }

  function updateFrame(frame) {
    cachedSnapshot = undefined;
    if (disposed) throw new Error("terrain chunk cache is disposed");
    if (!frame || !Number.isSafeInteger(frame.epoch) || frame.epoch < 0)
      throw new Error("invalid terrain frame epoch");
    const terrain = frame.terrain;
    if (!terrain) { reset(frame.epoch, undefined, undefined); return snapshot(); }
    if (!Number.isSafeInteger(terrain.revision) || terrain.revision < 0 ||
      !terrain.baseline || terrain.baseline.protocolVersion !== 3)
      throw new Error("invalid terrain frame baseline");
    if (epoch !== frame.epoch) reset(frame.epoch, terrain.revision, terrain.baseline);
    else if (revision !== terrain.revision) {
      revision = terrain.revision;
      baseline = terrain.baseline;
      invalidate(terrain.changes);
    } else baseline = terrain.baseline;
    return snapshot();
  }

  function updateDemand(rawKeys) {
    cachedSnapshot = undefined;
    if (disposed) throw new Error("terrain chunk cache is disposed");
    if (!Array.isArray(rawKeys)) throw new Error("terrain chunk demand must be an array");
    const seen = new Set();
    demand = rawKeys.map(checkedKey).map(key => {
      const id = keyId(key);
      if (seen.has(id)) throw new Error("terrain chunk demand contains a duplicate");
      seen.add(id);
      return { id, key };
    });
    viewBudget = demand.length > capacity;
    // The old view is useful while its replacement loads, but it cannot pin
    // enough chunks to make a valid new camera view impossible to request.
    const retained = new Set([...completeView, ...demand.map(item => item.id)]);
    if (retained.size > capacity) {
      completeView = [];
      for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id);
    }
    for (const item of demand) {
      const entry = cache.get(item.id);
      if (entry) { cache.delete(item.id); cache.set(item.id, entry); }
    }
    if (!viewBudget && demand.every(item => cache.has(item.id))) completeView = demand.map(item => item.id);
    return snapshot();
  }

  function snapshot() {
    if (cachedSnapshot) return cachedSnapshot;
    const loading = inFlight && inFlight.epoch === epoch && inFlight.terrainRevision === revision
      ? new Set(inFlight.ids) : new Set();
    return cachedSnapshot = Object.freeze({
      epoch, terrainRevision: revision, baseline, viewBudget, capacity,
      coverage: Object.freeze(demand.map(item => Object.freeze({ key: item.key,
        status: cache.has(item.id) ? "ready" : loading.has(item.id) ? "loading" : "unknown" }))),
      viewComplete: completeView.length > 0 && completeView.every(id => cache.has(id)),
      demandComplete: !viewBudget && demand.every(item => cache.has(item.id)),
      chunks: Object.freeze(completeView.map(id => cache.get(id)?.chunk).filter(Boolean)),
      cachedChunks: cache.size,
      pending: inFlight !== undefined,
    });
  }

  function service() {
    if (disposed) return Promise.reject(new Error("terrain chunk cache is disposed"));
    if (inFlight) return inFlight.promise;
    if (viewBudget || epoch === undefined || revision === undefined || baseline === undefined) return Promise.resolve(snapshot());
    const missing = demand.filter(item => !cache.has(item.id)).slice(0, REQUEST_LIMIT);
    if (missing.length === 0) {
      completeView = demand.map(item => item.id);
      cachedSnapshot = undefined;
      evict();
      return Promise.resolve(snapshot());
    }
    const identity = { requestId: ++requestSequence, epoch, terrainRevision: revision,
      chunks: missing.map(item => item.key) };
    const pending = { ...identity, ids: missing.map(item => item.id), promise: undefined };
    pending.promise = Promise.resolve(runtime.terrainChunks(identity)).then(reply => {
      if (disposed || inFlight !== pending) return snapshot();
      inFlight = undefined;
      cachedSnapshot = undefined;
      // A slow reply belongs to the request's world and revision, even when it
      // reports "stale". It cannot roll a newer accepted observation backward.
      if (identity.epoch !== epoch || identity.terrainRevision !== revision) return snapshot();
      if (reply.kind === "stale") {
        reset(reply.epoch, reply.terrainRevision, reply.epoch === identity.epoch ? baseline : undefined);
        return snapshot();
      }
      if (reply.kind === "unavailable") return snapshot();
      if (reply.requestId !== identity.requestId || reply.epoch !== epoch || reply.terrainRevision !== revision)
        return snapshot();
      for (const chunk of reply.chunks) {
        const id = keyId(chunk.key);
        if (!pending.ids.includes(id)) throw new Error("terrain chunk reply contains unrequested coverage");
        cache.delete(id);
        cache.set(id, { key: chunk.key, revision, chunk });
      }
      if (demand.every(item => cache.has(item.id))) completeView = demand.map(item => item.id);
      cachedSnapshot = undefined;
      evict();
      return snapshot();
    }, error => {
      if (inFlight === pending) { inFlight = undefined; cachedSnapshot = undefined; }
      throw error;
    });
    inFlight = pending;
    cachedSnapshot = undefined;
    return pending.promise;
  }

  function dispose() {
    disposed = true;
    cachedSnapshot = undefined;
    cache.clear(); demand = []; completeView = []; inFlight = undefined; baseline = undefined;
  }

  return Object.freeze({ updateFrame, updateDemand, snapshot, service, dispose });
}

export { CHUNK_EDGE as TERRAIN_CHUNK_EDGE, DEFAULT_CAPACITY as TERRAIN_CHUNK_CACHE_CAPACITY };
