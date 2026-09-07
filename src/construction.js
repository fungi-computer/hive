import {
  cellKey,
  inside,
  sameCell,
  neighbors,
  SIZE,
  blockedCells,
  placementOccupant,
  stairCells,
  stairHeadroom,
  stairLanding,
  upperSurface,
} from "./world.js";
import { pathTicks, route } from "./movement.js";

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
  shelf: {
    label: "Mugwort shelf",
    wood: 1,
    ticks: 24,
    deconstructTicks: 24,
    salvageWood: 1,
  },
  floor: {
    label: "Upper floor",
    wood: 1,
    ticks: 24,
    deconstructTicks: 24,
    salvageWood: 1,
  },
  stair: {
    label: "Stair ramp",
    wood: 3,
    ticks: 72,
    deconstructTicks: 72,
    salvageWood: 2,
  },
};
export function footprint(at) {
  if (at.type === "stair") return stairCells(at);
  const cells = [{ x: at.x, z: at.z, level: at.level ?? 0 }];
  if (at.type === "bed")
    cells.push({
      x: at.x + (at.direction === 1 ? 1 : 0),
      z: at.z + (at.direction === 1 ? 0 : 1),
      level: at.level ?? 0,
    });
  return cells;
}
function finishedSiteAt(state, cell, type = null) {
  return state.sites.some(
    (site) =>
      site.finishedAt !== null &&
      (!type || site.type === type) &&
      footprint(site).some((occupied) => sameCell(occupied, cell)),
  );
}
export function floorSupported(state, cell) {
  const lower = { x: cell.x, z: cell.z, level: 0 };
  if (cell.level !== 1 || !inside(lower)) return false;
  if (
    state.sites.some(
      (site) =>
        site.type === "stair" &&
        stairHeadroom(site).some((headroom) => sameCell(headroom, cell)),
    )
  )
    return false;
  if (
    state.sites.some(
      (site) =>
        sameCell(site, lower) && (site.type === "roof" || site.type === "door"),
    )
  )
    return false;
  return (
    indoors(state, 0).has(cellKey(lower)) ||
    finishedSiteAt(state, lower, "wall")
  );
}
export function crossLevelSurfaceConflict(state, site) {
  const upperFloor = site.type === "floor" && site.level === 1;
  const lowerCover =
    site.level === 0 && (site.type === "roof" || site.type === "door");
  if (!upperFloor && !lowerCover) return false;
  return state.sites.some(
    (other) =>
      other.id !== site.id &&
      (upperFloor
        ? other.level === 0 && (other.type === "roof" || other.type === "door")
        : other.type === "floor" && other.level === 1) &&
      other.x === site.x &&
      other.z === site.z,
  );
}
function upperSupported(state, cell) {
  return upperSurface(state, cell);
}
export function workPositions(state, site, operation = "build") {
  if (
    site.type === "floor" &&
    site.level === 1 &&
    operation !== "deconstruct"
  ) {
    const lower = { x: site.x, z: site.z, level: 0 };
    return [lower, ...neighbors(lower)].filter(inside);
  }
  const positions = neighbors(site).filter(inside);
  if (
    site.type === "floor" &&
    site.level === 1 &&
    operation === "deconstruct"
  ) {
    const lower = { x: site.x, z: site.z, level: 0 };
    positions.push(lower, ...neighbors(lower));
  }
  return positions.filter(inside);
}
export function workPosition(state, person, site, operation = "build") {
  return workPositions(state, site, operation).some((cell) =>
    sameCell(person, cell),
  );
}
export function workApproach(state, from, site, blocked, operation = "build") {
  return (
    workPositions(state, site, operation)
      .map((position) => route(from, position, blocked, state))
      .filter((path) => path !== null)
      .sort(
        (left, right) => pathTicks(from, left) - pathTicks(from, right),
      )[0] ?? null
  );
}
export function coverAt(state, cell) {
  if (cell.level === 0)
    return state.sites.some(
      (site) =>
        site.finishedAt !== null &&
        ((site.type === "roof" && sameCell(site, cell)) ||
          (site.type === "floor" &&
            site.level === 1 &&
            site.x === cell.x &&
            site.z === cell.z)),
    );
  return state.sites.some(
    (site) =>
      site.finishedAt !== null && site.type === "roof" && sameCell(site, cell),
  );
}
/** @param {import("./model.ts").Actor|null} [person] */
export function removalProblem(state, site, person = null) {
  if (!site || site.finishedAt === null)
    return "Waiting for a finished structure";
  const prospectiveState = {
    ...state,
    sites: state.sites.filter((candidate) => candidate.id !== site.id),
  };
  if (
    state.sites.some(
      (candidate) =>
        candidate.id !== site.id &&
        candidate.type === "floor" &&
        candidate.level === 1 &&
        !floorSupported(prospectiveState, candidate),
    )
  )
    return "Waiting for upper structures to be removed first";
  if (site.type === "floor") {
    const surface = { x: site.x, z: site.z, level: 1 };
    if (
      state.sites.some(
        (candidate) =>
          candidate.id !== site.id &&
          candidate.level === 1 &&
          footprint(candidate).some((cell) => sameCell(cell, surface)),
      ) ||
      Object.values(state.actors).some(
        (actor) =>
          (actor.level === 1 && sameCell(actor, surface)) ||
          actor.path.some((cell) => sameCell(cell, surface)),
      ) ||
      state.piles.some((pile) => pile.level === 1 && sameCell(pile, surface)) ||
      state.herbBundles.some(
        (bundle) =>
          bundle.location.kind === "ground" &&
          bundle.location.level === 1 &&
          sameCell(bundle.location, surface),
      )
    )
      return "Waiting for the upper surface to clear";
    if (person && person.level === 1 && !upperSurface(prospectiveState, person))
      return "Waiting for a supported salvage position";
  }
  if (
    site.type === "stair" &&
    (state.sites.some(
      (candidate) => candidate.id !== site.id && candidate.level === 1,
    ) ||
      Object.values(state.actors).some(
        (actor) =>
          actor.level === 1 || actor.path.some((cell) => cell.level === 1),
      ) ||
      state.piles.some((pile) => pile.amount > 0 && pile.level === 1) ||
      state.herbBundles.some(
        (bundle) =>
          bundle.location.kind === "ground" && bundle.location.level === 1,
      ))
  )
    return "Waiting for upstairs structures and materials to clear";
  return null;
}
export function sitesConflict(left, right) {
  if (
    !footprint(left).some((a) => footprint(right).some((b) => sameCell(a, b)))
  )
    return false;
  if (left.type === "stair" || right.type === "stair") return true;
  const layer = (type) =>
    type === "roof"
      ? "cover"
      : type === "wall" || type === "door"
        ? "standing"
        : type === "floor"
          ? "surface"
          : "object";
  const leftLayer = layer(left.type),
    rightLayer = layer(right.type);
  return (
    leftLayer === rightLayer ||
    (leftLayer === "standing" && rightLayer === "object") ||
    (rightLayer === "standing" && leftLayer === "object")
  );
}
export function placementProblem(state, at) {
  if (!at || !BUILDINGS[at.type]) return "Choose something to build.";
  if (!footprint(at).every(inside))
    return "Keep the footprint inside the clearing.";
  if (at.type === "floor") {
    if (at.level !== 1) return "Upper floors belong on level 1.";
    if (crossLevelSurfaceConflict(state, at))
      return "An upper floor cannot share a cell with lower cover or a door.";
    if (!floorSupported(state, at))
      return "The upper floor needs lower support without a roof or door.";
  } else if (at.type === "stair") {
    if (at.level !== 0) return "The stair ramp belongs on the ground.";
    if (state.sites.some((site) => site.type === "stair"))
      return "There is already a stair ramp here.";
    if (
      footprint(at).some((cell) => {
        const occupant = placementOccupant(state, cell);
        return (
          occupant === "tree" ||
          occupant === "rock" ||
          occupant === "watcher" ||
          occupant === "pile" ||
          occupant === "herb" ||
          occupant === "herb-bundle"
        );
      })
    )
      return "The stair ramp needs clear ground below.";
    if (
      footprint(at).some((cell) =>
        Object.values(state.actors).some(
          (person) =>
            sameCell(person, cell) ||
            person.path.some((next) => sameCell(next, cell)),
        ),
      ) ||
      footprint(at).some(
        (cell) =>
          sameCell(state.cat, cell) ||
          state.cat.path.some((next) => sameCell(next, cell)),
      )
    )
      return "Let the stair ramp clear before placing it.";
    if (
      stairHeadroom(at).some((headroom) =>
        state.sites.some(
          (site) =>
            site.level === 1 &&
            (site.type === "floor" ||
              (site.type === "roof" &&
                stairHeadroom(at)
                  .slice(0, 2)
                  .some((ramp) => sameCell(ramp, headroom)))) &&
            footprint(site).some((cell) => sameCell(cell, headroom)),
        ),
      )
    )
      return "The stair ramp needs clear headroom upstairs.";
  } else if (at.level === 1) {
    if (
      footprint(at).some((cell) =>
        state.sites.some(
          (site) =>
            site.type === "stair" &&
            sameCell(stairLanding(site), cell) &&
            at.type !== "door" &&
            at.type !== "roof",
        ),
      )
    )
      return "Only a doorway or roof may use the stair landing.";
    if (!footprint(at).every((cell) => upperSupported(state, cell)))
      return "Upper structures need finished floor support.";
    if (
      at.type === "roof" &&
      state.sites.some(
        (site) =>
          site.type === "stair" &&
          stairHeadroom(site)
            .slice(0, 2)
            .some((headroom) =>
              footprint(at).some((cell) => sameCell(cell, headroom)),
            ),
      )
    )
      return "The stair ramp needs clear headroom upstairs.";
  }
  const overlaps = (s) =>
    footprint(s).some((a) => footprint(at).some((b) => sameCell(a, b)));
  if (crossLevelSurfaceConflict(state, at))
    return "Upper floor and lower cover cannot share a cell.";
  if (state.sites.some((s) => overlaps(s) && sitesConflict(s, at)))
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
export function indoors(state, level = 0) {
  if (level === 1) return upstairsIndoors(state);
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
function upstairsIndoors(state) {
  const supported = new Set();
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      const cell = { x, z, level: 1 };
      if (upperSupported(state, cell)) supported.add(cellKey(cell));
    }
  const boundary = new Set(
    state.sites
      .filter(
        (site) =>
          site.level === 1 &&
          site.finishedAt !== null &&
          (site.type === "wall" || site.type === "door"),
      )
      .flatMap((site) => footprint(site).map(cellKey)),
  );
  const outside = new Set();
  const queue = [];
  for (const key of supported) {
    const [x, z] = key.split(",").map(Number);
    const cell = { x, z, level: 1 };
    if (
      neighbors(cell).some(
        (next) =>
          !inside(next) ||
          (!supported.has(cellKey(next)) && !boundary.has(cellKey(next))),
      )
    )
      queue.push(cell);
  }
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const key = cellKey(cell);
    if (outside.has(key) || boundary.has(key)) continue;
    outside.add(key);
    for (const next of neighbors(cell))
      if (supported.has(cellKey(next))) queue.push(next);
  }
  return new Set(
    [...supported].filter((key) => !outside.has(key) && !boundary.has(key)),
  );
}
export function roofSupported(
  state,
  site,
  interior = indoors(state, site.level),
) {
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
  const beds = state.sites.filter(
    (site) => site.type === "bed" && site.finishedAt !== null,
  );
  return beds.filter((s) => {
    const interior = indoors(state, s.level);
    const blocked = blockedCells(state);
    const entrances = state.sites.filter(
      (door) =>
        door.level === s.level &&
        door.type === "door" &&
        door.finishedAt !== null &&
        neighbors(door).some(
          (cell) =>
            inside(cell) &&
            !interior.has(cellKey(cell)) &&
            (s.level === 1 && !upperSupported(state, cell)
              ? true
              : !blocked.has(cellKey(cell))),
        ),
    );
    return (
      entrances.some((door) => route(door, s, blocked, state) !== null) &&
      footprint(s).every(
        (cell) =>
          interior.has(cellKey(cell)) &&
          (s.level === 0 || upperSupported(state, cell)) &&
          coverAt(state, cell),
      )
    );
  });
}
