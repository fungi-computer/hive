import { structuralSupport } from "./structure-support.js";
import { roomInterior } from "./room-space.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import { knownFootings } from "./exploration.ts";
import {
  createNavigationSpaces,
  stairLink,
  HUMAN_NAVIGATION,
  bodyProfile,
  bodyContact,
} from "./navigation-space.ts";
import {
  route as physicalRoute,
  standing,
  admitEdge,
} from "./engine/navigation/index.ts";
import {
  groundLotsAt,
  placementOccupant,
  stairCells,
  stairHeadroom,
  stairLanding,
  builtSurface,
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
import { terrainGeometry } from "./terrain.ts";

// Actual buildable objects; the same costs and work drive ghosts, jobs and HUD.
export const BUILDINGS = {
  wall: {
    support: { kind: "column" },
    environment: { kind: "solid-column", heightVoxels: 4 },
    label: "Timber wall",
    wood: 1,
    ticks: 32,
    deconstructTicks: 32,
    salvageWood: 1,
  },
  door: {
    support: { kind: "column" },
    environment: { kind: "permeable" },
    label: "Doorway",
    wood: 2,
    ticks: 48,
    deconstructTicks: 48,
    salvageWood: 1,
  },
  roof: {
    support: { kind: "span", maxSteps: 6 },
    environment: { kind: "y-face", offsetVoxels: 0 },
    visualBaseOffset: -1,
    walkable: false,
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
    support: { kind: "span", maxSteps: 6 },
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
  if (
    state.sites.some(
      (site) =>
        site.type === "stair" &&
        stairHeadroom(site).some((headroom) => samePlacement(headroom, cell)),
    )
  )
    return false;
  return structuralSupport(state, { ...cell, type: "floor" }).span(cell);
}
/** Floor and roof are alternative physical faces at the same selected height. */
function crossLevelSurfaceConflict(state, site) {
  if (site.type !== "floor" && site.type !== "roof") return false;
  return state.sites.some(
    (other) =>
      other.id !== site.id &&
      (other.type === "floor" || other.type === "roof") &&
      samePlacement(other, site),
  );
}

/** Original roof textures are authored above a room base. Only their draw
 * anchor moves; the saved placement and picking target remain the surface. */
export function buildingVisualPlacement(site) {
  return {
    ...site,
    level: site.level + (BUILDINGS[site.type].visualBaseOffset ?? 0),
  };
}

export function buildingEnvelopeProblem(state, site) {
  if (!footprint(site).every(insidePlacement))
    return "Keep the footprint inside the clearing.";
  const { bounds, frame } = terrainGeometry(state.terrain);
  const y = placementFooting(site).y;
  const shape = BUILDINGS[site.type].environment;
  const lower = site.type === "roof" ? y - frame.storeyVoxels : y;
  const upper =
    shape.kind === "y-face"
      ? y
      : y + frame.storeyVoxels * (site.type === "stair" ? 2 : 1);
  if (lower < bounds.min[1] || upper >= bounds.max[1])
    return "Keep the building inside the known world height.";
  return null;
}

/** Structural dependencies are stable save/settlement facts, unlike temporary
 * actor occupancy or current route availability. */
export function buildingSupportProblem(state, site) {
  if (site.type === "floor")
    return floorSupported(state, site)
      ? null
      : "Waiting for floor support below.";
  if (site.type === "roof")
    return roofSupported(state, site)
      ? null
      : "Waiting for roof support below.";
  const cells = site.type === "stair" ? [site] : footprint(site);
  return cells.every((cell) => surfaceSupported(state, cell))
    ? null
    : "Waiting for a supported building surface.";
}

/** The same stable dependency law is used for saves and prospective edits. */
export function structureSupportProblem(state) {
  for (const site of state.sites)
    if (
      (site.finishedAt !== null || site.type === "floor") &&
      buildingSupportProblem(state, site)
    )
      return `unsupported ${site.type} ${site.id}`;
  return null;
}

export function surfaceSupported(state, cell) {
  return structuralSupport(state).surface(cell);
}

/** A builder can work from one neighboring cell, including the existing
 * diagonal corner reach. Route admission still requires a supported body. */
function neighboringWorkCells(at) {
  const cells = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      if (dx || dz) cells.push({ x: at.x + dx, z: at.z + dz, level: at.level });
  return cells.filter(insidePlacement);
}

export function workPositions(state, site, operation = "build") {
  if (site.type === "brew-station") return brewStationAccessCells(site);
  if (
    (site.type === "roof" || site.type === "floor") &&
    operation !== "deconstruct"
  ) {
    const lower = { ...site, level: site.level - 1 };
    return [
      lower,
      ...neighboringWorkCells(lower),
      ...neighboringWorkCells(site),
    ]
      .filter(insidePlacement)
      .map(placementFooting);
  }
  const positions = placementNeighbors(site).filter(insidePlacement);
  if (site.type === "stair") positions.push(site);
  // A dragged closed outline must not strand its last corner behind its two
  // finished neighbors. Construction can reach that corner from the interior
  // diagonal, and delivery must revalidate that same work position. Movement
  // and deconstruction keep their cardinal topology.
  if (
    operation !== "deconstruct" &&
    (site.type === "wall" || site.type === "door")
  )
    positions.push(...neighboringWorkCells(site));
  if (
    (site.type === "floor" || site.type === "roof") &&
    operation === "deconstruct"
  ) {
    const lower = { ...site, level: site.level - 1 };
    positions.push(lower, ...neighboringWorkCells(lower));
  }
  return positions
    .filter(insidePlacement)
    .filter(
      (cell, index, cells) =>
        cells.findIndex((other) => samePlacement(other, cell)) === index,
    )
    .map(placementFooting);
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
  const ceiling = { ...cell, level: cell.level + 1 };
  const terrain = terrainGeometry(state.terrain),
    at = placementFooting(ceiling);
  if (at.y < terrain.bounds.max[1] && terrain.solidAt(at.x, at.y, at.z))
    return true;
  return state.sites.some(
    (site) =>
      site.finishedAt !== null &&
      (site.type === "roof" || site.type === "floor") &&
      samePlacement(site, ceiling),
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
  const support = structureSupportProblem(prospectiveState);
  if (support) return `Waiting for dependent structures: ${support}`;
  if (site.type === "floor") {
    const surface = { x: site.x, z: site.z, level: site.level };
    if (
      state.sites.some(
        (candidate) =>
          candidate.id !== site.id &&
          candidate.level === site.level &&
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
        (lot) => worldView(lot.location).level === site.level,
      )
    )
      return "Waiting for the upper surface to clear";
    if (
      person &&
      worldView(person).level === site.level &&
      !builtSurface(prospectiveState, worldView(person))
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
  const envelope = buildingEnvelopeProblem(state, at);
  if (envelope) return envelope;
  const known = knownFootings(state);
  if (!footprint(at).every((cell) => known(placementFooting(cell))))
    return "Explore this space before building here.";
  const terrain = terrainGeometry(state.terrain);
  if (
    footprint(at).some((cell) => {
      const footing = placementFooting(cell);
      const height =
        BUILDINGS[at.type].environment.kind === "solid-column" ? 4 : 1;
      for (let dy = 0; dy < height; dy++)
        if (terrain.solidAt(footing.x, footing.y + dy, footing.z)) return true;
      return false;
    })
  )
    return "Excavate clear space before building here.";
  if (at.type === "floor") {
    if (crossLevelSurfaceConflict(state, at))
      return "A floor and roof cannot occupy the same surface.";
    if (!floorSupported(state, at))
      return "The floor needs a connected span within six tiles of support.";
  } else if (at.type === "roof" && !roofSupported(state, at)) {
    return "The roof needs a connected span within six tiles of support.";
  } else if (at.type === "stair") {
    if (!surfaceSupported(state, at))
      return "The stair needs a supported starting surface.";
    const link = stairLink({ ...at, id: at.id ?? "preview-stair" });
    const space = createNavigationSpaces(state)();
    const admission = admitEdge(
      { ...space, links: [link] },
      link.from,
      link.to,
      HUMAN_NAVIGATION,
    );
    if (admission.kind !== "edge")
      return "The stair needs a clear, explored route to its landing.";
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
            site.level === at.level + 1 &&
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
  } else {
    if (
      footprint(at).some((cell) =>
        state.sites.some(
          (site) =>
            site.type === "stair" &&
            samePlacement(stairLanding(site), cell) &&
            at.type !== "door",
        ),
      )
    )
      return "Keep the stair landing open; only a doorway may share it.";
    if (
      at.type !== "roof" &&
      !footprint(at).every((cell) => surfaceSupported(state, cell))
    )
      return "The building needs a supported surface.";
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
    return "A floor and roof cannot occupy the same surface.";
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
    state.trees.some((t) => t.felledAt === null && overlaps(worldView(t))) ||
    state.rocks.some((rock) => overlaps(worldView(rock))) ||
    overlaps(worldView(state.watcher))
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
const roomQueries = new WeakMap();
function roomsFor(state) {
  const terrain = terrainGeometry(state.terrain);
  const finished = state.sites.filter((site) => site.finishedAt !== null);
  const signature = JSON.stringify(
    finished.map(({ id, type, x, z, level, direction }) => [
      id,
      type,
      x,
      z,
      level,
      direction,
    ]),
  );
  const cached = roomQueries.get(terrain);
  if (cached?.signature === signature) return cached;
  const geometry = createStructureGeometry(
    { terrain, sites: finished },
    terrain.bounds,
  );
  const doors = new Set(
    finished
      .filter((site) => site.type === "door")
      .flatMap((site) => footprint(site).map(placementKey)),
  );
  const landings = new Set(
    finished
      .filter((site) => site.type === "stair")
      .map((site) => placementKey(stairLanding(site))),
  );
  const result = {
    signature,
    terrain,
    geometry,
    doors,
    landings,
    levels: new Map(),
  };
  roomQueries.set(terrain, result);
  return result;
}
function interiorAt(state, level) {
  const rooms = roomsFor(state),
    y = placementFooting({ x: 0, z: 0, level }).y;
  if (
    !Number.isInteger(level) ||
    y < rooms.terrain.bounds.min[1] ||
    y >= rooms.terrain.bounds.max[1]
  )
    return new Set();
  let result = rooms.levels.get(level);
  if (!result) {
    result = roomInterior(rooms.geometry, level, rooms.doors, rooms.landings);
    rooms.levels.set(level, result);
  }
  return result;
}
export function indoors(state, level = 0) {
  return new Set(interiorAt(state, level));
}
export function roofSupported(state, site) {
  return structuralSupport(state, { ...site, type: "roof" }).span(site);
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
            (!surfaceSupported(state, cell)
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
          surfaceSupported(state, cell) &&
          coverAt(state, cell),
      )
    );
  });
}
