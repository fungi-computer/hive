// Original one-cell timber herb shelf. Capacity and contents belong to game state.
import { box, cylinder, group } from "./geometry.js";
import { mugwortBundle } from "./herbs.js";

function board(parent, x, y, z, width, height, depth) {
  box(parent, "#896442", x, y, z, width, height, depth);
  box(parent, "#bc9667", x, y + height / 2, z, width, 0.012, depth);
}

function pegs(parent, x, z, height) {
  for (const y of [0.6, 1.15]) {
    if (y >= height) continue;
    const peg = cylinder(parent, "#d0ad74", x, y, z, 0.022, 0.022, 0.027, 5);
    peg.rotation.x = Math.PI / 2;
  }
}

export function shelf(parent, stage) {
  const finished = stage === "finished" || stage === "filled";
  for (const x of [-0.4, 0.4]) {
    for (const z of [-0.23, 0.23]) {
      const height = stage === "stakes" ? 0.22 : 1.28;
      board(parent, x, height / 2, z, 0.095, height, 0.09);
      if (finished) pegs(parent, x, z + 0.055, height);
    }
  }
  if (stage === "stakes") {
    // Loose boards inside the footprint make this distinct from wall stakes.
    const laid = group(parent, -0.03, 0.055, 0);
    laid.rotation.y = 0.13;
    for (const z of [-0.07, 0.07]) board(laid, 0, 0, z, 0.67, 0.055, 0.09);
    return;
  }
  for (const z of [-0.23, 0.23]) board(parent, 0, 0.55, z, 0.8, 0.095, 0.085);
  for (const z of [-0.23, 0.23]) board(parent, 0, 1.23, z, 0.83, 0.12, 0.075);
  const brace = boardBrace(parent);
  brace.rotation.z = -0.6;
  if (!finished) return;
  for (const z of [-0.18, 0, 0.18])
    board(parent, 0, 0.63, z, 0.89, 0.075, 0.17);
  // One open cubby, with side panels and a cap to read as a shelf, not a chair.
  for (const x of [-0.42, 0.42]) {
    board(parent, x, 0.94, 0, 0.06, 0.58, 0.49);
  }
  board(parent, 0, 0.94, -0.25, 0.8, 0.58, 0.045);
  for (const z of [-0.2, 0, 0.2]) board(parent, 0, 1.34, z, 0.98, 0.07, 0.195);
  // Small carved leaf on the crest signals herbs without claiming stored goods.
  const carving = group(parent, 0, 1.235, 0.278);
  box(carving, "#c6a06c", 0, 0, 0, 0.014, 0.08, 0.01);
  for (const side of [-1, 1])
    box(
      carving,
      "#b39768",
      side * 0.025,
      0.006,
      0,
      0.05,
      0.026,
      0.012,
    ).rotation.z = side * 0.5;
  if (stage === "filled") {
    const contents = group(parent, 0, 0.64, 0.09);
    contents.rotation.y = Math.PI / 2;
    mugwortBundle(contents);
  }
}

function boardBrace(parent) {
  const brace = group(parent, 0, 0.83, -0.245);
  board(brace, 0, 0, 0, 0.055, 0.73, 0.055);
  return brace;
}
