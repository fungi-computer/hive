import { z } from "zod";
import { footingSchema, type Footing } from "./engine/world/footing.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import { terrainGeometry } from "./terrain.ts";
import { exposedFooting, worldView } from "./game-space.ts";
import type { Clearing } from "./model.ts";

const faceFacts = z.tuple([
  z.boolean(),
  z.boolean(),
  z.boolean(),
  z.boolean(),
  z.boolean(),
  z.boolean(),
]);
const observationSchema = z.strictObject({
  at: footingSchema,
  solid: z.boolean(),
  terrainSolid: z.boolean(),
  faces: faceFacts,
});
export const explorationSchema = z
  .strictObject({
    version: z.literal(1),
    observed: z.array(observationSchema).max(28_800),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const fact of value.observed) {
      const id = key(fact.at);
      if (ids.has(id))
        context.addIssue({
          code: "custom",
          message: `duplicate observed cell ${id}`,
        });
      ids.add(id);
    }
  });
export type Exploration = z.infer<typeof explorationSchema>;
/** Game perception capability, not a world-depth limit. */
export const HUMAN_SIGHT = Object.freeze({
  radiusVoxels: 4,
  eyeOffsetVoxels: 3,
});
export const initialExploration = (): Exploration => ({
  version: 1,
  observed: [],
});
const key = (at: Footing) => `${at.x},${at.y},${at.z}`;
const tuple = (at: Footing): [number, number, number] => [at.x, at.y, at.z];
const axes = ["x", "y", "z"] as const;
type Query = ReturnType<typeof createStructureGeometry>;

/** Centre-to-centre voxel traversal. Tied crossings conservatively test every
 * crossed face/cell; a diagonal corner cannot reveal space through a wall. */
function lineVisible(query: Query, from: Footing, target: Footing): boolean {
  const at = tuple(from),
    end = tuple(target),
    delta = end.map((v, i) => v - at[i]);
  const step = delta.map(Math.sign),
    interval = delta.map((v) => (v ? 1 / Math.abs(v) : Infinity));
  const next = interval.map((v) => v / 2);
  for (let count = 0; count <= HUMAN_SIGHT.radiusVoxels * 3; count++) {
    if (at.every((v, i) => v === end[i]))
      return query.point(at) !== "unresolved";
    const time = Math.min(...next);
    for (let axis = 0; axis < 3; axis++) {
      if (next[axis] !== time) continue;
      const face = [...at] as [number, number, number];
      if (step[axis] > 0) face[axis]++;
      if (query.face(axes[axis], face) !== "open") return false;
      at[axis] += step[axis];
      next[axis] += interval[axis];
      const point = query.point(at);
      if (point === "unresolved") return false;
      if (point === "solid") return at.every((v, i) => v === end[i]);
    }
  }
  return false;
}
function observation(
  query: Query,
  terrain: ReturnType<typeof terrainGeometry>,
  at: Footing,
) {
  const cell = tuple(at);
  const faces = axes.flatMap((axis, index) => {
    const upper = [...cell] as [number, number, number];
    upper[index]++;
    return [
      query.face(axis, cell) === "closed",
      query.face(axis, upper) === "closed",
    ];
  }) as z.infer<typeof faceFacts>;
  return {
    at: { x: at.x, y: at.y, z: at.z },
    solid: query.point(cell) === "solid",
    terrainSolid: terrain.solidAt(at.x, at.y, at.z),
    faces,
  };
}
function signature(state: Clearing): string {
  return JSON.stringify([
    Object.values(state.actors).map(({ x, y, z }) => [x, y, z]),
    state.sites
      .filter((site) => site.finishedAt !== null)
      .map(({ id, type, x, z, level, direction }) => [
        id,
        type,
        x,
        z,
        level,
        direction,
      ]),
  ]);
}
type View = {
  observed: boolean;
  terrain: ReturnType<typeof terrainGeometry>;
  signature: string;
  visible: ReadonlyMap<string, z.infer<typeof observationSchema>>;
};
const views = new WeakMap<Exploration, View>();
function visibility(state: Clearing): View {
  const terrain = terrainGeometry(state.terrain),
    stamp = signature(state);
  const cached = views.get(state.exploration);
  if (cached?.terrain === terrain && cached.signature === stamp) return cached;
  const query = createStructureGeometry(
    { terrain, sites: state.sites },
    terrain.bounds,
  );
  const visible = new Map<string, z.infer<typeof observationSchema>>();
  const radius = HUMAN_SIGHT.radiusVoxels;
  for (const body of Object.values(state.actors)) {
    const eye = {
      x: body.x,
      y: body.y + HUMAN_SIGHT.eyeOffsetVoxels,
      z: body.z,
    };
    for (let x = -radius; x <= radius; x++)
      for (let y = -radius; y <= radius; y++)
        for (let z = -radius; z <= radius; z++) {
          if (x * x + y * y + z * z > radius * radius) continue;
          const at = { x: eye.x + x, y: eye.y + y, z: eye.z + z };
          if (lineVisible(query, eye, at))
            visible.set(key(at), observation(query, terrain, at));
        }
  }
  const result = { observed: false, terrain, signature: stamp, visible };
  views.set(state.exploration, result);
  return result;
}
/** Sole saved observation mutation. Called after physical changes, never by a
 * camera/query. Unseen remembered facts intentionally keep their last value. */
export function observeClearing(state: Clearing): void {
  const view = visibility(state);
  if (view.observed) return;
  const remembered = new Map(
    state.exploration.observed.map((fact) => [key(fact.at), fact]),
  );
  for (const [id, fact] of view.visible) remembered.set(id, fact);
  const next = {
    version: 1 as const,
    observed: [...remembered.values()].sort((a, b) =>
      key(a.at).localeCompare(key(b.at)),
    ),
  };
  state.exploration = next;
  views.set(next, { ...view, observed: true });
}
export function knownFootings(state: Clearing) {
  const remembered = new Set(
    state.exploration.observed.map((fact) => key(fact.at)),
  );
  return (at: Footing): boolean =>
    exposedFooting(state.terrain, at) || remembered.has(key(at));
}
export function currentVisibility(state: Clearing) {
  const view = visibility(state);
  return (at: Footing): boolean => view.visible.has(key(at));
}
export function currentlyVisible(state: Clearing, at: Footing): boolean {
  return currentVisibility(state)(at);
}
export function explorationProblem(state: Clearing): string | null {
  const bounds = terrainGeometry(state.terrain).bounds;
  for (const fact of state.exploration.observed)
    if (tuple(fact.at).some((v, i) => v < bounds.min[i] || v >= bounds.max[i]))
      return "observed cell outside registered world";
  return null;
}

/** Remembered map coverage, not visibility of current objects. */
export function exploredMapCells(state: Clearing) {
  const cells = new Map<string, { x: number; z: number; level: number }>();
  for (const { at } of state.exploration.observed) {
    const local = worldView(at),
      level = Math.floor(local.level);
    cells.set(`${local.x},${local.z},${level}`, {
      x: local.x,
      z: local.z,
      level,
    });
  }
  return [...cells.values()];
}
