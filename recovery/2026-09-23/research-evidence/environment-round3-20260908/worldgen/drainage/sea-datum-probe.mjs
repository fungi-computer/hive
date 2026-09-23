import { createWorldSpec, sampleCell } from '../reference/terrain.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const here = new URL('./', import.meta.url);
const terrainUrl = new URL('../reference/terrain.js', import.meta.url);
const voxelUrl = new URL('../voxel-world.mjs', import.meta.url);
const digest = async url => createHash('sha256').update(await readFile(url)).digest('hex');
const spec = createWorldSpec({ seed: 'drainage-sea-datum-sample-v1' });
const labels = new Map();
let waterHigh = null, landLow = null;
for (let z = -2048; z < 2048; z += 16) for (let x = -2048; x < 2048; x += 16) {
  const sample = sampleCell(spec, x, z);
  const row = labels.get(sample.terrain) ?? { count: 0, min: Infinity, max: -Infinity, sum: 0 };
  row.count++; row.min = Math.min(row.min, sample.surfaceLevel); row.max = Math.max(row.max, sample.surfaceLevel); row.sum += sample.surfaceLevel;
  labels.set(sample.terrain, row);
  if (sample.terrain === 'water' && (!waterHigh || sample.surfaceLevel > waterHigh.surfaceLevel)) waterHigh = sample;
  if (sample.terrain === 'land' && (!landLow || sample.surfaceLevel < landLow.surfaceLevel)) landLow = sample;
}
const result = {
  scope: '65,536 deterministic 16-cell samples; label/datum diagnostic only',
  identity: spec.identity,
  sources: { terrainSha256: await digest(terrainUrl), voxelSha256: await digest(voxelUrl) },
  labels: Object.fromEntries([...labels].sort().map(([label, row]) => [label, { ...row, mean: row.sum / row.count }])),
  thresholdSeparatesWaterFromLand: Boolean(waterHigh && landLow && waterHigh.surfaceLevel < landLow.surfaceLevel),
  witnesses: { waterHigh: waterHigh && { x: waterHigh.x, z: waterHigh.z, surfaceLevel: waterHigh.surfaceLevel, coastDistance: waterHigh.coastDistance }, landLow: landLow && { x: landLow.x, z: landLow.z, surfaceLevel: landLow.surfaceLevel, coastDistance: landLow.coastDistance } },
  sourceFacts: {
    waterLabel: 'terrain.js selects water from coastDistance < -coastBand',
    voxelMaterials: 'voxel-world base exposes only air, soil, stone from surfaceLevel',
  },
};
await writeFile(new URL('./sea-datum-measurement.json', here), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
