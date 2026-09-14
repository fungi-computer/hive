/*
 * CPU ordering for the ordinary Pixi presentation.
 *
 * Geometry in this module is deliberately presentation data: callers provide
 * canonical footprint points (long things provide both endpoints) and the
 * projected screen bounds of the visible part.  It never reads sprite pixels,
 * creates a depth texture, or owns physical geometry.
 */

const EPSILON = 1e-7;
const ROLE_ORDER = Object.freeze({ terrain: 0, water: 1, structure: 2, item: 3, actor: 4 });

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

function relationByFootprints(left, right, camera) {
  const a = left.footprint.map((value) => sortPoint(value, camera, `${stableKey(left)} footprint`));
  const b = right.footprint.map((value) => sortPoint(value, camera, `${stableKey(right)} footprint`));
  if (a.length > 2 || b.length > 2) {
    const aMin = Math.min(...a.map((value) => value.y)), aMax = Math.max(...a.map((value) => value.y));
    const bMin = Math.min(...b.map((value) => value.y)), bMax = Math.max(...b.map((value) => value.y));
    if (aMax < bMin - EPSILON) return [left, right];
    if (bMax < aMin - EPSILON) return [right, left];
    return null;
  }
  if (a.length === 1 && b.length === 1)
    return a[0].y < b[0].y - EPSILON ? [left, right] : b[0].y < a[0].y - EPSILON ? [right, left] : null;
  if (a.length === 1 || b.length === 1) {
    const pointNode = a.length === 1 ? left : right;
    const line = a.length === 1 ? b : a;
    const projected = a.length === 1 ? a[0] : b[0];
    const lineY = lineYAt(line, projected.x);
    if (projected.y < lineY - EPSILON) return [pointNode, a.length === 1 ? right : left];
    if (lineY < projected.y - EPSILON) return [a.length === 1 ? right : left, pointNode];
    return null;
  }
  const leftAgainstRight = a.map((value) => value.y - lineYAt(b, value.x));
  const rightAgainstLeft = b.map((value) => value.y - lineYAt(a, value.x));
  if (leftAgainstRight.every((value) => value < -EPSILON) && rightAgainstLeft.every((value) => value > EPSILON)) return [left, right];
  if (rightAgainstLeft.every((value) => value < -EPSILON) && leftAgainstRight.every((value) => value > EPSILON)) return [right, left];
  return null;
}

function compareStable(a, b) {
  return stableKey(a).localeCompare(stableKey(b));
}

function geometrySignature(node) {
  return JSON.stringify([
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
  const cross = unique.every((p) => Math.abs((axis.x - origin.x) * (p.z - origin.z) - (axis.z - origin.z) * (p.x - origin.x)) <= EPSILON);
  if (cross) {
    let first = unique[0], last = unique[0], distance = -1;
    for (const left of unique) for (const right of unique) {
      const d = (left.x - right.x) ** 2 + (left.z - right.z) ** 2;
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
    moving: input.moving === true,
    visible: input.visible !== false,
  });
}

function edgeFor(left, right, camera) {
  if (!overlaps(left.screenBounds, right.screenBounds)) return null;
  if (left.storeyBand !== right.storeyBand) return left.storeyBand < right.storeyBand ? [left, right] : [right, left];
  if ((left.role === "terrain" || left.role === "water" || right.role === "terrain" || right.role === "water") && ROLE_ORDER[left.role] !== undefined && ROLE_ORDER[right.role] !== undefined && ROLE_ORDER[left.role] !== ROLE_ORDER[right.role])
    return ROLE_ORDER[left.role] < ROLE_ORDER[right.role] ? [left, right] : [right, left];
  return relationByFootprints(left, right, camera);
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

  function invalidate(ids) {
    if (!ids) return staticRelations.clear();
    const changed = new Set([...ids].map(String));
    for (const key of staticRelations.keys()) {
      const [left, right] = key.split("\u0000\u0000");
      if (
        changed.has(left?.split("\u0000")[0]) ||
        changed.has(right?.split("\u0000")[0])
      )
        staticRelations.delete(key);
    }
  }

  function relation(left, right) {
    const moving = left.moving || right.moving;
    const key = relationKey(left, right);
    const signature = `${geometrySignature(left)}|${geometrySignature(right)}`;
    if (!moving && staticRelations.get(key)?.signature === signature)
      return staticRelations.get(key).result;
    const result = edgeFor(left, right, normalized);
    if (!moving) staticRelations.set(key, { signature, result });
    return result;
  }

  function order(inputs) {
    const nodes = inputs
      .filter((node) => node?.visible !== false)
      .map(validateNode)
      .sort(compareStable);
    const byKey = new Map(nodes.map((node) => [stableKey(node), node]));
    const outgoing = new Map(nodes.map((node) => [stableKey(node), new Set()]));
    const indegree = new Map(nodes.map((node) => [stableKey(node), 0]));
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const edge = relation(nodes[i], nodes[j]);
        if (!edge) continue;
        const [before, after] = edge;
        const from = stableKey(before),
          to = stableKey(after);
        if (outgoing.get(from).has(to)) continue;
        outgoing.get(from).add(to);
        indegree.set(to, indegree.get(to) + 1);
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
  return [origin];
}

export { stableKey };
