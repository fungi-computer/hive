// Presentation planes only. No collision, support admission or pixel depth.
export const PLANE_EPSILON = 1e-7;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const cross2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

// Synchronous entrypoints drain the same cooperative algorithms used by scene
// preparation. One yield is one bounded geometric/index operation.
export function finishOrderingSteps(steps) {
  let next;
  do next = steps.next(); while (!next.done);
  return next.value;
}

export function* sortOrderingSteps(values, compare) {
  let source = [], target = [];
  for (const value of values) { source.push(value); yield "sort"; }
  for (let width = 1; width < source.length; width *= 2) {
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length), end = Math.min(start + width * 2, source.length);
      let left = start, right = middle;
      for (let index = start; index < end; index++) {
        target[index] = right < end && (left === middle || compare(source[right], source[left]) < 0)
          ? source[right++] : source[left++];
        yield "sort";
      }
    }
    [source, target] = [target, source];
  }
  return source;
}

export function polygonArea(polygon) { return finishOrderingSteps(polygonAreaSteps(polygon)); }
export function* polygonAreaSteps(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]; sum += a.x * b.y - a.y * b.x; yield "geometry";
  }
  return sum / 2;
}

export function hull(points) { return finishOrderingSteps(hullSteps(points)); }
export function* hullSteps(points) {
  const sorted = yield* sortOrderingSteps(points, (a, b) => a.x - b.x || a.y - b.y);
  const out = [];
  for (let side = 0; side < 2; side++) {
    const half = [];
    for (let index = 0; index < sorted.length; index++) {
      const point = sorted[side ? sorted.length - index - 1 : index];
      while (half.length > 1 && cross2(half.at(-2), half.at(-1), point) <= PLANE_EPSILON) {
        half.pop(); yield "geometry";
      }
      half.push(point); yield "geometry";
    }
    half.pop();
    for (const point of half) { out.push(point); yield "geometry"; }
  }
  return out;
}

export function polygonContains(polygon, point) { return finishOrderingSteps(polygonContainsSteps(polygon, point)); }
export function* polygonContainsSteps(polygon, point) {
  if (polygon.length < 3) return false;
  for (let index = 0; index < polygon.length; index++) {
    if (cross2(polygon[index], polygon[(index + 1) % polygon.length], point) < -PLANE_EPSILON) return false;
    yield "geometry";
  }
  return true;
}

function* intersectionSteps(subject, clip) {
  let output = subject;
  for (let index = 0; index < clip.length && output.length; index++) {
    const a = clip[index], b = clip[(index + 1) % clip.length];
    const input = output; output = [];
    let previous = input.at(-1), previousSide = cross2(a, b, previous);
    for (const current of input) {
      yield "geometry";
      const side = cross2(a, b, current);
      if ((side >= 0) !== (previousSide >= 0)) {
        const ratio = previousSide / (previousSide - side);
        output.push({ x: previous.x + ratio * (current.x - previous.x), y: previous.y + ratio * (current.y - previous.y) });
      }
      if (side >= 0) output.push(current);
      previous = current; previousSide = side;
    }
  }
  return output;
}

/** Real corners for a face; upright camera-facing/endpoint curtain for art. */
export function prepareOrderingProxy(node, projection) {
  return finishOrderingSteps(prepareOrderingProxySteps(node, projection));
}
export function* prepareOrderingProxySteps(node, projection) {
  const corners = node.planarCorners ?? (node.partRole === "supporting-surface" ? node.footprint : undefined);
  const points = corners ?? node.footprint;
  const origin = points[0];
  let normal;
  if (corners) {
    for (let i = 1; i < points.length - 1; i++) {
      yield "geometry";
      const candidate = cross3(subtract(points[i], origin), subtract(points[i + 1], origin));
      if (Math.hypot(candidate.x, candidate.y, candidate.z) > PLANE_EPSILON) { normal = candidate; break; }
    }
  } else if (node.orderingKind === "line" || node.partRole === "upright-boundary") {
    let end;
    for (const point of points) {
      if (Math.hypot(point.x - origin.x, point.z - origin.z) > PLANE_EPSILON) { end = point; break; }
      yield "geometry";
    }
    if (!end) throw new Error(`line ordering proxy needs two distinct endpoints: ${node.id}`);
    normal = { x: end.z - origin.z, y: 0, z: origin.x - end.x };
  } else normal = { x: projection.direction.x, y: 0, z: projection.direction.z };
  if (!normal) return null;
  const length = Math.hypot(normal.x, normal.y, normal.z);
  normal = { x: normal.x / length, y: normal.y / length, z: normal.z / length };
  if (Math.abs(dot(normal, projection.direction)) <= PLANE_EPSILON) return null;
  const { left, right, top, bottom } = node.screenBounds;
  let polygon;
  if (corners) {
    const projected = [];
    for (const point of corners) { projected.push(projection.project(point)); yield "geometry"; }
    polygon = yield* hullSteps(projected);
  } else polygon = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  if (Math.abs(yield* polygonAreaSteps(polygon)) <= PLANE_EPSILON) return null;
  return { normal, constant: dot(normal, origin), polygon };
}

export function planeDepth(proxy, screenPoint, projection) {
  const ray = projection.ray(screenPoint);
  return (proxy.constant - dot(proxy.normal, ray.origin)) / dot(proxy.normal, ray.direction);
}

/** An orthographic depth difference is affine over this convex overlap. */
export function compareOrderingPlanes(left, right, projection) {
  return finishOrderingSteps(compareOrderingPlanesSteps(left, right, projection));
}
export function* compareOrderingPlanesSteps(left, right, projection) {
  const a = left.orderingProxy, b = right.orderingProxy;
  if (!a || !b) return { kind: "disjoint" };
  const overlap = yield* intersectionSteps(a.polygon, b.polygon);
  if (overlap.length < 3 || Math.abs(yield* polygonAreaSteps(overlap)) <= PLANE_EPSILON) return { kind: "disjoint" };
  let positive = false, negative = false;
  for (const p of overlap) {
    yield "geometry";
    const depthA = planeDepth(a, p, projection), depthB = planeDepth(b, p, projection);
    const epsilon = PLANE_EPSILON * Math.max(1, Math.abs(depthA), Math.abs(depthB));
    if (depthA - depthB > epsilon) positive = true;
    if (depthA - depthB < -epsilon) negative = true;
  }
  if (positive && negative) return { kind: "interleaving" };
  return positive ? { kind: "ordered", edge: [left, right] } : negative ? { kind: "ordered", edge: [right, left] } : { kind: "tie" };
}
