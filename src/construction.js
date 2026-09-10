import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
  bodyProfile,
  bodyContact,
} from "./navigation-space.ts";
import { route as physicalRoute, standing } from "./engine/navigation/index.ts";
import {
  SIZE,
  groundLotsAt,
  placementOccupant,
  stairCells,
  stairHeadroom,
  stairLanding,
  upperSurface,
} from "./world.js";
import {
  placementFooting,
  worldView,
  placementKey,
  insidePlacement,
  samePlacement,
  placementNeighbors,
} from "./game-space.ts";
import { sameCell } from "./world.js";
import { terrainCell } from "./terrain.ts";

// Actual buildable objects; the same costs and work drive ghosts, jobs and HUD.
export const BUILDINGS = {
  wall: {
    environment: { kind: "solid-column", heightVoxels: 4 },
    label: "Timber wall",
    wood: 1,
    ticks: 32,
    deconstructTicks: 32,
    salvageWood: 1,
  },
  door: {
    environment: { kind: "permeable" },
    label: "Doorway",
    wood: 2,
    ticks: 48,
    deconstructTicks: 48,
    salvageWood: 1,
  },
  roof: {
    environment: { kind: "y-face", offsetVoxels: 4 },
    label: "Thatch roof",
    wood: 1,
    ticks: 24,
    deconstructTicks: 24,
    salvageWood: 1,
  },
  bed: {
    environment: { kind: "permeable" },
    label: "Bedroll",
    wood: 2,
    ticks: 48,
    deconstructTicks: 48,
    salvageWood: 1,
  },
  shelf: {
    environment: { kind: "permeable" },
    label: "Storage shelf",
    wood: 1,
    ticks: 24,
    deconstructTicks: 24,
    salvageWood: 1,
  },
  floor: {
    environment: { kind: "y-face", offsetVoxels: 0 },
    label: "Upper floor",
    wood: 1,
    ticks: 24,
    deconstructTicks: 24,
    salvageWood: 1,
  },
  stair: {
    environment: { kind: "permeable" },
    label: "Stair ramp",
    wood: 3,
    ticks: 72,
    deconstructTicks: 72,
    salvageWood: 2,
  },
  "brew-station": {
    environment: { kind: "permeable" },
    label: "Brew station",
    wood: 6,
    ticks: 144,
    deconstructTicks: 144,
    salvageWood: 3,
    slots: [
      {
        key: "kettle",
        prefix: "kettle",
        capacity: 5,
        accepts: ["water", "malt", "mugwort"],
        bulk: { water: 1, malt: 1, mugwort: 1 },
        deposit: true,
        withdraw: false,
      },
      {
        key: "hearth",
        prefix: "brew-hearth",
        capacity: 1,
        accepts: ["wood"],
        bulk: { wood: 1 },
        deposit: true,
        withdraw: false,
      },
      {
        key: "barm",
        prefix: "brew-barm",
        capacity: 1,
        accepts: ["barm"],
        bulk: { barm: 1 },
        deposit: true,
        withdraw: false,
      },
      {
        key: "keg",
        prefix: "brew-keg",
        capacity: 1,
        accepts: ["keg"],
        bulk: { keg: 1 },
        deposit: true,
        withdraw: false,
      },
      {
        key: "tray",
        prefix: "brew-tray",
        capacity: 1,
        accepts: ["spent-grain"],
        bulk: { "spent-grain": 1 },
        deposit: false,
        withdraw: false,
      },
    ],
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

/** Physical station slots come from the checked building definition. */
/** @returns {import("./materials.ts").ContainerSpec} */
function brewStationSlot(site, key) {
  const definition = BUILDINGS["brew-station"].slots.find(
    (slot) => slot.key === key,
  );
  if (!definition) throw new Error(`unknown brew station slot ${key}`);
  return {
    id: `${definition.prefix}:${site.id}`,
    capacity: /** @type {import("./model.ts").PositiveInt} */ (
      definition.capacity
    ),
    accepts: /** @type {import("./model.ts").Material[]} */ (
      definition.accepts
    ),
    bulk: /** @type {import("./materials.ts").ContainerSpec["bulk"]} */ (
      definition.bulk
    ),
  };
}
export function brewKettle(site) {
  return brewStationSlot(site, "kettle");
}
export function brewStationContainers(site) {
  return BUILDINGS["brew-station"].slots.map((slot) =>
    brewStationSlot(site, slot.key),
  );
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
      ...BUILDINGS["brew-station"].slots.map((slot) => ({
        site,
        slot: slot.key,
        destination: brewStationSlot(site, slot.key),
        deposit: slot.deposit,
        withdraw: slot.withdraw,
      })),
    ];
  return [];
}

/** The content-owned endpoint for one stable slot key and operation. */
export function siteMaterialEndpoint(site, slot, operation = null) {
  return (
    siteMaterialEndpoints(site).find(
      (endpoint) =>
        (operation === null || endpoint[operation]) && endpoint.slot === slot,
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
  return cells
    .filter(
      (cell, index) =>
        insidePlacement(cell) &&
        cells.findIndex((other) => samePlacement(other, cell)) === index,
    )
    .map(placementFooting);
}
function finishedSiteAt(state, cell, type = null) {
  return state.sites.some(
    (site) =>
      site.finishedAt !== null &&
      (!type || site.type === type) &&
      footprint(site).some((occupied) => samePlacement(occupied, cell)),
  );
}
export function floorSupported(state, cell) {
  const lower = { x: cell.x, z: cell.z, level: 0 };
  if (cell.level !== 1 || !insidePlacement(lower)) return false;
  if (
    state.sites.some(
      (site) =>
        site.type === "stair" &&
        stairHeadroom(site).some((headroom) => samePlacement(headroom, cell)),
    )
  )
    return false;
  if (
    state.sites.some(
      (site) =>
        samePlacement(site, lower) &&
        (site.type === "roof" || site.type === "door"),
    )
  )
    return false;
  return (
    indoors(state, 0).has(placementKey(lower)) ||
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
export function workPositions(state, site, operation = "build") {
  if (site.type === "brew-station") return brewStationAccessCells(site);
  if (
    site.type === "floor" &&
    site.level === 1 &&
    operation !== "deconstruct"
  ) {
    const lower = { x: site.x, z: site.z, level: 0 };
    return [lower, ...placementNeighbors(lower)]
      .filter(insidePlacement)
      .map(placementFooting);
  }
  const positions = placementNeighbors(site).filter(insidePlacement);
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
      if (insidePlacement(diagonal)) positions.push(diagonal);
    }
  if (
    site.type === "floor" &&
    site.level === 1 &&
    operation === "deconstruct"
  ) {
    const lower = { x: site.x, z: site.z, level: 0 };
    positions.push(lower, ...placementNeighbors(lower));
  }
  return positions.filter(insidePlacement).map(placementFooting);
}
export function workPosition(state, person, site, operation = "build") {
  return workPositions(state, site, operation).some((cell) =>
    sameCell(person, cell),
  );
}
export function workApproach(state, from, site, routes, operation = "build") {
  return routes.closest(from, workPositions(state, site, operation));
}
function coverAt(state, cell) {
  if (cell.level === 0)
    return state.sites.some(
      (site) =>
        site.finishedAt !== null &&
        ((site.type === "roof" && samePlacement(site, cell)) ||
          (site.type === "floor" &&
            site.level === 1 &&
            site.x === cell.x &&
            site.z === cell.z)),
    );
  return state.sites.some(
    (site) =>
      site.finishedAt !== null &&
      site.type === "roof" &&
      samePlacement(site, cell),
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
      (operation) =>
        operation.target.kind === "kettle" &&
        operation.target.station === site.id,
    );
    const hasBinding = state.materials.bindings.some(
      (binding) =>
        binding.kind === "recipe" && binding.station === brewKettle(site).id,
    );
    const hasProcess = state.processes.some(
      (process) => process.station === site.id,
    );
    const hasTransformation = state.materials.transformations.some(
      (transformation) =>
        state.materials.bindings.some(
          (binding) =>
            binding.kind === "recipe" &&
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
          footprint(candidate).some((cell) => samePlacement(cell, surface)),
      ) ||
      Object.values(state.actors).some(
        (actor) =>
          sameCell(actor, placementFooting(surface)) ||
          actor.traversal?.edge.sweep.some((cell) =>
            sameCell(cell, placementFooting(surface)),
          ),
      ) ||
      groundLotsAt(state, placementFooting(surface)).some(
        (lot) => worldView(lot.location).level === 1,
      )
    )
      return "Waiting for the upper surface to clear";
    if (
      person &&
      worldView(person).level === 1 &&
      !upperSurface(prospectiveState, worldView(person))
    )
      return "Waiting for a supported salvage position";
  }
  if (site.type === "stair" && losesStairAccess(state, prospectiveState, site))
    return "Waiting for connected upstairs access to remain";
  return null;
}
/** A spare stair only replaces access when it belongs to the same traversable
 * component. Compare actual dependent access against the removed stair's ground
 * endpoint; unrelated pre-existing inaccessible surfaces confer no dependency. */
function losesStairAccess(state, prospective, removed) {
  if (
    [...Object.values(state.actors), state.cat].some(
      (body) => body.traversal?.edge.link === removed.id,
    )
  )
    return true;
  const before = createNavigationSpaces(state),
    after = createNavigationSpaces(prospective);
  const ground = placementFooting(removed);
  const losesRoute = (at, profile, contact = null) =>
    at.y > ground.y &&
    physicalRoute(before(contact), at, ground, profile).kind === "route" &&
    physicalRoute(after(contact), at, ground, profile).kind !== "route";
  for (const body of [...Object.values(state.actors), state.cat])
    if (losesRoute(body, bodyProfile(state, body), bodyContact(body)))
      return true;
  const dependencies = [
    ...state.materials.lots.flatMap((lot) =>
      lot.location.kind === "ground" ? [lot.location] : [],
    ),
    ...prospective.sites.flatMap((site) =>
      site.level > removed.level
        ? workPositions(prospective, site, "deconstruct")
        : [],
    ),
    ...prospective.sites
      .filter((site) => site.type === "floor" && site.finishedAt !== null)
      .map(placementFooting),
  ];
  const seen = new Set();
  for (const at of dependencies) {
    if (at.y <= ground.y) continue;
    const key = `${at.x},${at.y},${at.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (losesRoute(at, HUMAN_NAVIGATION)) return true;
  }
  return false;
}

function sitesConflict(left, right) {
  if (
    !footprint(left).some((a) =>
      footprint(right).some((b) => samePlacement(a, b)),
    )
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
  if (
    footprint(at).some(
      (cell) => !terrainCell(state.terrain, cell.x, cell.z).support,
    )
  )
    return "Choose ground that supports this building.";
  if (at.type === "floor") {
    if (at.level !== 1) return "Upper floors belong on level 1.";
    if (crossLevelSurfaceConflict(state, at))
      return "An upper floor cannot share a cell with lower cover or a door.";
    if (!floorSupported(state, at))
      return "The upper floor needs lower support without a roof or door.";
  } else if (at.type === "stair") {
    if (at.level !== 0) return "The stair ramp belongs on the ground.";
    if (
      footprint(at).some((cell) => {
        const occupant = placementOccupant(state, placementFooting(cell));
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
            sameCell(person, placementFooting(cell)) ||
            person.traversal?.edge.sweep.some((next) =>
              sameCell(next, placementFooting(cell)),
            ),
        ),
      ) ||
      footprint(at).some(
        (cell) =>
          sameCell(state.cat, placementFooting(cell)) ||
          state.cat.traversal?.edge.sweep.some((next) =>
            sameCell(next, placementFooting(cell)),
          ),
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
                  .some((ramp) => samePlacement(ramp, headroom)))) &&
            footprint(site).some((cell) => samePlacement(cell, headroom)),
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
            samePlacement(stairLanding(site), cell) &&
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
              footprint(at).some((cell) => samePlacement(cell, headroom)),
            ),
      )
    )
      return "The stair ramp needs clear headroom upstairs.";
  }
  const overlaps = (s) =>
    footprint(s).some((a) => footprint(at).some((b) => samePlacement(a, b)));
  if (crossLevelSurfaceConflict(state, at))
    return "Upper floor and lower cover cannot share a cell.";
  if (state.sites.some((s) => overlaps(s) && sitesConflict(s, at)))
    return "There is already a building or blueprint here.";
  if (
    footprint(at).some((cell) => {
      const occupant = placementOccupant(state, placementFooting(cell));
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
        sameCell(person, placementFooting(at)) ||
        person.traversal?.edge.sweep.some((p) =>
          sameCell(p, placementFooting(at)),
        ),
    ) ||
      sameCell(state.cat, placementFooting(at)) ||
      state.cat.traversal?.edge.sweep.some((p) =>
        sameCell(p, placementFooting(at)),
      ))
  )
    return "Let the path clear before placing a wall here.";
  if (
    at.type === "wall" &&
    groundLotsAt(state, placementFooting(at)).some(
      (lot) => lot.material === "wood",
    )
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
      key = placementKey(cell);
    if (!insidePlacement(cell) || boundary.has(key) || outside.has(key))
      continue;
    outside.add(key);
    queue.push(...placementNeighbors(cell));
  }
  const result = new Set();
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      const key = placementKey({ x, z });
      if (!outside.has(key) && !boundary.has(key)) result.add(key);
    }
  return result;
}
function upstairsIndoors(state) {
  const supported = new Set();
  for (let x = 0; x < SIZE; x++)
    for (let z = 0; z < SIZE; z++) {
      const cell = { x, z, level: 1 };
      if (upperSupported(state, cell)) supported.add(placementKey(cell));
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
      placementNeighbors(cell).some(
        (next) =>
          !insidePlacement(next) ||
          (!supported.has(placementKey(next)) &&
            !boundary.has(placementKey(next))),
      )
    )
      queue.push(cell);
  }
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const key = placementKey(cell);
    if (outside.has(key) || boundary.has(key)) continue;
    outside.add(key);
    for (const next of placementNeighbors(cell))
      if (supported.has(placementKey(next))) queue.push(next);
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
    interior.has(placementKey(site)) ||
    state.sites.some(
      (s) =>
        samePlacement(s, site) &&
        s.finishedAt !== null &&
        (s.type === "wall" || s.type === "door"),
    )
  );
}
export function shelteredBeds(state) {
  const beds = state.sites.filter(
    (site) => site.type === "bed" && site.finishedAt !== null,
  );
  const spaces = createNavigationSpaces(state);
  return beds.filter((s) => {
    const interior = indoors(state, s.level);
    const space = spaces({ kind: "bed", site: s.id });
    const entrances = state.sites.filter(
      (door) =>
        door.level === s.level &&
        door.type === "door" &&
        door.finishedAt !== null &&
        placementNeighbors(door).some(
          (cell) =>
            insidePlacement(cell) &&
            !interior.has(placementKey(cell)) &&
            (s.level === 1 && !upperSupported(state, cell)
              ? true
              : standing(space, placementFooting(cell), HUMAN_NAVIGATION) ===
                "supported"),
        ),
    );
    return (
      entrances.some(
        (door) =>
          physicalRoute(
            space,
            placementFooting(door),
            placementFooting(s),
            HUMAN_NAVIGATION,
          ).kind === "route",
      ) &&
      footprint(s).every(
        (cell) =>
          interior.has(placementKey(cell)) &&
          (s.level === 0 || upperSupported(state, cell)) &&
          coverAt(state, cell),
      )
    );
  });
}
