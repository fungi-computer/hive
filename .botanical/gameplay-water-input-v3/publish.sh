#!/usr/bin/env bash
set -euo pipefail
set +x
node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),'81386a80f54eb41efa711da2806d02210fc7a5af');
assert.equal(git('status','--porcelain','--untracked-files=no'),'');
assert.deepEqual(git('diff','--name-only','210b85d','HEAD').split('\n'),['AGENTS.md','docs/decisions/architecture-proof-sprint.md']);
const m=JSON.parse(await readFile('.botanical/gameplay-water-release/dist-sha256.json','utf8'));
assert.equal(m.runtimePin,'210b85d722e4d074eeff34d3653d109882c02655');
assert.equal(Object.keys(m.files).length,100);
for(const [path,expected] of Object.entries(m.files)) {
 const actual=createHash('sha256').update(await readFile('dist/'+path)).digest('hex');
 assert.equal(actual,expected,'Accepted dist changed: '+path);
}
console.log('Accepted source and 100-file dist verified; no rebuild.');
JS
set -a
source /home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env
set +a
export CLOUDFLARE_ACCOUNT_ID=fe06bade61f12db4c9af035423185f7f
npm run preview -- --name goblin-mvp
