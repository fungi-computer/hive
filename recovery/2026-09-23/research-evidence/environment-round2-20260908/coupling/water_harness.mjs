// Physical sibling LI consumer; no copied solver or production imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeFixture,step,edit,serialize,restore,metrics} from '../water/solver.mjs';
const here=new URL('./',import.meta.url),solver=new URL('../water/solver.mjs',import.meta.url);
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const stable=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(stable):Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]))):x;
const digest=x=>hash(stable(x));
function shuffle(a){let seed=817;for(let i=a.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function partitionRestore(state,parts,order){
  const saved=serialize(state),{n,faces}=state.geom,axis=Math.sqrt(parts),width=n/axis;
  assert(Number.isInteger(width));
  const owner=i=>`${Math.floor((i%n)/width)},${Math.floor(Math.floor(i/n)/width)}`;
  const shards=new Map();
  for(let i=0;i<state.V.length;i++){
    const key=owner(i);if(!shards.has(key))shards.set(key,{cells:[],faces:[]});
    shards.get(key).cells.push({i,V:state.V[i],mx:state.mx[i],my:state.my[i],z:state.geom.z[i],solid:state.geom.solid[i],region:state.geom.region[i]});
  }
  for(const f of faces){
    const observers=new Set([f.a,f.b].filter(i=>i>=0).map(owner));
    for(const key of observers)shards.get(key).faces.push({f,q:state.q[f.id]});
  }
  let blobs=[...shards.values()].map(x=>JSON.stringify(x));
  if(order==='reverse')blobs.reverse();if(order==='shuffle')shuffle(blobs);
  const header={...saved,geom:{...saved.geom}};
  for(const k of ['V','q','mx','my'])delete header[k];
  for(const k of ['z','solid','region','faces'])delete header.geom[k];
  // Only encoded shards/header remain in this reconstruction. Old state is kept
  // solely by the comparison caller, never used to regenerate decoded fields.
  const decoded=JSON.parse(JSON.stringify(header)),cells=new Map(),records=new Map();let duplicates=0;
  for(const blob of blobs){const chunk=JSON.parse(blob);for(const c of chunk.cells){assert(!cells.has(c.i));cells.set(c.i,c);}for(const r of chunk.faces){if(records.has(r.f.id)){assert.deepEqual(records.get(r.f.id),r);duplicates++;}records.set(r.f.id,r);}}
  const cs=[...cells.values()].sort((a,b)=>a.i-b.i),rs=[...records.values()].sort((a,b)=>a.f.id-b.f.id);
  for(const k of ['V','mx','my'])decoded[k]=cs.map(c=>c[k]);
  for(const k of ['z','solid','region'])decoded.geom[k]=cs.map(c=>c[k]);
  decoded.q=rs.map(r=>r.q);decoded.geom.faces=rs.map(r=>r.f);
  const next=restore(decoded),orders=faces.map(f=>f.id);
  if(order==='reverse')orders.reverse();if(order==='shuffle')shuffle(orders);
  assert.deepEqual(serialize(next),saved);
  return {state:next,orders,storage:{parts:blobs.length,duplicateFaceObservations:duplicates,serializedShardBytes:blobs.reduce((s,b)=>s+b.length,0),faces:records.size}};
}
function validate(old,result){
  const {state:s,interval,exchanges,withdrawals}=result;
  assert.equal(interval.geometryRevision,old.geom.revision);assert.equal(s.geom.revision,old.geom.revision);
  assert.equal(interval.start,old.time);assert.equal(interval.end,s.time);
  const delta=new Float64Array(old.V.length);let maxHistoryError=0;
  for(const f of old.geom.faces){const dv=exchanges[f.id];assert(Number.isFinite(dv));if(!f.open)assert.equal(dv,0);else{delta[f.a]-=dv;delta[f.b]+=dv;maxHistoryError=Math.max(maxHistoryError,Math.abs(s.q[f.id]*old.geom.dx*interval.dt-dv));}}
  let residual=0,totalWithdrawal=0;
  for(let i=0;i<delta.length;i++){assert(s.V[i]>=0&&Number.isFinite(s.V[i]));delta[i]-=withdrawals[i];totalWithdrawal+=withdrawals[i];residual=Math.max(residual,Math.abs(s.V[i]-old.V[i]-delta[i]));}
  assert(residual<1e-10);assert(maxHistoryError<1e-12);assert(Math.abs(s.collected-old.collected-totalWithdrawal)<1e-10);
  assert(Math.abs(metrics(s).balanceError)<1e-8);
  return {cellResidualM3:residual,historyExchangeResidualM3:maxHistoryError};
}
function run(parts,order,restart=false){
  let {state,orders,storage}=partitionRestore(makeFixture({n:32,model:'li',theta:.7}),parts,order);
  const trace=[],receipts=[];let worst=0;
  for(let k=0;k<200;k++){
    if(k===40||k===140){const before=Array.from(state.V),previous=state;state=edit(state,k===40?'gate-open':'dig-pond');assert.deepEqual(Array.from(state.V),before);assert.equal(state.geom.revision,previous.geom.revision+1);}
    if(restart&&k===115){const checkpoint=JSON.stringify(serialize(state));state=null;state=restore(JSON.parse(checkpoint));}
    const before=digest(serialize(state)),result=step(state,.05,{faceOrder:orders,withdrawRate:.02});
    assert.equal(digest(serialize(state)),before);const errors=validate(state,result);worst=Math.max(worst,errors.cellResidualM3);
    state=result.state;trace.push(digest(serialize(state)));receipts.push(digest({interval:result.interval,exchanges:Array.from(result.exchanges),withdrawals:Array.from(result.withdrawals)}));
  }
  return {parts,order,restart,storage,trace,receiptTrace:receipts,worstCellResidualM3:worst,final:metrics(state),state};
}
function bindCandidate(old,result){return {base:digest(serialize(old)),geometry:old.geom.revision,result};}
function commitBound(current,candidate){assert.equal(digest(serialize(current)),candidate.base,'stale state / geometry / time');validate(current,candidate.result);return candidate.result.state;}
function main(){
  const started=performance.now(),solverHash=hash(readFileSync(solver,'utf8'));
  const cases=[];for(const p of [1,4,16])for(const o of ['forward','reverse','shuffle'])cases.push(run(p,o));
  for(const c of cases){assert.deepEqual(c.trace,cases[0].trace);assert.deepEqual(c.receiptTrace,cases[0].receiptTrace);}
  const resumed=run(16,'shuffle',true);assert.deepEqual(resumed.trace,cases[0].trace);assert.deepEqual(resumed.receiptTrace,cases[0].receiptTrace);
  let seed=makeFixture({n:32,model:'li'});for(let i=0;i<100;i++)seed=step(seed,.05).state;
  const direct=step(seed,.05),snapshot=JSON.stringify(serialize(seed)),withHistory=restore(JSON.parse(snapshot)),withoutHistory=restore(JSON.parse(snapshot));withoutHistory.q.fill(0);
  const restored=step(withHistory,.05),reset=step(withoutHistory,.05);assert.deepEqual(serialize(restored.state),serialize(direct.state));
  const lostQDifference=direct.state.V.reduce((sum,v,i)=>sum+Math.abs(v-reset.state.V[i]),0);assert(lostQDifference>1e-6);
  const candidate=bindCandidate(seed,direct),dug=edit(seed,'dig-pond');assert.throws(()=>commitBound(dug,candidate));assert.deepEqual(Array.from(dug.V),Array.from(seed.V));
  const committed=commitBound(seed,candidate);assert.throws(()=>commitBound(committed,candidate));
  // Actual physical water successor supplies one receiving cell's net intrusion
  // to the independent open-exhaust displacement extension, with zero backpressure.
  let target=0;for(let i=1;i<seed.V.length;i++)if(direct.state.V[i]-seed.V[i]>direct.state.V[target]-seed.V[target])target=i;
  const delta=direct.state.V[target]-seed.V[target];assert(delta>0);
  const faces=seed.geom.faces.filter(f=>f.a===target||f.b===target).map(f=>({id:f.id,a:f.a,b:f.b,integratedM3:direct.exchanges[f.id]}));
  const coupling={solverSha256:solverHash,cell:target,oldWaterM3:seed.V[target],newWaterM3:direct.state.V[target],deltaWaterM3:delta,dtSeconds:.05,geometryRevision:seed.geom.revision,physicalCellAreaM2:seed.geom.area,faces,withdrawalM3:direct.withdrawals[target],assumption:'Separate fixed-reference-density open exhaust extension; outside pressure fixed; no sealed pressure feedback or coupled momentum solve.'};
  let receiptDelta=-coupling.withdrawalM3;for(const f of faces)receiptDelta+=f.b===target?f.integratedM3:-f.integratedM3;assert(Math.abs(delta-receiptDelta)<1e-12);
  writeFileSync(new URL('water-receiver.json',here),JSON.stringify(coupling,null,2)+'\n');
  const refinement=[];for(const dt of [.05,.025,.0125]){let s=restore(JSON.parse(snapshot));for(let i=0;i<Math.round(1/dt);i++)s=step(s,dt).state;refinement.push({dt,state:s});}
  const fine=refinement.at(-1).state;const errors=refinement.map(r=>({dtSeconds:r.dt,volumeL1M3:r.state.V.reduce((sum,v,i)=>sum+Math.abs(v-fine.V[i]),0),faceDischargeL1M2S:r.state.q.reduce((sum,q,i)=>sum+Math.abs(q-fine.q[i]),0)}));
  assert.equal(hash(readFileSync(solver,'utf8')),solverHash,'solver changed during proof');
  const rows=cases.map(({state,...r})=>r),{state:unused,...restartRow}=resumed;
  const output={scope:'Actual sibling local-inertial 32² finite diversion solver, one-process physical face evaluation + canonical reduction',solverSha256:solverHash,node:process.version,elapsedMs:performance.now()-started,partitionCases:rows,restart:restartRow,allFullStateAndFaceReceiptTracesEqual:true,lostDischargeHistoryVolumeL1M3:lostQDifference,staleGeometryRejected:true,doubleCommitRejected:true,receiver:coupling,dtContinuationComparison:errors,limits:'Storage partitions do not split simulation authority. Full state is copied/hashed. No active-frontier implementation, spatial refinement validation, browser/cross-engine proof, distributed host or population capacity claim. dt comparison is1s continuation of one common5s state; LI theta damping itself depends on timestep.'};
  writeFileSync(new URL(process.argv[2]??'water-results.json',here),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({...output,partitionCases:rows.map(({trace,receiptTrace,...r})=>r),restart:undefined},null,2));
}
try{main();}catch(error){writeFileSync(new URL((process.argv[2]??'water-results.json')+'.failure.txt',here),String(error.stack)+'\n');throw error;}
