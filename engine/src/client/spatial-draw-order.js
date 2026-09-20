import { compareOrderingPlanes, prepareOrderingProxy, polygonContains } from "./plane-order.js";

const EPSILON = 1e-7;
const keyOf = record => `${record.id}\u0000${record.part ?? ""}`;
const boundsOf = points => ({
  left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
  top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)),
});
const overlap = (a, b) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
const finite = p => p && [p.x, p.y, p.z].every(Number.isFinite);

function checkedFace(points) {
  if(!Array.isArray(points)||points.length<3||!points.every(finite))throw new Error("spatial draw face requires finite corners");
  const a=points[0];let normal;
  for(let i=1;i<points.length-1&&!normal;i++) {
    const b=points[i],c=points[i+1],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
    const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(n.x,n.y,n.z);
    if(length>EPSILON)normal={x:n.x/length,y:n.y/length,z:n.z/length};
  }
  if(!normal)throw new Error("spatial draw face is degenerate");
  if(points.some(p=>Math.abs((p.x-a.x)*normal.x+(p.y-a.y)*normal.y+(p.z-a.z)*normal.z)>EPSILON))
    throw new Error("spatial draw face must be planar");
  for(let i=0;i<points.length;i++) {
    const p=points[i],q=points[(i+1)%points.length],r=points[(i+2)%points.length];
    const u={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z},v={x:r.x-q.x,y:r.y-q.y,z:r.z-q.z};
    if((u.y*v.z-u.z*v.y)*normal.x+(u.z*v.x-u.x*v.z)*normal.y+(u.x*v.y-u.y*v.x)*normal.z < -EPSILON)
      throw new Error("spatial draw face must be convex and ordered");
  }
  return points;
}

/** Visual geometry only. A volume is a conservative, authored visual piece;
 * intersecting pieces must be refined, never repaired by an arbitrary depth key.
 * Faces are actual planar polygons (terrain, sloped surfaces, declared curtains).
 */
function geometryFaces(geometry, direction) {
  if (geometry?.kind === "face") {
    return [checkedFace(geometry.points)];
  }
  if (geometry?.kind !== "volume" || !finite(geometry.min) || !finite(geometry.max) ||
      ["x", "y", "z"].some(axis => geometry.min[axis] >= geometry.max[axis]))
    throw new Error("spatial draw requires a positive visual volume or planar face");
  const { min: a, max: b } = geometry, faces = [];
  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(direction[axis]) <= EPSILON) continue;
    const [u, v] = ["x", "y", "z"].filter(value => value !== axis);
    const value = direction[axis] < 0 ? b[axis] : a[axis];
    faces.push([[a[u], a[v]], [b[u], a[v]], [b[u], b[v]], [a[u], b[v]]]
      .map(([x, y]) => ({ [axis]: value, [u]: x, [v]: y })));
  }
  return faces;
}

function prepare(record, projection) {
  const key = keyOf(record);
  if (record.id == null) throw new Error("spatial draw record identity required");
  if(record.surfaceOrder!=null&&!Number.isSafeInteger(record.surfaceOrder))throw new Error("spatial draw surface order must be an integer");
  if(record.supportY!=null&&!Number.isFinite(record.supportY))throw new Error("spatial draw support height must be finite");
  const faces = geometryFaces(record.orderGeometry, projection.direction).map(points => {
    const screenBounds = boundsOf(points.map(point => projection.project(point)));
    return { bounds:screenBounds, orderingProxy: prepareOrderingProxy({ id: key, planarCorners: points, footprint: points, screenBounds }, projection) };
  }).filter(face => face.orderingProxy);
  if (!faces.length) throw new Error(`spatial draw geometry is edge-on: ${key}`);
  return { record, key, faces, bounds: boundsOf(faces.flatMap(face => face.orderingProxy.polygon)) };
}

/** Resolve a relationship over its projected overlap, not at a pivot. Each
 * convex volume's visible faces partition its projected silhouette. Opposite
 * signs therefore mean its representation cannot be emitted as one image.
 */
function faceRelation(a, b, projection, counters) {
  let before = false, after = false, coplanar = false;
  for (const left of a.faces) for (const right of b.faces) {
    if(!overlap(left.bounds,right.bounds))continue;
    counters.faceComparisons++;
    const compared = compareOrderingPlanes(left, right, projection);
    if (compared.kind === "interleaving") return "interleaving";
    if (compared.kind === "tie") coplanar = true;
    if (compared.kind !== "ordered") continue;
    if (compared.edge[0] === left) before = true;
    else after = true;
    if (before && after) return "interleaving";
  }
  if (before) return "before";
  if (after) return "after";
  if (coplanar) {
    const difference = (a.record.surfaceOrder ?? 0) - (b.record.surfaceOrder ?? 0);
    if (difference) return difference < 0 ? "before" : "after";
  }
  return "independent";
}

function relation(a,b,projection,counters) {
  if(b.supportKey===a.key)return "before";
  if(a.supportKey===b.key)return "after";
  // The checked bake partitions one composite into disjoint RGBA pixels. Its
  // siblings never occlude one another; each still relates to outside objects.
  if(a.record.compositePartition != null && a.record.compositePartition === b.record.compositePartition)return "independent";
  // A supported picture includes contact ink/shadows, even if the source mesh
  // extends slightly below its authored datum. All appearance on that support
  // plane precedes the supported picture. This relation is content-independent.
  const supportedBy = (surface, object) => surface.record.orderGeometry.kind === "face" &&
    Number.isFinite(object.record.supportY) &&
    surface.record.orderGeometry.points.every(point=>Math.abs(point.y-object.record.supportY)<=EPSILON);
  if(supportedBy(a,b))return "before";
  if(supportedBy(b,a))return "after";
  return faceRelation(a,b,projection,counters);
}

/** Small spatial bins bound candidate discovery. Coordinates are projected
 * geometry, never cropped to the viewport; pan cannot change a relationship.
 */
function binKeys(entry, binSize) {
  const x0 = Math.floor(entry.bounds.left / binSize), x1 = Math.floor(entry.bounds.right / binSize);
  const y0 = Math.floor(entry.bounds.top / binSize), y1 = Math.floor(entry.bounds.bottom / binSize);
  if (![x0, x1, y0, y1].every(Number.isSafeInteger) ||
      (x1 - x0 + 1) * (y1 - y0 + 1) > 4096)
    throw new Error(`spatial draw piece exceeds bin budget: ${entry.key}`);
  const keys = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`);
  return keys;
}

function createSpatialIndex(binSize) {
  const bins = new Map();
  return {
    add(entry) {
      for (const key of binKeys(entry, binSize)) {
        const bin = bins.get(key) ?? [];
        bin.push(entry); bins.set(key, bin);
      }
    },
    candidates(entry, counters) {
      const seen = new Set(), candidates = [];
      for (const key of binKeys(entry, binSize)) for (const other of bins.get(key) ?? []) {
        if (seen.has(other.key)) continue;
        seen.add(other.key); counters.candidateVisits++;
        if (overlap(entry.bounds, other.bounds)) candidates.push(other);
      }
      return candidates;
    },
    get size() { return bins.size; },
  };
}

function heapPush(heap, value) {
  let index = heap.length; heap.push(value);
  while (index) {
    const parent = (index - 1) >> 1;
    if (heap[parent] <= value) break;
    heap[index] = heap[parent]; index = parent;
  }
  heap[index] = value;
}
function heapPop(heap) {
  const first = heap[0], last = heap.pop();
  if (!heap.length) return first;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1] < heap[child]) child++;
    if (heap[child] >= last) break;
    heap[index] = heap[child]; index = child;
  }
  heap[index] = last; return first;
}

const compareEntries = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
const countersFor = records => ({ records, candidateVisits: 0, faceComparisons: 0, bins: 0, edges: 0 });

function prepareEntries(records, projection) {
  if (!Array.isArray(records)) throw new Error("spatial draw records must be an array");
  const entries = records.map(record => prepare(record, projection)).sort(compareEntries);
  if (new Set(entries.map(entry => entry.key)).size !== entries.length)
    throw new Error("duplicate spatial draw identity");
  return entries;
}

function mergeEntries(statics, dynamics, refreshedRecords) {
  const entries = [];
  let left = 0, right = 0;
  while (left < statics.length || right < dynamics.length) {
    if (right < dynamics.length && (left === statics.length || dynamics[right].key < statics[left].key)) {
      entries.push(dynamics[right++]);
    } else {
      const entry = statics[left++], record = refreshedRecords.get(entry.key);
      entries.push(record ? { ...entry, record } : entry);
    }
  }
  return entries;
}

function resolveSupports(entries, byKey, projection) {
  for (const entry of entries) {
    const support = entry.record.support;
    if (!support) continue;
    const key = keyOf(support), surface = byKey.get(key), points = surface?.record.contactSurface;
    if (key === entry.key) throw new Error("spatial draw self-support is invalid");
    if (!points || !finite(support.point)) throw new Error(`spatial draw support geometry missing: ${entry.key}`);
    checkedFace(points);
    const proxy = prepareOrderingProxy({ id: key, planarCorners: points, footprint: points,
      screenBounds: boundsOf(points.map(point => projection.project(point))) }, projection);
    const n = proxy?.normal, p = support.point;
    if (!proxy || Math.abs(n.x*p.x + n.y*p.y + n.z*p.z - proxy.constant) > EPSILON ||
        !polygonContains(proxy.polygon, projection.project(p)))
      throw new Error(`spatial draw contact outside its support: ${entry.key}`);
    entry.supportKey = key;
  }
}

function addRelation(a, b, projection, counters, edges) {
  // Canonical argument order preserves the full compiler's tie semantics.
  if (a.key > b.key) [a, b] = [b, a];
  const result = relation(a, b, projection, counters);
  if (result === "interleaving") {
    const error = new Error(`spatial draw pieces interleave: ${a.key} / ${b.key}`);
    error.pieces = [a.record, b.record]; throw error;
  }
  if (result === "independent") return;
  edges.push(result === "before" ? [a.key, b.key] : [b.key, a.key]);
}

function orderGraph(entries, relations, counters) {
  const indices = new Map(entries.map((entry, index) => [entry.key, index]));
  const edges = entries.map(() => new Set()), incoming = new Uint32Array(entries.length), unique = [];
  for (const [fromKey, toKey] of relations) {
    const from = indices.get(fromKey), to = indices.get(toKey);
    if (edges[from].has(to)) continue;
    edges[from].add(to); incoming[to]++; unique.push([fromKey, toKey]);
  }
  const ready = [], output = [];
  incoming.forEach((count, index) => { if (!count) heapPush(ready, index); });
  while (ready.length) {
    const index = heapPop(ready); output.push(entries[index].record);
    for (const next of edges[index]) if (--incoming[next] === 0) heapPush(ready, next);
  }
  if (output.length !== entries.length) {
    const remaining = entries.filter((_, index) => incoming[index] > 0).map(value => value.key);
    throw new Error(`spatial draw cycle requires refined art pieces: ${remaining.join(" / ")}`);
  }
  counters.edges = unique.length;
  return Object.freeze({ records: Object.freeze(output), relations: Object.freeze(unique), metrics: Object.freeze(counters) });
}

// A retained revision covers every value used by geometry or contact ordering.
// Snapshot bytes also detect mutation of an existing geometry object on refresh.
function geometrySignature(record) {
  return JSON.stringify([record.orderGeometry, record.surfaceOrder ?? 0, record.supportY ?? null,
    record.compositePartition ?? null, record.support ?? null, record.contactSurface ?? null], (_key, value) => {
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error("spatial ordering data must be finite");
      return value;
    });
}

/** Retains checked static geometry, its spatial index and all static relations.
 * A static support must itself be static. Dynamic records may reference either
 * class. Geometry/contact changes require a new prepared scene; refreshes only
 * replace display, picking and other presentation references. The projection
 * and supplied geometry are immutable for this scene's lifetime.
 */
export function prepareSpatialDrawScene(staticRecords, { projection, binSize = 64 } = {}) {
  if (!projection?.project || !projection?.ray || !finite(projection.direction) ||
      !Number.isFinite(binSize) || !(binSize > 0))
    throw new Error("spatial draw records and orthographic projection required");
  const statics = prepareEntries(staticRecords, projection);
  const byKey = new Map(statics.map(entry => [entry.key, entry]));
  const signatures = new Map(statics.map(entry => [entry.key, geometrySignature(entry.record)]));
  resolveSupports(statics, byKey, projection);
  const staticCounters = countersFor(statics.length), staticIndex = createSpatialIndex(binSize), staticEdges = [];
  for (const entry of statics) {
    if (entry.supportKey) staticEdges.push([entry.supportKey, entry.key]);
    for (const other of staticIndex.candidates(entry, staticCounters))
      addRelation(other, entry, projection, staticCounters, staticEdges);
    staticIndex.add(entry);
  }
  staticCounters.bins = staticIndex.size;
  // Validate the static graph once, including cycles with no spatial overlap.
  const staticResult = orderGraph(statics, staticEdges, staticCounters);
  return Object.freeze({
    metrics: staticResult.metrics,
    compile(dynamicRecords = [], currentStaticRecords = []) {
      if (!Array.isArray(currentStaticRecords)) throw new Error("spatial static refresh requires an array");
      const refreshed = new Set();
      for (const record of currentStaticRecords) {
        const key = keyOf(record);
        if (refreshed.has(key)) throw new Error("duplicate spatial static refresh identity");
        refreshed.add(key);
        if (!byKey.has(key) || signatures.get(key) !== geometrySignature(record))
          throw new Error(`spatial static geometry changed without a revision: ${key}`);
      }
      const dynamics = prepareEntries(dynamicRecords, projection);
      for (const entry of dynamics) if (byKey.has(entry.key)) throw new Error("duplicate spatial draw identity");
      // Only commit refreshes after validating and ordering the entire update.
      const refreshedRecords = new Map(currentStaticRecords.map(record => [keyOf(record), record]));
      const entries = mergeEntries(statics, dynamics, refreshedRecords);
      resolveSupports(dynamics, new Map(entries.map(entry => [entry.key, entry])), projection);
      const counters = countersFor(entries.length), dynamicIndex = createSpatialIndex(binSize), relations = [...staticResult.relations];
      for (const entry of dynamics) {
        if (entry.supportKey) relations.push([entry.supportKey, entry.key]);
        for (const other of staticIndex.candidates(entry, counters)) addRelation(other, entry, projection, counters, relations);
        for (const other of dynamicIndex.candidates(entry, counters)) addRelation(other, entry, projection, counters, relations);
        dynamicIndex.add(entry);
      }
      counters.bins = staticIndex.size + dynamicIndex.size;
      const result = orderGraph(entries, relations, counters);
      for (const [key, record] of refreshedRecords) byKey.get(key).record = record;
      return result;
    },
  });
}

/** One client-side ordering core: checked geometry goes to one painter/picker
 * order. Stable IDs settle only unconstrained choices; no edge is discarded.
 */
export function compileSpatialDrawOrder(records, options = {}) {
  const scene = prepareSpatialDrawScene(records, options);
  const result = scene.compile();
  return Object.freeze({ ...result, metrics: scene.metrics });
}
