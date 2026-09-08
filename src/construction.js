import {
  cellKey,
  inside,
  sameCell,
  neighbors,
  SIZE,
  blockedCells,
  groundLotsAt,
  placementOccupant,
  stairCells,
  stairHeadroom,
  stairLanding,
  upperSurface,
} from "./world.js";
import { pathTicks, route } from "./movement.js";
import { herbalAleTray } from "./recipes.ts";

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
    label: "Storage shelf",
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
  "brew-station": {
    label: "Brew station",
    wood: 6,
    ticks: 144,
    deconstructTicks: 144,
    salvageWood: 3,
  },
};

// Consumer-owned destination policies. Materials only validates this resolved
// shape; it does not know construction or shelf content rules.
/** @returns {import("./materials.ts").ContainerSpec} */
export function constructionBuffer(site) {
  return {
    id: `construction-buffer:${site.id}`,
    capacity: BUILDINGS[site.type].wood,
    accepts: ["wood"],
    bulk: { wood: 1, mugwort: 1 },
  };
}

/** @returns {import("./materials.ts").ContainerSpec} */
export function shelfContainer(site) {
  return {
    id: `shelf:${typeof site === "string" ? site : site.id}`,
    capacity: 6,
    accepts: ["wood", "mugwort"],
    bulk: { wood: 2, mugwort: 1 },
  };
}

/** Physical station slots. Recipe amounts are independent from these capacities. */
export function brewKettle(site) {
  return {
    id: `kettle:${site.id}`,
    capacity: /** @type {import("./model.ts").PositiveInt} */ (5),
    accepts: /** @type {import("./model.ts").Material[]} */ ([
      "water",
      "malt",
      "mugwort",
    ]),
    bulk: {
      water: /** @type {import("./model.ts").PositiveInt} */ (1),
      malt: /** @type {import("./model.ts").PositiveInt} */ (1),
      mugwort: /** @type {import("./model.ts").PositiveInt} */ (1),
    },
  };
}
export function brewHearth(site) {
  return {
    id: `brew-hearth:${site.id}`,
    capacity: /** @type {import("./model.ts").PositiveInt} */ (1),
    accepts: /** @type {import("./model.ts").Material[]} */ (["wood"]),
    bulk: { wood: /** @type {import("./model.ts").PositiveInt} */ (1) },
  };
}
export function brewBarmSlot(site) {
  return {
    id: `brew-barm:${site.id}`,
    capacity: /** @type {import("./model.ts").PositiveInt} */ (1),
    accepts: /** @type {import("./model.ts").Material[]} */ (["barm"]),
    bulk: { barm: /** @type {import("./model.ts").PositiveInt} */ (1) },
  };
}
export function brewKegSlot(site) {
  return {
    id: `brew-keg:${site.id}`,
    capacity: /** @type {import("./model.ts").PositiveInt} */ (1),
    accepts: /** @type {import("./model.ts").Material[]} */ (["keg"]),
    bulk: { keg: /** @type {import("./model.ts").PositiveInt} */ (1) },
  };
}
export function brewStationContainers(site) {
  return [
    brewKettle(site),
    brewHearth(site),
    brewBarmSlot(site),
    brewKegSlot(site),
  ];
}

/**
 * Site-owned material endpoints.  This is the one lifecycle-aware catalogue
 * for transfer resolution, save relations, and structure teardown; the
 * material kernel receives only its resolved ContainerSpec.
 */
export function siteMaterialEndpoints(site) {
  if (site.finishedAt === null)
    return [
      {
        site,
        destination: constructionBuffer(site),
        deposit: true,
        withdraw: false,
      },
    ];
  if (site.type === "shelf")
    return [
      {
        site,
        destination: shelfContainer(site.id),
        deposit: true,
        withdraw: true,
      },
    ];
  if (site.type === "brew-station")
    return [
      ...brewStationContainers(site).map((destination) => ({
        site,
        destination,
        deposit: true,
        withdraw: false,
      })),
      {
        site,
        destination: herbalAleTray(site.id),
        deposit: false,
        withdraw: false,
      },
    ];
  return [];
}

/** The content-owned slot for one accepted material and operation. */
export function siteMaterialEndpointFor(site, material, operation = null) {
  return (
    siteMaterialEndpoints(site).find(
      (endpoint) =>
        (operation === null || endpoint[operation]) &&
        endpoint.destination.accepts.includes(material),
    ) ?? null
  );
}

// The construction consumer owns the only lifecycle-aware interpretation of a
// material destination. Transfer mechanics receive this resolved record; they
// never infer a destination from a structure type.
export function resolveMaterialEndpoint(sites, id, operation = "deposit") {
  for (const site of sites)
    for (const endpoint of siteMaterialEndpoints(site))
      if (
        endpoint.destination.id === id &&
        (operation === "deposit" ? endpoint.deposit : endpoint.withdraw)
      )
        return { site, destination: endpoint.destination };
  return null;
}
export function resolveMaterialDestination(sites, id) {
  return resolveMaterialEndpoint(sites, id, "deposit");
}
export function footprint(at) {
  if (at.type === "stair") return stairCells(at);
  if (at.type === "brew-station")
    return [
      { x: at.x, z: at.z, level: at.level ?? 0 },
      { x: at.x + 1, z: at.z, level: at.level ?? 0 },
      { x: at.x, z: at.z + 1, level: at.level ?? 0 },
      { x: at.x + 1, z: at.z + 1, level: at.level ?? 0 },
    ];
  const cells = [{ x: at.x, z: at.z, level: at.level ?? 0 }];
  if (at.type === "bed")
    cells.push({
      x: at.x + (at.direction === 1 ? 1 : 0),
      z: at.z + (at.direction === 1 ? 0 : 1),
      level: at.level ?? 0,
    });
  return cells;
}

/** Outside-front/side cells for the fixed 2×2 station datum. */
export function brewStationAccessCells(site) {
  const cells =
    site.direction === 1
      ? [
          { x: site.x + 2, z: site.z, level: site.level },
          { x: site.x + 2, z: site.z + 1, level: site.level },
          { x: site.x, z: site.z - 1, level: site.level },
          { x: site.x + 1, z: site.z - 1, level: site.level },
        ]
      : [
          { x: site.x, z: site.z + 2, level: site.level },
          { x: site.x + 1, z: site.z + 2, level: site.level },
          { x: site.x + 2, z: site.z, level: site.level },
          { x: site.x + 2, z: site.z + 1, level: site.level },
        ];
  return cells.filter(
    (cell, index) =>
      inside(cell) &&
      cells.findIndex((other) => sameCell(other, cell)) === index,
  );
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
function crossLevelSurfaceConflict(state, site) {
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
function workPositions(state, site, operation = "build") {
  if (site.type === "brew-station") return brewStationAccessCells(site);
  if (
    site.type === "floor" &&
    site.level === 1 &&
    operation !== "deconstruct"
  ) {
    const lower = { x: site.x, z: site.z, level: 0 };
    return [lower, ...neighbors(lower)].filter(inside);
  }
  const positions = neighbors(site).filter(inside);
  // A dragged closed outline must not strand its last corner behind its two
  // finished neighbors. Construction can reach that corner from the interior
  // diagonal, and delivery must revalidate that same work position. Movement
  // and deconstruction keep their cardinal topology.
  if (
    operation !== "deconstruct" &&
    site.level === 1 &&
    (site.type === "wall" || site.type === "door")
  )
    for (const [x, z] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const diagonal = {
        x: site.x + x,
        z: site.z + z,
        level: site.level,
      };
      if (inside(diagonal)) positions.push(diagonal);
    }
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
function coverAt(state, cell) {
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
  if (site.type === "brew-station") {
    const slots = new Set(
      siteMaterialEndpoints(site).map((endpoint) => endpoint.destination.id),
    );
    const hasContents = state.materials.lots.some(
      (lot) =>
        lot.location.kind === "container" && slots.has(lot.location.container),
    );
    const hasTransfer = state.materials.transfers.some(
      (transfer) =>
        (transfer.intent.kind === "deliver" &&
          slots.has(transfer.intent.destination)) ||
        (transfer.phase.kind === "reserved" &&
          transfer.phase.origin.kind === "container" &&
          slots.has(transfer.phase.origin.container)) ||
        (transfer.request.source.kind === "eligible-container" &&
          slots.has(transfer.request.source.container)),
    );
    const hasJob = state.jobs.some(
      (job) =>
        (job.kind === "fill-kettle" || job.kind === "brew") &&
        job.target === site.id,
    );
    const hasOperation = state.operations.some(
      (operation) => operation.station === site.id,
    );
    const hasBinding = state.materials.bindings.some(
      (binding) =>
        binding.kind === "brew" && binding.station === brewKettle(site).id,
    );
    const hasProcess = state.processes.some(
      (process) => process.station === site.id,
    );
    const hasTransformation = state.materials.transformations.some(
      (transformation) =>
        state.materials.bindings.some(
          (binding) =>
            binding.kind === "brew" &&
            binding.id === transformation.id &&
            binding.station === brewKettle(site).id,
        ),
    );
    if (
      hasContents ||
      hasTransfer ||
      hasJob ||
      hasOperation ||
      hasBinding ||
      hasProcess ||
      hasTransformation
    )
      return "The brew station is occupied.";
  }
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
      groundLotsAt(state, surface).some((lot) => lot.location.level === 1)
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
      state.materials.lots.some(
        (lot) => lot.location.kind === "ground" && lot.location.level === 1,
      ))
  )
    return "Waiting for upstairs structures and materials to clear";
  return null;
}
function sitesConflict(left, right) {
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
          occupant === "source" ||
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
      return (
        occupant === "source" ||
        occupant === "herb" ||
        occupant === "herb-bundle"
      );
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
    groundLotsAt(state, at).some((lot) => lot.material === "wood")
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
