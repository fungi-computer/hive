import {
  TERRAIN_REGION_HEIGHT,
  TERRAIN_REGION_EDGE as REGION_EDGE,
  terrainRegionLayout,
  validateTerrainMaterialPatch,
  freezeTerrainMaterialPatch,
} from "../runtime/terrain-region-materials.js";
export const TERRAIN_REGION_CACHE_CAPACITY = 256;
export const TERRAIN_REGION_CACHE_BYTES = 32 * 1024 * 1024;
const keyOf = (key) => key.join(",");
function checkedKeys(keys) {
  if (!Array.isArray(keys))
    throw new Error("terrain region demand must be an array");
  const seen = new Set();
  return keys.map((key) => {
    if (
      !Array.isArray(key) ||
      key.length !== 2 ||
      key.some(
        (value) =>
          !Number.isInteger(value) || value < -2147483648 || value > 2147483647,
      )
    )
      throw new Error("terrain region key must contain two signed integers");
    const id = keyOf(key);
    if (seen.has(id)) throw new Error("duplicate terrain region demand");
    seen.add(id);
    return { id, key: Object.freeze([...key]) };
  });
}

/** Bounded disposable region subscriptions. Complete patches publish separately;
 * no camera, cover mutation or voxel exposure authority lives in this cache. */
export function createTerrainRegionCache({
  runtime,
  capacity = TERRAIN_REGION_CACHE_CAPACITY,
  maxBytes = TERRAIN_REGION_CACHE_BYTES,
  onChange,
  clock = () => performance.now(),
} = {}) {
  if (typeof runtime?.terrainRegions !== "function")
    throw new Error("terrain region cache requires a runtime region reader");
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > TERRAIN_REGION_CACHE_CAPACITY ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > TERRAIN_REGION_CACHE_BYTES
  )
    throw new Error("invalid terrain region cache budget");
  const cache = new Map(),
    encoder = new TextEncoder();
  let epoch,
    revision,
    baseline,
    level,
    demand = [],
    visible = new Set(),
    stream,
    disposed = false;
  let bytes = 0,
    sequence = 0,
    publication = 0,
    budget = false,
    failure,
    cachedSnapshot,
    notification = false;
  let retryAt,
    retries = 0;
  let requests = 0,
    cancelled = 0,
    receivedPatches = 0,
    receivedBytes = 0,
    startedAt,
    firstPatchMs;
  function changed(notify = false) {
    cachedSnapshot = undefined;
    if (!notify || notification) return;
    notification = true;
    queueMicrotask(() => {
      notification = false;
      if (!disposed) onChange?.();
    });
  }
  function cancel(count = true) {
    const previous = stream;
    stream = undefined;
    if (previous) {
      if (count) cancelled++;
      previous.cancel?.();
    }
  }
  function remove(id) {
    const entry = cache.get(id);
    if (entry) {
      bytes -= entry.bytes;
      cache.delete(id);
    }
  }
  function drop() {
    cache.clear();
    bytes = 0;
    publication++;
  }
  function evict(requiredBytes = 0, requiredCount = 0) {
    const wanted = new Set(demand.map((item) => item.id));
    for (const id of cache.keys()) {
      if (
        bytes + requiredBytes <= maxBytes &&
        cache.size + requiredCount <= capacity
      )
        break;
      if (!wanted.has(id)) remove(id);
    }
    return (
      bytes + requiredBytes <= maxBytes &&
      cache.size + requiredCount <= capacity
    );
  }
  function clear() {
    cancel();
    drop();
    epoch = revision = baseline = level = undefined;
    demand = [];
    visible.clear();
    budget = false;
    failure = undefined;
    retryAt = undefined;
    retries = 0;
    startedAt = firstPatchMs = undefined;
    changed();
  }
  function updateFrame(frame) {
    if (disposed) throw new Error("terrain region cache is disposed");
    if (!frame?.terrain) {
      clear();
      return;
    }
    const next = frame.terrain;
    if (
      !Number.isSafeInteger(frame.epoch) ||
      frame.epoch < 0 ||
      !Number.isSafeInteger(next.revision) ||
      next.revision < 0 ||
      next.baseline?.protocolVersion !== 5
    )
      throw new Error("invalid terrain region baseline");
    const newWorld = epoch !== frame.epoch;
    if (newWorld || revision !== next.revision) {
      cancel();
      failure = undefined;
      retryAt = undefined;
      retries = 0;
      budget = false;
      if (newWorld || next.changes?.kind !== "changed-columns") drop();
      else {
        if (next.changes.revision !== next.revision)
          throw new Error("invalid terrain region change revision");
        const dirty = new Set();
        for (const [x, z] of next.changes.columns)
          for (let dx = -1; dx <= 1; dx++)
            for (let dz = -1; dz <= 1; dz++)
              dirty.add(
                `${Math.floor((x + dx) / REGION_EDGE)},${Math.floor((z + dz) / REGION_EDGE)}`,
              );
        for (const [id, entry] of cache)
          if (dirty.has(entry.patch.key.slice(0, 2).join(","))) remove(id);
        publication++;
      }
      if (newWorld) {
        demand = [];
        visible.clear();
        level = undefined;
      }
      startedAt = firstPatchMs = undefined;
    }
    epoch = frame.epoch;
    revision = next.revision;
    baseline = next.baseline;
    changed();
  }
  function receive(current, event) {
    if (disposed || stream !== current) return;
    const request = current.request;
    if (event.requestId !== request.requestId) return;
    if (
      event.kind !== "stale" &&
      (event.epoch !== epoch || event.terrainRevision !== revision)
    )
      return;
    if (event.kind === "patch") {
      const id = keyOf(event.patch.key);
      if (!current.ids.has(id)) {
        failure = "unrequested terrain region";
        cancel();
        changed(true);
        return;
      }
      try {
        validateTerrainMaterialPatch(event.patch, baseline);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        cancel();
        changed(true);
        return;
      }
      const encoded = JSON.stringify(event.patch);
      if (current.received.has(id)) {
        if (JSON.stringify(cache.get(id)?.patch) !== encoded) {
          failure = "conflicting duplicate terrain region";
          cancel();
          changed(true);
        }
        return;
      }
      const size = encoder.encode(encoded).byteLength;
      if (size > 512 * 1024 || !evict(size, 1)) {
        budget = true;
        failure = "terrain region byte budget exceeded";
        cancel();
        changed(true);
        return;
      }
      current.received.add(id);
      cache.set(id, {
        patch: freezeTerrainMaterialPatch(event.patch),
        bytes: size,
      });
      bytes += size;
      receivedPatches++;
      receivedBytes += size;
      firstPatchMs ??= Math.max(0, clock() - startedAt);
      publication++;
      changed(true);
      return;
    }
    if (event.kind === "complete") {
      if (current.received.size !== current.ids.size)
        failure = "incomplete terrain region stream";
    } else if (event.kind === "stale") {
      // Only an authoritative observation can install a different world/revision.
      failure = "stale terrain region observation";
      drop();
    } else if (event.kind === "unavailable") {
      failure = event.reason;
      if (retries < 3) retryAt = clock() + [500, 1500, 4000][retries++];
    } else {
      failure = "invalid terrain region event";
    }
    cancel(false);
    changed(true);
  }
  function service() {
    if (disposed || stream || budget || !baseline || level === undefined)
      return;
    if (failure) {
      if (retryAt === undefined || clock() < retryAt) return;
      failure = undefined;
      retryAt = undefined;
    }
    const missing = demand.filter((item) => !cache.has(item.id));
    if (!missing.length) return;
    startedAt ??= clock();
    const request = {
      requestId: ++sequence,
      epoch,
      terrainRevision: revision,
      regions: missing.map((item) => [...item.key]),
    };
    const current = {
      request,
      ids: new Set(missing.map((item) => item.id)),
      received: new Set(),
      visible: new Set(visible),
      cancel: undefined,
    };
    stream = current;
    requests++;
    changed();
    try {
      const stop = runtime.terrainRegions(request, (event) =>
        receive(current, event),
      );
      if (typeof stop !== "function")
        throw new Error("terrain region reader must return cancellation");
      if (stream === current) current.cancel = stop;
      else stop();
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      cancel();
      changed(true);
    }
  }
  function expandDemand(regions, visibleRegions, cut, vertical) {
    if (!baseline) return { next: [], nextVisible: new Set() };
    const world = baseline.bounds;
    // Full short worlds are cheap enough to retain once. Tall worlds request
    // explicit bounded slabs, with no inference that unrequested height is air.
    let minY = world.minY,
      maxY = world.maxY;
    if (vertical) {
      if (
        !Number.isSafeInteger(vertical.minY) ||
        !Number.isSafeInteger(vertical.maxY) ||
        vertical.minY >= vertical.maxY
      )
        throw new Error("invalid terrain vertical demand");
      minY = Math.max(world.minY, vertical.minY);
      maxY = Math.min(world.maxY, vertical.maxY);
    } else if (world.maxY - world.minY > TERRAIN_REGION_HEIGHT)
      maxY = Math.min(world.maxY, cut + 1);
    if (minY >= maxY) return { next: [], nextVisible: new Set() };
    const first = Math.floor((minY - world.minY) / TERRAIN_REGION_HEIGHT),
      last = Math.floor((maxY - 1 - world.minY) / TERRAIN_REGION_HEIGHT);
    const next = [],
      nextVisible = new Set(),
      shown = new Set(visibleRegions.map((item) => item.id));
    // Refuse unsupported work before allocating or enumerating huge vertical
    // worlds. The limit applies to slabs, not merely horizontal coordinates.
    if (regions.length * (last - first + 1) > capacity)
      return { next: [], nextVisible, budget: true };
    for (const item of regions)
      for (let slab = first; slab <= last; slab++) {
        const key = Object.freeze([...item.key, slab]);
        if (!terrainRegionLayout(world, key)) continue;
        const id = keyOf(key);
        next.push({ id, key });
        if (shown.has(item.id)) nextVisible.add(id);
      }
    return { next, nextVisible };
  }
  function updateDemand({
    regions,
    visibleRegions = regions,
    level: nextLevel,
    verticalCoverage: nextVertical,
  }) {
    if (disposed) throw new Error("terrain region cache is disposed");
    if (!Number.isSafeInteger(nextLevel))
      throw new Error("invalid terrain region cut");
    const horizontal = checkedKeys(regions),
      visibleHorizontal = checkedKeys(visibleRegions);
    const horizontalIds = new Set(horizontal.map((item) => item.id));
    if (visibleHorizontal.some((item) => !horizontalIds.has(item.id)))
      throw new Error("visible regions must belong to prepared demand");
    const expanded = expandDemand(
      horizontal,
      visibleHorizontal,
      nextLevel,
      nextVertical,
    );
    const { next, nextVisible } = expanded,
      ids = new Set(next.map((item) => item.id));
    const membershipChanged =
      demand.length !== next.length || demand.some((item) => !ids.has(item.id));
    const cutChanged = level !== nextLevel;
    // A cut only changes the local projection. Retained material and in-flight
    // reads survive whenever required coverage is the same.
    if (membershipChanged) {
      cancel();
      failure = undefined;
      retryAt = undefined;
      retries = 0;
      budget = false;
    } else if (
      stream &&
      [...nextVisible].some((id) => !cache.has(id) && !stream.visible.has(id))
    )
      cancel();
    if (membershipChanged || cutChanged) publication++;
    level = nextLevel;
    demand = next;
    visible = nextVisible;
    if (expanded.budget) {
      cancel();
      budget = true;
    } else if (budget && !failure) budget = false;
    for (const item of demand) {
      const entry = cache.get(item.id);
      if (entry) {
        cache.delete(item.id);
        cache.set(item.id, entry);
      }
    }
    evict();
    changed();
    service();
  }
  function snapshot() {
    if (cachedSnapshot) return cachedSnapshot;
    const coverage = demand.map((item) =>
      Object.freeze({
        key: item.key,
        visible: visible.has(item.id),
        status: cache.has(item.id)
          ? "ready"
          : stream?.ids.has(item.id)
            ? "loading"
            : "unknown",
      }),
    );
    const patches = demand
      .filter((item) => cache.has(item.id))
      .sort(
        (a, b) =>
          a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2],
      )
      .map((item) => cache.get(item.id).patch);
    return (cachedSnapshot = Object.freeze({
      epoch,
      terrainRevision: revision,
      level,
      baseline,
      publication,
      capacity,
      maxBytes,
      retainedBytes: bytes,
      cachedRegions: cache.size,
      pending: Boolean(stream),
      viewBudget: budget,
      error: failure,
      visibleComplete:
        !budget &&
        coverage
          .filter((item) => item.visible)
          .every((item) => item.status === "ready"),
      demandComplete:
        !budget && coverage.every((item) => item.status === "ready"),
      coverage: Object.freeze(coverage),
      patches: Object.freeze(patches),
      loading: Object.freeze({
        requests,
        cancelled,
        receivedPatches,
        receivedBytes,
        retries,
        retryAt: retryAt ?? null,
        firstPatchMs: firstPatchMs ?? null,
      }),
    }));
  }
  function dispose() {
    if (disposed) return;
    clear();
    disposed = true;
  }
  return Object.freeze({ updateFrame, updateDemand, snapshot, clear, dispose });
}
