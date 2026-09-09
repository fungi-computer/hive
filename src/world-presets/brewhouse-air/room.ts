import {
  structureEnvironment,
  type StructureTerrainGeometry,
} from "../../structure-environment.ts";
import type { BuildingKind } from "../../model.ts";

/** An authored starting building using actual Goblin construction definitions.
 * These are scenario facts, not evidence that a pawn built or paid for the house.
 * The same facts are the intended renderer input; no separate numerical walls.
 */
function site(type: BuildingKind, x: number, z: number, level: number) {
  return Object.freeze({
    id: `${type}:${x},${z},${level}`,
    type,
    x,
    z,
    level,
    direction: 0 as const,
    finishedAt: 0,
  });
}

function wallRing(level: number) {
  const sites = [];
  for (let x = 4; x <= 9; x++)
    for (let z = 4; z <= 8; z++) {
      if (x !== 4 && x !== 9 && z !== 4 && z !== 8) continue;
      const opening = z === 8 && x === (level === 0 ? 6 : 7);
      sites.push(site(opening ? "door" : "wall", x, z, level));
    }
  return sites;
}

function upperDeck() {
  const sites = [];
  for (let x = 5; x <= 8; x++)
    for (let z = 5; z <= 7; z++) {
      // Current ramp/headroom consumes all three cells of this run.
      if (x !== 8) sites.push(site("floor", x, z, 1));
      sites.push(site("roof", x, z, 1));
    }
  return sites;
}

export const BREWHOUSE_ROOM = Object.freeze({
  id: "goblin-warm-brewhouse-v1",
  bounds: Object.freeze({
    min: Object.freeze([3, 0, 3]),
    max: Object.freeze([11, 9, 10]),
  }),
  sites: Object.freeze([
    ...wallRing(0),
    ...wallRing(1),
    ...upperDeck(),
    site("stair", 8, 5, 0),
    site("brew-station", 5, 5, 0),
  ]),
  sourceCell: "cell:5,0,5",
  upstairsBreathingCell: "cell:6,6,6",
  downstairsBreathingCell: "cell:7,2,6",
  // A zero-volume shutter across the existing upper doorway. Four faces allow
  // vertically separated inflow/outflow; the downstairs doorway stays open.
  shutterFaces: Object.freeze([4, 5, 6, 7].map((y) => `z:7,${y},8`)),
});

const MODEL = Object.freeze({
  densityKgM3: 1.2,
  heatCapacityJKgK: 1005,
  referenceTemperatureK: 293.15,
  gravityMSS: 9.81,
  viscosityM2S: 1.5e-5,
  thermalDiffusivityM2S: 2.2e-5,
  tracerDiffusivityM2S: 1e-5,
});

/** This authored starting room has an explicit flat foundation and local voxel
 * frame. It is a separate scenario, not a fallback for generated Goblin terrain.
 * The queried air space begins at0; its foundation and bottom boundary agree.
 */
const foundation: StructureTerrainGeometry = Object.freeze({
  identity: "goblin-warm-room-foundation-v1",
  revision: 0,
  frame: Object.freeze({ x: 0, y: 0, z: 0, storeyVoxels: 4 }),
  spacingM: Object.freeze([1, 0.54, 1] as const),
  bounds: Object.freeze({
    min: Object.freeze([3, -1, 3] as const),
    max: Object.freeze([11, 9, 10] as const),
  }),
  solidAt(_x, y, _z) {
    return y < 0;
  },
});

/** Consumer policy supplies actual exterior air; query/window edges alone do not.
 * One outside-cell collar is modeled beside the house and above its roof. The
 * bottom meets authored ground and is closed. Walls/floors come from the shared
 * construction query; only this named shutter is an additional boundary fact.
 */
export function roomAirDefinition(ventOpen: boolean, revision: number) {
  if (
    typeof ventOpen !== "boolean" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw new TypeError("invalid brewhouse opening state");
  const geometry = structureEnvironment(
    { terrain: foundation, sites: BREWHOUSE_ROOM.sites },
    {
      min: [...BREWHOUSE_ROOM.bounds.min] as [number, number, number],
      max: [...BREWHOUSE_ROOM.bounds.max] as [number, number, number],
    },
  );
  return {
    version: "voxel-air-definition-v1",
    regionId: BREWHOUSE_ROOM.id,
    revision,
    origin: [...geometry.bounds.min],
    size: geometry.bounds.max.map((n, axis) => n - geometry.bounds.min[axis]),
    spacingM: [...geometry.spacingM],
    solidCells: [...geometry.solidCellIds],
    closedFaces: [
      ...geometry.closedFaceIds,
      ...(ventOpen ? [] : BREWHOUSE_ROOM.shutterFaces),
    ],
    openSides: ["x-", "x+", "z-", "z+", "y+"],
    model: { ...MODEL },
  };
}

export function roomInitialAir() {
  const definition = roomAirDefinition(false, 0),
    solid = new Set(definition.solidCells);
  const cells = [];
  const { min, max } = BREWHOUSE_ROOM.bounds;
  for (let z = min[2]; z < max[2]; z++)
    for (let y = min[1]; y < max[1]; y++)
      for (let x = min[0]; x < max[0]; x++) {
        const cellId = `cell:${x},${y},${z}` as const;
        if (!solid.has(cellId)) cells.push({ cellId, smokeKg: 0, heatJ: 0 });
      }
  return { cells };
}
