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
function candidatePairs(entries, binSize, counters) {
  const bins = new Map(), pairs = [];
  for (let index = 0; index < entries.length; index++) {
    const value = entries[index], seen = new Set();
    const x0 = Math.floor(value.bounds.left / binSize), x1 = Math.floor(value.bounds.right / binSize);
    const y0 = Math.floor(value.bounds.top / binSize), y1 = Math.floor(value.bounds.bottom / binSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) throw new Error(`spatial draw piece exceeds bin budget: ${value.key}`);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`, bin = bins.get(key) ?? [];
      for (const other of bin) {
        if (seen.has(other)) continue;
        seen.add(other); counters.candidateVisits++;
        if (overlap(value.bounds, entries[other].bounds)) pairs.push([other, index]);
      }
      bin.push(index); bins.set(key, bin);
    }
  }
  counters.bins = bins.size;
  return pairs;
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

/** One client-side ordering core. Input records already own their checked art
 * and world geometry; output records go directly to a painter/shared picker.
 * Stable IDs settle only unconstrained choices. No cycle edge is discarded.
 */
export function compileSpatialDrawOrder(records, { projection, binSize = 64 } = {}) {
  if (!Array.isArray(records) || !projection?.project || !projection?.ray || !finite(projection.direction) || !Number.isFinite(binSize) || !(binSize > 0))
    throw new Error("spatial draw records and orthographic projection required");
  const entries = records.map(record => prepare(record, projection)).sort((a, b) => a.key<b.key?-1:a.key>b.key?1:0);
  if (new Set(entries.map(value => value.key)).size !== entries.length) throw new Error("duplicate spatial draw identity");
  const byKey=new Map(entries.map(entry=>[entry.key,entry]));
  for(const entry of entries) {
    const support=entry.record.support;
    if(!support)continue;
    const key=keyOf(support),surface=byKey.get(key),points=surface?.record.contactSurface;
    if(key===entry.key)throw new Error("spatial draw self-support is invalid");
    if(!points||!finite(support.point))throw new Error(`spatial draw support geometry missing: ${entry.key}`);
    checkedFace(points);
    const proxy=prepareOrderingProxy({id:key,planarCorners:points,footprint:points,screenBounds:boundsOf(points.map(point=>projection.project(point)))},projection);
    const n=proxy?.normal,p=support.point;
    if(!proxy||Math.abs(n.x*p.x+n.y*p.y+n.z*p.z-proxy.constant)>EPSILON||
      !polygonContains(proxy.polygon,projection.project(p)))throw new Error(`spatial draw contact outside its support: ${entry.key}`);
    entry.supportKey=key;
  }
  const counters = { records: entries.length, candidateVisits: 0, faceComparisons: 0, bins: 0, edges: 0 };
  const edges = entries.map(() => new Set()), incoming = new Uint32Array(entries.length), relations = [];
  const indices=new Map(entries.map((entry,index)=>[entry.key,index]));
  const addEdge=(from,to)=>{
    if(edges[from].has(to))return;
    edges[from].add(to);incoming[to]++;counters.edges++;
    relations.push([entries[from].key,entries[to].key]);
  };
  entries.forEach((entry,index)=>{if(entry.supportKey)addEdge(indices.get(entry.supportKey),index);});
  for (const [a, b] of candidatePairs(entries, binSize, counters)) {
    const result = relation(entries[a], entries[b], projection, counters);
    if (result === "interleaving") {
      const error = new Error(`spatial draw pieces interleave: ${entries[a].key} / ${entries[b].key}`);
      error.pieces = [entries[a].record, entries[b].record]; throw error;
    }
    if (result === "independent") continue;
    const [from, to] = result === "before" ? [a, b] : [b, a];
    addEdge(from,to);
  }
  const ready = [], output = [];
  incoming.forEach((count, index) => { if (!count) heapPush(ready, index); });
  while (ready.length) {
    const index = heapPop(ready); output.push(entries[index].record);
    for (const next of edges[index]) if (--incoming[next] === 0) heapPush(ready, next);
  }
  if (output.length !== records.length) {
    const remaining = entries.filter((_, index) => incoming[index] > 0).map(value => value.key);
    throw new Error(`spatial draw cycle requires refined art pieces: ${remaining.join(" / ")}`);
  }
  return Object.freeze({ records: Object.freeze(output), relations: Object.freeze(relations), metrics: Object.freeze(counters) });
}
