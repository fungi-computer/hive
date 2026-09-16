/*
 * CPU ordering for the ordinary Pixi presentation.
 *
 * Geometry in this module is deliberately presentation data: callers provide
 * canonical footprint points (long things provide both endpoints) and the
 * projected screen bounds of the visible part.  It never reads sprite pixels,
 * creates a depth texture, or owns physical geometry.
 */

import { compareOrderingPlanes, planeDepth, polygonContains, prepareOrderingProxy } from "./plane-order.js";

const EPSILON = 1e-7;
const ROLE_ORDER = Object.freeze({ terrain: 0, water: 1, floor: 2, structure: 3, item: 4, actor: 5 });
const SURFACE_ROLES = new Set(["terrain", "water", "floor"]);

function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`invalid isometric ${name}`);
  return value;
}

function point(value, name) {
  if (!value || typeof value !== "object")
    throw new Error(`invalid isometric ${name}`);
  return {
    x: finite(value.x, `${name}.x`),
    y: finite(value.y ?? 0, `${name}.y`),
    z: finite(value.z, `${name}.z`),
  };
}

function bounds(value, name) {
  if (
    !value ||
    !["left", "right", "top", "bottom"].every((key) =>
      Number.isFinite(value[key]),
    ) ||
    value.right < value.left ||
    value.bottom < value.top
  )
    throw new Error(`invalid isometric ${name} bounds`);
  return {
    left: value.left,
    right: value.right,
    top: value.top,
    bottom: value.bottom,
  };
}

function stableKey(node) {
  return `${String(node.id)}\u0000${String(node.part ?? "body")}`;
}

function overlaps(a, b) {
  return (
    a.left <= b.right + EPSILON &&
    b.left <= a.right + EPSILON &&
    a.top <= b.bottom + EPSILON &&
    b.top <= a.bottom + EPSILON
  );
}

function sortPoint(value, camera, name) {
  const p = point(value, name);
  return {
    x: p.x * camera.x - p.z * camera.z,
    y: p.x * camera.x + p.z * camera.z - p.y * camera.y,
  };
}

function lineYAt(line, x) {
  const [a, b] = line;
  if (Math.abs(b.x - a.x) <= EPSILON) return (a.y + b.y) / 2;
  return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
}

function cross(origin, left, right) {
  return (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
}

function convexHull(points) {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const half = (values) => {
    const result = [];
    for (const value of values) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), value) <= EPSILON) result.pop();
      result.push(value);
    }
    return result;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function projectedFootprint(node, camera) {
  return convexHull(node.footprint.map((value) => sortPoint(value, camera, `${stableKey(node)} footprint`)));
}

function xRange(shape) {
  return { min: Math.min(...shape.map(({ x }) => x)), max: Math.max(...shape.map(({ x }) => x)) };
}

function verticalSpanAt(shape, x) {
  if (shape.length === 1) return Math.abs(shape[0].x - x) <= EPSILON ? [shape[0].y, shape[0].y] : null;
  if (shape.length === 2) {
    const [left, right] = shape;
    const minX = Math.min(left.x, right.x), maxX = Math.max(left.x, right.x);
    if (x < minX - EPSILON || x > maxX + EPSILON) return null;
    if (maxX - minX <= EPSILON) return [Math.min(left.y, right.y), Math.max(left.y, right.y)];
    const y = lineYAt(shape, x);
    return [y, y];
  }
  const intersections = [];
  for (let index = 0; index < shape.length; index++) {
    const left = shape[index], right = shape[(index + 1) % shape.length];
    const minX = Math.min(left.x, right.x), maxX = Math.max(left.x, right.x);
    if (x < minX - EPSILON || x > maxX + EPSILON) continue;
    if (maxX - minX <= EPSILON) intersections.push(left.y, right.y);
    else intersections.push(lineYAt([left, right], x));
  }
  return intersections.length ? [Math.min(...intersections), Math.max(...intersections)] : null;
}

function comparisonXs(left, right) {
  const a = xRange(left), b = xRange(right);
  const min = Math.max(a.min, b.min), max = Math.min(a.max, b.max);
  if (max < min - EPSILON) return [];
  const critical = [min, max, ...left.map(({ x }) => x), ...right.map(({ x }) => x)]
    .filter((x) => x >= min - EPSILON && x <= max + EPSILON)
    .sort((a, b) => a - b)
    .filter((x, index, values) => index === 0 || Math.abs(x - values[index - 1]) > EPSILON);
  const result = [...critical];
  for (let index = 1; index < critical.length; index++) {
    if (critical[index] - critical[index - 1] > EPSILON) result.push((critical[index] + critical[index - 1]) / 2);
  }
  return result.sort((a, b) => a - b);
}

function relationByFootprints(left, right, camera) {
  const a = projectedFootprint(left, camera), b = projectedFootprint(right, camera);
  if (a.length === 1 && b.length === 1)
    return a[0].y < b[0].y - EPSILON ? [left, right] : b[0].y < a[0].y - EPSILON ? [right, left] : null;
  const samples = comparisonXs(a, b)
    .map((x) => ({ left: verticalSpanAt(a, x), right: verticalSpanAt(b, x) }))
    .filter(({ left, right }) => left && right);
  if (!samples.length) return null;
  if (samples.every(({ left, right }) => left[1] < right[0] - EPSILON)) return [left, right];
  if (samples.every(({ left, right }) => right[1] < left[0] - EPSILON)) return [right, left];
  return null;
}

function projectedContains(shape, pointValue) {
  if (shape.length < 3) return shape.some((point) => Math.abs(point.x - pointValue.x) <= EPSILON && Math.abs(point.y - pointValue.y) <= EPSILON);
  let positive = false, negative = false;
  for (let index = 0; index < shape.length; index++) {
    const a = shape[index], b = shape[(index + 1) % shape.length];
    const value = cross(a, b, pointValue);
    if (value > EPSILON) positive = true;
    if (value < -EPSILON) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

function uprightRelation(boundary, occupant, camera) {
  if (boundary.partRole !== "upright-boundary" || occupant.partRole === "upright-boundary" || (occupant.role !== "actor" && !occupant.moving)) return null;
  if (boundary.footprint.length < 2 || occupant.footprint.length < 1) return null;
  // A vertical extent may repeat XZ endpoints at different heights.
  const start = boundary.footprint[0];
  const end = boundary.footprint.find(p => Math.hypot(p.x - start.x, p.z - start.z) > EPSILON);
  if (!end) return null;
  const pointValue = occupant.footprint[0];
  const dx = end.x - start.x, dz = end.z - start.z;
  const along = ((pointValue.x - start.x) * dx + (pointValue.z - start.z) * dz) / (dx * dx + dz * dz);
  const minY = Math.min(...boundary.footprint.map(p => p.y));
  const maxY = Math.max(...boundary.footprint.map(p => p.y));
  if (along < -EPSILON || along > 1 + EPSILON || pointValue.y < minY - EPSILON || pointValue.y > maxY + EPSILON) return null;
  // The horizontal support face owns the shared top edge. A body based on or
  // above that edge is wholly above this lower curtain when it is actually in
  // the neighboring cell. A distant body remains on its camera side of the
  // curtain; treating the infinite dividing line as contact creates cycles.
  const perpendicular = Math.abs(dx * (pointValue.z - start.z) - dz * (pointValue.x - start.x)) / Math.hypot(dx, dz);
  if (boundary.role === "terrain" && pointValue.y >= maxY - EPSILON && perpendicular <= 0.5 + EPSILON)
    return [boundary, occupant];
  const side = dx * (pointValue.z - start.z) - dz * (pointValue.x - start.x);
  const cameraSide = dx * camera.z - dz * camera.x;
  if (Math.abs(side) <= EPSILON || Math.abs(cameraSide) <= EPSILON) return null;
  // Reversing endpoints reverses both signs, leaving the relation unchanged.
  return side * cameraSide > 0 ? [boundary, occupant] : [occupant, boundary];
}

function supportRelation(surface, occupant) {
  const footprint = convexHull(surface.footprint.map(p => ({ x: p.x, y: p.z })));
  const at = occupant.footprint[0];
  if (!at || footprint.length < 3 || !projectedContains(footprint, { x: at.x, y: at.z })) return null;
  const a = surface.footprint[0];
  for (let i = 1; i < surface.footprint.length - 1; i++) {
    const b = surface.footprint[i], c = surface.footprint[i + 1];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(ny) <= EPSILON) continue;
    const height = a.y - (nx * (at.x - a.x) + nz * (at.z - a.z)) / ny;
    return at.y < height - EPSILON ? [occupant, surface] : [surface, occupant];
  }
  return null;
}

function compactPlaneRelation(compact, plane, projection) {
  if (compact.orderingKind !== "compact" || !plane.planarCorners || !plane.orderingProxy) return null;
  const at = compact.footprint[0];
  if (!at) return null;
  const screen = projection.project(at);
  if (!polygonContains(plane.orderingProxy.polygon, screen)) {
    const center = plane.planarCorners.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }), { x: 0, y: 0, z: 0 });
    center.x /= plane.planarCorners.length; center.y /= plane.planarCorners.length; center.z /= plane.planarCorners.length;
    const pointAxis = at.x * projection.direction.x + at.y * projection.direction.y + at.z * projection.direction.z;
    const faceAxis = center.x * projection.direction.x + center.y * projection.direction.y + center.z * projection.direction.z;
    const epsilon = EPSILON * Math.max(1, Math.abs(pointAxis), Math.abs(faceAxis));
    return pointAxis > faceAxis + epsilon ? [compact, plane]
      : faceAxis > pointAxis + epsilon ? [plane, compact]
        : (ROLE_ORDER[plane.role] ?? 0) <= (ROLE_ORDER[compact.role] ?? 0) ? [plane, compact] : [compact, plane];
  }
  const ray = projection.ray(screen);
  const denominator = ray.direction.x ** 2 + ray.direction.y ** 2 + ray.direction.z ** 2;
  const pointDepth = ((at.x - ray.origin.x) * ray.direction.x +
    (at.y - ray.origin.y) * ray.direction.y +
    (at.z - ray.origin.z) * ray.direction.z) / denominator;
  const surfaceDepth = planeDepth(plane.orderingProxy, screen, projection);
  const epsilon = EPSILON * Math.max(1, Math.abs(pointDepth), Math.abs(surfaceDepth));
  return pointDepth > surfaceDepth + epsilon ? [compact, plane]
    : surfaceDepth > pointDepth + epsilon ? [plane, compact]
      : (ROLE_ORDER[plane.role] ?? 0) <= (ROLE_ORDER[compact.role] ?? 0) ? [plane, compact] : [compact, plane];
}

function compareStable(a, b) {
  return stableKey(a).localeCompare(stableKey(b));
}

function geometrySignature(node) {
  return JSON.stringify([
    node.role,
    node.part,
    node.partRole,
    node.relationPolicy,
    node.screenBounds,
    node.storeyBand,
    node.orderingProxy,
    node.footprint.map(({ x, y, z }) => [x, y, z]),
  ]);
}

function normalizeFootprint(values, name) {
  const unique = [...new Map(values.map((value) => {
    const p = point(value, name);
    return [`${p.x}:${p.y}:${p.z}`, p];
  })).values()];
  if (unique.length <= 2) return unique;
  const [origin, axis] = unique;
  const dx = axis.x - origin.x, dy = axis.y - origin.y, dz = axis.z - origin.z;
  const cross = unique.every((p) => Math.hypot(
    dy * (p.z - origin.z) - dz * (p.y - origin.y),
    dz * (p.x - origin.x) - dx * (p.z - origin.z),
    dx * (p.y - origin.y) - dy * (p.x - origin.x),
  ) <= EPSILON);
  if (cross) {
    let first = unique[0], last = unique[0], distance = -1;
    for (const left of unique) for (const right of unique) {
      const d = (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;
      if (d > distance) { distance = d; first = left; last = right; }
    }
    return [first, last];
  }
  return unique.sort((left, right) => left.x - right.x || left.z - right.z || left.y - right.y);
}

function validateNode(input) {
  if (!input || input.id === undefined || input.id === null)
    throw new Error("isometric node needs an id");
  const footprint = input.footprint ?? [{ x: 0, y: 0, z: 0 }];
  if (!Array.isArray(footprint) || footprint.length === 0)
    throw new Error(`isometric ${stableKey(input)} has no footprint`);
  return Object.freeze({
    ...input,
    id: String(input.id),
    part: input.part === undefined ? "body" : String(input.part),
    footprint: Object.freeze(normalizeFootprint(footprint, `${input.id} footprint`)),
    screenBounds: bounds(
      input.screenBounds ?? { left: 0, right: 0, top: 0, bottom: 0 },
      stableKey(input),
    ),
    storeyBand: finite(input.storeyBand ?? 0, `${input.id} storey band`),
    pickable: input.pickable === true,
    role: input.role ?? "actor",
    relationPolicy: input.relationPolicy === undefined ? "default" : String(input.relationPolicy),
    moving: input.moving === true,
    visible: input.visible !== false,
  });
}

function edgeFor(left, right, camera) {
  if (!overlaps(left.screenBounds, right.screenBounds)) return null;
  // A multipart stair can cross levels.  Its local support geometry supplies
  // the relation; a scalar band would incorrectly put every upper fragment
  // in front of every lower fragment.
  if (left.storeyBand !== right.storeyBand && left.relationPolicy !== "multipart-geometry" && right.relationPolicy !== "multipart-geometry")
    return left.storeyBand < right.storeyBand ? [left, right] : [right, left];
  if ((SURFACE_ROLES.has(left.role) || SURFACE_ROLES.has(right.role)) && ROLE_ORDER[left.role] !== undefined && ROLE_ORDER[right.role] !== undefined && ROLE_ORDER[left.role] !== ROLE_ORDER[right.role])
    return ROLE_ORDER[left.role] < ROLE_ORDER[right.role] ? [left, right] : [right, left];
  const boundaryRelation = uprightRelation(left, right, camera) ?? uprightRelation(right, left, camera);
  if (boundaryRelation) return boundaryRelation;
  if (left.partRole === "upright-boundary" && right.partRole === "upright-boundary" && left.id === right.id) return null;
  if ((left.partRole === "supporting-surface" && right.partRole === "upright-boundary") ||
      (right.partRole === "supporting-surface" && left.partRole === "upright-boundary")) return null;
  // A supporting surface owns the contact plane where an occupant's
  // projected footprint touches/overlaps it. This generic geometric rule
  // resolves equality at the floor without content IDs or z constants.
  const support = left.partRole === "supporting-surface" ? left : right.partRole === "supporting-surface" ? right : null;
  const occupant = support === left ? right : support === right ? left : null;
  if (support && occupant) {
    const contact = supportRelation(support, occupant);
    if (contact) return contact;
  }
  const relation = relationByFootprints(left, right, camera);
  if (relation) return relation;
  return null;
}

function relationKey(a, b) {
  return `${stableKey(a)}\u0000\u0000${stableKey(b)}`;
}

function cyclePath(keys, outgoing) {
  const allowed = new Set(keys);
  const visiting = new Set(), visited = new Set(), stack = [];
  function visit(key) {
    if (visiting.has(key)) return [...stack.slice(stack.indexOf(key)), key];
    if (visited.has(key)) return null;
    visiting.add(key); stack.push(key);
    for (const next of [...(outgoing.get(key) ?? [])].filter(value => allowed.has(value)).sort()) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop(); visiting.delete(key); visited.add(key);
    return null;
  }
  for (const key of [...keys].sort()) {
    const cycle = visit(key);
    if (cycle) return cycle;
  }
  return [...keys].sort();
}

/**
 * Keep static relations in a small cache. `invalidate` accepts an optional set
 * of IDs and removes only relations incident to those IDs; omitting it
 * invalidates every cached relation. Moving nodes bypass the cache, so actor
 * motion never leaves stale edges behind.
 */
export function createIsometricSorter({ camera = { x: 1, y: 0, z: 1 }, projection } = {}) {
  const basis = point(camera, "camera basis");
  const length = Math.hypot(basis.x, basis.y, basis.z);
  if (!(length > 0)) throw new Error("invalid isometric camera basis");
  const normalized = Object.freeze({
    x: basis.x / length,
    y: basis.y / length,
    z: basis.z / length,
  });
  const staticRelations = new Map();
  const bucketSize = 64;
  let staticIndex = new Map();
  let staticNodeSignatures = new Map();
  let staticIndexSignature = null;
  let invalidateAll = false;
  let relationTests = 0;

  function bucketRange(screenBounds) {
    return {
      // Expand by the same tolerance as overlaps(), so touching bounds that
      // are lawful relations cannot fall into disjoint buckets.
      left: Math.floor((screenBounds.left - EPSILON) / bucketSize),
      right: Math.floor((screenBounds.right + EPSILON) / bucketSize),
      top: Math.floor((screenBounds.top - EPSILON) / bucketSize),
      bottom: Math.floor((screenBounds.bottom + EPSILON) / bucketSize),
    };
  }

  function bucketKey(x, y) {
    return `${x}:${y}`;
  }

  function makeIndex(nodes) {
    const index = new Map();
    for (const node of nodes) {
      const range = bucketRange(node.screenBounds);
      for (let x = range.left; x <= range.right; x++)
        for (let y = range.top; y <= range.bottom; y++) {
          const key = bucketKey(x, y);
          let bucket = index.get(key);
          if (!bucket) index.set(key, (bucket = new Map()));
          bucket.set(stableKey(node), node);
        }
    }
    return index;
  }

  function indexedCandidates(index, node) {
    const found = new Map();
    const range = bucketRange(node.screenBounds);
    for (let x = range.left; x <= range.right; x++)
      for (let y = range.top; y <= range.bottom; y++)
        for (const [key, candidate] of index.get(bucketKey(x, y)) ?? [])
          found.set(key, candidate);
    return [...found.values()].sort(compareStable);
  }

  function nodeSignature(node) {
    return [stableKey(node), geometrySignature(node)];
  }

  function nodeIdFromKey(key) {
    return key.slice(0, key.indexOf("\u0000"));
  }

  function relationInvolves(key, ids) {
    const separator = key.indexOf("\u0000\u0000");
    if (separator < 0) return false;
    return ids.has(nodeIdFromKey(key.slice(0, separator)))
      || ids.has(nodeIdFromKey(key.slice(separator + 2)));
  }

  function dropRelations(predicate) {
    for (const key of staticRelations.keys())
      if (predicate(key)) staticRelations.delete(key);
  }

  function invalidate(ids) {
    if (ids === undefined) {
      staticRelations.clear();
      invalidateAll = true;
      return;
    }
    const affected = new Set([...ids].map(String));
    if (affected.size === 0) return;
    dropRelations((key) => relationInvolves(key, affected));
  }

  function relation(left, right) {
    const moving = left.moving || right.moving;
    const key = relationKey(left, right);
    const signature = `${geometrySignature(left)}|${geometrySignature(right)}`;
    if (!moving && staticRelations.get(key)?.signature === signature)
      return staticRelations.get(key).result;
    relationTests++;
    let result;
    if (projection) {
      // Whole upright sprites are presentation curtains, so their pixel bounds
      // can mathematically cross the plane that physically supports or borders
      // them. Resolve those declared contacts from canonical world geometry
      // before comparing the remaining arbitrary planes.
      result = uprightRelation(left, right, normalized) ?? uprightRelation(right, left, normalized);
      const support = left.partRole === "supporting-surface" ? left : right.partRole === "supporting-surface" ? right : null;
      const occupant = support === left ? right : support === right ? left : null;
      // Face-to-face ordering stays planar. Treating a vertical terrain face's
      // first corner as an occupant manufactures edges between merely adjacent
      // faces and can close a body/side/top cycle.
      if (!result && support && occupant && !occupant.planarCorners) result = supportRelation(support, occupant);
      if (!result) result = compactPlaneRelation(left, right, projection) ?? compactPlaneRelation(right, left, projection);
      if (!result) {
        const comparison = compareOrderingPlanes(left, right, projection);
        if (comparison.kind === "interleaving")
          throw new Error(`interleaving ordering planes: ${stableKey(left)} / ${stableKey(right)}`);
        result = comparison.kind === "ordered" ? comparison.edge : null;
        if (comparison.kind === "tie" && ROLE_ORDER[left.role] !== ROLE_ORDER[right.role])
          result = (ROLE_ORDER[left.role] ?? 0) < (ROLE_ORDER[right.role] ?? 0) ? [left, right] : [right, left];
      }
    } else result = edgeFor(left, right, normalized);
    if (!moving) staticRelations.set(key, { signature, result });
    return result;
  }

  function ensureStaticGraph(staticNodes) {
    const currentSignatures = new Map(staticNodes.map((node) => {
      const [key, signature] = nodeSignature(node);
      return [key, signature];
    }));
    const currentKeys = new Set(currentSignatures.keys());
    const changedKeys = new Set();
    for (const [key, signature] of staticNodeSignatures) {
      if (currentSignatures.get(key) !== signature) changedKeys.add(key);
    }
    for (const key of staticNodeSignatures.keys())
      if (!currentKeys.has(key)) changedKeys.add(key);
    if (invalidateAll) staticRelations.clear();
    else {
      dropRelations((key) => {
        const separator = key.indexOf("\u0000\u0000");
        if (separator < 0) return true;
        const left = key.slice(0, separator), right = key.slice(separator + 2);
        return !currentKeys.has(left) || !currentKeys.has(right)
          || changedKeys.has(left) || changedKeys.has(right);
      });
    }
    const indexSignature = JSON.stringify([...currentSignatures]);
    if (indexSignature !== staticIndexSignature || invalidateAll) {
      staticIndex = makeIndex(staticNodes);
      staticIndexSignature = indexSignature;
    }
    for (const left of staticNodes)
      for (const right of indexedCandidates(staticIndex, left))
        if (compareStable(left, right) < 0) relation(left, right);
    staticNodeSignatures = currentSignatures;
    invalidateAll = false;
  }

  function order(inputs) {
    relationTests = 0;
    const nodes = inputs
      .filter((node) => node?.visible !== false)
      .map(validateNode)
      .map(node => projection ? { ...node, orderingProxy: prepareOrderingProxy(node, projection) } : node)
      .sort(compareStable);
    const byKey = new Map(nodes.map((node) => [stableKey(node), node]));
    const outgoing = new Map(nodes.map((node) => [stableKey(node), new Set()]));
    const indegree = new Map(nodes.map((node) => [stableKey(node), 0]));
    const staticNodes = nodes.filter((node) => !node.moving);
    const movingNodes = nodes.filter((node) => node.moving);
    ensureStaticGraph(staticNodes);
    const movingIndex = makeIndex(movingNodes);
    const addRelation = (edge) => {
        if (!edge) return;
        const [before, after] = edge;
        const from = stableKey(before),
          to = stableKey(after);
        if (outgoing.get(from).has(to)) return;
        outgoing.get(from).add(to);
        indegree.set(to, indegree.get(to) + 1);
    };
    for (const relation of staticRelations.values()) addRelation(relation.result);
    for (const moving of movingNodes) {
      for (const candidate of indexedCandidates(staticIndex, moving))
        addRelation(relation(moving, candidate));
      for (const candidate of indexedCandidates(movingIndex, moving))
        if (compareStable(moving, candidate) < 0) addRelation(relation(moving, candidate));
    }
    const ready = nodes
      .filter((node) => indegree.get(stableKey(node)) === 0)
      .sort(compareStable);
    const result = [];
    while (ready.length) {
      const node = ready.shift();
      result.push(node);
      for (const target of [...outgoing.get(stableKey(node))].sort()) {
        indegree.set(target, indegree.get(target) - 1);
        if (indegree.get(target) === 0) ready.push(byKey.get(target));
      }
      ready.sort(compareStable);
    }
    // Cycles are possible for whole sprites. Remove one deterministic incoming
    // edge from the stalled node, then resume Kahn's algorithm.
    while (result.length < nodes.length) {
      if (projection) {
        const remaining = nodes.filter(node => !result.includes(node)).map(stableKey);
        const cycle = cyclePath(remaining, outgoing);
        const describe = key => {
          const node = byKey.get(key);
          return `${key}[${node?.partRole ?? "body"};${node?.orderingKind ?? "plane"};${node?.footprint.map(point => `${point.x},${point.y},${point.z}`).join("|") ?? "missing"}]`;
        };
        throw new Error(`cyclic ordering planes: ${cycle.map(describe).join(" -> ")}`);
      }
      const remaining = nodes
        .filter((node) => !result.includes(node))
        .sort(compareStable);
      const target = stableKey(remaining[0]);
      const predecessor = remaining
        .filter((node) => outgoing.get(stableKey(node)).has(target))
        .sort(compareStable)
        .at(-1);
      if (predecessor) {
        outgoing.get(stableKey(predecessor)).delete(target);
        indegree.set(target, Math.max(0, indegree.get(target) - 1));
      } else {
        indegree.set(target, 0);
      }
      if (indegree.get(target) === 0) ready.push(byKey.get(target));
      while (ready.length) {
        const node = ready.shift();
        if (result.includes(node)) continue;
        result.push(node);
        for (const next of [...outgoing.get(stableKey(node))].sort()) {
          indegree.set(next, indegree.get(next) - 1);
          if (indegree.get(next) === 0) ready.push(byKey.get(next));
        }
        ready.sort(compareStable);
      }
    }
    return result;
  }

  function apply(inputs) {
    const ordered = order(inputs);
    ordered.forEach((node, index) => {
      if (node.display && typeof node.display === "object")
        node.display.zIndex = index;
    });
    return ordered;
  }

  return Object.freeze({
    order,
    apply,
    invalidate,
    cacheSize: () => staticRelations.size,
    diagnostics: () => ({ relationTests }),
    camera: normalized,
  });
}

/** Use the same final ordering for alpha-silhouette picking. */
export function pickFromOrdered(order, candidates) {
  const rank = new Map(order.map((node, index) => [stableKey(node), index]));
  const node = (
    [...candidates]
      .filter((candidate) => candidate?.visible !== false)
      .sort(
        (a, b) =>
          (rank.get(stableKey(b)) ?? -1) - (rank.get(stableKey(a)) ?? -1) ||
          compareStable(a, b),
      )[0] ?? null
  );
  return node
    ? { node, target: node.pickable ? node.target ?? node.id : null, occluded: !node.pickable }
    : null;
}

/**
 * Resolve a horizontal support from the same final order used by rendering.
 *
 * Support selection is a geometry query, so it intentionally does not require
 * an alpha hit. The entity ordering still comes from the sorted render
 * records, which keeps overlapping decks deterministic while preserving the
 * transparent-silhouette behavior of ordinary entity picking.
 */
export function surfaceSubjectFromOrdered(order, subjects, pointValue, resolveSurface) {
  if (!Array.isArray(order) || !Array.isArray(subjects) || !pointValue || typeof resolveSurface !== "function") return null;
  const byId = new Map(subjects
    .filter((subject) => subject?.id !== undefined && subject?.id !== null)
    .map((subject) => [String(subject.id), subject]));
  const surfaces = new Map();
  const candidates = [];
  for (const node of order) {
    if (node?.visible === false || node?.pickable === false) continue;
    const subject = byId.get(String(node?.target ?? node?.id));
    if (!subject || subject.pickable === false || !subject.surface) continue;
    const surface = resolveSurface(pointValue.x, pointValue.y, subject);
    if (surface) {
      candidates.push(node);
      surfaces.set(stableKey(node), surface);
    }
  }
  const picked = pickFromOrdered(order, candidates);
  if (!picked) return null;
  const subject = byId.get(String(picked.node.target ?? picked.node.id));
  return subject ? { node: picked.node, subject, surface: surfaces.get(stableKey(picked.node)) } : null;
}

export function storeyBandFor(subject, verticalMetres) {
  const explicit = subject?.support?.level ?? subject?.surface?.level;
  if (Number.isFinite(explicit)) return explicit;
  if (!Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("isometric storey conversion requires positive vertical metres");
  return Math.floor(subject.y / verticalMetres);
}

/** Translate canonical art placement datums into the subject's world origin. */
export function subjectSortFootprint(subject, resolvedPlacement) {
  const origin = { x: subject.x, y: subject.y, z: subject.z };
  if (resolvedPlacement?.kind === "footprint" && resolvedPlacement.alignedFootprint?.length)
    return resolvedPlacement.alignedFootprint.map(([x, z]) => ({ x: origin.x + x, y: origin.y, z: origin.z + z }));
  if (resolvedPlacement?.kind === "stair" && resolvedPlacement.entrance && resolvedPlacement.landing)
    return [resolvedPlacement.entrance, resolvedPlacement.landing].map(([x, y, z]) => ({ x: origin.x + x, y: origin.y + y, z: origin.z + z }));
  if (resolvedPlacement?.kind === "edge" && resolvedPlacement.endpoints?.length)
    return resolvedPlacement.endpoints.map(([x, z]) => ({ x: origin.x + x, y: origin.y, z: origin.z + z }));
  return [origin];
}

export { stableKey };
