import {
  EDGE_WALL_FAMILY,
  edgeWallJoinVariant,
  endpointJoinKind,
  validateEdgeWallPlacement,
} from "./edge-wall-contract.js";

const TIMBER = "#8e6a43";
const HIGHLIGHT = "#ba925e";
const JOINT = "#656957";
const STAGE_SIZE = Object.freeze({ stakes: [0.23, 0.46], frame: [1.08, 2.16], finished: [1.08, 2.16] });

function timber(specs, axis, x, y, z, tangentLength, normalLength, height) {
  const [w, d] = axis === "x" ? [normalLength, tangentLength] : [tangentLength, normalLength];
  specs.push({ role: "plank", color: TIMBER, x, y, z, w, h: height, d });
  specs.push({ role: "plank-highlight", color: HIGHLIGHT,
    x: axis === "x" ? x - w * 0.15 : x, y: y + height * 0.15,
    z: axis === "x" ? z : z + d * 0.5 + 0.004,
    w: axis === "x" ? w * 0.13 : w, h: height * 0.83, d: axis === "x" ? d : 0.015 });
}

/** Return renderer-neutral boxes, useful for proving placement without Three. */
export function edgeWallGeometry(placement) {
  validateEdgeWallPlacement(placement);
  const [y, height] = STAGE_SIZE[placement.stage ?? "finished"];
  const specs = [];
  // The one-unit span is tangent to the edge and the 0.25 thickness straddles it.
  timber(specs, placement.axis, 0, y, 0, 1, 0.25, height);
  for (const side of ["negative", "positive"]) {
    const endpoint = placement.adjacency[side];
    const tangent = side === "negative" ? -0.5 : 0.5;
    for (const normalSide of ["normalNegative", "normalPositive"]) {
      if (!endpoint[normalSide]) continue;
      const normal = normalSide === "normalNegative" ? -0.25 : 0.25;
      specs.push({ role: `endpoint-join-${endpointJoinKind(endpoint)}`, color: JOINT,
        x: placement.axis === "x" ? normal : tangent, y,
        z: placement.axis === "x" ? tangent : normal,
        w: placement.axis === "x" ? 0.25 : 0.5, h: height,
        d: placement.axis === "x" ? 0.5 : 0.25 });
    }
  }
  if (placement.stage === "finished") {
    for (const tangent of [-0.31, 0, 0.31])
      timber(specs, placement.axis, placement.axis === "x" ? 0 : tangent, 1.03,
        placement.axis === "x" ? tangent : 0, 0.17, 0.14, 1.94);
  }
  return Object.freeze({ family: EDGE_WALL_FAMILY, variant: edgeWallJoinVariant(placement.adjacency), boxes: specs });
}
