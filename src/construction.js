import {
  cellKey,
  inside,
  sameCell,
  neighbors,
  SIZE,
  blockedCells,
  placementOccupant,
} from "./world.js";
import { route } from "./movement.js";

// Actual buildable objects; the same costs and work drive ghosts, jobs and HUD.
export const BUILDINGS = {
  wall: {
    label: "Timber wall",
    wood: 1,
    ticks: 32,
    deconstructTicks: 32,
    salvageWood: 1,
  },
  door: {
    label: "Doorway",
    wood: 2,
    ticks: 48,
    deconstructTicks: 48,
    salvageWood: 1,
  },
  roof: {
    label: "Thatch roof",
    wood: 1,
    ticks: 24,
    deconstructTicks: 24,
    salvageWood: 1,
  },
  bed: {
    label: "Bedroll",
    wood: 2,
    ticks: 48,
    deconstructTicks: 48,
    salvageWood: 1,
  },
};
export function footprint(at) {
  const cells = [{ x: at.x, z: at.z, level: at.level ?? 0 }];
  if (at.type === "bed")
    cells.push({
      x: at.x + (at.direction === 1 ? 1 : 0),
      z: at.z + (at.direction === 1 ? 0 : 1),
      level: at.level ?? 0,
    });
  return cells;
}
export function placementProblem(state, at) {
  if (!at || !BUILDINGS[at.type]) return "Choose something to build.";
  if (!footprint(at).every(inside))
    return "Keep the footprint inside the clearing.";
  const overlaps = (s) =>
    footprint(s).some((a) => footprint(at).some((b) => sameCell(a, b)));
  if (
    state.sites.some(
      (s) => overlaps(s) && (s.type === "roof") === (at.type === "roof"),
    )
  )
    return "There is already a building or blueprint here.";
  if (
    footprint(at).some((cell) => {
      const occupant = placementOccupant(state, cell);
      return occupant === "herb" || occupant === "herb-bundle";
    })
  )
    return "Choose clear ground.";
  if (
    state.trees.some((t) => t.felledAt === null && overlaps(t)) ||
    state.rocks.some(overlaps) ||
    overlaps(state.watcher)
  )
    return "Choose clear ground.";
  if (
    at.type === "wall" &&
    (Object.values(state.actors).some(
      (person) =>
        sameCell(person, at) || person.path.some((p) => sameCell(p, at)),
    ) ||
      sameCell(state.cat, at) ||
      state.cat.path.some((p) => sameCell(p, at)))
  )
    return "Let the path clear before placing a wall here.";
  if (
    at.type === "wall" &&
    state.piles.some((p) => p.amount && sameCell(p, at))
  )
    return "Wood is lying here. Use it before building over it.";
  return "";
}
// A flood from the map edge finds outdoors. Doors seal a room for shelter,
// while movement treats their opening as walkable. No room objects to sync.
export function indoors(state) {
  const boundary = new Set(
    state.sites
      .filter(
        (s) =>
          s.finishedAt !== null && (s.type === "wall" || s.type === "door"),
      )
      .map(cellKey),
  );
  const outside = new Set(),
    queue = [];
  for (let x = 0; x < SIZE; x++)
    for (const z of [0, SIZE - 1]) queue.push({ x, z });
  for (let z = 1; z < SIZE - 1; z++)
    for (const x of [0, SIZE - 1]) queue.push({ x, z });
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i],
      key = cellKey(cell);
    if (!inside(cell) || boundary.has(key) || outside.has(key)) continue;
    outside.add(key);
    queue.push(...neighbors(cell));
  }
  const result = new Set();
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      const key = cellKey({ x, z });
      if (!outside.has(key) && !boundary.has(key)) result.add(key);
    }
  return result;
}
export function roofSupported(state, site, interior = indoors(state)) {
  return (
    interior.has(cellKey(site)) ||
    state.sites.some(
      (s) =>
        sameCell(s, site) &&
        s.finishedAt !== null &&
        (s.type === "wall" || s.type === "door"),
    )
  );
}
export function shelteredBeds(state) {
  const interior = indoors(state);
  const blocked = blockedCells(state);
  const entrances = state.sites.filter(
    (door) =>
      door.type === "door" &&
      door.finishedAt !== null &&
      neighbors(door).some(
        (cell) =>
          inside(cell) &&
          !interior.has(cellKey(cell)) &&
          !blocked.has(cellKey(cell)),
      ),
  );
  return state.sites.filter(
    (s) =>
      s.type === "bed" &&
      s.finishedAt !== null &&
      entrances.some((door) => route(door, s, blocked) !== null) &&
      footprint(s).every(
        (cell) =>
          interior.has(cellKey(cell)) &&
          state.sites.some(
            (r) =>
              r.type === "roof" && r.finishedAt !== null && sameCell(r, cell),
          ),
      ),
  );
}
