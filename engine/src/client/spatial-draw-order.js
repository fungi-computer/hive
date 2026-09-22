import { compareOrderingPlanesSteps, prepareOrderingProxySteps, polygonContainsSteps, hullSteps, sortOrderingSteps, finishOrderingSteps } from "./plane-order.js";

const EPSILON = 1e-7;
const keyOf = record => `${record.id}\u0000${record.part ?? ""}`;
function* boundsOf(points) {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const point of points) {
    yield "geometry";
    bounds.left = Math.min(bounds.left, point.x); bounds.right = Math.max(bounds.right, point.x);
    bounds.top = Math.min(bounds.top, point.y); bounds.bottom = Math.max(bounds.bottom, point.y);
  }
  return bounds;
};
const overlap = (a, b) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
const finite = p => p && [p.x, p.y, p.z].every(Number.isFinite);

function* checkedFace(points) {
  if(!Array.isArray(points)||points.length<3)throw new Error("spatial draw face requires finite corners");
  for (const point of points) { if (!finite(point)) throw new Error("spatial draw face requires finite corners"); yield "geometry"; }
  const a=points[0];let normal;
  for(let i=1;i<points.length-1&&!normal;i++) {
    yield "geometry";
    const b=points[i],c=points[i+1],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
    const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(n.x,n.y,n.z);
    if(length>EPSILON)normal={x:n.x/length,y:n.y/length,z:n.z/length};
  }
  if(!normal)throw new Error("spatial draw face is degenerate");
  for (const p of points) {
    if(Math.abs((p.x-a.x)*normal.x+(p.y-a.y)*normal.y+(p.z-a.z)*normal.z)>EPSILON)
      throw new Error("spatial draw face must be planar");
    yield "geometry";
  }
  for(let i=0;i<points.length;i++) {
    yield "geometry";
    const p=points[i],q=points[(i+1)%points.length],r=points[(i+2)%points.length];
    const u={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z},v={x:r.x-q.x,y:r.y-q.y,z:r.z-q.z};
    if((u.y*v.z-u.z*v.y)*normal.x+(u.z*v.x-u.x*v.z)*normal.y+(u.x*v.y-u.y*v.x)*normal.z < -EPSILON)
      throw new Error("spatial draw face must be convex and ordered");
  }
  return points;
}

/** Visual geometry only. A volume is a conservative authored visual piece.
 * Faces are actual planar polygons; whole-picture ambiguity follows the
 * explicit approximate overlap/cycle policy below, without changing the art.
 */
function* geometryFaces(geometry, direction) {
  if (geometry?.kind === "face") {
    return [yield* checkedFace(geometry.points)];
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

function rectanglePolygon(bounds) {
  return [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }];
}

const checkedCardShapes = new WeakSet();
function* prepareCard(geometry, projection) {
  const { shape, offset, plane } = geometry;
  if (!offset || ![offset.x, offset.y].every(Number.isFinite) || !plane || !finite(plane.normal) ||
      !Number.isFinite(plane.constant) || plane.normal.y !== 0)
    throw new Error("spatial draw card requires finite placement and an upright plane");
  const length = Math.hypot(projection.direction.x, projection.direction.z);
  if (!(length > 0) || plane.normal.x !== projection.direction.x / length || plane.normal.z !== projection.direction.z / length)
    throw new Error("spatial draw card plane must match its view");
  if (!checkedCardShapes.has(shape)) {
    if (!shape || ![shape.width, shape.height].every(value => Number.isFinite(value) && value > 0) ||
        !Array.isArray(shape.points) || shape.points.length < 3)
      throw new Error("spatial draw card requires a convex checked silhouette");
    let area = 0;
    for (let i = 0; i < shape.points.length; i++) {
      const point = shape.points[i], next = shape.points[(i + 1) % shape.points.length];
      if (!point || ![point.x, point.y, next?.x, next?.y].every(Number.isFinite))
        throw new Error("spatial draw card requires a convex checked silhouette");
      area += point.x * next.y - point.y * next.x;
      for (const other of shape.points) {
        if ((next.x-point.x)*(other.y-point.y)-(next.y-point.y)*(other.x-point.x) < -EPSILON)
          throw new Error("spatial draw card requires a convex checked silhouette");
        yield "geometry";
      }
    }
    if (area / 2 <= EPSILON) throw new Error("spatial draw card requires a convex checked silhouette");
    const coverage = yield* checkedCoverage({ kind: "face", coverage: { offset: { x: 0, y: 0 }, rectangles: shape.rectangles } });
    if (!coverage) throw new Error("spatial draw card coverage must be inside its silhouette");
    for (const rectangle of coverage) for (const point of rectanglePolygon(rectangle)) {
      for (let i = 0; i < shape.points.length; i++) {
        const a = shape.points[i], b = shape.points[(i+1)%shape.points.length];
        if ((b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x) < -EPSILON)
          throw new Error("spatial draw card coverage must be inside its silhouette");
        yield "geometry";
      }
    }
    if (yield* frozenOrderingData(shape)) checkedCardShapes.add(shape);
  }
  const polygon = [];
  for (const point of shape.points) { polygon.push({ x: point.x + offset.x, y: point.y + offset.y }); yield "geometry"; }
  const bounds = yield* boundsOf(polygon);
  if (!Object.values(bounds).every(Number.isFinite)) throw new Error("spatial draw card placement exceeds finite coordinates");
  return { bounds, orderingProxy: { normal: plane.normal, constant: plane.constant, polygon } };
}

function* checkedCoverage(geometry) {
  const coverage = geometry.coverage;
  if (coverage == null) return null;
  if (geometry.kind !== "face" || !coverage.offset ||
      ![coverage.offset.x, coverage.offset.y].every(Number.isFinite) ||
      !Array.isArray(coverage.rectangles) || !coverage.rectangles.length)
    throw new Error("spatial draw coverage requires a face, finite offset and opaque rectangles");
  const rectangles = [];
  for (const rectangle of coverage.rectangles) {
    yield "geometry";
    if (!rectangle || ![rectangle.left, rectangle.top, rectangle.right, rectangle.bottom].every(Number.isFinite) ||
        rectangle.left >= rectangle.right || rectangle.top >= rectangle.bottom)
      throw new Error("spatial draw coverage rectangles must be finite and positive");
    const bounds = { left: rectangle.left + coverage.offset.x, right: rectangle.right + coverage.offset.x,
      top: rectangle.top + coverage.offset.y, bottom: rectangle.bottom + coverage.offset.y };
    if (!Object.values(bounds).every(Number.isFinite) || bounds.left >= bounds.right || bounds.top >= bounds.bottom)
      throw new Error("spatial draw coverage coordinates must be finite and positive");
    rectangles.push(bounds);
  }
  return rectangles;
}

// Rectangles use exactly the coarse face's plane. Refinement excludes empty
// image area; it never samples pixel centers or changes the depth equation.
function* preciseFaces(entry) {
  if (!entry.coverage) return entry.faces;
  if (entry.preciseFaces) return entry.preciseFaces;
  const geometry = entry.record.orderGeometry;
  const faces = [];
  for (const rectangle of geometry.kind === "card" ? geometry.shape.rectangles : entry.coverage) {
    const bounds = geometry.kind === "card" ? {
      left: rectangle.left + geometry.offset.x, right: rectangle.right + geometry.offset.x,
      top: rectangle.top + geometry.offset.y, bottom: rectangle.bottom + geometry.offset.y,
    } : rectangle;
    faces.push({ bounds, orderingProxy: { ...entry.faces[0].orderingProxy, polygon: rectanglePolygon(bounds) } });
    yield "geometry";
  }
  // Shared lazy immutable geometry is safe across pending/published snapshots.
  return entry.preciseFaces = faces;
}

function* prepare(record, projection) {
  const key = keyOf(record);
  if (record.id == null) throw new Error("spatial draw record identity required");
  if(record.surfaceOrder!=null&&!Number.isSafeInteger(record.surfaceOrder))throw new Error("spatial draw surface order must be an integer");
  if(record.supportY!=null&&!Number.isFinite(record.supportY))throw new Error("spatial draw support height must be finite");
  if (record.orderGeometry?.kind === "card") {
    const face = yield* prepareCard(record.orderGeometry, projection);
    return { record, key, faces: [face], coverage: true, bounds: face.bounds };
  }
  const faces = [];
  for (const points of yield* geometryFaces(record.orderGeometry, projection.direction)) {
    const projected = [];
    for (const point of points) { projected.push(projection.project(point)); yield "geometry"; }
    const screenBounds = yield* boundsOf(projected);
    const orderingProxy = yield* prepareOrderingProxySteps({ id: key, planarCorners: points, footprint: points, screenBounds }, projection);
    if (orderingProxy) faces.push({ bounds: screenBounds, orderingProxy });
  }
  if (!faces.length) throw new Error(`spatial draw geometry is edge-on: ${key}`);
  const coverage = yield* checkedCoverage(record.orderGeometry);
  if (coverage) {
    // Coverage includes outline texels that can extend beyond model geometry.
    // Keep coarse candidate discovery conservative over all authored ink.
    const face = faces[0];
    const corners = [...face.orderingProxy.polygon];
    for (const rectangle of coverage) { corners.push(...rectanglePolygon(rectangle)); yield "geometry"; }
    face.orderingProxy.polygon = yield* hullSteps(corners);
    face.bounds = yield* boundsOf(face.orderingProxy.polygon);
  }
  function* facePoints() { for (const face of faces) yield* face.orderingProxy.polygon; }
  let supportRange;
  if (record.orderGeometry.kind === "face") {
    supportRange = { min: Infinity, max: -Infinity };
    for (const point of record.orderGeometry.points) {
      supportRange.min = Math.min(supportRange.min, point.y); supportRange.max = Math.max(supportRange.max, point.y); yield "geometry";
    }
  }
  return { record, key, faces, coverage, supportRange, bounds: yield* boundsOf(facePoints()) };
}

// Equal-depth pictures still paint different pixels in opposite orders. Give
// their actual opaque overlap a pairwise tie, rather than relying on whichever
// node becomes topologically ready first as offscreen membership changes.
function* coplanarPictureRelation(a, b, projection, counters) {
  if (!a.coverage && !b.coverage) return "independent";
  const leftFaces = yield* preciseFaces(a), rightFaces = yield* preciseFaces(b);
  for (const left of leftFaces) for (const right of rightFaces) {
    yield "relation";
    if (!overlap(left.bounds, right.bounds)) continue;
    counters.faceComparisons++;
    counters.coverageFaceComparisons++;
    if ((yield* compareOrderingPlanesSteps(left, right, projection)).kind !== "disjoint")
      return a.key < b.key ? "before" : "after";
  }
  return "independent";
}

/** Resolve a relationship over its projected overlap, not at a pivot. Each
 * convex volume's visible faces partition its projected silhouette. Opposite
 * signs therefore mean its representation cannot be emitted as one image.
 */
function* faceRelation(a, b, projection, counters, precise = false) {
  if (a.faces.length === 1 && b.faces.length === 1 &&
      (a.record.surfaceOrder ?? 0) === (b.record.surfaceOrder ?? 0)) {
    const left = a.faces[0].orderingProxy, right = b.faces[0].orderingProxy;
    // Exact plane equality only: no epsilon that could erase a real depth
    // difference. Opposite polygon winding describes the same plane too.
    const ln = left.normal, rn = right.normal;
    const samePlane = (left.constant === right.constant && ln.x === rn.x && ln.y === rn.y && ln.z === rn.z) ||
      (left.constant === -right.constant && ln.x === -rn.x && ln.y === -rn.y && ln.z === -rn.z);
    if (samePlane) {
      if (!a.coverage && !b.coverage) counters.coplanarSkips++;
      return yield* coplanarPictureRelation(a, b, projection, counters);
    }
  }
  let before = false, after = false, coplanar = false;
  const leftFaces = precise ? yield* preciseFaces(a) : a.faces, rightFaces = precise ? yield* preciseFaces(b) : b.faces;
  for (const left of leftFaces) for (const right of rightFaces) {
    yield "relation";
    if(!overlap(left.bounds,right.bounds))continue;
    counters.faceComparisons++;
    if (precise) counters.coverageFaceComparisons++;
    const compared = yield* compareOrderingPlanesSteps(left, right, projection);
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
    return yield* coplanarPictureRelation(a, b, projection, counters);
  }
  return "independent";
}

function* relation(a,b,projection,counters) {
  if(b.supportKey===a.key)return "before";
  if(a.supportKey===b.key)return "after";
  // The checked bake partitions one composite into disjoint RGBA pixels. Its
  // siblings never occlude one another; each still relates to outside objects.
  if(a.record.compositePartition != null && a.record.compositePartition === b.record.compositePartition)return "independent";
  // A supported picture includes contact ink/shadows, even if the source mesh
  // extends slightly below its authored datum. All appearance on that support
  // plane precedes the supported picture. This relation is content-independent.
  const supportedBy = (surface, object) => surface.supportRange && Number.isFinite(object.record.supportY) &&
    Math.abs(surface.supportRange.min - object.record.supportY) <= EPSILON &&
    Math.abs(surface.supportRange.max - object.record.supportY) <= EPSILON;
  if(supportedBy(a,b))return "before";
  if(supportedBy(b,a))return "after";
  const coarse = yield* faceRelation(a,b,projection,counters);
  if (coarse !== "interleaving" || (!a.coverage && !b.coverage)) return coarse;
  counters.coverageRefinements++;
  return yield* faceRelation(a,b,projection,counters,true);
}

/** Small spatial bins bound candidate discovery. Coordinates are projected
 * geometry, never cropped to the viewport; pan cannot change a relationship.
 */
function* binKeys(entry, binSize) {
  const x0 = Math.floor(entry.bounds.left / binSize), x1 = Math.floor(entry.bounds.right / binSize);
  const y0 = Math.floor(entry.bounds.top / binSize), y1 = Math.floor(entry.bounds.bottom / binSize);
  if (![x0, x1, y0, y1].every(Number.isSafeInteger) ||
      (x1 - x0 + 1) * (y1 - y0 + 1) > 4096)
    throw new Error(`spatial draw piece exceeds bin budget: ${entry.key}`);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield `${x},${y}`;
}

function createSpatialIndex(binSize, bins = new Map()) {
  return {
    *add(entry) {
      for (const key of binKeys(entry, binSize)) {
        const bin = bins.get(key) ?? new Map();
        bin.set(entry.key, entry); bins.set(key, bin); yield "index";
      }
    },
    // Empty/duplicate visits yield too: a crowded bin cannot hide an unbounded
    // scan before producing its next candidate.
    *candidates(entry, counters) {
      const seen = new Set();
      for (const key of binKeys(entry, binSize)) {
        yield null;
        for (const other of bins.get(key)?.values() ?? []) {
          if (seen.has(other.key)) { yield null; continue; }
          seen.add(other.key); counters.candidateVisits++;
          yield overlap(entry.bounds, other.bounds) ? other : null;
        }
      }
    },
    *withChanges(previousEntries, changed, changedEntries) {
      const next = new Map(), copied = new Set();
      for (const [key, bin] of bins) { next.set(key, bin); yield "index"; }
      function* writable(key) {
        if (!copied.has(key)) {
          const bin = new Map();
          for (const [id, entry] of next.get(key) ?? []) { bin.set(id, entry); yield "index"; }
          next.set(key, bin); copied.add(key);
        }
        return next.get(key);
      }
      for (const id of changed) {
        yield "index";
        const old = previousEntries.get(id);
        if (!old) continue;
        for (const key of binKeys(old, binSize)) {
          const bin = yield* writable(key); bin.delete(id); yield "index";
        }
      }
      for (const entry of changedEntries) for (const key of binKeys(entry, binSize)) {
        const bin = yield* writable(key); bin.set(entry.key, entry); yield "index";
      }
      for (const key of copied) { if (!next.get(key).size) next.delete(key); yield "index"; }
      return createSpatialIndex(binSize, next);
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
const countersFor = records => ({ records, candidateVisits: 0, faceComparisons: 0, bins: 0, edges: 0,
  topologyBuilds: 0, topologyReuses: 0, coplanarSkips: 0, coverageRefinements: 0, coverageFaceComparisons: 0, approximateOverlaps: 0, approximateCycles: 0, preparedNew: 0, preparedReused: 0, relationsReused: 0, preparationMs: 0, candidateMs: 0, topologyMs: 0 });

function* mergeEntries(statics, dynamics, refreshedRecords) {
  const entries = [];
  let left = 0, right = 0;
  while (left < statics.length || right < dynamics.length) {
    yield "merge";
    if (right < dynamics.length && (left === statics.length || dynamics[right].key < statics[left].key)) {
      entries.push(dynamics[right++]);
    } else {
      const entry = statics[left++], record = refreshedRecords.get(entry.key);
      entries.push(record ? { ...entry, record } : entry);
    }
  }
  return entries;
}

function* resolveSupports(entries, byKey, projection) {
  for (const entry of entries) {
    yield "support";
    const support = entry.record.support;
    if (!support) continue;
    const key = keyOf(support), surface = byKey.get(key), points = surface?.record.contactSurface;
    if (key === entry.key) throw new Error("spatial draw self-support is invalid");
    if (!points || !finite(support.point)) throw new Error(`spatial draw support geometry missing: ${entry.key}`);
    yield* checkedFace(points);
    const projected = [];
    for (const point of points) { projected.push(projection.project(point)); yield "support"; }
    const proxy = yield* prepareOrderingProxySteps({ id: key, planarCorners: points, footprint: points,
      screenBounds: yield* boundsOf(projected) }, projection);
    const n = proxy?.normal, p = support.point;
    if (!proxy || Math.abs(n.x*p.x + n.y*p.y + n.z*p.z - proxy.constant) > EPSILON ||
        !(yield* polygonContainsSteps(proxy.polygon, projection.project(p))))
      throw new Error(`spatial draw contact outside its support: ${entry.key}`);
    entry.supportKey = key;
  }
}

function* centerDepth(entry, projection) {
  const geometry = entry.record.orderGeometry;
  if (geometry.kind === "card") {
    if (entry.centerDepth !== undefined) return entry.centerDepth;
    // Only the established ambiguous-overlap/cycle policy needs a world-space
    // center. Recover its previous world-AABB center lazily from the affine
    // screen-to-plane map, without changing the ordinary card representation.
    const pointOnPlane = point => {
      const { origin, direction } = projection.ray(point), { normal, constant } = geometry.plane;
      const t = (constant - normal.x * origin.x - normal.z * origin.z) /
        (normal.x * direction.x + normal.z * direction.z);
      return { x: origin.x + t * direction.x, y: origin.y + t * direction.y, z: origin.z + t * direction.z };
    };
    const origin = pointOnPlane(geometry.offset);
    const x = pointOnPlane({ x: geometry.offset.x + 1, y: geometry.offset.y });
    const y = pointOnPlane({ x: geometry.offset.x, y: geometry.offset.y + 1 });
    let depth = 0;
    for (const axis of ["x", "y", "z"]) {
      let min = Infinity, max = -Infinity;
      for (const point of geometry.shape.points) {
        yield "geometry";
        const value = origin[axis] + point.x * (x[axis] - origin[axis]) + point.y * (y[axis] - origin[axis]);
        min = Math.min(min, value); max = Math.max(max, value);
      }
      depth += (min + max) / 2 * projection.direction[axis];
    }
    return entry.centerDepth = depth;
  }
  const points = geometry.kind === "volume" ? [geometry.min, geometry.max] : geometry.points;
  let depth = 0;
  for (const axis of ["x", "y", "z"]) {
    let min = Infinity, max = -Infinity;
    for (const point of points) { min = Math.min(min, point[axis]); max = Math.max(max, point[axis]); yield "geometry"; }
    depth += (min + max) / 2 * projection.direction[axis];
  }
  return depth;
}

function* addRelation(a, b, projection, counters, edges) {
  // Canonical argument order preserves the full compiler's tie semantics.
  if (a.key > b.key) [a, b] = [b, a];
  const result = yield* relation(a, b, projection, counters);
  if (result === "interleaving") {
    // Whole pictures can overlap in ways no exact whole-picture order can
    // express. Keep the ordinary geometric relations, and choose one stable
    // camera-depth order for this ambiguous pair rather than stop rendering.
    counters.approximateOverlaps++;
    const difference = (yield* centerDepth(a, projection)) - (yield* centerDepth(b, projection));
    edges.push(difference >= -EPSILON ? [a.key, b.key] : [b.key, a.key]);
    return;
  }
  if (result === "independent") return;
  edges.push(result === "before" ? [a.key, b.key] : [b.key, a.key]);
}

function* orderGraph(entries, relations, counters, clock, projection) {
  const started = clock();
  counters.topologyBuilds++;
  const indices = new Map(), edges = [], incoming = new Uint32Array(entries.length), unique = [];
  for (let index = 0; index < entries.length; index++) {
    indices.set(entries[index].key, index); edges.push(new Set()); yield "topology";
  }
  for (const [fromKey, toKey] of relations) {
    yield "topology";
    const from = indices.get(fromKey), to = indices.get(toKey);
    if (edges[from].has(to)) continue;
    edges[from].add(to); incoming[to]++; unique.push([fromKey, toKey]);
  }
  const ready = [], output = [], emitted = new Uint8Array(entries.length);
  for (let index = 0; index < incoming.length; index++) { if (!incoming[index]) heapPush(ready, index); yield "topology"; }
  while (output.length < entries.length) {
    yield "topology";
    if (!ready.length) {
      // Whole-picture occlusion can cycle. Keep physical support precedence,
      // then resume from one deterministic farthest picture. Original visual
      // constraints remain recorded for membership reuse and diagnostics;
      // approximate cycles can leave some of those constraints unsatisfied.
      let selected = -1, selectedDepth = -Infinity;
      for (let index = 0; index < entries.length; index++) {
        yield "cycle";
        const entry = entries[index];
        if (emitted[index] || (entry.supportKey && !emitted[indices.get(entry.supportKey)])) continue;
        const depth = yield* centerDepth(entry, projection);
        if (selected < 0 || depth > selectedDepth + EPSILON ||
          (Math.abs(depth - selectedDepth) <= EPSILON && entry.key < entries[selected].key)) {
          selected = index; selectedDepth = depth;
        }
      }
      if (selected < 0) throw new Error("spatial draw explicit support cycle");
      counters.approximateCycles++;
      heapPush(ready, selected);
    }
    const index = heapPop(ready);
    if (emitted[index]) continue;
    emitted[index] = 1; output.push(entries[index].record);
    for (const next of edges[index]) {
      yield "topology";
      if (!emitted[next] && --incoming[next] === 0) heapPush(ready, next);
    }
  }
  counters.edges = unique.length;
  counters.topologyMs = Math.max(0, clock() - started);
  return Object.freeze({ records: output, relations: unique, metrics: Object.freeze(counters) });
}

// A retained revision covers every value used by geometry or contact ordering.
// Snapshot bytes also detect mutation of an existing geometry object on refresh.
const immutableSignatures = new WeakMap(), immutableOrderingData = new WeakSet();
function* frozenOrderingData(value) {
  if (value === null || typeof value !== "object") return typeof value !== "function";
  if (immutableOrderingData.has(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  if (!Object.isFrozen(value) || (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null)
    || "toJSON" in value) return false;
  // Frozen accessors can still return changing data. Only owned data properties
  // qualify; mutable or unusual inputs retain the original checked serializer.
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    yield "signature";
    if (!("value" in descriptor) || !(yield* frozenOrderingData(descriptor.value))) return false;
  }
  immutableOrderingData.add(value);
  return true;
}
function* geometrySignature(record) {
  const inputs = [record.orderGeometry, record.surfaceOrder ?? 0, record.supportY ?? null,
    record.compositePartition ?? null, record.support ?? null, record.contactSurface ?? null];
  const cached = immutableSignatures.get(record);
  if (cached && inputs.every((value,index) => value === cached.inputs[index])) return cached.signature;
  const geometry = record.orderGeometry;
  const shape = geometry?.kind === "card" && (yield* frozenOrderingData(geometry.shape)) ? geometry.shape : null;
  const data = JSON.stringify(shape ? [{ kind: "card", offset: geometry.offset, plane: geometry.plane }, ...inputs.slice(1)] : inputs, (_key, value) => {
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error("spatial ordering data must be finite");
      return value;
    });
  // Composite membership uses strict token identity in the comparator. Preserve
  // it separately so equal-looking replacement objects cannot reuse old edges.
  const signature = { data, shape, partition: record.compositePartition ?? null };
  // Run finite validation before admitting immutable data. Root fields stay
  // replaceable, so every hit checks their captured references and scalars.
  let immutable = true;
  for (const input of inputs) if (!(yield* frozenOrderingData(input))) { immutable = false; break; }
  if (immutable) immutableSignatures.set(record, { inputs, signature });
  return signature;
}
const sameGeometrySignature = (a, b) => a?.data === b?.data && a?.shape === b?.shape && a?.partition === b?.partition;

const pairKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
const sameEdge = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];

/** Retains dynamic pieces and only their incident visual/support edges. A
 * proposal touches no published entries, bins or relations until accepted. */
function createDynamicRelations(staticByKey, staticIndex, projection, binSize, clock) {
  let entries = new Map(), signatures = new Map(), index = createSpatialIndex(binSize);
  let pairs = new Map(), incidents = new Map();

  function* stage(records, counters) {
    const started = clock();
    if (!Array.isArray(records)) throw new Error("spatial draw records must be an array");
    const next = new Map(), nextSignatures = new Map(), currentRecords = new Map(), changed = new Set();
    for (const record of records) {
      yield "dynamic";
      if (record?.id == null) throw new Error("spatial draw record identity required");
      const key = keyOf(record), signature = yield* geometrySignature(record);
      if (staticByKey.has(key) || next.has(key)) throw new Error("duplicate spatial draw identity");
      nextSignatures.set(key, signature); currentRecords.set(key, record);
      if (sameGeometrySignature(signatures.get(key), signature)) {
        next.set(key, entries.get(key)); counters.preparedReused++;
      } else {
        const entry = yield* prepare(record, projection);
        for (const unused of binKeys(entry, binSize)) { void unused; yield "index"; }
        next.set(key, entry); changed.add(key); counters.preparedNew++;
      }
    }
    for (const key of entries.keys()) { if (!next.has(key)) changed.add(key); yield "dynamic"; }
    for (const [key, entry] of next) {
      if (entry.supportKey && changed.has(entry.supportKey) && !changed.has(key)) {
        next.set(key, { ...entry }); changed.add(key);
      }
      yield "support";
    }
    const changedEntries = [];
    for (const key of changed) { if (next.has(key)) changedEntries.push(next.get(key)); yield "dynamic"; }
    yield* resolveSupports(changedEntries, { get: key => next.get(key) ?? staticByKey.get(key) }, projection);
    yield* checkSupportCycles(changedEntries, next);
    const removedPairs = new Set();
    for (const key of changed) for (const pair of incidents.get(key) ?? []) { removedPairs.add(pair); yield "relation"; }
    const candidateStarted = clock();
    counters.preparationMs = Math.max(0, candidateStarted - started);
    const nextPairs = new Map(), compared = new Set(), changedIndex = createSpatialIndex(binSize);
    function* compare(a, b) {
      if (a.key === b.key) return;
      const key = pairKey(a.key, b.key);
      if (compared.has(key)) return;
      compared.add(key);
      const edges = [];
      yield* addRelation(a, b, projection, counters, edges);
      if (edges.length) nextPairs.set(key, edges[0]);
    }
    for (const entry of changedEntries) {
      if (entry.supportKey) yield* compare(entry, next.get(entry.supportKey) ?? staticByKey.get(entry.supportKey));
      for (const other of staticIndex.candidates(entry, counters)) { yield "candidate"; if (other) yield* compare(entry, other); }
      for (const other of index.candidates(entry, counters)) { yield "candidate"; if (other && !changed.has(other.key)) yield* compare(entry, other); }
      for (const other of changedIndex.candidates(entry, counters)) { yield "candidate"; if (other) yield* compare(entry, other); }
      yield* changedIndex.add(entry);
    }
    counters.candidateMs = Math.max(0, clock() - candidateStarted);
    let sameMembership = next.size === entries.size, sameSupports = true, sameRelations = removedPairs.size === nextPairs.size;
    for (const key of next.keys()) { if (!entries.has(key)) sameMembership = false; yield "dynamic"; }
    for (const entry of changedEntries) { if (entries.get(entry.key)?.supportKey !== entry.supportKey) sameSupports = false; yield "support"; }
    for (const key of removedPairs) { if (!sameEdge(pairs.get(key), nextPairs.get(key))) sameRelations = false; yield "relation"; }

    // Prepare the next retained index and relation state before publication.
    // Unchanged relations are reused. Changed relations copy the dynamic
    // relation map and incidence sets, never the static terrain graph.
    const stagedIndex = changed.size ? yield* index.withChanges(entries, changed, changedEntries) : index;
    let stagedPairs = pairs, stagedIncidents = incidents;
    if (!sameRelations) {
      stagedPairs = new Map(); stagedIncidents = new Map();
      for (const [key, edge] of pairs) { if (!removedPairs.has(key)) stagedPairs.set(key, edge); yield "relation"; }
      for (const [key, edge] of nextPairs) { stagedPairs.set(key, edge); yield "relation"; }
      for (const [key, edge] of stagedPairs) for (const endpoint of edge) {
        const set = stagedIncidents.get(endpoint) ?? new Set();
        set.add(key); stagedIncidents.set(endpoint, set); yield "relation";
      }
    }
    counters.bins = staticIndex.size + stagedIndex.size;
    return { next, nextSignatures, currentRecords, index: stagedIndex, pairs: stagedPairs, incidents: stagedIncidents,
      geometryChanged: changed.size > 0, orderUnchanged: sameMembership && sameSupports && sameRelations,
      *entriesForOrder() {
        const values = [];
        for (const entry of next.values()) { values.push({ ...entry, record: currentRecords.get(entry.key) }); yield "merge"; }
        return yield* sortOrderingSteps(values, compareEntries);
      },
    };
  }
  function commit(update) {
    entries = update.next; signatures = update.nextSignatures;
    index = update.index; pairs = update.pairs; incidents = update.incidents;
  }
  return { stage, commit, get size() { return entries.size; }, get bins() { return index.size; } };
}

function* checkSupportCycles(entries, byKey) {
  const checked = new Set();
  for (const entry of entries) {
    yield "support";
    const path = new Set(); let current = entry;
    while (current && !checked.has(current.key)) {
      if (path.has(current.key)) throw new Error("spatial draw explicit support cycle");
      path.add(current.key); current = byKey.get(current.supportKey); yield "support";
    }
    for (const key of path) { checked.add(key); yield "support"; }
  }
}

/** Retains checked static geometry, its spatial index and all static relations.
 * A static support must itself be static. Dynamic records may reference either
 * class. Geometry/contact changes require a new prepared scene; refreshes only
 * replace display, picking and other presentation references. The projection
 * and supplied geometry are immutable for this scene's lifetime. A staged
 * withStaticRecords successor retains only unchanged current members/edges;
 * its creation and validation never replace this scene's presentation state.
 * Returned records are a borrowed read-only view: publication swaps current
 * references together, without traversing terrain. Preparation never publishes.
 */
export function prepareSpatialDrawScene(staticRecords, options = {}) {
  return finishOrderingSteps(prepareSpatialDrawSceneSteps(staticRecords, options));
}

export function* prepareSpatialDrawSceneSteps(staticRecords, { projection, binSize = 64, clock = () => performance.now() } = {}) {
  return yield* buildSpatialDrawScene(staticRecords, { projection, binSize, clock });
}

// One stable borrowed array, with a single reference-state pointer. Reusing an
// order can publish thousands of new hit/display references without copying
// terrain or mutating thousands of array slots in the publication turn. This is
// not a chain of overlays: static refreshes and current dynamics each have one
// map, both prepared before swapping the pointer. The array remains read-only.
function borrowedRecords(base, referenceState) {
  const state = { current: referenceState };
  const records = new Proxy(base, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !/^(0|[1-9][0-9]*)$/.test(property) || !value) return value;
      const key = keyOf(value);
      return state.current.dynamic.get(key) ?? state.current.static.get(key) ?? value;
    },
    set() { throw new Error("spatial draw records are a borrowed read-only view"); },
    deleteProperty() { throw new Error("spatial draw records are a borrowed read-only view"); },
    defineProperty() { throw new Error("spatial draw records are a borrowed read-only view"); },
  });
  return { records,
    // A ready consumer sees candidate references directly. Its view stays
    // pinned even if the published borrowed view later refreshes in place.
    stage(references) { return borrowedRecords(base, references).records; },
    publish(references) { state.current = references; },
  };
}

function* buildSpatialDrawScene(staticRecords, { projection, binSize, clock }, previous) {
  if (!projection?.project || !projection?.ray || !finite(projection.direction) ||
      !Number.isFinite(binSize) || !(binSize > 0))
    throw new Error("spatial draw records and orthographic projection required");
  const preparationStarted = clock();
  if (!Array.isArray(staticRecords)) throw new Error("spatial draw records must be an array");
  const signatures = new Map(), reused = new Set(), input = [];
  for (const record of staticRecords) {
    yield "static";
    if (record?.id == null) throw new Error("spatial draw record identity required");
    const key = keyOf(record), signature = yield* geometrySignature(record);
    if (signatures.has(key)) throw new Error("duplicate spatial draw identity");
    signatures.set(key, signature);
    if (previous?.byKey.has(key) && sameGeometrySignature(previous.signatures.get(key), signature)) {
      reused.add(key); input.push({ ...previous.byKey.get(key), record });
    } else input.push(yield* prepare(record, projection));
  }
  const statics = yield* sortOrderingSteps(input, compareEntries), byKey = new Map();
  for (const entry of statics) { byKey.set(entry.key, entry); yield "static"; }
  yield* resolveSupports(statics, byKey, projection);
  yield* checkSupportCycles(statics, byKey);
  const staticCounters = countersFor(statics.length), staticIndex = createSpatialIndex(binSize), staticEdges = [];
  // Deduplicate while building; there is no redundant static-only topology pass.
  const edgeKeys = new Set();
  const retain = edge => {
    const key = JSON.stringify(edge);
    if (!edgeKeys.has(key)) { edgeKeys.add(key); staticEdges.push(edge); }
  };
  staticCounters.preparedReused = reused.size;
  staticCounters.preparedNew = statics.length - reused.size;
  for (const edge of previous?.relations ?? []) {
    if (reused.has(edge[0]) && reused.has(edge[1])) { retain(edge); staticCounters.relationsReused++; }
    yield "relation";
  }
  const candidatesStarted = clock();
  staticCounters.preparationMs = Math.max(0, candidatesStarted - preparationStarted);
  for (const entry of statics) {
    if (reused.has(entry.key)) yield* staticIndex.add(entry);
    if (entry.supportKey) retain([entry.supportKey, entry.key]);
    yield "static";
  }
  for (const entry of statics) {
    yield "static";
    if (reused.has(entry.key)) continue;
    for (const other of staticIndex.candidates(entry, staticCounters)) {
      yield "candidate";
      if (other) {
        const edges = [];
        yield* addRelation(other, entry, projection, staticCounters, edges);
        for (const edge of edges) retain(edge);
      }
    }
    yield* staticIndex.add(entry);
  }
  staticCounters.bins = staticIndex.size;
  staticCounters.edges = staticEdges.length;
  staticCounters.candidateMs = Math.max(0, clock() - candidatesStarted);
  const metrics = Object.freeze(staticCounters);
  previous = undefined;
  let current = null, orderView = null, orderedIndexes = new Map(), staticReferences = new Map(), generation = 0;
  const dynamics = createDynamicRelations(byKey, staticIndex, projection, binSize, clock);
  function* stageCompile(dynamicRecords = [], currentStaticRecords = []) {
    const expectedGeneration = generation;
    if (!Array.isArray(currentStaticRecords)) throw new Error("spatial static refresh requires an array");
    const refreshed = new Set();
    let nextStaticReferences = staticReferences;
    if (currentStaticRecords.length) {
      nextStaticReferences = new Map();
      for (const [key, record] of staticReferences) { nextStaticReferences.set(key, record); yield "reference"; }
    }
    for (const record of currentStaticRecords) {
      const key = keyOf(record);
      if (refreshed.has(key)) throw new Error("duplicate spatial static refresh identity");
      refreshed.add(key);
      if (!byKey.has(key) || !sameGeometrySignature(signatures.get(key), yield* geometrySignature(record)))
        throw new Error(`spatial static geometry changed without a revision: ${key}`);
      nextStaticReferences.set(key, record); yield "reference";
    }
    if (!Array.isArray(dynamicRecords)) throw new Error("spatial draw records must be an array");
    const counters = countersFor(statics.length + dynamicRecords.length);
    const update = yield* dynamics.stage(dynamicRecords, counters);
    const references = { static: nextStaticReferences, dynamic: update.currentRecords };
    let result, nextView, nextIndexes;
    if (current && update.orderUnchanged && (!update.geometryChanged || current.metrics.approximateCycles === 0)) {
      const recordChanges = [];
      for (const inputRecords of [currentStaticRecords, dynamicRecords]) for (const record of inputRecords) {
        const index = orderedIndexes.get(keyOf(record)), previous = orderView.records[index];
        if (previous !== record) recordChanges.push(Object.freeze({ index, previous, current: record }));
        yield "reference";
      }
      nextView = orderView; nextIndexes = orderedIndexes;
      result = Object.freeze({ records: orderView.records, stagedRecords: orderView.stage(references), relations: current.relations,
        recordChanges,
        metrics: Object.freeze({ ...counters, edges: current.metrics.edges, topologyReuses: 1 }) });
    } else {
      const dynamicEntries = yield* update.entriesForOrder();
      const entries = yield* mergeEntries(statics, dynamicEntries, nextStaticReferences);
      function* relations() { yield* staticEdges; yield* update.pairs.values(); }
      result = yield* orderGraph(entries, relations(), counters, clock, projection);
      // The graph returns an immutable result; this private array is the stable
      // read-only borrowed view's backing, never exposed independently.
      const base = []; nextIndexes = new Map();
      for (const record of result.records) {
        nextIndexes.set(keyOf(record), base.length); base.push(record); yield "reference";
      }
      nextView = borrowedRecords(base, references);
      result = Object.freeze({ ...result, records: nextView.records, stagedRecords: nextView.stage(references) });
    }
    let committed = false;
    return Object.freeze({ ...result,
      publish() {
        if (committed || expectedGeneration !== generation) throw new Error("spatial draw preparation is stale");
        dynamics.commit(update); nextView.publish(references);
        orderView = nextView; orderedIndexes = nextIndexes; staticReferences = nextStaticReferences;
        if (!result.metrics.topologyReuses) current = { relations: result.relations, metrics: result.metrics };
        generation++; committed = true;
        // Candidate views belong to the task/consumer, not the retained order.
        // Do not keep old candidate reference maps alive after publication.
        const { stagedRecords: _stagedRecords, ...publishedResult } = result;
        return Object.freeze(publishedResult);
      },
    });
  }
  return Object.freeze({
    metrics,
    withStaticRecords(records) { return finishOrderingSteps(this.withStaticRecordsSteps(records)); },
    *withStaticRecordsSteps(records) {
      return yield* buildSpatialDrawScene(records, { projection, binSize, clock }, { byKey, signatures, relations: staticEdges });
    },
    retained: () => Object.freeze({ staticRecords: byKey.size, staticRelations: staticEdges.length,
      staticBins: staticIndex.size, dynamicRecords: dynamics.size, currentRecords: orderView?.records.length ?? 0 }),
    stageCompile,
    compile(dynamicRecords = [], currentStaticRecords = []) {
      return finishOrderingSteps(stageCompile(dynamicRecords, currentStaticRecords)).publish();
    },
  });
}

/** One client-side ordering core: checked geometry goes to one painter/picker
 * order. Whole-picture overlaps/cycles use deterministic approximation while
 * explicit support remains mandatory. Relations retain the original visual
 * constraints, which need not all be satisfied after approximate cycle recovery.
 */
export function compileSpatialDrawOrder(records, options = {}) {
  const scene = prepareSpatialDrawScene(records, options), result = scene.compile();
  const metrics = { ...result.metrics };
  for (const [name, value] of Object.entries(scene.metrics)) if (name !== "records" && name !== "bins" && name !== "edges") metrics[name] += value;
  return Object.freeze({ ...result, records: Object.freeze([...result.records]), metrics: Object.freeze(metrics) });
}
