import * as baseline from './baseline.mjs';
import * as candidate from './candidate.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const variants = { baseline, candidate };
const spec = baseline.createWorldSpec();
const result = {
  passed: false,
  scope: 'Pinned Node 512x512 overview generation, four arrays and metadata; no browser/worker scheduling or population-capacity claim',
  source: JSON.parse(await readFile(new URL('./source-inventory.json', import.meta.url), 'utf8')),
  rounds: [],
};
function generate(module) {
  const cpu = process.cpuUsage();
  const start = performance.now();
  const sampler = module.createOverviewSampler(spec);
  let batches = 0;
  while (true) {
    batches += 1;
    if (sampler.sampleRows(8).done) break;
  }
  const value = sampler.result();
  const milliseconds = performance.now() - start;
  const cpuUsed = process.cpuUsage(cpu);
  return { value, timing: { milliseconds, cpuMilliseconds: (cpuUsed.user + cpuUsed.system) / 1000, batches, samples: value.sampleCount } };
}
function digest(value) {
  const hash = createHash('sha256');
  for (const key of ['terrain', 'features', 'elevation', 'moisture']) hash.update(value[key]);
  return hash.digest('hex');
}
try {
  for (const module of Object.values(variants)) {
    module.sampleOverview(spec, { width: 64, height: 64 });
  }
  for (const order of [['baseline', 'candidate'], ['candidate', 'baseline']]) {
    const values = {};
    for (const name of order) values[name] = generate(variants[name]);
    assert.deepEqual(values.candidate.value, values.baseline.value);
    const record = {
      order,
      baseline: values.baseline.timing,
      candidate: values.candidate.timing,
      sameCompleteResult: true,
      arraySha256: digest(values.baseline.value),
      elapsedRatio: values.baseline.timing.milliseconds / values.candidate.timing.milliseconds,
      cpuRatio: values.baseline.timing.cpuMilliseconds / values.candidate.timing.cpuMilliseconds,
    };
    result.rounds.push(record);
    console.log(JSON.stringify(record));
  }
  result.passed = true;
} catch (error) {
  result.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await writeFile(new URL('./overview-proof.json', import.meta.url), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, failure: result.failure }));
}
