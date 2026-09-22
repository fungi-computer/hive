import { compareOrderingPlanes, prepareOrderingProxy, polygonContains, polygonArea, hull } from "./plane-order.js";

const EPSILON = 1e-7;
const keyOf = record => `${record.id}\u0000${record.part ?? ""}`;
const boundsOf = points => {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const point of points) {
    bounds.left = Math.min(bounds.left, point.x); bounds.right = Math.max(bounds.right, point.x);
    bounds.top = Math.min(bounds.top, point.y); bounds.bottom = Math.max(bounds.bottom, point.y);
  }
  return bounds;
};
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

function rectanglePolygon(bounds) {
  return [{ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom }];
}

const checkedCardShapes = new WeakSet();
function prepareCard(geometry, projection) {
  const { shape, offset, plane } = geometry;
  if (!offset || ![offset.x, offset.y].every(Number.isFinite) || !plane || !finite(plane.normal) ||
      !Number.isFinite(plane.constant) || plane.normal.y !== 0)
    throw new Error("spatial draw card requires finite placement and an upright plane");
  const length = Math.hypot(projection.direction.x, projection.direction.z);
  if (!(length > 0) || plane.normal.x !== projection.direction.x / length || plane.normal.z !== projection.direction.z / length)
    throw new Error("spatial draw card plane must match its view");
  if (!checkedCardShapes.has(shape)) {
    if (!shape || ![shape.width, shape.height].every(value => Number.isFinite(value) && value > 0) ||
        !Array.isArray(shape.points) || shape.points.length < 3 ||
        !shape.points.every(point => point && [point.x, point.y].every(Number.isFinite)) ||
        polygonArea(shape.points) <= EPSILON ||
        !shape.points.every(point => polygonContains(shape.points, point)))
      throw new Error("spatial draw card requires a convex checked silhouette");
    const coverage = checkedCoverage({ kind: "face", coverage: { offset: { x: 0, y: 0 }, rectangles: shape.rectangles } });
    if (!coverage || !coverage.every(rectangle => rectanglePolygon(rectangle).every(point => polygonContains(shape.points, point))))
      throw new Error("spatial draw card coverage must be inside its silhouette");
    if (frozenOrderingData(shape)) checkedCardShapes.add(shape);
  }
  const polygon = shape.points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y }));
  const bounds = boundsOf(polygon);
  if (!Object.values(bounds).every(Number.isFinite)) throw new Error("spatial draw card placement exceeds finite coordinates");
  return { bounds, orderingProxy: { normal: plane.normal, constant: plane.constant, polygon } };
}

function checkedCoverage(geometry) {
  const coverage = geometry.coverage;
  if (coverage == null) return null;
  if (geometry.kind !== "face" || !coverage.offset ||
      ![coverage.offset.x, coverage.offset.y].every(Number.isFinite) ||
      !Array.isArray(coverage.rectangles) || !coverage.rectangles.length)
    throw new Error("spatial draw coverage requires a face, finite offset and opaque rectangles");
  return coverage.rectangles.map(rectangle => {
    if (!rectangle || ![rectangle.left, rectangle.top, rectangle.right, rectangle.bottom].every(Number.isFinite) ||
        rectangle.left >= rectangle.right || rectangle.top >= rectangle.bottom)
      throw new Error("spatial draw coverage rectangles must be finite and positive");
    const bounds = { left: rectangle.left + coverage.offset.x, right: rectangle.right + coverage.offset.x,
      top: rectangle.top + coverage.offset.y, bottom: rectangle.bottom + coverage.offset.y };
    if (!Object.values(bounds).every(Number.isFinite) || bounds.left >= bounds.right || bounds.top >= bounds.bottom)
      throw new Error("spatial draw coverage coordinates must be finite and positive");
    return bounds;
  });
}

// Rectangles use exactly the coarse face's plane. Refinement excludes empty
// image area; it never samples pixel centers or changes the depth equation.
function preciseFaces(entry) {
  if (!entry.coverage) return entry.faces;
  if (entry.preciseFaces) return entry.preciseFaces;
  const geometry = entry.record.orderGeometry;
  const coverage = geometry.kind === "card" ? geometry.shape.rectangles.map(rectangle => ({
    left: rectangle.left + geometry.offset.x, right: rectangle.right + geometry.offset.x,
    top: rectangle.top + geometry.offset.y, bottom: rectangle.bottom + geometry.offset.y,
  })) : entry.coverage;
  return entry.preciseFaces ??= coverage.map(bounds => ({ bounds,
    orderingProxy: { ...entry.faces[0].orderingProxy, polygon: rectanglePolygon(bounds) } }));
}

function prepare(record, projection) {
  const key = keyOf(record);
  if (record.id == null) throw new Error("spatial draw record identity required");
  if(record.surfaceOrder!=null&&!Number.isSafeInteger(record.surfaceOrder))throw new Error("spatial draw surface order must be an integer");
  if(record.supportY!=null&&!Number.isFinite(record.supportY))throw new Error("spatial draw support height must be finite");
  if (record.orderGeometry?.kind === "card") {
    const face = prepareCard(record.orderGeometry, projection);
    return { record, key, faces: [face], coverage: true, bounds: face.bounds };
  }
  const faces = geometryFaces(record.orderGeometry, projection.direction).map(points => {
    const screenBounds = boundsOf(points.map(point => projection.project(point)));
    return { bounds:screenBounds, orderingProxy: prepareOrderingProxy({ id: key, planarCorners: points, footprint: points, screenBounds }, projection) };
  }).filter(face => face.orderingProxy);
  if (!faces.length) throw new Error(`spatial draw geometry is edge-on: ${key}`);
  const coverage = checkedCoverage(record.orderGeometry);
  if (coverage) {
    // Coverage includes outline texels that can extend beyond model geometry.
    // Keep coarse candidate discovery conservative over all authored ink.
    const face = faces[0];
    face.orderingProxy.polygon = hull([...face.orderingProxy.polygon, ...coverage.flatMap(rectanglePolygon)]);
    face.bounds = boundsOf(face.orderingProxy.polygon);
  }
  return { record, key, faces, coverage, bounds: boundsOf(faces.flatMap(face => face.orderingProxy.polygon)) };
}

// Equal-depth pictures still paint different pixels in opposite orders. Give
// their actual opaque overlap a pairwise tie, rather than relying on whichever
// node becomes topologically ready first as offscreen membership changes.
function coplanarPictureRelation(a, b, projection, counters) {
  if (!a.coverage && !b.coverage) return "independent";
  for (const left of preciseFaces(a)) for (const right of preciseFaces(b)) {
    if (!overlap(left.bounds, right.bounds)) continue;
    counters.faceComparisons++;
    counters.coverageFaceComparisons++;
    if (compareOrderingPlanes(left, right, projection).kind !== "disjoint")
      return a.key < b.key ? "before" : "after";
  }
  return "independent";
}

/** Resolve a relationship over its projected overlap, not at a pivot. Each
 * convex volume's visible faces partition its projected silhouette. Opposite
 * signs therefore mean its representation cannot be emitted as one image.
 */
function faceRelation(a, b, projection, counters, precise = false) {
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
      return coplanarPictureRelation(a, b, projection, counters);
    }
  }
  let before = false, after = false, coplanar = false;
  const leftFaces = precise ? preciseFaces(a) : a.faces, rightFaces = precise ? preciseFaces(b) : b.faces;
  for (const left of leftFaces) for (const right of rightFaces) {
    if(!overlap(left.bounds,right.bounds))continue;
    counters.faceComparisons++;
    if (precise) counters.coverageFaceComparisons++;
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
    return coplanarPictureRelation(a, b, projection, counters);
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
  const coarse = faceRelation(a,b,projection,counters);
  if (coarse !== "interleaving" || (!a.coverage && !b.coverage)) return coarse;
  counters.coverageRefinements++;
  return faceRelation(a,b,projection,counters,true);
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
        const bin = bins.get(key) ?? new Map();
        bin.set(entry.key, entry); bins.set(key, bin);
      }
    },
    remove(entry) {
      for (const key of binKeys(entry, binSize)) {
        const bin = bins.get(key);
        bin?.delete(entry.key);
        if (bin?.size === 0) bins.delete(key);
      }
    },
    candidates(entry, counters) {
      const seen = new Set(), candidates = [];
      for (const key of binKeys(entry, binSize)) for (const other of bins.get(key)?.values() ?? []) {
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
const countersFor = records => ({ records, candidateVisits: 0, faceComparisons: 0, bins: 0, edges: 0,
  topologyBuilds: 0, topologyReuses: 0, coplanarSkips: 0, coverageRefinements: 0, coverageFaceComparisons: 0, approximateOverlaps: 0, approximateCycles: 0, preparedNew: 0, preparedReused: 0, relationsReused: 0, preparationMs: 0, candidateMs: 0, topologyMs: 0 });

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

function centerDepth(entry, projection) {
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
        const value = origin[axis] + point.x * (x[axis] - origin[axis]) + point.y * (y[axis] - origin[axis]);
        min = Math.min(min, value); max = Math.max(max, value);
      }
      depth += (min + max) / 2 * projection.direction[axis];
    }
    return entry.centerDepth = depth;
  }
  const points = geometry.kind === "volume" ? [geometry.min, geometry.max] : geometry.points;
  const center = axis => (Math.min(...points.map(point => point[axis])) + Math.max(...points.map(point => point[axis]))) / 2;
  return center("x") * projection.direction.x + center("y") * projection.direction.y + center("z") * projection.direction.z;
}

function addRelation(a, b, projection, counters, edges) {
  // Canonical argument order preserves the full compiler's tie semantics.
  if (a.key > b.key) [a, b] = [b, a];
  const result = relation(a, b, projection, counters);
  if (result === "interleaving") {
    // Whole pictures can overlap in ways no exact whole-picture order can
    // express. Keep the ordinary geometric relations, and choose one stable
    // camera-depth order for this ambiguous pair rather than stop rendering.
    counters.approximateOverlaps++;
    const difference = centerDepth(a, projection) - centerDepth(b, projection);
    edges.push(difference >= -EPSILON ? [a.key, b.key] : [b.key, a.key]);
    return;
  }
  if (result === "independent") return;
  edges.push(result === "before" ? [a.key, b.key] : [b.key, a.key]);
}

function orderGraph(entries, relations, counters, clock, projection) {
  const started = clock();
  counters.topologyBuilds++;
  const indices = new Map(entries.map((entry, index) => [entry.key, index]));
  const edges = entries.map(() => new Set()), incoming = new Uint32Array(entries.length), unique = [];
  for (const [fromKey, toKey] of relations) {
    const from = indices.get(fromKey), to = indices.get(toKey);
    if (edges[from].has(to)) continue;
    edges[from].add(to); incoming[to]++; unique.push([fromKey, toKey]);
  }
  const ready = [], output = [], emitted = new Uint8Array(entries.length);
  incoming.forEach((count, index) => { if (!count) heapPush(ready, index); });
  while (output.length < entries.length) {
    if (!ready.length) {
      // Whole-picture occlusion can cycle. Keep physical support precedence,
      // then resume from one deterministic farthest picture. Original visual
      // constraints remain recorded for membership reuse and diagnostics;
      // approximate cycles can leave some of those constraints unsatisfied.
      let selected = -1, selectedDepth = -Infinity;
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (emitted[index] || (entry.supportKey && !emitted[indices.get(entry.supportKey)])) continue;
        const depth = centerDepth(entry, projection);
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
      if (!emitted[next] && --incoming[next] === 0) heapPush(ready, next);
    }
  }
  counters.edges = unique.length;
  counters.topologyMs = Math.max(0, clock() - started);
  return Object.freeze({ records: Object.freeze(output), relations: Object.freeze(unique), metrics: Object.freeze(counters) });
}

// A retained revision covers every value used by geometry or contact ordering.
// Snapshot bytes also detect mutation of an existing geometry object on refresh.
const immutableSignatures = new WeakMap(), immutableOrderingData = new WeakSet();
function frozenOrderingData(value) {
  if (value === null || typeof value !== "object") return typeof value !== "function";
  if (immutableOrderingData.has(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  if (!Object.isFrozen(value) || (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null)
    || "toJSON" in value) return false;
  // Frozen accessors can still return changing data. Only owned data properties
  // qualify; mutable or unusual inputs retain the original checked serializer.
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor) || !frozenOrderingData(descriptor.value)) return false;
  }
  immutableOrderingData.add(value);
  return true;
}
function geometrySignature(record) {
  const inputs = [record.orderGeometry, record.surfaceOrder ?? 0, record.supportY ?? null,
    record.compositePartition ?? null, record.support ?? null, record.contactSurface ?? null];
  const cached = immutableSignatures.get(record);
  if (cached && inputs.every((value,index) => value === cached.inputs[index])) return cached.signature;
  const geometry = record.orderGeometry;
  const shape = geometry?.kind === "card" && frozenOrderingData(geometry.shape) ? geometry.shape : null;
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
  if (inputs.every(frozenOrderingData)) immutableSignatures.set(record, { inputs, signature });
  return signature;
}
const sameGeometrySignature = (a, b) => a?.data === b?.data && a?.shape === b?.shape && a?.partition === b?.partition;

const pairKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
const sameEdge = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];

/** Retains dynamic pieces and only their incident visual/support edges. A
 * proposal touches no published entries, bins or relations until accepted. */
function createDynamicRelations(staticByKey, staticIndex, projection, binSize, clock) {
  let entries = new Map(), signatures = new Map();
  const index = createSpatialIndex(binSize), pairs = new Map(), incidents = new Map();

  function stage(records, counters) {
    const started = clock();
    if (!Array.isArray(records)) throw new Error("spatial draw records must be an array");
    const next = new Map(), nextSignatures = new Map(), currentRecords = new Map(), changed = new Set();
    for (const record of records) {
      if (record?.id == null) throw new Error("spatial draw record identity required");
      const key = keyOf(record), signature = geometrySignature(record);
      if (staticByKey.has(key) || next.has(key)) throw new Error("duplicate spatial draw identity");
      nextSignatures.set(key, signature); currentRecords.set(key, record);
      if (sameGeometrySignature(signatures.get(key), signature)) {
        next.set(key, entries.get(key)); counters.preparedReused++;
      } else {
        const entry = prepare(record, projection);
        // Check index bounds before any retained mutation, including isolated
        // pieces whose first candidate query would otherwise happen at commit.
        binKeys(entry, binSize);
        next.set(key, entry); changed.add(key); counters.preparedNew++;
      }
    }
    for (const key of entries.keys()) if (!next.has(key)) changed.add(key);
    // Contact geometry can belong to a moving support. Its unchanged occupants
    // must be checked too, including when their support was removed.
    for (const [key, entry] of next) if (entry.supportKey && changed.has(entry.supportKey) && !changed.has(key)) {
      next.set(key, { ...entry }); changed.add(key);
    }
    const changedEntries = [...changed].flatMap(key => next.has(key) ? [next.get(key)] : []);
    resolveSupports(changedEntries, { get: key => next.get(key) ?? staticByKey.get(key) }, projection);
    // Visual pairs retain one direction; explicit supports are independently
    // mandatory and may not be collapsed into that pair representation.
    const checkedSupports = new Set();
    for (const entry of changedEntries) {
      const path = new Set();
      let current = entry;
      while (current && !checkedSupports.has(current.key)) {
        if (path.has(current.key)) throw new Error("spatial draw explicit support cycle");
        path.add(current.key);
        current = next.get(current.supportKey);
      }
      for (const key of path) checkedSupports.add(key);
    }
    const removedPairs = new Set();
    for (const key of changed) for (const pair of incidents.get(key) ?? []) removedPairs.add(pair);
    const candidateStarted = clock();
    counters.preparationMs = Math.max(0, candidateStarted - started);
    const nextPairs = new Map(), compared = new Set(), changedIndex = createSpatialIndex(binSize);
    const compare = (a, b) => {
      if (a.key === b.key) return;
      const key = pairKey(a.key, b.key);
      if (compared.has(key)) return;
      compared.add(key);
      const edges = [];
      addRelation(a, b, projection, counters, edges);
      if (edges.length) nextPairs.set(key, edges[0]);
    };
    for (const entry of changedEntries) {
      if (entry.supportKey) compare(entry, next.get(entry.supportKey) ?? staticByKey.get(entry.supportKey));
      for (const other of staticIndex.candidates(entry, counters)) compare(entry, other);
      for (const other of index.candidates(entry, counters)) if (!changed.has(other.key)) compare(entry, other);
      for (const other of changedIndex.candidates(entry, counters)) compare(entry, other);
      changedIndex.add(entry);
    }
    counters.candidateMs = Math.max(0, clock() - candidateStarted);
    counters.bins = staticIndex.size + (changed.size
      ? new Set([...next.values()].flatMap(entry => binKeys(entry, binSize))).size : index.size);
    const sameMembership = next.size === entries.size && [...next.keys()].every(key => entries.has(key));
    const sameSupports = changedEntries.every(entry => entries.get(entry.key)?.supportKey === entry.supportKey);
    const sameRelations = removedPairs.size === nextPairs.size &&
      [...removedPairs].every(key => sameEdge(pairs.get(key), nextPairs.get(key)));
    return { next, nextSignatures, currentRecords, changed, changedEntries, removedPairs, nextPairs,
      geometryChanged: changed.size > 0, orderUnchanged: sameMembership && sameSupports && sameRelations,
      entriesForOrder: () => [...next.values()].map(entry => ({ ...entry, record: currentRecords.get(entry.key) })).sort(compareEntries),
      relationsForOrder: () => [...pairs].filter(([key]) => !removedPairs.has(key)).map(([, edge]) => edge).concat([...nextPairs.values()]),
    };
  }
  function commit(update) {
    for (const key of update.changed) {
      const old = entries.get(key);
      if (old) index.remove(old);
    }
    for (const entry of update.changedEntries) index.add(entry);
    for (const key of update.removedPairs) {
      const edge = pairs.get(key);
      for (const endpoint of edge) {
        const set = incidents.get(endpoint); set.delete(key);
        if (!set.size) incidents.delete(endpoint);
      }
      pairs.delete(key);
    }
    for (const [key, edge] of update.nextPairs) {
      pairs.set(key, edge);
      for (const endpoint of edge) {
        const set = incidents.get(endpoint) ?? new Set();
        set.add(key); incidents.set(endpoint, set);
      }
    }
    for (const [key, entry] of update.next) entry.record = update.currentRecords.get(key);
    entries = update.next; signatures = update.nextSignatures;
  }
  return { stage, commit, get size() { return entries.size; }, get bins() { return index.size; } };
}

/** Retains checked static geometry, its spatial index and all static relations.
 * A static support must itself be static. Dynamic records may reference either
 * class. Geometry/contact changes require a new prepared scene; refreshes only
 * replace display, picking and other presentation references. The projection
 * and supplied geometry are immutable for this scene's lifetime. A staged
 * withStaticRecords successor retains only unchanged current members/edges;
 * its creation and validation never replace this scene's presentation state.
 * Returned
 * records are a borrowed read-only view: a successful geometry-identical
 * compile refreshes its record references in place, without traversing terrain.
 */
export function prepareSpatialDrawScene(staticRecords, { projection, binSize = 64, clock = () => performance.now() } = {}) {
  return buildSpatialDrawScene(staticRecords, { projection, binSize, clock });
}

function buildSpatialDrawScene(staticRecords, { projection, binSize, clock }, previous) {
  if (!projection?.project || !projection?.ray || !finite(projection.direction) ||
      !Number.isFinite(binSize) || !(binSize > 0))
    throw new Error("spatial draw records and orthographic projection required");
  const preparationStarted = clock();
  if (!Array.isArray(staticRecords)) throw new Error("spatial draw records must be an array");
  const signatures = new Map(), reused = new Set();
  const statics = staticRecords.map(record => {
    if (record?.id == null) throw new Error("spatial draw record identity required");
    const key = keyOf(record), signature = geometrySignature(record);
    if (signatures.has(key)) throw new Error("duplicate spatial draw identity");
    signatures.set(key, signature);
    if (previous?.byKey.has(key) && sameGeometrySignature(previous.signatures.get(key), signature)) {
      reused.add(key);
      // Detach mutable presentation references from the previous revision.
      // Geometry/proxies are immutable; only their lazy refinement is shared.
      return { ...previous.byKey.get(key), record };
    }
    return prepare(record, projection);
  }).sort(compareEntries);
  const byKey = new Map(statics.map(entry => [entry.key, entry]));
  // Even unchanged occupants must be checked against their current support:
  // a contact surface may have changed or left membership this revision.
  resolveSupports(statics, byKey, projection);
  const staticCounters = countersFor(statics.length), staticIndex = createSpatialIndex(binSize), staticEdges = [];
  staticCounters.preparedReused = reused.size;
  staticCounters.preparedNew = statics.length - reused.size;
  for (const edge of previous?.relations ?? []) if (reused.has(edge[0]) && reused.has(edge[1])) {
    staticEdges.push(edge); staticCounters.relationsReused++;
  }
  const candidatesStarted = clock();
  staticCounters.preparationMs = Math.max(0, candidatesStarted - preparationStarted);
  for (const entry of statics) {
    if (reused.has(entry.key)) staticIndex.add(entry);
    if (entry.supportKey) staticEdges.push([entry.supportKey, entry.key]);
  }
  for (const entry of statics) {
    if (reused.has(entry.key)) continue;
    // The index contains all unchanged members and only preceding new ones.
    // Thus each affected pair is visited once; unchanged pairs need no query.
    for (const other of staticIndex.candidates(entry, staticCounters))
      addRelation(other, entry, projection, staticCounters, staticEdges);
    staticIndex.add(entry);
  }
  staticCounters.bins = staticIndex.size;
  staticCounters.candidateMs = Math.max(0, clock() - candidatesStarted);
  // Validate the static graph once, including cycles with no spatial overlap.
  const staticResult = orderGraph(statics, staticEdges, staticCounters, clock, projection);
  // Do not retain a chain of old scenes. The successor keeps only this
  // membership's proxies, signatures, spatial bins and surviving edges.
  previous = undefined;
  let current = staticResult, orderedRecords = [...staticResult.records];
  let orderedIndexes = new Map(orderedRecords.map((record, index) => [keyOf(record), index]));
  const dynamics = createDynamicRelations(byKey, staticIndex, projection, binSize, clock);
  return Object.freeze({
    metrics: staticResult.metrics,
    withStaticRecords(records) {
      return buildSpatialDrawScene(records, { projection, binSize, clock },
        { byKey, signatures, relations: staticResult.relations });
    },
    retained: () => Object.freeze({ staticRecords: byKey.size, staticRelations: staticResult.relations.length,
      staticBins: staticIndex.size, dynamicRecords: dynamics.size, currentRecords: orderedRecords.length }),
    compile(dynamicRecords = [], currentStaticRecords = []) {
      if (!Array.isArray(currentStaticRecords)) throw new Error("spatial static refresh requires an array");
      const refreshed = new Set();
      for (const record of currentStaticRecords) {
        const key = keyOf(record);
        if (refreshed.has(key)) throw new Error("duplicate spatial static refresh identity");
        refreshed.add(key);
        if (!byKey.has(key) || !sameGeometrySignature(signatures.get(key), geometrySignature(record)))
          throw new Error(`spatial static geometry changed without a revision: ${key}`);
      }
      if (!Array.isArray(dynamicRecords)) throw new Error("spatial draw records must be an array");
      const counters = countersFor(statics.length + dynamicRecords.length);
      const update = dynamics.stage(dynamicRecords, counters);
      const refreshedRecords = new Map(currentStaticRecords.map(record => [keyOf(record), record]));
      // Equal edges imply the same deterministic acyclic order. Approximate
      // cycles also depend on moving center depths, so changed geometry must
      // rerun recovery even when every pair retained its edge direction.
      if (update.orderUnchanged && (!update.geometryChanged || current.metrics.approximateCycles === 0)) {
        dynamics.commit(update);
        const recordChanges = [];
        for (const record of [...currentStaticRecords, ...dynamicRecords]) {
          const index = orderedIndexes.get(keyOf(record)), previous = orderedRecords[index];
          if (previous !== record) {
            recordChanges.push({ previous, current: record });
            orderedRecords[index] = record;
          }
        }
        for (const [key, record] of refreshedRecords) byKey.get(key).record = record;
        return Object.freeze({ records: orderedRecords, relations: current.relations,
          recordChanges: Object.freeze(recordChanges),
          metrics: Object.freeze({ ...counters, bins: staticIndex.size + dynamics.bins,
            edges: current.metrics.edges, topologyReuses: 1 }) });
      }
      // Only commit refreshes after validating and ordering the entire update.
      const entries = mergeEntries(statics, update.entriesForOrder(), refreshedRecords);
      const relations = [...staticResult.relations, ...update.relationsForOrder()];
      const result = orderGraph(entries, relations, counters, clock, projection);
      dynamics.commit(update);
      for (const [key, record] of refreshedRecords) byKey.get(key).record = record;
      current = result;
      orderedRecords = [...result.records];
      orderedIndexes = new Map(orderedRecords.map((record, index) => [keyOf(record), index]));
      return Object.freeze({ ...result, records: orderedRecords });
    },
  });
}

/** One client-side ordering core: checked geometry goes to one painter/picker
 * order. Whole-picture overlaps/cycles use deterministic approximation while
 * explicit support remains mandatory. Relations retain the original visual
 * constraints, which need not all be satisfied after approximate cycle recovery.
 */
export function compileSpatialDrawOrder(records, options = {}) {
  const scene = prepareSpatialDrawScene(records, options);
  const result = scene.compile();
  return Object.freeze({ ...result, records: Object.freeze([...result.records]), metrics: scene.metrics });
}
