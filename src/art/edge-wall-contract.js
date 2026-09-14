/**
 * Declarative source contract for one timber wall segment on a grid edge.
 * Adjacency is expressed at the two endpoints of this edge. It deliberately
 * has no cell-neighbor mask: perpendicular edges meet at an endpoint.
 */
export const EDGE_WALL_FAMILY = "timber-edge-v1";
export const EDGE_WALL_AXES = Object.freeze(["x", "z"]);
export const EDGE_WALL_STAGES = Object.freeze(["stakes", "frame", "finished"]);

const SIDES = Object.freeze(["negative", "positive"]);
const DIRECTIONS = Object.freeze(["tangent", "normalNegative", "normalPositive"]);

function isBoolean(value) {
  return typeof value === "boolean";
}

export function validateEdgeWallPlacement(placement) {
  const allowed = new Set(["family", "axis", "cell", "adjacency", "stage"]);
  if (placement && Object.keys(placement).some((key) => !allowed.has(key)))
    throw new Error("Unknown edge wall placement field");
  if (!placement || placement.family !== EDGE_WALL_FAMILY)
    throw new Error(`Unsupported edge wall family: ${placement?.family ?? "missing"}`);
  if (!EDGE_WALL_AXES.includes(placement.axis))
    throw new Error(`Invalid edge wall axis: ${placement.axis}`);
  if (!Array.isArray(placement.cell) || placement.cell.length !== 3 ||
      placement.cell.some((value) => !Number.isInteger(value)))
    throw new Error("Edge wall cell must be an integer [x,y,z]");
  if (!placement.adjacency || SIDES.some((side) =>
      !placement.adjacency[side] || DIRECTIONS.some((direction) =>
        !isBoolean(placement.adjacency[side][direction]))))
    throw new Error("Edge wall adjacency must declare every endpoint direction");
  if (placement.stage !== undefined && !EDGE_WALL_STAGES.includes(placement.stage))
    throw new Error(`Invalid edge wall stage: ${placement.stage}`);
  return placement;
}

export function endpointJoinKind(endpoint) {
  const tangent = endpoint.tangent ? 1 : 0;
  const normal = (endpoint.normalNegative ? 1 : 0) + (endpoint.normalPositive ? 1 : 0);
  const degree = 1 + tangent + normal;
  if (degree >= 4) return "cross";
  if (degree === 3) return "t";
  if (degree === 2) return tangent ? "straight" : "corner";
  return "end";
}

export function edgeWallJoinVariant(adjacency) {
  const placement = validateEdgeWallPlacement({
    family: EDGE_WALL_FAMILY,
    axis: "x",
    cell: [0, 0, 0],
    adjacency,
  });
  const kinds = SIDES.map((side) => endpointJoinKind(placement.adjacency[side]));
  if (kinds.includes("cross")) return "cross";
  if (kinds.includes("t")) return "t";
  if (kinds.every((kind) => kind === "straight")) return "straight";
  if (kinds.includes("corner")) return "corner";
  return "end";
}

export function edgeWallPlacement(axis, cell, adjacency, stage = "finished") {
  return validateEdgeWallPlacement({ family: EDGE_WALL_FAMILY, axis, cell, adjacency, stage });
}
