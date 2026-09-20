const VERSION = 1;
const SCALE = 0.54;
const CHUNK = 8;

const key = (x, z) => `${x},${z}`;

function cell(x, z, y, kind = "earth", grass = true, condition = "green", height = "full") {
  return { x, z, y, kind, variant: Math.abs(x * 17 + z * 31) % 3, grass, condition, height };
}

function makeCells(size) {
  const half = size / 2;
  const cells = [];
  for (let x = -half; x < half; x++) for (let z = -half; z < half; z++) {
    const winding = Math.abs(z - Math.round(Math.sin(x * 0.48) * 1.5)) <= 0;
    const straight = Math.abs(x + 3) <= 0 && z > -half + 1;
    const pit = x >= -4 && x <= -3 && z >= 3 && z <= 4;
    const bank = x >= 3 && z >= 3;
    const stone = x > 4 && z < -3;
    const y = pit ? -1 : bank ? 1 : 0;
    cells.push(cell(x, z, y, stone ? "stone" : "earth", !winding && !straight && !pit, x < -4 && z < -2 ? "dead" : "green", z < -1 ? "full" : "short"));
    if (bank) cells.push(cell(x, z, 0, stone ? "stone" : "earth", false));
  }
  return cells;
}

function objects(dense = false) {
  return [
    { id: "tree:oak", kind: "tree", x: -5, y: 0, z: -3, direction: 0, supportY: 0 },
    { id: "bed:finished", kind: "bed", x: 1, y: 0, z: -1, direction: 0, supportY: 0 },
    { id: "stair:raised", kind: "stair", x: -1, y: 0, z: 2, direction: 0, supportY: 0 },
    { id: "wall:door", kind: "door", x: 4, y: 0, z: -1, direction: 1, supportY: 0 },
    ...(dense ? [{ id: "tree:oak:far", kind: "tree", x: 9, y: 0, z: 8, direction: 1, supportY: 0 }] : []),
  ];
}

function actors(dense = false) {
  return [
    { id: "actor:bed-loop", kind: "goblin", x: 0, y: 0, z: -1, direction: 0, supportY: 0,
      route: [[0, -1], [2, -1], [2, 0], [0, 0], [0, -1]] },
    { id: "actor:stair-route", kind: "goblin", x: -1, y: 0, z: 1.5, direction: 0, supportY: 0,
      route: [[-1, 1, 0], [-1, 2, 0.5], [-1, 3, 1]] },
    ...(dense ? [{ id: "actor:far", kind: "goblin", x: 8, y: 0, z: 8, direction: 0, supportY: 0,
      route: [[8, 8], [10, 8], [10, 10], [8, 10]] }] : []),
  ];
}

function build(size, dense) {
  const cells = makeCells(size);
  const scene = {
    version: VERSION, revision: dense ? "three-depth-dense-1" : "three-depth-court-1",
    preset: dense ? "dense" : "court", voxelScale: SCALE, chunkSize: CHUNK,
    bounds: { minX: -size / 2, maxX: size / 2, minY: -1, maxY: 2, minZ: -size / 2, maxZ: size / 2 },
    cells, objects: objects(dense), actors: actors(dense), water: { enabled: false, x: 2, y: 0.01, z: 4, width: 2, depth: 2 },
  };
  return Object.freeze(scene);
}

export const COURT = build(16, false);
export const DENSE = build(32, true);

export function validateFixture(value) {
  if (!value || value.version !== VERSION || value.voxelScale !== SCALE) throw new Error("Unsupported depth-study fixture");
  const ids = new Set();
  for (const entry of [...value.objects, ...value.actors]) {
    if (ids.has(entry.id)) throw new Error(`Duplicate fixture ID: ${entry.id}`);
    ids.add(entry.id);
    for (const coordinate of [entry.x, entry.y, entry.z]) if (!Number.isFinite(coordinate)) throw new Error("Non-finite fixture coordinate");
  }
  if (!Number.isInteger(value.chunkSize) || value.chunkSize <= 0) throw new Error("Invalid fixture chunk size");
  return value;
}

export function cellAt(scene, x, z, y = undefined) {
  const matches = scene.cells.filter(item => item.x === x && item.z === z && (y === undefined || item.y === y));
  return matches.sort((a, b) => b.y - a.y)[0] ?? null;
}

export function replayActor(actor, seconds) {
  const route = actor.route;
  const progress = ((seconds % route.length) + route.length) % route.length;
  const index = Math.floor(progress), t = progress - index;
  const a = route[index], b = route[(index + 1) % route.length];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: (a[2] ?? actor.y) + ((b[2] ?? actor.y) - (a[2] ?? actor.y)) * t, phase: progress % 1 };
}

export const fixtureConstants = Object.freeze({ VERSION, SCALE, CHUNK });
