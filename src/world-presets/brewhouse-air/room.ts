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
  id: "goblin-generated-warm-brewhouse-v1",
  bounds: Object.freeze({
    min: Object.freeze([3, 0, 3] as const),
    max: Object.freeze([11, 9, 10] as const),
  }),
  sites: Object.freeze([
    ...wallRing(0),
    ...wallRing(1),
    ...upperDeck(),
    site("stair", 8, 5, 0),
    site("brew-station", 5, 5, 0),
  ]),
  source: Object.freeze([5, 0, 5] as const),
  upstairsBreathing: Object.freeze([6, 6, 6] as const),
  downstairsBreathing: Object.freeze([7, 2, 6] as const),
  // A zero-volume shutter across the existing upper doorway. Four faces allow
  // vertically separated inflow/outflow; the downstairs doorway stays open.
  shutter: Object.freeze({
    axis: "z" as const,
    x: 7,
    z: 8,
    minY: 4,
    maxY: 8,
  }),
  // One real owned-soil cut beside the modeled collar. The adjacent z=9 cut
  // is inside the room domain and is intentionally refused by its producer.
  outsideExcavationLocal: Object.freeze([7, -1, 10] as const),
});

export const BREWHOUSE_AIR_MODEL = Object.freeze({
  densityKgM3: 1.2,
  heatCapacityJKgK: 1005,
  referenceTemperatureK: 293.15,
  gravityMSS: 9.81,
  viscosityM2S: 1.5e-5,
  thermalDiffusivityM2S: 2.2e-5,
  tracerDiffusivityM2S: 1e-5,
});

/** Current air and soil owners both admit no positive interval below this. The
 * room uses it only to keep its finite-source event boundary representable.
 */
export const ROOM_MIN_FIELD_INTERVAL_S = 1e-6;
