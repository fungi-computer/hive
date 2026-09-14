// Original timber doorway fitted to the same canonical grid-edge convention
// as walls. Local +z follows the boundary; axis is its physical normal.
import { scene, group, box } from "./geometry.js";
import { STOREY_HEIGHT } from "./scale.js";

export const EDGE_DOOR_STAGES = Object.freeze(["stakes", "frame", "finished"]);

function checked(stage, axis) {
  if (!EDGE_DOOR_STAGES.includes(stage)) throw new Error(`Unknown edge door stage: ${stage}`);
  if (axis !== "x" && axis !== "z") throw new Error("Door segment requires x or z face normal");
}

function timber(parent, x, y, z, width, height, depth, color = "#8e6a43") {
  box(parent, color, x, y, z, width, height, depth);
  box(parent, "#ba925e", x + width / 2 + 0.002, y + height * 0.04, z - depth * 0.18,
    0.004, height * 0.82, Math.max(0.025, depth * 0.1));
}

/** An open door leaf leaves the canonical aperture visibly traversable. */
export function edgeDoorSegment(stage, axis = "x") {
  checked(stage, axis);
  const s = scene(), model = group(s);
  if (axis === "z") model.rotation.y = Math.PI / 2;
  const height = stage === "stakes" ? 0.46 : STOREY_HEIGHT;
  box(model, "#656957", 0, 0.045, 0, 0.24, 0.09, 0.82);
  for (const z of [-0.41, 0.41]) timber(model, 0, height / 2, z, 0.18, height, 0.16);
  if (stage === "stakes") {
    box(model, "#c6b783", 0, height - 0.035, 0, 0.014, 0.014, 0.65);
    return s;
  }
  timber(model, 0, height - 0.08, 0, 0.22, 0.16, 0.82);
  if (stage === "finished") {
    // The leaf is swung into the room around the negative-z jamb. It remains
    // one presentation sprite and never creates a second physical boundary.
    const leaf = group(model, -0.37, 0, -0.37);
    for (let index = 0; index < 4; index++)
      timber(leaf, 0.1 + index * 0.19, 0.8, 0, 0.18, 1.48, 0.09,
        index % 2 ? "#927047" : "#8e6a43");
    timber(leaf, 0.38, 0.22, 0, 0.76, 0.1, 0.12, "#755238");
    timber(leaf, 0.38, 1.38, 0, 0.76, 0.1, 0.12, "#755238");
    box(leaf, "#4b4940", 0.68, 0.82, 0.065, 0.055, 0.055, 0.035);
  }
  return s;
}
