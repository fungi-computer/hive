import { drainage } from '../drainage.mjs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const common = { origin: [0, 0], size: [3, 3], stride: 1, seaMetres: 0, sourceIdentity: 'review-only-admitted-extreme-finite-bed' };
const bed = Array(9).fill(1e308); bed[4] = -1e308;
let overflow;
try {
  const value = drainage({ ...common, bedMetres: bed }).components()[0];
  overflow = { admitted: true, allInputBedsFinite: bed.every(Number.isFinite),
    maximumDepthFinite: Number.isFinite(value.maximumDepthMetres), capacityFinite: Number.isFinite(value.rectangularPrismCapacityM3),
    serializedComponent: JSON.stringify(value) };
} catch (error) { overflow = { admitted: false, message: error.message }; }

let duplicateRoots;
try {
  const value = drainage({ ...common, seaMetres: 1, bedMetres: Array(9).fill(0), marineRoots: Array(10).fill(0) });
  duplicateRoots = { admitted: true, cells: value.describe().cells, inputRootEntries: 10, oceanCellZero: value.atIndex(0).oceanConnected };
} catch (error) { duplicateRoots = { admitted: false, message: error.message }; }

const result = { scope: 'two tiny admission probes; no numerical suite or world generation', overflow, duplicateRoots,
  sourceSha256: createHash('sha256').update(await readFile(new URL('../drainage.mjs', import.meta.url))).digest('hex') };
await writeFile(new URL('./probe.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
