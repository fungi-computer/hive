import {makeFixture,step,stableDt,serialize,restore,edit,metrics,G,sum} from './solver.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),arg=process.argv[2]??'qualification',stamp=process.argv[3]??new Date().toISOString().replaceAll(':','-');
const dir=new URL(`runs/${stamp}-${arg}/`,root);mkdirSync(dir,{recursive:true});
const digest=x=>createHash('sha256').update(x).digest('hex');
const hashes={};for(const file of ['solver.mjs','experiment.mjs','PREDECLARED.md']){const bytes=readFileSync(new URL(file,root));hashes[file]=digest(bytes);writeFileSync(new URL(file,dir),bytes);}
function save(name,x){writeFileSync(new URL(name,dir),JSON.stringify(x,null,2)+'\n');}
const outcomes=[];
function experiment(name,fn){const start=performance.now();try{const result=fn();result.name=name;result.elapsedMs=performance.now()-start;outcomes.push(result);save(`${name}.json`,result);console.log(JSON.stringify({name,status:'completed',...result.summary,elapsedMs:result.elapsedMs}));return result;}catch(error){const result={name,status:'failed',error:error.stack,elapsedMs:performance.now()-start};outcomes.push(result);save(`${name}.json`,result);console.log(JSON.stringify(result));return result;}}
function advance(initial,{end=600,dt=.1,open=true,dig=true,withdrawRate=.06,retain=true}={}) {
  let s=initial;const trajectory=[],snapshots=[];let nextOutput=s.time;
  let arrival=null,maxMassError=0,maxFr=0,wetFaceSeconds=0,halfFaceSeconds=0,oneFaceSeconds=0,limitedDonors=0,minFactor=1,maxGradient=0,minDepth=Infinity,gateBeforeOpen=0;
  let steps=0,minDt=Infinity;
  while(s.time<end-1e-9) {
    if(open&&!s.events.gate&&s.geom.fixture==='diversion'&&s.time>=60-1e-9)s=edit(s,'gate-open');
    if(dig&&!s.events.dig&&s.geom.fixture==='diversion'&&s.time>=180-1e-9)s=edit(s,'dig-pond');
    if(s.time>=nextOutput-1e-9) {trajectory.push(metrics(s));if(retain&&[0,60,180,300,600].some(t=>Math.abs(s.time-t)<1e-7))snapshots.push(serialize(s));nextOutput+=10;}
    let d=stableDt(s,dt);d=Math.min(d,end-s.time,nextOutput-s.time);
    if(s.geom.fixture==='diversion'){if(open&&!s.events.gate)d=Math.min(d,60-s.time);if(dig&&!s.events.dig)d=Math.min(d,180-s.time);}
    if(d<1e-12)throw Error(`bad timestep ${d} at ${s.time}`);
    const r=step(s,d,{withdrawRate:s.geom.fixture==='diversion'?withdrawRate:0});
    if(!s.events.gate)for(const f of s.geom.faces)if(f.gate)gateBeforeOpen+=Math.abs(r.exchanges[f.id]);
    s=r.state;steps++;minDt=Math.min(minDt,d);const q=r.diagnostics;
    maxMassError=Math.max(maxMassError,Math.abs(metrics(s).balanceError));maxFr=Math.max(maxFr,q.maxFr);maxGradient=Math.max(maxGradient,q.maxGradient);minDepth=Math.min(minDepth,q.minDepth);
    wetFaceSeconds+=d*q.wetFaces;halfFaceSeconds+=d*q.frAboveHalf;oneFaceSeconds+=d*q.frAboveOne;limitedDonors+=q.limitedDonors;minFactor=Math.min(minFactor,q.minFactor);
    if(arrival===null)for(let i=0;i<s.V.length;i++)if(s.geom.region[i]===6&&s.V[i]/s.geom.area>=.01){arrival=s.time;break;}
    if(steps>150000)throw Error('bounded step quota exceeded');
  }
  trajectory.push(metrics(s));if(retain)snapshots.push(serialize(s));
  return {state:s,trajectory,snapshots,summary:{...metrics(s),arrivalSeconds:arrival,steps,minDt,maxMassError,maxFrAbove1cm:maxFr,wetFaceTimeFractionFrAboveHalf:wetFaceSeconds?halfFaceSeconds/wetFaceSeconds:0,wetFaceTimeFractionFrAboveOne:wetFaceSeconds?oneFaceSeconds/wetFaceSeconds:0,maxGradient,limitedDonors,minFactor,minDepth,gateBeforeOpen}};
}
function finish(r){return {...r,state:serialize(r.state)};}
if(arg==='qualification') {
  for(const model of ['li','swe'])experiment(`rest-${model}`,()=>{const initial=makeFixture({fixture:'rest',model}),r=advance(initial,{end:120,retain:false});let maxV=0,maxMomentum=0;for(let i=0;i<initial.V.length;i++){maxV=Math.max(maxV,Math.abs(initial.V[i]-r.state.V[i])/initial.geom.area);maxMomentum=Math.max(maxMomentum,Math.abs(r.state.mx[i]),Math.abs(r.state.my[i]));}r.summary.restDepthDrift=maxV;r.summary.restHistoryDrift=Math.max(maxMomentum,...r.state.q.map(Math.abs));r.summary.pass=maxV<=1e-11&&r.summary.restHistoryDrift<=1e-11;return finish(r);});
  for(const n of [64,128])for(const model of ['swe','li'])experiment(`ritter-${model}-${n}`,()=>{const initial=makeFixture({fixture:'dam',n,length:32,model,roughness:0}),r=advance(initial,{end:2,dt:.02,retain:false});const c=Math.sqrt(G),dx=initial.geom.dx;let error=0,exactMass=0;const profile=[];for(let x=0;x<n;x++){const X=(x+.5)*dx-16,xi=X/2;const exact=xi<=-c?1:xi>=2*c?0:(2*c-xi)**2/(9*G);const actual=r.state.V[Math.floor(n/2)*n+x]/initial.geom.area;error+=Math.abs(actual-exact)*dx;exactMass+=exact*dx;profile.push({x:X,exact,actual});}r.summary.normalizedDepthL1=error/exactMass;r.summary.pass=r.summary.normalizedDepthL1<=.08&&r.summary.minDepth>=-1e-12;r.profile=profile;return finish(r);});
} else if(arg==='base') {
  for(const model of ['li','swe'])for(const variant of ['divert-dig','closed','divert-no-dig'])experiment(`${model}-${variant}`,()=>finish(advance(makeFixture({model}),{dt:.1,open:variant!=='closed',dig:variant==='divert-dig'})));
} else if(arg==='refinement') {
  for(const [model,theta,n,dt] of [['li',.7,32,.05],['li',.7,32,.025],['li',.7,64,.05],['li',1,32,.1],['li',1,32,.05],['li',1,32,.025],['li',1,64,.05],['swe',.7,32,.05],['swe',.7,32,.025],['swe',.7,64,.05]])experiment(`${model}-theta${theta}-n${n}-dt${dt}`,()=>finish(advance(makeFixture({model,theta,n}),{dt})));
} else if(arg==='restart') {
  for(const model of ['li','swe'])experiment(`restart-${model}`,()=>{const start=advance(makeFixture({model}),{end:200,dt:.1,retain:false}).state;const original=advance(start,{end:220,dt:.1,retain:false}).state;const decoded=restore(JSON.parse(JSON.stringify(serialize(start))));const resumed=advance(decoded,{end:220,dt:.1,retain:false}).state;const qLost=restore(serialize(start));qLost.q.fill(0);const reset=advance(qLost,{end:220,dt:.1,retain:false}).state;let diff=0;for(let i=0;i<reset.V.length;i++)diff=Math.max(diff,Math.abs(reset.V[i]-original.V[i]));return {summary:{exactWithHistory:JSON.stringify(serialize(original))===JSON.stringify(serialize(resumed)),maxVolumeDifferenceDiscardQ:diff},checkpoint:serialize(start),final:serialize(original)};});
  for(const model of ['li','swe'])experiment(`rotation90-${model}`,()=>{const a=advance(makeFixture({model}),{end:120,retain:false}),b=advance(makeFixture({model,rotation:1}),{end:120,retain:false});let diff=0,momentum=0,face=0;const n=32;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const bi=y*n+x,ai=(n-1-x)*n+y;diff=Math.max(diff,Math.abs(b.state.V[bi]-a.state.V[ai]));momentum=Math.max(momentum,Math.abs(b.state.mx[bi]+a.state.my[ai]),Math.abs(b.state.my[bi]-a.state.mx[ai]));}for(const f of b.state.geom.faces){const ai=f.axis===0?a.state.geom.yids[(n-f.x)*n+f.y]:a.state.geom.xids[(n-1-f.x)*(n+1)+f.y];face=Math.max(face,Math.abs(b.state.q[f.id]-(f.axis===0?-1:1)*a.state.q[ai]));}return {summary:{mappedVolumeMaxDifference:diff,mappedMomentumMaxDifference:momentum,mappedDischargeMaxDifference:face,pass:Math.max(diff,momentum,face)<=1e-10,a:a.summary,b:b.summary},a:serialize(a.state),b:serialize(b.state)};});
} else if(arg==='radial') {
  for(const model of ['li','swe'])for(const n of [32,64])experiment(`radial-${model}-${n}`,()=>{const r=advance(makeFixture({model,n,fixture:'radial'}),{end:25,dt:.05,retain:false});const rays={axis:[],diagonal:[]},dx=r.state.geom.dx;for(let i=0;i<r.state.V.length;i++){const x=(i%n+.5)*dx-32,y=(Math.floor(i/n)+.5)*dx-32,depth=r.state.V[i]/r.state.geom.area;if(depth<.01)continue;const rr=Math.hypot(x,y);if(Math.abs(y)<=dx/2+.001&&x>0)rays.axis.push(rr);if(Math.abs(x-y)<.001&&x>0)rays.diagonal.push(rr);}const axis=Math.max(...rays.axis),diagonal=Math.max(...rays.diagonal);r.summary.axisRadius=axis;r.summary.diagonalRadius=diagonal;r.summary.relativeRadiusBias=Math.abs(axis-diagonal)/((axis+diagonal)/2);r.summary.pass=r.summary.relativeRadiusBias<=.1;return finish(r);});
} else if(arg.startsWith('cost-')) {
  const model=arg.slice(5);experiment(arg,()=>{const initial=makeFixture({model}),before=process.memoryUsage(),r=advance(initial,{retain:false});const after=process.memoryUsage(),N=initial.V.length,E=initial.q.length;r.summary.cost={cells:N,faces:E,faceEvaluations:r.summary.steps*E,persistentFieldBytes:(3*N+E)*8,geometryTypedBytes:N*10+E*4,scratchTypedArrayBytesPerStep:(8*N+7*E)*8,decodedJsonBytes:Buffer.byteLength(JSON.stringify(serialize(r.state))),before,after,processPeakRssKiB:process.resourceUsage().maxRSS};return finish(r);});
} else if(arg==='extended-observation') {
 for(const model of ['li','swe'])for(const open of [false,true])experiment(`${model}-${open?'divert':'closed'}-1200s`,()=>finish(advance(makeFixture({model}),{end:1200,open,dig:open,retain:false})));
} else throw Error('unknown suite');
save('manifest.json',{suite:arg,stamp,hashes,node:process.version,platform:process.platform,arch:process.arch,timestamp:new Date().toISOString(),outcomes:outcomes.map(({name,status,summary,elapsedMs,error})=>({name,status:status??'completed',summary,elapsedMs,error}))});
console.log(`Saved ${fileURLToPath(dir)}`);
