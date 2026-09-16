// Presentation planes only. No collision, support admission or pixel depth.
export const PLANE_EPSILON = 1e-7;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const cross2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function polygonArea(polygon) {
  return polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a.x * b.y - a.y * b.x; }, 0) / 2;
}

function hull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = values => {
    const out = [];
    for (const p of values) {
      while (out.length > 1 && cross2(out.at(-2), out.at(-1), p) <= PLANE_EPSILON) out.pop();
      out.push(p);
    }
    return out;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

export function polygonContains(polygon, point) {
  return polygon.length >= 3 && polygon.every((a, i) => cross2(a, polygon[(i + 1) % polygon.length], point) >= -PLANE_EPSILON);
}

function intersection(subject, clip) {
  let output = subject;
  for (let index = 0; index < clip.length && output.length; index++) {
    const a = clip[index], b = clip[(index + 1) % clip.length];
    const input = output; output = [];
    let previous = input.at(-1), previousSide = cross2(a, b, previous);
    for (const current of input) {
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
  const corners = node.planarCorners ?? (node.partRole === "supporting-surface" ? node.footprint : undefined);
  const points = corners ?? node.footprint;
  const origin = points[0];
  let normal;
  if (corners) {
    for (let i = 1; i < points.length - 1; i++) {
      const candidate = cross3(subtract(points[i], origin), subtract(points[i + 1], origin));
      if (Math.hypot(candidate.x, candidate.y, candidate.z) > PLANE_EPSILON) { normal = candidate; break; }
    }
  } else if (node.orderingKind === "line" || node.partRole === "upright-boundary") {
    const end = points.find(p => Math.hypot(p.x - origin.x, p.z - origin.z) > PLANE_EPSILON);
    if (!end) throw new Error(`line ordering proxy needs two distinct endpoints: ${node.id}`);
    normal = { x: end.z - origin.z, y: 0, z: origin.x - end.x };
  } else normal = { x: projection.direction.x, y: 0, z: projection.direction.z };
  if (!normal) return null;
  const length = Math.hypot(normal.x, normal.y, normal.z);
  normal = { x: normal.x / length, y: normal.y / length, z: normal.z / length };
  if (Math.abs(dot(normal, projection.direction)) <= PLANE_EPSILON) return null;
  const { left, right, top, bottom } = node.screenBounds;
  const polygon = corners ? hull(corners.map(p => projection.project(p))) : [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  if (Math.abs(polygonArea(polygon)) <= PLANE_EPSILON) return null;
  return { normal, constant: dot(normal, origin), polygon };
}

export function planeDepth(proxy, screenPoint, projection) {
  const ray = projection.ray(screenPoint);
  return (proxy.constant - dot(proxy.normal, ray.origin)) / dot(proxy.normal, ray.direction);
}

/** An orthographic depth difference is affine over this convex overlap. */
export function compareOrderingPlanes(left, right, projection) {
  const a = left.orderingProxy, b = right.orderingProxy;
  if (!a || !b) return { kind: "disjoint" };
  const overlap = intersection(a.polygon, b.polygon);
  if (overlap.length < 3 || Math.abs(polygonArea(overlap)) <= PLANE_EPSILON) return { kind: "disjoint" };
  let positive = false, negative = false;
  for (const p of overlap) {
    const depthA = planeDepth(a, p, projection), depthB = planeDepth(b, p, projection);
    const epsilon = PLANE_EPSILON * Math.max(1, Math.abs(depthA), Math.abs(depthB));
    if (depthA - depthB > epsilon) positive = true;
    if (depthA - depthB < -epsilon) negative = true;
  }
  if (positive && negative) return { kind: "interleaving" };
  return positive ? { kind: "ordered", edge: [left, right] } : negative ? { kind: "ordered", edge: [right, left] } : { kind: "tie" };
}
