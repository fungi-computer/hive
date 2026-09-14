/*
 * CPU ordering for the ordinary Pixi presentation.
 *
 * Geometry in this module is deliberately presentation data: callers provide
 * canonical footprint points (long things provide both endpoints) and the
 * projected screen bounds of the visible part.  It never reads sprite pixels,
 * creates a depth texture, or owns physical geometry.
 */

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

/**
 * Keep static relations in a small cache. `invalidate` accepts an optional set
 * of IDs; omitting it invalidates every cached relation. Moving nodes bypass
 * the cache, so actor motion never leaves stale edges behind.
 */
export function createIsometricSorter({ camera = { x: 1, y: 0, z: 1 } } = {}) {
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
  let staticSetSignature = null;
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

  function invalidate(ids) {
    // A static graph is one coherent cache. A scoped invalidation therefore
    // drops the whole graph, while the optional IDs document the transition
    // that caused it and keep the public operation useful to callers.
    void ids;
    staticRelations.clear();
    staticIndex = new Map();
    staticSetSignature = null;
  }

  function relation(left, right) {
    const moving = left.moving || right.moving;
    const key = relationKey(left, right);
    const signature = `${geometrySignature(left)}|${geometrySignature(right)}`;
    if (!moving && staticRelations.get(key)?.signature === signature)
      return staticRelations.get(key).result;
    relationTests++;
    const result = edgeFor(left, right, normalized);
    if (!moving) staticRelations.set(key, { signature, result });
    return result;
  }

  function ensureStaticGraph(staticNodes) {
    const signature = JSON.stringify(staticNodes.map(nodeSignature));
    if (signature === staticSetSignature) return;
    staticRelations.clear();
    staticIndex = makeIndex(staticNodes);
    staticSetSignature = signature;
    for (const left of staticNodes)
      for (const right of indexedCandidates(staticIndex, left))
        if (compareStable(left, right) < 0) relation(left, right);
  }

  function order(inputs) {
    relationTests = 0;
    const nodes = inputs
      .filter((node) => node?.visible !== false)
      .map(validateNode)
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
    const activeKeys = new Set(nodes.map(stableKey));
    for (const key of staticRelations.keys()) {
      const [left, right] = key.split("\u0000\u0000");
      if (!activeKeys.has(left) || !activeKeys.has(right)) staticRelations.delete(key);
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
