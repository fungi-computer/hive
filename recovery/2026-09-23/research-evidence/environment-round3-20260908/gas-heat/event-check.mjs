import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {geometry,initial,advance} from './solver.mjs';
const cfg={nx:4,nz:4,dx:.5},s=initial(geometry(cfg));s.time=120-5e-12;
const r=advance(geometry(cfg),s,1e-11,{dtMax:.05,events:[120],forcingAt:t=>({sources:t<120?[{cell:0,smokeKgS:1,heatJS:1}]:[]})});
const sourceError=Math.abs(r.state.smokeSource-(120-s.time));
const result={sourceSha256:createHash('sha256').update(readFileSync(new URL('solver.mjs',import.meta.url))).digest('hex'),start:s.time,end:r.state.time,expectedEnd:s.time+1e-11,sourceError,steps:r.state.steps};
writeFileSync(new URL('event-check-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
if(r.state.time!==s.time+1e-11||sourceError!==0||r.state.steps!==2)throw new Error('floating boundary interval');
