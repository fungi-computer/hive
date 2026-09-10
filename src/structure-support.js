import { BUILDINGS, footprint } from "./construction.js";
import {
  insidePlacement,
  placementFooting,
  placementKey,
  placementLevels,
  placementNeighbors,
} from "./game-space.ts";
import { terrainGeometry } from "./terrain.ts";
import { SIZE, stairLanding } from "./world.js";

// Rebuildable structural facts. No enclosure, furniture, or completed span can
// become a new anchor. Only rooted columns and actual terrain seed a height.
const cache = new WeakMap();
export function structuralSupport(state, proposed = null) {
  const terrain = terrainGeometry(state.terrain);
  const sites = state.sites.filter(
    (site) => site.finishedAt !== null && site.id !== proposed?.id,
  );
  if (proposed) sites.push(proposed);
  const stamp = JSON.stringify(
    sites.map(({ id, type, x, z, level, direction }) => [
      id,
      type,
      x,
      z,
      level,
      direction,
    ]),
  );
  const previous = cache.get(terrain);
  if (previous?.stamp === stamp) return previous.query;
  const range = placementLevels(state.terrain),
    surfaces = new Set(),
    spans = new Set();
  let columnTops = new Set(),
    landings = new Set();
  const terrainSupport = (cell) => {
    const at = placementFooting(cell);
    return (
      at.y - 1 >= terrain.bounds.min[1] &&
      at.y < terrain.bounds.max[1] &&
      terrain.solidAt(at.x, at.y - 1, at.z) &&
      !terrain.solidAt(at.x, at.y, at.z)
    );
  };
  for (let level = range.min; level <= range.max; level++) {
    const anchors = new Set(columnTops);
    for (let x = 0; x < SIZE; x++)
      for (let z = 0; z < SIZE; z++) {
        const cell = { x, z, level },
          key = placementKey(cell);
        if (terrainSupport(cell)) anchors.add(key);
        if (anchors.has(key) || landings.has(key)) surfaces.add(key);
      }
    const here = sites.filter((site) => site.level === level);
    const segments = new Map(
      here
        .filter((site) => BUILDINGS[site.type].support?.kind === "span")
        .map((site) => [placementKey(site), site]),
    );
    const distances = spanDistances(anchors, segments, level);
    for (const [key, segment] of segments)
      if (distances.has(key)) {
        spans.add(key);
        if (BUILDINGS[segment.type].walkable !== false) surfaces.add(key);
      }
    ({ columnTops, landings } = nextHeightSupports(here, surfaces));
  }
  const query = Object.freeze({
    surface: (cell) =>
      insidePlacement(cell) && surfaces.has(placementKey(cell)),
    span: (cell) => insidePlacement(cell) && spans.has(placementKey(cell)),
  });
  cache.set(terrain, { stamp, query });
  return query;
}

/** Distance is carried from the original anchor, never reset at a segment. */
function spanDistances(anchors, segments, level) {
  const distances = new Map(),
    queue = [];
  for (const key of anchors) {
    const [x, z] = key.split(",").map(Number);
    distances.set(key, 0);
    queue.push({ x, z, level });
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const at = queue[cursor],
      distance = distances.get(placementKey(at));
    for (const next of placementNeighbors(at)) {
      const key = placementKey(next),
        segment = segments.get(key);
      if (
        !segment ||
        distances.has(key) ||
        distance + 1 > BUILDINGS[segment.type].support.maxSteps
      )
        continue;
      distances.set(key, distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

/** Only supported load-bearing definitions and actual stair contacts rise. */
function nextHeightSupports(sites, surfaces) {
  const columnTops = new Set(),
    landings = new Set();
  for (const site of sites) {
    const bases = site.type === "stair" ? [site] : footprint(site);
    if (!bases.every((cell) => surfaces.has(placementKey(cell)))) continue;
    if (BUILDINGS[site.type].support?.kind === "column")
      for (const cell of footprint(site))
        columnTops.add(placementKey({ ...cell, level: cell.level + 1 }));
    if (site.type === "stair") landings.add(placementKey(stairLanding(site)));
  }
  return { columnTops, landings };
}
