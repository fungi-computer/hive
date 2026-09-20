import { exposeTerrainFaces } from "../runtime/terrain-region-exposure.js";
const key = values => values.join(",");
const inBounds = ([x,y,z], bounds) => x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY && z >= bounds.minZ && z < bounds.maxZ;
/** RLE input belongs only to synthetic source studies. Live clients consume
 * complete region face facts; the shared runtime helper owns exposure rules. */
export function materialCoverage({ chunks, palette, bounds, verticalMetres, variantSeed = 0, epoch, terrainRevision }) {
  if (!(verticalMetres > 0) || chunks.length > 2048) throw new Error("invalid terrain coverage budget/scale");
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


export function fixtureTerrainFaces(data, level) {
  const coverage = materialCoverage(data), cells = new Set(), faces = [];
  for (const chunk of data.chunks) for (const column of chunk.columns) {
    const id = `${column.x},${column.z}`;
    if (cells.has(id)) continue;
    cells.add(id);
    faces.push(...exposeTerrainFaces({ bounds:data.bounds, level, sample:coverage.sample,
      core:{minX:column.x,maxX:column.x+1,minZ:column.z,maxZ:column.z+1} }));
  }
  return { faces, palette:data.palette, bounds:data.bounds, verticalMetres:data.verticalMetres, variantSeed:data.variantSeed??0 };
}
