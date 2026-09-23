// Isolated generated base + durable-change codec. No Clearing or clock owner.
import { createWorldSpec, sampleCell, floorDiv, mod } from './reference/terrain.js';

const RECIPE = Object.freeze({
  generatorSource: '1e0c01b88d6a28e60ef2cd150bf98c085612df3a75a57793a27d5d70c230af34',
  voxelRecipe: 'surface-extrusion-two-soil-cells-v1',
  surfacePolicy: 'world-lab-surface-level-normalized-32-v1',
  // Study proposal: four vertical voxels equal the accepted 2.16 art storey.
  units: { horizontalMetres: 1, verticalMetres: 0.54, voxelsPerStorey: 4 },
  bounds: { minX: -2048, maxX: 2048, minZ: -2048, maxZ: 2048, minY: -64, maxY: 64 },
  brickSide: 16,
});
export const MATERIAL = Object.freeze({ air: 0, soil: 1, stone: 2 });
const SIDE = RECIPE.brickSide, VOLUME = SIDE ** 3;
const clone = value => structuredClone(value);
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function integer(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label}: safe integer required`);
  return value;
}
function cellKey({ x, y, z }) { return `${x},${y},${z}`; }
function brickKey({ x, y, z }) { return `${floorDiv(x,SIDE)},${floorDiv(y,SIDE)},${floorDiv(z,SIDE)}`; }
function index({ x, y, z }) { return (mod(y,SIDE) * SIDE + mod(z,SIDE)) * SIDE + mod(x,SIDE); }
function checkCell(at) {
  const b = RECIPE.bounds;
  for (const axis of ['x','y','z']) integer(at?.[axis], axis);
  if (at.x < b.minX || at.x >= b.maxX || at.y < b.minY || at.y >= b.maxY || at.z < b.minZ || at.z >= b.maxZ)
    throw new RangeError('cell outside this finite study domain');
  return { x: at.x, y: at.y, z: at.z };
}
function checkMaterial(value) {
  if (![MATERIAL.air,MATERIAL.soil,MATERIAL.stone].includes(value)) throw new TypeError('unsupported solid material');
  return value;
}
function compareCells(a,b) { return a.x-b.x || a.z-b.z || a.y-b.y; }
function layerMaterial(surface,y) { return y >= surface ? MATERIAL.air : y >= surface-2 ? MATERIAL.soil : MATERIAL.stone; }

function readCheckpoint(identity,checkpoint,baseAt) {
  if (checkpoint === null) return { revision:0, entries:[] };
  if (!checkpoint || checkpoint.schema !== 1 || !equal(checkpoint.identity,identity))
    throw new Error('checkpoint world/recipe mismatch');
  integer(checkpoint.revision,'checkpoint revision');
  if (checkpoint.revision < 0 || !Array.isArray(checkpoint.changes)) throw new Error('invalid checkpoint');
  const entries=[],seen=new Set();
  for (const entry of checkpoint.changes) {
    const at=checkCell(entry); checkMaterial(entry.material); integer(entry.revision,'change revision');
    if (entry.revision < 1 || entry.revision > checkpoint.revision || seen.has(cellKey(at)))
      throw new Error('duplicate or invalid change revision');
    if (entry.material === baseAt(at)) throw new Error('redundant base-equal override');
    entries.push({...at,material:entry.material,revision:entry.revision}); seen.add(cellKey(at));
  }
  // This is a compacted state overlay. Returning to base may remove every patch
  // while the world revision still records a real intervening physical change.
  return {revision:checkpoint.revision,entries};
}

export function worldIdentity({ worldId, spaceId = 'surface', seed } = {}) {
  if (typeof worldId !== 'string' || !worldId || typeof spaceId !== 'string' || !spaceId)
    throw new TypeError('world and space identities required');
  if (seed !== undefined && (typeof seed !== 'string' || !seed)) throw new TypeError('nonempty string seed required');
  const spec = createWorldSpec(seed === undefined ? {} : { seed });
  return { worldId, spaceId, base: { identity: spec.identity, seed: spec.seed, ...clone(RECIPE) } };
}

/** Changes are authoritative; resident voxel arrays are disposable projections. */
export function createVoxelWorld(identity, { checkpoint = null, maxResidentBricks = 8 } = {}) {
  const expected = worldIdentity({ worldId:identity?.worldId, spaceId:identity?.spaceId, seed:identity?.base?.seed });
  // Caller must bind complete recipe/units, not just a seed or generator label.
  if (!equal(identity, expected)) throw new Error('unsupported or incompatible world recipe');
  identity = clone(identity);
  integer(maxResidentBricks, 'resident cap');
  if (maxResidentBricks < 1 || maxResidentBricks > 256) throw new RangeError('resident cap outside study budget');
  const spec = createWorldSpec({ seed: identity.base.seed });
  const changes = new Map(), byBrick = new Map(), cache = new Map();
  let revision = 0, generatedBricks = 0, evictions = 0, terrainSamples = 0;

  function putChange(entry) {
    const key = cellKey(entry), brick = brickKey(entry);
    changes.set(key, entry);
    if (!byBrick.has(brick)) byBrick.set(brick, new Map());
    byBrick.get(brick).set(key, entry);
  }
  function removeChange(at) {
    const key=cellKey(at),brick=brickKey(at),index=byBrick.get(brick);
    changes.delete(key); index?.delete(key);
    if (index?.size===0) byBrick.delete(brick);
  }
  function baseAt(at) { terrainSamples++; return layerMaterial(sampleCell(spec,at.x,at.z).surfaceLevel,at.y); }
  const restored=readCheckpoint(identity,checkpoint,baseAt);
  for (const entry of restored.entries) putChange(entry);
  revision=restored.revision;

  function decode(at) {
    const key = brickKey(at);
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const x0 = floorDiv(at.x,SIDE)*SIDE, y0 = floorDiv(at.y,SIDE)*SIDE, z0 = floorDiv(at.z,SIDE)*SIDE;
    const material = new Uint8Array(VOLUME);
    for (let z=0; z<SIDE; z++) for (let x=0; x<SIDE; x++) {
      const surface = sampleCell(spec,x0+x,z0+z).surfaceLevel; terrainSamples++;
      for (let y=0; y<SIDE; y++) {
        const level = y0+y;
        material[(y*SIDE+z)*SIDE+x] = layerMaterial(surface,level);
      }
    }
    for (const entry of byBrick.get(key)?.values() ?? []) material[index(entry)] = entry.material;
    generatedBricks++;
    cache.set(key, material);
    while (cache.size > maxResidentBricks) { cache.delete(cache.keys().next().value); evictions++; }
    return material;
  }
  function read(at) { at = checkCell(at); return decode(at)[index(at)]; }
  function save() {
    return { schema: 1, identity: clone(identity), revision,
      changes: [...changes.values()].map(clone).sort(compareCells) };
  }

  return Object.freeze({
    read,
    // Cold geometry consumers need identity/revision, not a copied edit ledger.
    describe() { return { identity:clone(identity), revision }; },
    /** One atomic in-memory edit; host must persist save() for disk durability. */
    edit({ expectedRevision, cells }) {
      if (expectedRevision !== revision) return { ok:false, reason:'stale-revision', revision };
      if (!Array.isArray(cells) || cells.length === 0 || cells.length > 4096) throw new Error('bounded nonempty cell batch required');
      const seen = new Set(), next = [];
      for (const input of cells) {
        const at = checkCell(input), material = checkMaterial(input.material), expectedMaterial = checkMaterial(input.expectedMaterial);
        if (seen.has(cellKey(at))) throw new Error('duplicate edit cell');
        seen.add(cellKey(at));
        if (read(at) !== expectedMaterial) return { ok:false, reason:'cell-changed', revision };
        if (expectedMaterial !== material) next.push({entry:{ ...at, material, revision:revision+1 },base:baseAt(at)});
      }
      if (next.length===0) return {ok:true,revision,changedBricks:[]};
      if (!Number.isSafeInteger(revision+1)) throw new RangeError('revision exhausted');
      // Every precondition passes before any canonical change is installed.
      for (const {entry,base} of next) {
        if (entry.material===base) removeChange(entry); else putChange(entry);
        const decoded=cache.get(brickKey(entry));
        if (decoded) decoded[index(entry)]=entry.material;
      }
      revision++;
      return { ok:true, revision, changedBricks:[...new Set(next.map(({entry})=>brickKey(entry)))].sort() };
    },
    save,
    evictAll() { evictions += cache.size; cache.clear(); },
    stats() { return { revision, changedCells:changes.size, changedBricks:byBrick.size,
      residentBricks:cache.size, residentBytes:cache.size*VOLUME,
      maxResidentBricks, generatedBricks, terrainSamples, evictions,
      checkpointBytes:new TextEncoder().encode(JSON.stringify(save())).length }; },
  });
}
