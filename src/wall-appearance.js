import { placementKey, placementNeighbors } from "./game-space.ts";

export function wallMask(site, sites) {
  let mask = 0;
  placementNeighbors(site).forEach((cell, index) => {
    if (
      sites.some(
        (s) =>
          (s.type === "wall" || s.type === "door") &&
          placementKey(s) === placementKey(cell),
      )
    )
      mask |= 1 << index;
  });
  return mask || (site.direction ? 10 : 5);
}
