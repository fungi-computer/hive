const AXES = Object.freeze(["x", "z"]);

function edgeKey(edge) { return `${edge.cell.join(",")}:${edge.axis}`; }
function validCell(cell) { return Array.isArray(cell) && cell.length === 3 && cell.every(Number.isSafeInteger); }
function compareEdges(left, right) {
  return left.cell[0] - right.cell[0]
    || left.cell[1] - right.cell[1]
    || left.cell[2] - right.cell[2]
    || left.axis.localeCompare(right.axis);
}

/** World endpoints of one canonical face on the top of its selected support cell. */
export function edgeSegmentEndpoints(edge, verticalMetres) {
  if (!validCell(edge?.cell) || !AXES.includes(edge?.axis) || !Number.isFinite(verticalMetres) || verticalMetres <= 0)
    throw new Error("invalid edge target");
  const [x, y, z] = edge.cell;
  const height = (y + 0.5) * verticalMetres;
  return edge.axis === "x"
    ? [[x + 0.5, height, z - 0.5], [x + 0.5, height, z + 0.5]]
    : [[x - 0.5, height, z + 0.5], [x + 0.5, height, z + 0.5]];
}

function squaredDistanceToSegment(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const along = denominator
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator))
    : 0;
  return (point.x - (start.x + along * dx)) ** 2 + (point.y - (start.y + along * dy)) ** 2;
}

/** Choose one of the four physical faces surrounding the picked support cell. */
export function nearestGridSegment(point, project, supportCell, verticalMetres) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !validCell(supportCell))
    throw new Error("invalid edge pointer");
  const [x, y, z] = supportCell;
  const candidates = [
    { cell: [x, y, z], axis: "x" },
    { cell: [x - 1, y, z], axis: "x" },
    { cell: [x, y, z], axis: "z" },
    { cell: [x, y, z - 1], axis: "z" },
  ];
  return candidates.map(edge => {
    const [worldStart, worldEnd] = edgeSegmentEndpoints(edge, verticalMetres);
    const start = project(...worldStart), end = project(...worldEnd);
    return { ...edge, distance: squaredDistanceToSegment(point, start, end) };
  }).sort((left, right) => left.distance - right.distance || compareEdges(left, right))[0];
}

/** Extend an inclusive straight run from the initially selected physical face. */
export function acquireEdgeStroke(start, currentCell, max = 256) {
  if (!validCell(start?.cell) || !AXES.includes(start?.axis) || !validCell(currentCell) || start.cell[1] !== currentCell[1])
    throw new Error("edge stroke must stay on one elevation");
  const [x, y, z] = start.cell;
  if ((start.axis === "x" && currentCell[0] !== x) || (start.axis === "z" && currentCell[2] !== z))
    throw new Error("edge stroke must stay on its initial grid line");
  const from = start.axis === "x" ? z : x;
  const to = start.axis === "x" ? currentCell[2] : currentCell[0];
  const count = Math.abs(to - from) + 1;
  if (count > max) throw new Error(`edge stroke exceeds ${max} edges`);
  return Array.from({ length: count }, (_, offset) => {
    const tangent = Math.min(from, to) + offset;
    return start.axis === "x"
      ? { cell: [x, y, tangent], axis: "x" }
      : { cell: [tangent, y, z], axis: "z" };
  });
}

export function canonicalEdges(edges, max = 256) {
  const map = new Map();
  for (const edge of edges ?? []) {
    if (!validCell(edge?.cell) || !AXES.includes(edge?.axis)) throw new Error("invalid edge target");
    map.set(edgeKey(edge), { cell: [...edge.cell], axis: edge.axis });
  }
  const result = [...map.values()].sort(compareEdges);
  if (!result.length || result.length > max) throw new Error(`edge target exceeds ${max} edges`);
  return result;
}
