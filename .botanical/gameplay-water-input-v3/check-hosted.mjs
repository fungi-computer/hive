import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/';
const manifest = JSON.parse(await readFile('.botanical/gameplay-water-release/dist-sha256.json', 'utf8'));
assert.equal(manifest.runtimePin, '210b85d722e4d074eeff34d3653d109882c02655');
const entries = Object.entries(manifest.files), rows = [];
assert.equal(entries.length, 100);
let next = 0;
await Promise.all(Array.from({length: 4}, async () => {
  while (next < entries.length) {
    const [path, expected] = entries[next++];
    assert(!path.startsWith('/') && !path.split('/').includes('..'));
    const row = {path, expected, match:false};
    try {
      const response = await fetch(new URL(path, base), {signal:AbortSignal.timeout(30000)});
      const bytes = Buffer.from(await response.arrayBuffer());
      row.status = response.status;
      row.url = response.url;
      row.sha256 = createHash('sha256').update(bytes).digest('hex');
      row.match = response.ok && row.sha256 === expected;
    } catch (error) { row.error = error.message; }
    rows.push(row);
  }
}));
rows.sort((a,b) => a.path.localeCompare(b.path));
const receipt = {base, runtimePin:manifest.runtimePin, deployment:process.argv[2] ?? null,
  observedAt:new Date().toISOString(), count:rows.length, passed:rows.every(r=>r.match), rows};
await writeFile('.botanical/gameplay-water-input-v3/hosted-parity.json', JSON.stringify(receipt,null,2), {flag:'wx'});
console.log(JSON.stringify({count:receipt.count,passed:receipt.passed,failed:rows.filter(r=>!r.match)}));
if (!receipt.passed) process.exitCode=1;
