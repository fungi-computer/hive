import { polygonContains, prepareOrderingProxy } from "./plane-order.js";

const DIRECTIONS = Object.freeze([
  { face: "top", offset: [0, 1, 0] }, { face: "bottom", offset: [0, -1, 0] },
  { face: "east", offset: [1, 0, 0] }, { face: "west", offset: [-1, 0, 0] },
  { face: "south", offset: [0, 0, 1] }, { face: "north", offset: [0, 0, -1] },
]);
const key = values => values.join(",");
const inBounds = ([x, y, z], bounds) => x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY && z >= bounds.minZ && z < bounds.maxZ;
const overlaps = (a, b) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

/** Consumes R1's checked complete RLE chunks, never highest-surface geology.
 * Each snapshot is one epoch/revision. Transport owns validation and lifetime;
 * this index is disposable presentation data and grants no physical support.
 */
export function materialCoverage({ chunks, palette, bounds, verticalMetres, variantSeed = 0, epoch, terrainRevision }) {
  if (!(verticalMetres > 0) || chunks.length > 512) throw new Error("invalid terrain coverage budget/scale");
  const materials = new Map(palette.map(material => [material.slot, material]));
  const indexed = new Map();
  for (const chunk of chunks) {
    const chunkKey = key(chunk.key);
    if (indexed.has(chunkKey)) throw new Error("duplicate terrain coverage chunk");
    indexed.set(chunkKey, { chunk, columns: new Map(chunk.columns.map(column => [key([column.x, column.z]), column.runs])) });
  }
  function sample(cell) {
    if (!inBounds(cell, bounds)) return { kind: "outside" };
    const chunk = indexed.get(key(cell.map(value => Math.floor(value / 8))));
    if (!chunk) return { kind: "unknown" };
    const runs = chunk.columns.get(key([cell[0], cell[2]]));
    let low = 0, high = (runs?.length ?? 0) - 1, run;
    while (low <= high) {
      const middle = (low + high) >> 1, candidate = runs[middle];
      if (cell[1] < candidate.minY) high = middle - 1;
      else if (cell[1] >= candidate.maxY) low = middle + 1;
      else { run = candidate; break; }
    }
    if (!run) throw new Error("incomplete terrain coverage column");
    const material = materials.get(run.material);
    if (!material || typeof material.solid !== "boolean") throw new Error("unknown terrain material slot");
    return { kind: "known", material: material.slot, solid: material.solid, art: material.art };
  }
  return Object.freeze({ chunks, bounds, verticalMetres, variantSeed, epoch, terrainRevision, sample });
}

function corners([x, y, z], face, h) {
  const l = x - 0.5, r = x + 0.5, b = (y - 0.5) * h, t = (y + 0.5) * h, n = z - 0.5, s = z + 0.5;
  const values = {
    top: [[l,t,n], [l,t,s], [r,t,s], [r,t,n]], bottom: [[l,b,n], [r,b,n], [r,b,s], [l,b,s]],
    east: [[r,b,n], [r,t,n], [r,t,s], [r,b,s]], west: [[l,b,s], [l,t,s], [l,t,n], [l,b,n]],
    south: [[l,b,s], [r,b,s], [r,t,s], [l,t,s]], north: [[r,b,n], [l,b,n], [l,t,n], [r,t,n]],
  };
  return values[face].map(([x,y,z]) => ({x,y,z}));
}

export function projectedBounds(points) {
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}

/** Exposed cell faces only. Undecided neighbor faces stay absent, not open air. */
export function terrainFaceRecords(coverage, { level, projection, viewport, appearance, generatedTops = new Map() }) {
  if (!Number.isSafeInteger(level)) throw new Error("terrain cut needs an integer support level");
  const records = [];
  for (const chunk of coverage.chunks) for (const column of chunk.columns) for (const run of column.runs) {
    for (let y = run.minY; y < Math.min(run.maxY, level + 1); y++) {
      const cell = [column.x, y, column.z];
      const material = coverage.sample(cell);
      if (!material.solid) continue;
      for (const { face, offset } of DIRECTIONS) {
        if (offset[0] * projection.direction.x + offset[1] * projection.direction.y + offset[2] * projection.direction.z >= -1e-7) continue;
        const neighbor = coverage.sample(cell.map((value, index) => value + offset[index]));
        const atCut = face === "top" && y === level;
        if (!atCut && (neighbor.kind !== "known" || neighbor.solid)) continue;
        // Unknown above the cut is enough to cap, but never enough to admit
        // a support target. World boundaries likewise aren't invented air.
        const cap = atCut && (neighbor.kind !== "known" || neighbor.solid);
        const planarCorners = corners(cell, face, coverage.verticalMetres);
        const projected = planarCorners.map(p => projection.project(p));
        const screenBounds = projectedBounds(projected);
        if (viewport && !overlaps(screenBounds, viewport)) continue;
        const visual = appearance?.body({ cell, face, material: material.material, art: material.art, cap,
          generatedTop: generatedTops.get(`${cell[0]},${cell[2]}`), seed: coverage.variantSeed,
          projection, verticalMetres: coverage.verticalMetres });
        const record = {
          id: `terrain:${key(cell)}:${face}`, part: "face", role: "terrain", cell, face,
          ...(face === "top" ? { partRole: "supporting-surface" } : {}),
          material: material.material, cap, planarCorners, footprint: planarCorners,
          screenBounds, storeyBand: y, pickable: false, visible: true,
          // Appearance receives material and cap, so grass cannot be inferred
          // from the highest column. Original art selection stays its owner.
          projected, ...(visual ?? {}),
        };
        const proxy = prepareOrderingProxy(record, projection);
        if (!proxy) continue;
        record.contains = point => polygonContains(proxy.polygon, point);
        records.push(record);
      }
    }
  }
  return records;
}

const coverIdentity = cover => `${cover.kind}\u0000${cover.condition}\u0000${cover.height}`;

/** Dual-grid cover patches are ordinary sortable records derived from four
 * explicit same-level surface facts. They never infer grass from geology.
 */
export function terrainCoverRecords(surfaces, { level, projection, viewport, appearance, verticalMetres, variantSeed = 0 }) {
  if (!appearance?.cover || !Number.isFinite(verticalMetres) || verticalMetres <= 0) return [];
  const covered = new Map(surfaces.filter(surface => surface.cover && surface.cell[1] <= level)
    .map(surface => [`${surface.cell[0]},${surface.cell[2]}`, surface]));
  const roots = new Map();
  for (const surface of covered.values()) for (const [dx, dz] of [[0,0],[-1,0],[-1,-1],[0,-1]])
    roots.set(`${surface.cell[0]+dx},${surface.cell[2]+dz}`, [surface.cell[0]+dx, surface.cell[2]+dz]);
  const records = [];
  for (const root of roots.values()) {
    const samples = [[0,0],[1,0],[1,1],[0,1]].map(([dx,dz]) => covered.get(`${root[0]+dx},${root[1]+dz}`));
    const identities = new Set(samples.filter(Boolean).map(surface => `${surface.cell[1]}\u0000${coverIdentity(surface.cover)}`));
    for (const identity of identities) {
      const [yText, kind, condition, height] = identity.split("\u0000"), y = Number(yText);
      let mask = 0;
      samples.forEach((surface, index) => {
        if (surface && surface.cell[1] === y && coverIdentity(surface.cover) === `${kind}\u0000${condition}\u0000${height}`) mask |= 1 << index;
      });
      if (!mask) continue;
      const surfaceY = (y + 0.5) * verticalMetres;
      const visual = appearance.cover({ cover: { kind, condition, height }, mask, root, seed: variantSeed, projection, surfaceY });
      const footprint = [{ x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 }];
      const supportIds = samples.flatMap((surface, index) => surface && (mask & (1 << index))
        ? [`terrain:${surface.cell.join(",")}:top\u0000face`] : []);
      const screenBounds = projectedBounds(visual.projected);
      if (viewport && !overlaps(screenBounds, viewport)) continue;
      const record = { id: `cover:${root[0]}:${y}:${root[1]}:${kind}:${condition}:${height}`, part: "cover", role: "terrain-cover",
        relationPolicy: "surface-cover", orderingKind: "compact", mask, footprint, screenBounds, storeyBand: y,
        supportIds, pickable: false, visible: true, ...visual };
      const proxy = prepareOrderingProxy(record, projection);
      if (!proxy) continue;
      record.contains = point => polygonContains(proxy.polygon, point);
      records.push(record);
    }
  }
  return records;
}

/** Request selection uses inverse camera rays across all lower world levels.
 * One-cell halo is represented by adjacent chunk keys, including vertical keys.
 * This only plans demand; R1 owns request turns, budgets and the retained cache.
 */
export function visibleTerrainChunks({ bounds, level, verticalMetres, projection, viewport, padding = 16, limit = 512 }) {
  const expanded = { left: viewport.left - padding, right: viewport.right + padding, top: viewport.top - padding, bottom: viewport.bottom + padding };
  const screens = [{x:expanded.left,y:expanded.top},{x:expanded.right,y:expanded.top},{x:expanded.right,y:expanded.bottom},{x:expanded.left,y:expanded.bottom}];
  const maxY = Math.min(bounds.maxY, level + 1);
  const keys = new Map();
  if (maxY <= bounds.minY) return { kind: "ready", chunks: [] };
  // Bound candidate enumeration before constructing any per-cell geometry.
  const minChunkY = Math.floor(bounds.minY / 8), maxChunkY = Math.floor((maxY - 1) / 8);
  for (let cy = maxChunkY; cy >= minChunkY; cy--) {
    const low = (Math.max(bounds.minY, cy * 8) - 0.5) * verticalMetres;
    const high = (Math.min(maxY, (cy + 1) * 8) - 0.5) * verticalMetres;
    const hits = screens.flatMap(screen => {
      const { origin, direction } = projection.ray(screen);
      if (Math.abs(direction.y) < 1e-7) throw new Error("terrain demand requires a downward camera");
      return [low, high].map(y => { const t = (y - origin.y) / direction.y; return { x: origin.x + t * direction.x, z: origin.z + t * direction.z }; });
    });
    const startX = Math.max(Math.floor(bounds.minX / 8), Math.floor((Math.min(...hits.map(p=>p.x)) - 0.5) / 8));
    const endX = Math.min(Math.floor((bounds.maxX - 1) / 8), Math.floor((Math.max(...hits.map(p=>p.x)) + 0.5) / 8));
    const startZ = Math.max(Math.floor(bounds.minZ / 8), Math.floor((Math.min(...hits.map(p=>p.z)) - 0.5) / 8));
    const endZ = Math.min(Math.floor((bounds.maxZ - 1) / 8), Math.floor((Math.max(...hits.map(p=>p.z)) + 0.5) / 8));
    for (let cx=startX; cx<=endX; cx++) for (let cz=startZ; cz<=endZ; cz++) {
      const points = [Math.max(bounds.minX,cx*8)-0.5,Math.min(bounds.maxX,(cx+1)*8)-0.5].flatMap(x => [low,high].flatMap(y => [Math.max(bounds.minZ,cz*8)-0.5,Math.min(bounds.maxZ,(cz+1)*8)-0.5].map(z => projection.project({x,y,z}))));
      if (!overlaps(projectedBounds(points), expanded)) continue;
      for (const [dx,dy,dz] of [[0,0,0], ...DIRECTIONS.map(d=>d.offset)]) {
        const value = [cx+dx,cy+dy,cz+dz];
        if (value[0]*8 >= bounds.maxX || (value[0]+1)*8 <= bounds.minX || value[1]*8 >= bounds.maxY || (value[1]+1)*8 <= bounds.minY || value[2]*8 >= bounds.maxZ || (value[2]+1)*8 <= bounds.minZ) continue;
        keys.set(key(value), value);
        if (keys.size > limit) return { kind: "view-budget", limit };
      }
    }
  }
  return { kind: "ready", chunks: [...keys.values()].sort((a,b) => b[1]-a[1] || a[0]-b[0] || a[2]-b[2]) };
}
