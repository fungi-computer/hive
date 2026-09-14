// Original timber kit fitted to physical grid edges. Local +z is the segment
// tangent; junctions use the world's +x,+z,-x,-z incident-edge mask.
import { scene, group, box } from "./geometry.js";
import { STOREY_HEIGHT } from "./scale.js";

export const EDGE_WALL_STAGES = Object.freeze(["stakes", "frame", "finished"]);
export const EDGE_WALL_JUNCTION_MASKS = Object.freeze(Array.from({ length: 15 }, (_, i) => i + 1));
const POST = 0.18;
const SPAN = 1 - POST;

function stageHeight(stage) {
  if (!EDGE_WALL_STAGES.includes(stage)) throw new Error(`Unknown edge wall stage: ${stage}`);
  return stage === "stakes" ? 0.46 : STOREY_HEIGHT;
}

function timber(parent, x, y, z, width, height, depth, color = "#8e6a43") {
  box(parent, color, x, y, z, width, height, depth);
  // The same thin sunlit grain used by the original wall builder.
  for (const side of [-1, 1])
    box(parent, "#ba925e", x + side * (width / 2 + 0.002), y + height * 0.04, z - depth * 0.18,
      0.004, height * 0.82, depth * 0.1);
}

/** Six authored frames: three stages in the two physical axes. */
export function edgeWallSegment(stage, axis = "x") {
  const height = stageHeight(stage);
  if (axis !== "x" && axis !== "z") throw new Error("Wall segment requires x or z face normal");
  const s = scene(), model = group(s);
  if (axis === "z") model.rotation.y = Math.PI / 2;
  box(model, "#656957", 0, 0.045, 0, 0.24, 0.09, SPAN);
  if (stage === "stakes") {
    box(model, "#c6b783", 0, height - 0.035, 0, 0.014, 0.014, SPAN);
    return s;
  }
  timber(model, 0, height - 0.08, 0, 0.22, 0.16, SPAN);
  timber(model, 0, 0.24, 0, 0.14, 0.11, SPAN, "#755238");
  if (stage === "finished") {
    for (let i = 0; i < 5; i++) {
      const z = -SPAN / 2 + (i + 0.5) * SPAN / 5;
      timber(model, 0, (height - 0.18) / 2 + 0.06, z, 0.115, height - 0.18, SPAN / 5 - 0.012,
        i % 2 ? "#927047" : "#8e6a43");
      for (const x of [-0.074, 0.074]) for (const y of [0.25, height - 0.24])
        box(model, "#4b4940", x, y, z, 0.012, 0.028, 0.028);
    }
  }
  return s;
}

/** One post per vertex. Joinery occupies only the post's own footprint. */
export function edgeWallJunction(stage, mask) {
  const height = stageHeight(stage);
  if (!EDGE_WALL_JUNCTION_MASKS.includes(mask)) throw new Error("Wall junction requires a nonempty cardinal mask");
  const s = scene();
  box(s, "#656957", 0, 0.055, 0, 0.25, 0.11, 0.25);
  timber(s, 0, height / 2, 0, POST, height, POST);
  if (stage === "stakes") {
    box(s, "#b49a65", 0, height - 0.018, 0, POST + 0.008, 0.036, POST + 0.008);
    return s;
  }
  for (const [bit, x, z] of [[1, 1, 0], [2, 0, 1], [4, -1, 0], [8, 0, -1]]) {
    if (!(mask & bit)) continue;
    // Flush tenon ends join the adjacent rail without extending halfway
    // into its segment or introducing another physical support object.
    box(s, "#755238", x * POST / 2, height - 0.1, z * POST / 2,
      x ? 0.012 : 0.1, 0.1, z ? 0.012 : 0.1);
    for (const y of [0.26, height - 0.24])
      box(s, "#4b4940", x * (POST / 2 + 0.006), y, z * (POST / 2 + 0.006),
        x ? 0.014 : 0.035, 0.035, z ? 0.014 : 0.035);
  }
  box(s, "#ba925e", 0, height - 0.018, 0, POST + 0.01, 0.036, POST + 0.01);
  return s;
}
