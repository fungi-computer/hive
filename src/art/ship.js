// Original timber sailing boat for the pirate moving-support example.
// The deck is deliberately open: navigation owns its rectangle separately.
import { scene, box, cylinder, group } from "./geometry.js";

export const SHIP_DECK = Object.freeze({
  minX: -3,
  maxX: 3,
  minZ: -2,
  maxZ: 2,
  height: 1,
});

function plank(parent, color, x, y, z, w, h, d) {
  box(parent, color, x, y, z, w, h, d);
}

function hull(parent) {
  // A low, stepped timber hull keeps the deck silhouette readable at the
  // fixed pixel scale without putting collision-like geometry on the deck.
  plank(parent, "#694733", 0, 0.28, 0, 6.65, 0.48, 4.15);
  plank(parent, "#815537", 0, 0.62, 0, 6.2, 0.25, 3.72);
  plank(parent, "#a8794b", 0, 0.84, 0, 6.02, 0.16, 3.52);
  for (const x of [-2.55, -1.3, 0, 1.3, 2.55])
    plank(parent, "#bc8b53", x, 0.96, 0, 1.08, 0.08, 3.35);
}

function deck(parent) {
  // Six broad boards leave the full x[-3,3], z[-2,2] rectangle visibly open.
  for (let index = 0, x = -2.5; x <= 2.5; x += 1, index++)
    plank(
      parent,
      index % 2 ? "#c18d52" : "#b27d48",
      x,
      1.06,
      0,
      0.92,
      0.1,
      3.88,
    );
  // Low rim sits just beyond the walkable rectangle.
  for (const x of [-3.18, 3.18]) {
    plank(parent, "#754b32", x, 1.23, 0, 0.18, 0.34, 4.55);
    plank(parent, "#a26c3f", x, 1.45, 0, 0.22, 0.12, 4.7);
  }
  for (const z of [-2.18, 2.18]) {
    plank(parent, "#754b32", 0, 1.23, z, 6.55, 0.34, 0.18);
    plank(parent, "#a26c3f", 0, 1.45, z, 6.7, 0.12, 0.22);
  }
}

function mastAndRigging(parent) {
  // The mast is beyond the back edge of the deck, so crew retain a clear
  // walkable interior. A small furled sail gives the boat character without
  // becoming a tall screen over the crew.
  const mast = cylinder(parent, "#5d3e2b", 0, 2.08, 2.3, 0.09, 0.12, 2.25, 8);
  mast.name = "ship-mast";
  const yard = box(parent, "#694733", 0, 2.55, 2.14, 2.15, 0.08, 0.08);
  yard.rotation.z = -0.08;
  const sail = group(parent, 0, 0, 0);
  sail.name = "ship-furled-sail";
  box(sail, "#d2bd88", 0.45, 2.06, 2.2, 0.9, 0.95, 0.06);
  box(sail, "#a58b60", 0.45, 2.06, 2.17, 0.08, 1.02, 0.08);
  // A short stern line remains outside the traversable deck rectangle.
  const rope = cylinder(parent, "#b28b58", 3.33, 1.25, 0, 0.025, 0.025, 2.5, 6);
  rope.rotation.x = Math.PI / 2;
}

export function shipScene(direction = 0) {
  if (!Number.isSafeInteger(direction) || direction < 0 || direction > 3)
    throw new Error("Ship direction must be one of four quarter turns");
  const result = scene();
  const model = group(result);
  model.name = "ship";
  model.rotation.y = (direction * Math.PI) / 2;
  hull(model);
  deck(model);
  mastAndRigging(model);
  const datum = group(model, 0, SHIP_DECK.height, 0);
  datum.name = "ship-deck-datum";
  return result;
}
