import type { Cell, Clearing } from "./model.ts";
import {
  standing,
  type Space,
  type Profile,
} from "./engine/navigation/index.ts";
import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
} from "./navigation-space.ts";
import { knownFootings } from "./exploration.ts";
import {
  terrainDigProblem,
  terrainGeometry,
  type TerrainVoxel,
} from "./world-presets/goblin-terrain.ts";
import {
  GOBLIN_FRAME,
  GOBLIN_MAP_SIDE,
} from "./world-presets/goblin-environment/content.ts";

/** Work reach is a game capability; path cost and body clearance remain with
 * navigation. Four .54m body cells can reach their adjacent face and one below. */
export const EXCAVATION_REACH = Object.freeze({ upVoxels: 3, downVoxels: 1 });
const cardinal = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
const tuple = (at: Cell): [number, number, number] => [at.x, at.y, at.z];
export const excavationTarget = (at: TerrainVoxel): Cell => ({
  x: at[0],
  y: at[1],
  z: at[2],
});
function within(state: Clearing, at: Cell) {
  const bounds = terrainGeometry(state.terrain).bounds;
  return (
    at.x >= GOBLIN_FRAME.x &&
    at.x < GOBLIN_FRAME.x + GOBLIN_MAP_SIDE &&
    at.z >= GOBLIN_FRAME.z &&
    at.z < GOBLIN_FRAME.z + GOBLIN_MAP_SIDE &&
    at.y >= bounds.min[1] &&
    at.y < bounds.max[1]
  );
}
function horizontalFace(space: Space, from: Cell, target: Cell, y: number) {
  const axis = from.x === target.x ? "z" : "x";
  return (
    space.face(axis, [
      Math.max(from.x, target.x),
      y,
      Math.max(from.z, target.z),
    ]) === "open"
  );
}
function reaches(space: Space, from: Cell, target: Cell) {
  if (from.y === target.y + 1) {
    const above: [number, number, number] = [target.x, from.y, target.z];
    return (
      space.point(above) === "empty" &&
      space.face("y", above) === "open" &&
      horizontalFace(space, from, target, from.y)
    );
  }
  return horizontalFace(space, from, target, target.y);
}

/** Admission names a real exposed or remembered target. Future caves cannot be
 * discovered by submitting deep coordinates; temporary work access is separate. */
export function excavationTargetProblem(
  state: Clearing,
  voxel: TerrainVoxel,
): string | null {
  const problem = terrainDigProblem(state.terrain, voxel);
  if (problem) return problem;
  const target = excavationTarget(voxel),
    known = knownFootings(state);
  const space = createNavigationSpaces(state)(null, "occupied-body");
  for (const [axis, delta] of [
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 1],
    [2, -1],
    [2, 1],
  ] as const) {
    const point = tuple(target);
    point[axis] += delta;
    const neighbor = { x: point[0], y: point[1], z: point[2] };
    if (
      !within(state, neighbor) ||
      !known(neighbor) ||
      space.point(point) !== "empty"
    )
      continue;
    const face = tuple(target);
    if (delta > 0) face[axis]++;
    if (space.face((["x", "y", "z"] as const)[axis], face) === "open")
      return null;
  }
  return "Expose this voxel before designating it.";
}

/** Shared by command feedback, optimizer candidates, work and completion. No
 * horizontal-map or selected-storey conversion may change this physical target. */
export function excavationPositions(
  state: Clearing,
  voxel: TerrainVoxel,
  profile: Profile = HUMAN_NAVIGATION,
): Cell[] {
  const target = excavationTarget(voxel);
  const space = createNavigationSpaces(state)();
  const candidates: Cell[] = [];
  for (const [dx, dz] of cardinal)
    for (
      let dy = -EXCAVATION_REACH.upVoxels;
      dy <= EXCAVATION_REACH.downVoxels;
      dy++
    ) {
      const at = { x: target.x + dx, y: target.y + dy, z: target.z + dz };
      if (
        within(state, at) &&
        reaches(space, at, target) &&
        standing(space, at, profile) === "supported"
      )
        candidates.push(at);
    }
  return candidates;
}
