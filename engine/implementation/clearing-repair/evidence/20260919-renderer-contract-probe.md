# Independent renderer probe

Read-only reviewer execution at `950bea93` with the two preserved dirty picking
files. Exit code 0; scope `run-u2306`, invocation
`5a6e54adebfd445da7ede6377e48e92e`. This checks record order/admission, not pixels,
camera interaction or performance. No source edits were made by the reviewer.

Working directory: `/home/levi/src/hive-worktrees/living-terrain-integration`.
Exact command:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node --input-type=module <<'JS'
import { createMixedRenderFixture } from './engine/src/client/mixed-render-fixture.js';
import { compileVoxelDrawStream, voxelDrawRecordKey } from './engine/src/client/voxel-draw-stream.js';
import { createVoxelDrawStreamOwner } from './engine/src/client/voxel-draw-stream-owner.js';
const f=createMixedRenderFixture();
const options={direction:f.projection.direction,verticalMetres:f.verticalMetres};
const top=f.terrain.find(r=>r.face==='top'&&r.cell.join(',')==='1,0,1');
const actor={...f.actors[0],id:'rear-half-actor',attachment:{kind:'supported',support:null,feet:{x:.6,y:.27,z:.6}}};
const compile=rs=>compileVoxelDrawStream(rs,options);
console.log('rear-half support order',compile([top,actor]).records.map(r=>r.id));
const result=compile(f.input);
const shifted=result.trace.filter(t=>t.slot==='surface-root'&&JSON.stringify(t.anchor)!==JSON.stringify(t.insertion));
console.log('cover roots delayed',shifted.length,shifted.slice(0,2).map(t=>({record:t.record,anchor:t.anchor,insertion:t.insertion})));
const cover=f.grass.find(r=>voxelDrawRecordKey(r)===shifted[0]?.record);
if(cover){
 const sameFacts={...cover,attachment:{...cover.attachment,supports:cover.attachment.supports.map(s=>s.match(/^terrain:([^:]+):/)[1].split(',').map(Number))}};
 const changed=compile(f.input.map(r=>r===cover?sameFacts:r));
 console.log('culling support representation changes order',result.records.map(voxelDrawRecordKey).join('|')!==changed.records.map(voxelDrawRecordKey).join('|'));
}
const statics=f.input.filter(r=>r.attachment.kind!=='supported');
const bad={...f.actors.find(r=>r.attachment.support==='fixture:stair'),moving:true,attachment:{kind:'supported',support:'fixture:stair',feet:{x:100,y:.27,z:100}}};
const owner=createVoxelDrawStreamOwner(options);
console.log('owner admits invalid support span',owner.update({revision:1,staticRecords:()=>statics,dynamicRecords:[bad]}).records.includes(bad));
try { compile([...statics,bad]); console.log('compiler accepts'); } catch(e){console.log('compiler rejects',e.message);}
JS
```

Captured output:

```text
Running as unit: run-u2306.scope; invocation ID: 5a6e54adebfd445da7ede6377e48e92e
rear-half support order [ 'rear-half-actor', 'terrain:1,0,1:top' ]
cover roots delayed 8 [
  {
    record: 'cover:0:0:0:grass:green:full\x00cover',
    anchor: [ 0.7473724356957945, 5.551115123125783e-17, 0.27, 0.5, 0.5 ],
    insertion: [ 1.3597448713915892, 1.1102230246251565e-16, 0.27, 1, 1 ]
  },
  {
    record: 'cover:1:0:0:grass:green:full\x00cover',
    anchor: [ 1.3597448713915892, -0.6123724356957945, 0.27, 1.5, 0.5 ],
    insertion: [ 1.9721173070873836, -0.6123724356957944, 0.27, 2, 1 ]
  }
]
culling support representation changes order true
owner admits invalid support span true
compiler rejects multipart support fixture:stair actor lies outside its traversal span
```
