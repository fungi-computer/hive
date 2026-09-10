import { knownFootings } from "./exploration.ts";
import { inside, stairLanding } from "./world.js";
import {
  standing,
  edgeStillClear,
  traversalProblem,
} from "./engine/navigation/index.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import {
  terrainGeometry,
  terrainEnvironment,
} from "./world-presets/goblin-terrain.ts";
import { waterEnvironmentFacts } from "./world-presets/goblin-environment/water-state.ts";
import { BUILDINGS, footprint } from "./construction.js";
import { placementFooting } from "./game-space.ts";
import type { Actor, Body, Clearing } from "./model.ts";
import type {
  Footing,
  Link,
  Profile,
  Space,
} from "./engine/navigation/index.ts";

export const HUMAN_NAVIGATION: Profile = Object.freeze({
  clearanceVoxels: 4,
  maxWadingDepthM: 0.25,
  flatTicks: 6,
  upTicks: 12,
  downTicks: 9,
});
export const CAT_NAVIGATION: Profile = Object.freeze({
  clearanceVoxels: 1,
  maxWadingDepthM: 0.05,
  flatTicks: 6,
  upTicks: 12,
  downTicks: 9,
});
/** Current finite hand payloads fit this conservative envelope. Custody stays
 * material-owned; neither item names nor figures select a separate graph. */
export const HAND_PAYLOAD_CLEARANCE = 4;
const GROUND_POINT_PROFILE: Profile = Object.freeze({
  ...HUMAN_NAVIGATION,
  clearanceVoxels: 1,
});
export function carryingProfile(body: Profile, occupiedHand: boolean): Profile {
  return occupiedHand
    ? Object.freeze({
        ...body,
        clearanceVoxels: Math.max(body.clearanceVoxels, HAND_PAYLOAD_CLEARANCE),
      })
    : body;
}

export function stairLink(
  site: Pick<
    import("./model.ts").Site,
    "id" | "x" | "z" | "level" | "direction"
  >,
): Link {
  const from = placementFooting(site),
    to = placementFooting(stairLanding(site));
  const dx = site.direction === 1 ? 1 : 0,
    dz = site.direction === 1 ? 0 : 1;
  return Object.freeze({
    id: site.id,
    from,
    to: Object.freeze(to),
    via: Object.freeze([
      Object.freeze({ x: from.x + dx, y: (from.y + to.y) / 2, z: from.z + dz }),
    ]),
    duration: 18,
  });
}
function stairs(state: Clearing): readonly Link[] {
  return state.sites
    .filter((site) => site.type === "stair" && site.finishedAt !== null)
    .map(stairLink);
}

/** Build a bounded live capability from canonical geometry/content. This is a
 * query projection, not saved state and not permission to mutate terrain. */
function buildNavigationSpaces(state: Clearing) {
  const checkpoint = state.terrain;
  const terrain = terrainGeometry(checkpoint);
  const known = knownFootings(state);
  const geometry = createStructureGeometry(
    { terrain, sites: state.sites },
    terrain.bounds,
  );
  const fixed: Footing[] = [
    ...state.trees.filter((tree) => tree.felledAt === null),
    ...state.rocks,
    state.watcher,
    ...state.sources,
  ];
  const furniture = state.sites
    .filter((site) => site.type === "bed" || site.type === "brew-station")
    .map((site) => ({
      id: site.id,
      bed: site.type === "bed" && site.finishedAt !== null,
      cells: footprint(site).map((cell: { x: number; z: number }) =>
        placementFooting({ ...cell, level: site.level }),
      ),
    }));
  const water = waterEnvironmentFacts(state.water, {
    terrain: terrainEnvironment(checkpoint),
    sites: state.sites,
  });
  let wet = wetMaps.get(water);
  if (!wet) {
    wet = new Map();
    for (const cell of water.cells)
      if (cell.kind === "void" && cell.massKg > 0) wet.set(cell.at.join(), cell);
    wetMaps.set(water, wet);
  }
  const links = Object.freeze(stairs(state));
  return (
    contact: { kind: "bed"; site: string } | null = null,
    purpose: "route" | "occupied-body" | "ground-support" = "route",
  ): Space => {
    const obstacles = [
      ...fixed,
      ...furniture
        .filter((site) => !(site.bed && contact?.site === site.id))
        .flatMap((site) => site.cells),
    ];
    return Object.freeze({
      point: geometry.point,
      face: geometry.face,
      links,
      access(
        at: Footing,
        body: Readonly<{ footing: Footing; profile: Profile }>,
      ): "allowed" | "blocked" | "needs-data" {
        if (!inside(at)) return "blocked";
        const coordinate = [at.x, at.y, at.z];
        if (
          coordinate.some(
            (value, i) =>
              value < terrain.bounds.min[i] || value >= terrain.bounds.max[i],
          )
        )
          return "needs-data";
        if (!known(at)) return "needs-data";
        if (
          state.sites.some((site) => {
            const definition = BUILDINGS[site.type];
            return (
              site.finishedAt !== null &&
              "walkable" in definition &&
              definition.walkable === false &&
              footprint(site).some((cell) => {
                const surface = placementFooting(cell);
                return (
                  surface.x === at.x && surface.y === at.y && surface.z === at.z
                );
              })
            );
          })
        )
          return "blocked";
        if (
          purpose !== "ground-support" &&
          obstacles.some(
            (base) =>
              base.x === at.x &&
              base.z === at.z &&
              at.y >= base.y &&
              at.y < base.y + 4,
          )
        )
          return "blocked";
        // Only route eligibility changes with water. Occupied-body validation
        // preserves a real body's saved position when its cell becomes wet.
        const cell = wet.get(`${at.x},${at.y},${at.z}`);
        if (purpose === "route" && cell) {
          const depthM =
            cell.liquidVolumeM3 / (terrain.spacingM[0] * terrain.spacingM[2]);
          const aboveFootM =
            (cell.at[1] - body.footing.y) * terrain.spacingM[1] + depthM;
          if (aboveFootM > body.profile.maxWadingDepthM) return "blocked";
        }
        return "allowed";
      },
    });
  };
}

type NavigationCache = {
  terrain: ReturnType<typeof terrainGeometry>;
  water: Clearing["water"];
  sites: Clearing["sites"];
  siteStamp: string;
  trees: Clearing["trees"];
  treeStamp: string;
  rocks: Clearing["rocks"];
  fixedStamp: string;
  watcher: Clearing["watcher"];
  sources: Clearing["sources"];
  exploration: Clearing["exploration"];
  space: ReturnType<typeof buildNavigationSpaces>;
};
const navigationCaches = new WeakMap<Clearing, NavigationCache>();
const wetMaps = new WeakMap<object, Map<string, { at: readonly number[]; liquidVolumeM3: number }>>();
function navigationStamp(state: Clearing): { sites: string; trees: string; fixed: string } {
  return {
    sites: JSON.stringify(
      state.sites.map(({ id, type, x, z, level, direction, finishedAt }) => [
        id,
        type,
        x,
        z,
        level,
        direction,
        finishedAt,
      ]),
    ),
    trees: JSON.stringify(
      state.trees.map(({ id, x, y, z, felledAt }) => [id, x, y, z, felledAt]),
    ),
    fixed: JSON.stringify([
      state.rocks.map(({ x, y, z }) => [x, y, z]),
      [state.watcher.x, state.watcher.y, state.watcher.z],
      state.sources.map(({ id, x, y, z, kind }) => [id, x, y, z, kind]),
    ]),
  };
}
export function createNavigationSpaces(state: Clearing) {
  const terrain = terrainGeometry(state.terrain),
    stamp = navigationStamp(state),
    cached = navigationCaches.get(state);
  if (
    cached && cached.terrain === terrain && cached.water === state.water &&
    cached.sites === state.sites && cached.siteStamp === stamp.sites &&
    cached.trees === state.trees && cached.treeStamp === stamp.trees &&
    cached.fixedStamp === stamp.fixed &&
    cached.rocks === state.rocks && cached.watcher === state.watcher &&
    cached.sources === state.sources && cached.exploration === state.exploration
  ) return cached.space;
  const space = buildNavigationSpaces(state);
  navigationCaches.set(state, {
    terrain,
    water: state.water,
    sites: state.sites,
    siteStamp: stamp.sites,
    trees: state.trees,
    treeStamp: stamp.trees,
    fixedStamp: stamp.fixed,
    rocks: state.rocks,
    watcher: state.watcher,
    sources: state.sources,
    exploration: state.exploration,
    space,
  });
  return space;
}

export function bodyProfile(state: Clearing, body: Body): Profile {
  const configured =
    body.navigationProfile === "upright" ? HUMAN_NAVIGATION : CAT_NAVIGATION;
  const carrying =
    "id" in body &&
    state.materials.lots.some(
      (lot) => lot.location.kind === "hand" && lot.location.actor === body.id,
    );
  return carryingProfile(configured, carrying);
}

export function bodyContact(body: Body) {
  const task = (body as Partial<Actor>).task;
  return task?.kind === "sleep"
    ? { kind: "bed" as const, site: task.target }
    : null;
}
/** Geometry edits protect actual bodies and admitted links. A later change in
 * water eligibility can make an edge wait; it cannot erase its saved position. */
function bodiesProblem(
  state: Clearing,
  spaces: ReturnType<typeof createNavigationSpaces>,
): string | null {
  for (const body of [...Object.values(state.actors), state.cat]) {
    const space = spaces(bodyContact(body), "occupied-body");
    const safe = body.traversal
      ? edgeStillClear(space, body.traversal.edge, bodyProfile(state, body))
      : standing(space, body, bodyProfile(state, body)) === "supported";
    if (!safe)
      return "Waiting for bodies and carried goods to clear the changed space.";
  }
  return groundLotsProblem(state, spaces);
}

/** Loose goods retain their exact footing under prospective edits. This uses
 * point/support facts only; it does not invent a cargo volume or item exception. */
function groundLotsProblem(
  state: Clearing,
  spaces: ReturnType<typeof createNavigationSpaces>,
): string | null {
  const ground = spaces(null, "ground-support");
  for (const lot of state.materials.lots)
    if (
      lot.location.kind === "ground" &&
      standing(ground, lot.location, GROUND_POINT_PROFILE) !== "supported"
    )
      return "Waiting for loose goods to clear the changed ground.";
  return null;
}

/** Fixed content uses the same physical support rule during edits and restore. */
function fixedGroundProblem(
  state: Clearing,
  spaces: ReturnType<typeof createNavigationSpaces>,
): string | null {
  const ground = spaces(null, "ground-support"),
    profile = GROUND_POINT_PROFILE;
  const occupants = [
    ...state.rocks,
    state.watcher,
    ...state.trees,
    ...state.herbs,
    ...state.sources,
  ];
  for (const at of occupants)
    if (standing(ground, at, profile) !== "supported")
      return "ground occupant lacks physical support";
  return null;
}

export function physicalOccupancyProblem(state: Clearing): string | null {
  const spaces = createNavigationSpaces(state);
  return fixedGroundProblem(state, spaces) ?? bodiesProblem(state, spaces);
}

export function navigationStateProblem(state: Clearing): string | null {
  const spaces = createNavigationSpaces(state);
  for (const body of [...Object.values(state.actors), state.cat]) {
    const profile = bodyProfile(state, body),
      space = spaces(bodyContact(body), "occupied-body");
    const problem = traversalProblem(space, body, profile);
    if (problem) return problem;
    if (body.traversal && body.mode !== "walk")
      return "admitted edge has no walking body";
  }
  for (const actor of Object.values(state.actors)) {
    if (actor.navigationProfile !== "upright")
      return "current actor has an unsupported body profile";
    if (
      actor.workDisposition === "interrupt-at-footing" &&
      (!actor.traversal || actor.traversal.elapsed === 0)
    )
      return "interruption has no paid edge";
  }
  if (state.cat.navigationProfile !== "small")
    return "current cat has an unsupported body profile";
  return fixedGroundProblem(state, spaces) ?? bodiesProblem(state, spaces);
}
