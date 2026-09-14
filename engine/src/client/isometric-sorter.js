/*
 * CPU ordering for the ordinary Pixi presentation.
 *
 * Geometry in this module is deliberately presentation data: callers provide
 * canonical footprint points (long things provide both endpoints) and the
 * projected screen bounds of the visible part.  It never reads sprite pixels,
 * creates a depth texture, or owns physical geometry.
 */

const EPSILON = 1e-7;

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
    footprint: Object.freeze(
      footprint.map((value) => point(value, `${input.id} footprint`)),
    ),
    screenBounds: bounds(
      input.screenBounds ?? { left: 0, right: 0, top: 0, bottom: 0 },
      stableKey(input),
    ),
    storeyBand: Number.isFinite(input.storeyBand) ? input.storeyBand : 0,
    moving: input.moving === true,
    visible: input.visible !== false,
  });
}

function edgeFor(left, right, camera) {
  if (!overlaps(left.screenBounds, right.screenBounds)) return null;
  if (left.storeyBand !== right.storeyBand) return left.storeyBand < right.storeyBand ? [left, right] : [right, left];
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
    if (!moving && staticRelations.has(key)) return staticRelations.get(key);
    const result = edgeFor(left, right, normalized);
    if (!moving) staticRelations.set(key, result);
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
    // Cycles are possible for whole sprites.  Remove the least authoritative
    // remaining edge by stable identity, then continue; this is deterministic
    // and leaves every node represented exactly once.
    while (result.length < nodes.length) {
      const remaining = nodes
        .filter((node) => !result.includes(node))
        .sort(compareStable);
      const node = remaining[0];
      result.push(node);
      for (const target of [...outgoing.get(stableKey(node))])
        if (!result.some((entry) => stableKey(entry) === target)) {
          indegree.set(target, 0);
          ready.push(byKey.get(target));
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
  return (
    [...candidates]
      .filter((candidate) => candidate?.visible !== false)
      .sort(
        (a, b) =>
          (rank.get(stableKey(b)) ?? -1) - (rank.get(stableKey(a)) ?? -1) ||
          compareStable(a, b),
      )[0] ?? null
  );
}

export { stableKey };
