const AXES = Object.freeze(["x", "z"]);

function cellKey(cell) { return cell.join(","); }
function edgeKey(edge) { return `${cellKey(edge.cell)}:${edge.axis}`; }

/** Acquire canonical grid edges on one visible support elevation. */
export function acquireEdgeStroke(start, end, project, verticalMetres, max = 256) {
  if (!Array.isArray(start) || !Array.isArray(end) || start[1] !== end[1]) throw new Error("edge stroke must stay on one elevation");
  const sx = Number(start[0]), sz = Number(start[2]), ex = Number(end[0]), ez = Number(end[2]);
  const axis = Math.abs(ex - sx) >= Math.abs(ez - sz) ? "x" : "z";
  const fixed = axis === "x" ? Math.round((sz + ez) / 2) : Math.round((sx + ex) / 2);
  const from = axis === "x" ? Math.min(sx, ex) : Math.min(sz, ez);
  const to = axis === "x" ? Math.max(sx, ex) : Math.max(sz, ez);
  const edges = [];
  for (let index = Math.floor(from); index < Math.ceil(to); index++) {
    const cell = axis === "x" ? [index, start[1], fixed] : [fixed, start[1], index];
    edges.push({ cell, axis });
  }
  if (edges.length === 0) {
    const cell = [Math.round(sx), start[1], Math.round(sz)];
    edges.push({ cell, axis });
  }
  if (edges.length > max) throw new Error("edge stroke exceeds 256 edges");
  return edges;
}

export function nearestGridSegment(point, project, level, verticalMetres) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new Error("invalid edge pointer");
  let best;
  for (let x = Math.floor(point.x) - 1; x <= Math.ceil(point.x) + 1; x++) for (let z = Math.floor(point.y) - 1; z <= Math.ceil(point.y) + 1; z++) {
    for (const axis of AXES) {
      const a = axis === "x" ? project(x, (level + 0.5) * verticalMetres, z) : project(x, (level + 0.5) * verticalMetres, z);
      const b = axis === "x" ? project(x + 1, (level + 0.5) * verticalMetres, z) : project(x, (level + 0.5) * verticalMetres, z + 1);
      const dx = b.x - a.x, dy = b.y - a.y, denominator = dx * dx + dy * dy;
      const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
      const distance = (point.x - (a.x + t * dx)) ** 2 + (point.y - (a.y + t * dy)) ** 2;
      const candidate = { cell: [x, level, z], axis, distance };
      if (!best || distance < best.distance || distance === best.distance && edgeKey(candidate) < edgeKey(best)) best = candidate;
    }
  }
  return best;
}

export function canonicalEdges(edges, max = 256) {
  const map = new Map();
  for (const edge of edges ?? []) {
    if (!Array.isArray(edge.cell) || edge.cell.length !== 3 || !edge.cell.every(Number.isSafeInteger) || !AXES.includes(edge.axis)) throw new Error("invalid edge target");
    map.set(edgeKey(edge), { cell: [...edge.cell], axis: edge.axis });
  }
  const result = [...map.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  if (!result.length || result.length > max) throw new Error("edge target exceeds 256 edges");
  return result;
}
