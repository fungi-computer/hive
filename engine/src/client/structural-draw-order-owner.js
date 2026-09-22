import { pickVoxelDrawRecord } from "./voxel-draw-picking.js";

const EPSILON = 1e-7;

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`structural order requires finite ${label}`);
  return value;
}

function identityOf(record) {
  if (record?.id === undefined || record?.id === null || String(record.id) === "")
    throw new Error("structural draw record identity required");
  return `${String(record.id)}\u0000${String(record.part ?? "body")}`;
}

function compareScalar(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

/** Public for independent traversal/oracle laws; production ownership stays in
 * createStructuralDrawOrderOwner. The tuple is never packed into a bit field. */
export function compareStructuralTuple(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const compared = compareScalar(left[index] ?? "", right[index] ?? "");
    if (compared) return compared;
  }
  return 0;
}

function checkedDirection(direction) {
  if (!direction || ![direction.x, direction.y, direction.z].every(Number.isFinite) ||
      direction.y >= -EPSILON || Math.abs(direction.x) <= EPSILON || Math.abs(direction.z) <= EPSILON)
    throw new Error("structural order requires a downward diagonal camera direction");
  return Object.freeze({ x: Math.sign(direction.x), y: Math.sign(direction.y), z: Math.sign(direction.z) });
}

function cameraPoint(point, signs) {
  const u = -signs.x * finite(point.x, "world x");
  const v = -signs.z * finite(point.z, "world z");
  return Object.freeze({ u, v, w: -signs.y * finite(point.y, "world y") });
}

function structuralCellTuple(cell, phase, id, signs) {
  if (!Array.isArray(cell) || cell.length !== 3 || !cell.every(Number.isFinite))
    throw new Error("structural dense record requires a finite cell");
  const point = cameraPoint({ x: cell[0], y: cell[1], z: cell[2] }, signs);
  return Object.freeze([point.u + point.v, cell[1], phase, point.u - point.v, id]);
}

function densePhase(record) {
  if (record.role === "terrain") {
    if (record.face === "top") return 20;
    if (record.face === "east" || record.face === "west") return 10;
    if (record.face === "north" || record.face === "south") return 11;
    throw new Error(`unsupported structural terrain face: ${record.face}`);
  }
  if (record.role === "water") return 25;
  if (record.role === "terrain-cover") return 30;
  throw new Error(`unsupported dense structural role: ${record.role}`);
}

function coverCell(record, signs) {
  const attachment = record.attachment;
  if (attachment?.kind !== "surface-root" || !attachment.point || !Array.isArray(attachment.supports) || !attachment.supports.length)
    throw new Error("structural cover requires a surface root and occupied support cells");
  const rootX = attachment.root?.[0] ?? attachment.point.x - 0.5;
  const rootZ = attachment.root?.[1] ?? attachment.point.z - 0.5;
  if (![rootX, rootZ].every(Number.isInteger))
    throw new Error("structural cover root must identify an authored 2x2 cell footprint");
  const height = finite(record.storeyBand, "cover support height");
  for (const support of attachment.supports) {
    if (!Array.isArray(support) || support.length !== 3 || !support.every(Number.isFinite) || support[1] !== height ||
        support[0] < rootX || support[0] > rootX + 1 || support[2] < rootZ || support[2] > rootZ + 1)
      throw new Error("structural cover support must belong to its authored 2x2 footprint and height");
  }
  // Every mask uses these four nominal centers. Occupied supports validate the
  // physical attachment but never move the preferred slot after mowing.
  const nominal = [[rootX, height, rootZ], [rootX + 1, height, rootZ],
    [rootX + 1, height, rootZ + 1], [rootX, height, rootZ + 1]];
  let front = nominal[0], frontTuple = structuralCellTuple(front, 30, "", signs);
  for (let index = 1; index < nominal.length; index++) {
    const tuple = structuralCellTuple(nominal[index], 30, "", signs);
    if (compareStructuralTuple(tuple, frontTuple) > 0) { front = nominal[index]; frontTuple = tuple; }
  }
  return front;
}

function denseEntry(record, signs) {
  const id = identityOf(record), phase = densePhase(record);
  const cell = record.role === "terrain-cover" ? coverCell(record, signs)
    : record.role === "water" && !record.cell
      ? [record.attachment?.point?.x, record.storeyBand, record.attachment?.point?.z]
      : record.cell;
  const key = structuralCellTuple(cell, phase, id, signs);
  const worldBounds = record.role === "terrain-cover" ? coverBounds(record)
    : record.structuralBounds ? sparseBounds(record)
    : record.orderGeometry?.kind === "face" ? boundsFromPoints(record.orderGeometry.points)
    : cellBounds(cell);
  return { record, id, key, signature: denseSignature(record), cell: Object.freeze([...cell]), worldBounds,
    screenBounds: checkedScreenBounds(record.screenBounds) };
}

function denseSignature(record) {
  return JSON.stringify([record.role, record.cell, record.face, record.material, record.cap, record.mask,
    record.storeyBand, record.attachment?.point, record.attachment?.supports, record.structuralBounds,
    record.visualReach, record.pictureRevision]);
}

/** A cover card's fixed 2x2 supports select its stable slot. The checked pack's
 * transformed authored geometry separately supplies local world bounds; alpha
 * pixels are never sampled for ordering. */
function coverBounds(record) {
  if (!record.structuralBounds) throw new Error("structural cover requires checked authored structural bounds");
  return sparseBounds(record);
}

function checkedScreenBounds(bounds) {
  if (bounds == null) return null;
  if (![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite) ||
      bounds.left > bounds.right || bounds.top > bounds.bottom)
    throw new Error("structural record requires finite projected visual bounds");
  return bounds;
}

function cellBounds(cell) {
  return { min: { x: cell[0] - 0.5, y: cell[1] - 0.5, z: cell[2] - 0.5 },
    max: { x: cell[0] + 0.5, y: cell[1] + 0.5, z: cell[2] + 0.5 } };
}

function boundsFromPoints(points) {
  if (!Array.isArray(points) || !points.length) throw new Error("structural sparse record requires an authored footprint or volume");
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const point of points) for (const axis of ["x", "y", "z"]) {
    const value = finite(point?.[axis], `sparse ${axis}`);
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
  }
  return { min, max };
}

function sparseBounds(record) {
  const supplied = record.structuralBounds ?? (record.orderGeometry?.kind === "volume" ? record.orderGeometry : null);
  if (supplied) {
    const result = { min: {}, max: {} };
    for (const axis of ["x", "y", "z"]) {
      result.min[axis] = finite(supplied.min?.[axis], `sparse min ${axis}`);
      result.max[axis] = finite(supplied.max?.[axis], `sparse max ${axis}`);
      if (result.min[axis] > result.max[axis]) throw new Error("structural sparse bounds are inverted");
    }
    return result;
  }
  const points = record.footprint ?? record.orderGeometry?.points;
  const bounds = boundsFromPoints(points);
  const reach = record.visualReach;
  if (reach != null) {
    if (!reach || ![reach.x, reach.y, reach.z].every(value => Number.isFinite(value) && value >= 0))
      throw new Error("structural sparse visual reach must be finite and nonnegative");
    for (const axis of ["x", "y", "z"]) { bounds.min[axis] -= reach[axis]; bounds.max[axis] += reach[axis]; }
  }
  return bounds;
}

function sparseAnchor(record, bounds, signs) {
  const points = record.footprint?.length ? record.footprint : [{
    x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 }];
  let front = points[0], camera = cameraPoint(front, signs);
  for (let index = 1; index < points.length; index++) {
    const candidate = cameraPoint(points[index], signs);
    if (candidate.u + candidate.v > camera.u + camera.v ||
        (candidate.u + candidate.v === camera.u + camera.v && candidate.u - candidate.v > camera.u - camera.v)) {
      front = points[index]; camera = candidate;
    }
  }
  const height = Number.isFinite(record.storeyBand) ? record.storeyBand : front.y;
  return { point: front, camera, preferred: Object.freeze([camera.u + camera.v, height, 30, camera.u - camera.v, identityOf(record)]),
    bucket: Object.freeze([camera.u + camera.v, camera.w, camera.u - camera.v, front.x, front.z, identityOf(record)]) };
}

function overlaps(left, right) {
  return !left || !right || (left.left <= right.right && right.left <= left.right && left.top <= right.bottom && right.top <= left.bottom);
}

function cameraBounds(bounds, signs) {
  const transform = (axis, coefficient) => {
    const a = coefficient * bounds.min[axis], b = coefficient * bounds.max[axis];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  };
  return { u: transform("x", -signs.x), v: transform("z", -signs.z), w: transform("y", -signs.y) };
}

/** Conservative whole-picture relation from the packet. Diagonal separation
 * and overlapping volumes deliberately remain unresolved. */
export function conservativeStructuralRelation(left, right, direction, epsilon = EPSILON) {
  const signs = checkedDirection(direction);
  if (!(Number.isFinite(epsilon) && epsilon >= 0)) throw new Error("structural relation epsilon must be nonnegative");
  if (!overlaps(checkedScreenBounds(left.screenBounds), checkedScreenBounds(right.screenBounds))) return null;
  const a = cameraBounds(left.worldBounds, signs), b = cameraBounds(right.worldBounds, signs);
  let behind = false, front = false;
  for (const axis of ["u", "v", "w"]) {
    behind ||= a[axis].max < b[axis].min - epsilon;
    front ||= a[axis].min > b[axis].max + epsilon;
  }
  if (behind && !front) return "before";
  if (front && !behind) return "after";
  return null;
}

function* mergeSort(values, compare, work) {
  if (values.length < 2) return values;
  let source = [...values], target = new Array(values.length);
  for (let width = 1; width < values.length; width *= 2) {
    for (let start = 0; start < values.length; start += width * 2) {
      let left = start, right = Math.min(start + width, values.length);
      const leftEnd = right, rightEnd = Math.min(start + width * 2, values.length);
      for (let output = start; output < rightEnd; output++) {
        let takeLeft;
        if (left >= leftEnd) takeLeft = false;
        else if (right >= rightEnd) takeLeft = true;
        else { work.mergeComparisons++; takeLeft = compare(source[left], source[right]) <= 0; yield "merge-comparison"; }
        target[output] = takeLeft ? source[left++] : source[right++];
        work.mergeWrites++; yield "merge-write";
      }
    }
    [source, target] = [target, source];
  }
  return source;
}

function* lowerBound(entries, tuple, work) {
  let low = 0, high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    work.keySearches++; yield "key-search";
    if (compareStructuralTuple(entries[middle].key, tuple) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function gridRange(bounds, maxLocalCells) {
  const minX = Math.ceil(bounds.min.x - 0.5), maxX = Math.floor(bounds.max.x + 0.5);
  const minZ = Math.ceil(bounds.min.z - 0.5), maxZ = Math.floor(bounds.max.z + 0.5);
  const count = (maxX - minX + 1) * (maxZ - minZ + 1);
  if (!Number.isSafeInteger(count) || count > maxLocalCells)
    throw new RangeError(`structural sparse local query exceeds ${maxLocalCells} cells`);
  return { minX, maxX, minZ, maxZ };
}

function* queryIndex(index, range, work) {
  const found = new Map();
  for (let x = range.minX; x <= range.maxX; x++) for (let z = range.minZ; z <= range.maxZ; z++) {
    work.sparseQueries++; yield "sparse-query";
    for (const entry of index.get(`${x},${z}`) ?? []) {
      work.sparseCandidates++; yield "sparse-candidate";
      found.set(entry.id, entry);
    }
  }
  return found.values();
}

function* addToIndex(index, entry, maxLocalCells, work) {
  const range = gridRange(entry.worldBounds, maxLocalCells);
  for (let x = range.minX; x <= range.maxX; x++) for (let z = range.minZ; z <= range.maxZ; z++) {
    const key = `${x},${z}`, bucket = index.get(key) ?? [];
    bucket.push(entry); index.set(key, bucket); work.indexWrites++; yield "index-write";
  }
}

function pointOnContact(point, surface) {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite) || !Array.isArray(surface) || surface.length < 3) return false;
  const origin = surface[0]; let normal;
  for (let index = 1; index < surface.length - 1 && !normal; index++) {
    const a = { x:surface[index].x-origin.x, y:surface[index].y-origin.y, z:surface[index].z-origin.z };
    const b = { x:surface[index+1].x-origin.x, y:surface[index+1].y-origin.y, z:surface[index+1].z-origin.z };
    const candidate = { x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x };
    const length = Math.hypot(candidate.x,candidate.y,candidate.z);
    if (length > EPSILON) normal = { x:candidate.x/length, y:candidate.y/length, z:candidate.z/length };
  }
  if (!normal) return false;
  const planeDistance = value => (value.x-origin.x)*normal.x+(value.y-origin.y)*normal.y+(value.z-origin.z)*normal.z;
  if (surface.some(value => Math.abs(planeDistance(value)) > EPSILON) || Math.abs(planeDistance(point)) > EPSILON) return false;
  const drop = ["x","y","z"].reduce((best, axis) => Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best, "x");
  const [u,v] = ["x","y","z"].filter(axis => axis !== drop);
  let inside = false;
  for (let index=0, previous=surface.length-1; index<surface.length; previous=index++) {
    const a=surface[previous], b=surface[index];
    const cross=(b[u]-a[u])*(point[v]-a[v])-(b[v]-a[v])*(point[u]-a[u]);
    if (Math.abs(cross)<=EPSILON && point[u]>=Math.min(a[u],b[u])-EPSILON && point[u]<=Math.max(a[u],b[u])+EPSILON &&
        point[v]>=Math.min(a[v],b[v])-EPSILON && point[v]<=Math.max(a[v],b[v])+EPSILON) return true;
    if ((a[v]>point[v]) !== (b[v]>point[v]) &&
        point[u] < (b[u]-a[u])*(point[v]-a[v])/(b[v]-a[v])+a[u]) inside=!inside;
  }
  return inside;
}

function supportRequest(record) {
  if (record.attachment?.kind === "supported" && record.attachment.support != null)
    return { value: record.attachment.support, point: record.attachment.feet };
  if (record.support != null) return { value: record.support, point: record.support.point };
  return null;
}

function resolveSupport(record, contactsByIdentity, contactsByOwner, work) {
  const request = supportRequest(record);
  if (!request) return null;
  let support;
  if (typeof request.value === "object" && request.value.id != null && request.value.part != null)
    support = contactsByIdentity.get(`${String(request.value.id)}\u0000${String(request.value.part)}`);
  else {
    const owner = typeof request.value === "object" ? request.value.id : request.value;
    const matches = contactsByOwner.get(String(owner)) ?? [];
    if (matches.length > 1) throw new Error(`structural support is ambiguous: ${owner}`);
    support = matches[0];
  }
  if (!support) throw new Error(`structural support is missing for ${identityOf(record)}`);
  if (support.id === identityOf(record)) throw new Error("structural record cannot support itself");
  if (support.moving) throw new Error("structural support must belong to the fixed terrain/static compound");
  if (!pointOnContact(request.point, support.record.contactSurface))
    throw new Error(`structural support point is outside ${support.id}`);
  work.supportResolutions++; return support;
}

function sparseEntry(record, signs) {
  if (record.role !== "structure" && record.role !== "floor" && record.role !== "actor")
    throw new Error(`unsupported sparse structural role: ${record.role}`);
  const id = identityOf(record), worldBounds = sparseBounds(record), anchor = sparseAnchor(record, worldBounds, signs);
  const signature = JSON.stringify([id, record.role, record.partRole, record.storeyBand, record.footprint,
    record.structuralBounds, record.orderGeometry, record.screenBounds, record.contactSurface,
    record.compositePartition, record.attachment?.kind === "footprint" ? record.attachment : null]);
  return { record, id, signature, worldBounds, screenBounds: checkedScreenBounds(record.screenBounds), anchor,
    moving: record.moving === true || record.role === "actor" };
}

function attachCompoundBoundaries(statics, contacts, direction, work) {
  const byOwner = new Map();
  for (const entry of statics) {
    const list = byOwner.get(String(entry.record.id)) ?? [];
    list.push(entry); byOwner.set(String(entry.record.id), list);
  }
  for (const support of contacts.values()) {
    const boundaries = (byOwner.get(String(support.record.id)) ?? [])
      .filter(entry => entry.record.partRole === "upright-boundary");
    const far = [], near = [];
    for (const boundary of boundaries) {
      let relation = conservativeStructuralRelation(boundary, support, direction);
      if (!relation) {
        const compared = compareStructuralTuple(boundary.anchor.bucket, support.anchor.bucket);
        relation = compared < 0 ? "before" : compared > 0 ? "after" : null;
      }
      if (!relation) throw new Error(`structural support boundary is ambiguous: ${boundary.id}`);
      (relation === "before" ? far : near).push(boundary); work.supportBoundaryClassifications++;
    }
    if (far.some(entry => entry.baseIndex >= support.baseIndex) || near.some(entry => entry.baseIndex <= support.baseIndex))
      throw new Error(`structural support compound order is inconsistent: ${support.id}`);
    support.compoundFar = far; support.compoundNear = near;
  }
}

function sameDisplay(left, right) {
  return left?.display === right?.display;
}

/**
 * Structural ordering owner for dense grid pictures and bounded sparse images.
 * It owns classification, support resolution, revision admission, candidate
 * lifetime, coherent publication, and picking. It never constructs a relation
 * graph or calls plane/alpha ordering code.
 */
export function createStructuralDrawOrderOwner({ direction, clock = () => performance.now(), maxLocalCells = 256 } = {}) {
  const signs = checkedDirection(direction);
  if (!Number.isSafeInteger(maxLocalCells) || maxLocalCells < 4)
    throw new Error("structural local cell budget must be a positive safe integer");
  let pending, disposed = false, terrainRevision, denseLayout = null, staticState = null;
  let records = Object.freeze([]), latest = null;
  const taskStates = new WeakMap();
  const totals = { started: 0, ready: 0, published: 0, cancelled: 0, failed: 0, advances: 0, operations: 0,
    preparationMs: 0, maxAdvanceMs: 0, publicationMs: 0, densePairComparisons: 0, alphaComparisons: 0, topologyWork: 0 };

  function prepare({ terrainRevision: nextRevision, terrainRecords, subjectRecords } = {}) {
    if (disposed) throw new Error("structural draw owner is disposed");
    if (nextRevision === undefined || nextRevision === null || !Array.isArray(terrainRecords) || !Array.isArray(subjectRecords))
      throw new Error("structural preparation requires a terrain revision and record arrays");
    pending?.cancel(); totals.started++;
    let status = "pending", prepared, iterator;
    const work = { keyPreparations: 0, keySearches: 0, mergeComparisons: 0, mergeWrites: 0, indexWrites: 0,
      denseRecords: 0, denseRebuilds: 0, denseReuses: 0, sparseRecords: 0, sparseQueries: 0, sparseCandidates: 0,
      sparsePlacements: 0, staticRebuilds: 0, staticReuses: 0, staticIndexReuses: 0,
      ambiguousRelations: 0, conflicts: 0, supportResolutions: 0, supportBoundaryClassifications: 0,
      densePairComparisons: 0, alphaComparisons: 0, topologyWork: 0 };

    function* build() {
      const seen = new Set(), denseInput = [], staticInput = [], movingInput = [];
      for (const record of terrainRecords) {
        const entry = denseEntry(record, signs);
        if (seen.has(entry.id)) throw new Error(`duplicate structural record: ${entry.id}`);
        seen.add(entry.id); denseInput.push(entry); work.keyPreparations++; yield "key-preparation";
      }
      for (const record of subjectRecords) {
        const entry = sparseEntry(record, signs);
        if (seen.has(entry.id)) throw new Error(`duplicate structural record: ${entry.id}`);
        seen.add(entry.id); (entry.moving ? movingInput : staticInput).push(entry);
        work.keyPreparations++; work.sparseRecords++; yield "key-preparation";
      }

      let dense;
      if (denseLayout && nextRevision === terrainRevision) {
        const byIdentity = new Map();
        for (const entry of denseInput) { byIdentity.set(entry.id, entry); yield "dense-reuse"; }
        dense = [];
        for (const layout of denseLayout) {
          const entry = byIdentity.get(layout.id);
          if (!entry || compareStructuralTuple(entry.key, layout.key) !== 0 || entry.signature !== layout.signature)
            throw new Error("terrain structural facts changed without a terrain revision");
          dense.push(entry); byIdentity.delete(layout.id); work.denseReuses++; yield "dense-reuse";
        }
        if (byIdentity.size) throw new Error("terrain structural facts changed without a terrain revision");
      } else {
        dense = yield* mergeSort(denseInput, (a, b) => compareStructuralTuple(a.key, b.key), work);
        work.denseRebuilds++;
      }
      work.denseRecords = dense.length;
      for (let index = 0; index < dense.length; index++) dense[index].denseIndex = index;

      const contactsByIdentity = new Map(), contactsByOwner = new Map();
      for (const entry of [...staticInput, ...movingInput]) {
        if (entry.record.contactSurface) {
          if (contactsByIdentity.has(entry.id)) throw new Error(`duplicate structural contact surface: ${entry.id}`);
          contactsByIdentity.set(entry.id, entry);
          const owner = String(entry.record.id), list = contactsByOwner.get(owner) ?? [];
          list.push(entry); contactsByOwner.set(owner, list);
        }
        yield "contact-index";
      }

      const staticCanonical = yield* mergeSort(staticInput, (a, b) => a.id.localeCompare(b.id), work);
      const reuseStatics = Boolean(staticState && nextRevision === terrainRevision &&
        staticState.signatures.length === staticCanonical.length &&
        staticCanonical.every((entry,index) => entry.id === staticState.signatures[index].id &&
          entry.signature === staticState.signatures[index].signature));
      let statics;
      if (reuseStatics) {
        const byIdentity = new Map(staticCanonical.map(entry => [entry.id,entry]));
        statics = [];
        for (const retained of staticState.placements) {
          const entry=byIdentity.get(retained.id); entry.boundary=retained.boundary;
          statics.push(entry); work.staticReuses++; yield "static-reuse";
        }
      } else {
        const denseIndex = new Map();
        if (staticCanonical.length) for (const entry of dense) {
          if (entry.record.role === "terrain-cover") yield* addToIndex(denseIndex, entry, maxLocalCells, work);
          else {
            const key = `${entry.cell[0]},${entry.cell[2]}`, bucket = denseIndex.get(key) ?? [];
            bucket.push(entry); denseIndex.set(key, bucket); work.indexWrites++; yield "index-write";
          }
        }
        for (const entry of staticCanonical)
          yield* placeAgainstDense(entry, dense, denseIndex, signs, maxLocalCells, work);
        statics = yield* mergeSort(staticCanonical, comparePlaced, work); work.staticRebuilds++;
      }
      const staticBuckets = bucketByBoundary(statics);
      const base = [], baseEntries = [], denseBoundaryToBase = new Array(dense.length + 1);
      for (let boundary = 0; boundary <= dense.length; boundary++) {
        denseBoundaryToBase[boundary] = base.length;
        for (const entry of staticBuckets.get(boundary) ?? []) {
          entry.baseIndex = base.length; base.push(entry.record); baseEntries.push(entry); yield "base-merge";
        }
        if (boundary < dense.length) {
          dense[boundary].baseIndex = base.length; base.push(dense[boundary].record); baseEntries.push(dense[boundary]); yield "base-merge";
        }
      }
      attachCompoundBoundaries(statics, contactsByIdentity, signs, work);

      let baseIndex;
      if (reuseStatics) { baseIndex=staticState.baseIndex; work.staticIndexReuses++; yield "static-index-reuse"; }
      else {
        baseIndex = new Map();
        for (const entry of baseEntries) {
          if (entry.cell && entry.record.role !== "terrain-cover") {
            const key=`${entry.cell[0]},${entry.cell[2]}`, bucket=baseIndex.get(key)??[];
            bucket.push(entry); baseIndex.set(key,bucket); work.indexWrites++; yield "index-write";
          } else yield* addToIndex(baseIndex, entry, maxLocalCells, work);
        }
      }
      const movingCanonical = yield* mergeSort(movingInput, (a, b) => a.id.localeCompare(b.id), work);
      for (const entry of movingCanonical) {
        const support = resolveSupport(entry.record, contactsByIdentity, contactsByOwner, work);
        yield* placeAgainstBase(entry, dense, denseBoundaryToBase, base.length, baseIndex, support, signs, maxLocalCells, work);
      }
      const movers = yield* mergeSort(movingCanonical, comparePlaced, work);
      const moverBuckets = bucketByBoundary(movers), candidate = [];
      for (let boundary = 0; boundary <= base.length; boundary++) {
        for (const entry of moverBuckets.get(boundary) ?? []) { candidate.push(entry.record); yield "candidate-merge"; }
        if (boundary < base.length) { candidate.push(base[boundary]); yield "candidate-merge"; }
      }

      let physicalOrderChanged = candidate.length !== records.length, displayOrderChanged = physicalOrderChanged;
      const recordChanges = [];
      for (let index = 0; index < candidate.length && !physicalOrderChanged; index++) {
        if (identityOf(candidate[index]) !== identityOf(records[index])) physicalOrderChanged = true;
        if (!sameDisplay(candidate[index], records[index])) displayOrderChanged = true;
        if (candidate[index] !== records[index]) recordChanges.push(Object.freeze({ previous: records[index], current: candidate[index] }));
        yield "publication-check";
      }
      displayOrderChanged ||= physicalOrderChanged;
      const paintRequired = physicalOrderChanged || recordChanges.some(({previous,current}) =>
        [previous?.role,current?.role].some(role => role === "terrain" || role === "terrain-cover" || role === "water"));
      const frozenRecords = Object.freeze(candidate);
      const result = Object.freeze({ records: frozenRecords, stagedRecords: frozenRecords,
        physicalOrderChanged, displayOrderChanged, paintRequired,
        applyOrderRequired: physicalOrderChanged || displayOrderChanged,
        recordChanges: Object.freeze(recordChanges), metrics: Object.freeze({ ...work }) });
      const nextStaticState = reuseStatics ? staticState : Object.freeze({
        signatures: Object.freeze(staticCanonical.map(entry => Object.freeze({id:entry.id,signature:entry.signature}))),
        placements: Object.freeze(statics.map(entry => Object.freeze({id:entry.id,boundary:entry.boundary}))), baseIndex });
      return { result, layout: Object.freeze(dense.map(entry => Object.freeze({ id: entry.id, key: entry.key,
        signature: entry.signature }))), staticState: nextStaticState };
    }

    function release() { iterator?.return(); iterator = undefined; if (pending === task) pending = undefined; }
    const task = Object.freeze({
      get status() { return status; },
      get result() { return prepared?.result ?? null; },
      advance({ maxOperations = 256, deadline = Infinity } = {}) {
        if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 || !(deadline === Infinity || Number.isFinite(deadline)))
          throw new Error("invalid structural preparation budget");
        if (status !== "pending") return Object.freeze({ status, operations: 0, result: prepared?.result ?? null });
        const started = clock(); let operations = 0;
        try {
          while (operations < maxOperations && clock() < deadline) {
            const step = iterator.next();
            if (step.done) { prepared = step.value; iterator = undefined; status = "ready"; totals.ready++; break; }
            operations++;
          }
        } catch (error) { status = "failed"; totals.failed++; prepared = undefined; release(); throw error; }
        finally {
          const elapsed = Math.max(0, clock() - started); totals.advances++; totals.operations += operations;
          totals.preparationMs += elapsed; totals.maxAdvanceMs = Math.max(totals.maxAdvanceMs, elapsed);
        }
        return Object.freeze({ status, operations, result: prepared?.result ?? null });
      },
      cancel() {
        if (status !== "pending" && status !== "ready") return false;
        status = "cancelled"; totals.cancelled++; prepared = undefined; release(); return true;
      },
    });
    iterator = build(); pending = task;
    taskStates.set(task, { revision: nextRevision, prepared: () => prepared, publish() { status = "published"; release(); } });
    return task;
  }

  function publish(task) {
    if (task !== pending || task.status !== "ready") throw new Error("structural preparation is not ready or is stale");
    const state = taskStates.get(task), staged = state?.prepared();
    if (!staged) throw new Error("structural preparation does not belong to this owner");
    const started = clock(), candidate = staged.result;
    // Candidate arrays and records were completed before this turn. Publication
    // is only a coherent pointer/state swap; it does no sorting or copying.
    records = candidate.records; latest = candidate.metrics;
    terrainRevision = state.revision; denseLayout = staged.layout; staticState = staged.staticState;
    state.publish(); totals.published++; totals.publicationMs += Math.max(0, clock() - started);
    return candidate;
  }

  return Object.freeze({
    prepare,
    publish,
    pick(point) { return pickVoxelDrawRecord(records, point); },
    get records() { return records; },
    metrics: () => Object.freeze({ ...totals, latest,
      retained: Object.freeze({ records: records.length, denseLayout: denseLayout?.length ?? 0, pending: Boolean(pending) }) }),
    reset() { pending?.cancel(); pending = undefined; terrainRevision = undefined; denseLayout = null; staticState = null; records = Object.freeze([]); latest = null; },
    dispose() { if (!disposed) { pending?.cancel(); pending = undefined; records = Object.freeze([]); denseLayout = null; staticState = null; disposed = true; } },
  });
}

function comparePlaced(left, right) {
  return left.boundary - right.boundary || compareStructuralTuple(left.anchor.bucket, right.anchor.bucket) || left.id.localeCompare(right.id);
}

function bucketByBoundary(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const bucket = buckets.get(entry.boundary) ?? [];
    bucket.push(entry); buckets.set(entry.boundary, bucket);
  }
  return buckets;
}

function* placeAgainstDense(entry, dense, index, signs, maxLocalCells, work) {
  const preferred = yield* lowerBound(dense, entry.anchor.preferred, work);
  let lower = 0, upper = dense.length;
  const nearby = yield* queryIndex(index, gridRange(entry.worldBounds, maxLocalCells), work);
  for (const other of nearby) {
    const relation = conservativeStructuralRelation(entry, other, signs);
    if (relation === "after") lower = Math.max(lower, other.denseIndex + 1);
    else if (relation === "before") upper = Math.min(upper, other.denseIndex);
    else work.ambiguousRelations++;
  }
  if (lower > upper) { work.conflicts++; entry.conflict = Object.freeze({ lower, upper, policy: "stable-authored-anchor" }); }
  entry.boundary = lower > upper ? Math.max(lower, preferred) : Math.max(lower, Math.min(upper, preferred));
  entry.boundary = Math.min(dense.length, entry.boundary); work.sparsePlacements++; yield "sparse-placement";
}

function* placeAgainstBase(entry, dense, denseBoundaryToBase, baseLength, index, support, signs, maxLocalCells, work) {
  const preferredDense = yield* lowerBound(dense, entry.anchor.preferred, work);
  const preferred = denseBoundaryToBase[preferredDense];
  const hardLower = support ? Math.max(support.baseIndex + 1,
    ...support.compoundFar.map(boundary => boundary.baseIndex + 1)) : 0;
  const hardUpper = support ? Math.min(baseLength,
    ...support.compoundNear.map(boundary => boundary.baseIndex)) : baseLength;
  if (hardLower > hardUpper) throw new Error(`structural support compound cannot contain ${entry.id}`);
  let lower = hardLower, upper = hardUpper;
  const nearby = yield* queryIndex(index, gridRange(entry.worldBounds, maxLocalCells), work);
  for (const other of nearby) {
    if (support && other.id === support.id) continue;
    const relation = conservativeStructuralRelation(entry, other, signs);
    if (relation === "after") lower = Math.max(lower, other.baseIndex + 1);
    else if (relation === "before") upper = Math.min(upper, other.baseIndex);
    else work.ambiguousRelations++;
  }
  if (lower > upper) {
    work.conflicts++; entry.conflict = Object.freeze({ lower, upper, hardLower, hardUpper, policy: "mandatory-support-first" });
    entry.boundary = Math.max(hardLower, Math.min(hardUpper, preferred));
  } else entry.boundary = Math.max(lower, Math.min(upper, preferred));
  entry.boundary = Math.min(baseLength, entry.boundary); work.sparsePlacements++; yield "sparse-placement";
}
