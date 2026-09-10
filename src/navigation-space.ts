import { stairLanding } from "./world.js";
import {
  standing,
  edgeStillClear,
  traversalProblem,
} from "./engine/navigation/index.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import {
  terrainGeometry,
  terrainFacts,
} from "./world-presets/goblin-terrain.ts";
import { footprint } from "./construction.js";
import { placementFooting, groundFooting, worldView } from "./game-space.ts";
import type { Actor, Body, Clearing } from "./model.ts";
import type {
  Footing,
  Link,
  Profile,
  Space,
} from "./engine/navigation/index.ts";

export const HUMAN_NAVIGATION: Profile = Object.freeze({
  clearanceVoxels: 4,
  flatTicks: 6,
  upTicks: 12,
  downTicks: 9,
});
export const CAT_NAVIGATION: Profile = Object.freeze({
  clearanceVoxels: 1,
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

function stairs(state: Clearing): readonly Link[] {
  return state.sites
    .filter((site) => site.type === "stair" && site.finishedAt !== null)
    .map((site) => {
      const from = placementFooting(site),
        to = placementFooting(stairLanding(site)),
        dx = site.direction === 1 ? 1 : 0,
        dz = site.direction === 1 ? 0 : 1;
      return Object.freeze({
        id: site.id,
        from,
        to: Object.freeze(to),
        via: Object.freeze([
          Object.freeze({
            x: from.x + dx,
            y: (from.y + to.y) / 2,
            z: from.z + dz,
          }),
        ]),
        duration: 18,
      });
    });
}

/** Build a bounded live capability from canonical geometry/content. This is a
 * query projection, not saved state and not permission to mutate terrain. */
export function createNavigationSpaces(state: Clearing) {
  const checkpoint = state.terrain;
  const terrain = terrainGeometry(checkpoint);
  const surfaces = new Map<string, number>();
  function exposed(at: Footing): boolean {
    const key = `${at.x},${at.z}`;
    let y = surfaces.get(key);
    if (y === undefined) {
      y = groundFooting(checkpoint, worldView(at)).y;
      surfaces.set(key, y);
    }
    return at.y >= y;
  }
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
  const pits = terrainFacts(state.terrain).soil.nodes.filter(
    (node: { kind: string }) => node.kind === "pit",
  );
  const links = Object.freeze(stairs(state));
  return (
    contact: { kind: "bed"; site: string } | null = null,
    purpose: "dry-route" | "occupied-body" | "ground-support" = "dry-route",
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
      access(at: Footing): "allowed" | "blocked" | "needs-data" {
        const coordinate = [at.x, at.y, at.z];
        if (
          coordinate.some(
            (value, i) =>
              value < terrain.bounds.min[i] || value >= terrain.bounds.max[i],
          )
        )
          return "needs-data";
        if (!exposed(at)) return "needs-data";
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
        // Dry-foot-only first model: exact field stock and vertical water extent,
        // not a whole-unit collection estimate or a display-rounded surface.
        // soil/volume.readFacts owns depthM = mass / (density * area); it is
        // current water depth, distinct from heightCells/capacityKg.
        const footM = at.y * terrain.spacingM[1];
        if (
          purpose === "dry-route" &&
          pits.some(
            (node: {
              at: number[];
              baseYM: number;
              depthM: number;
              massKg: number;
            }) =>
              node.at[0] === at.x &&
              node.at[2] === at.z &&
              node.massKg > 0 &&
              footM >= node.baseYM &&
              footM < node.baseYM + node.depthM,
          )
        )
          return "blocked";
        return "allowed";
      },
    });
  };
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
      ? edgeStillClear(space, body.traversal.edge)
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

export function physicalOccupancyProblem(state: Clearing): string | null {
  return bodiesProblem(state, createNavigationSpaces(state));
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
  return bodiesProblem(state, spaces);
}
