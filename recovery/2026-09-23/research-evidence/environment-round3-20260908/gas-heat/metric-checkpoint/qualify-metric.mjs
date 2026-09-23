import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {geometry,initial,advance,predict,project,transport,momentumRate,totals,RHO,CP} from './solver.mjs';
import * as square from './square-checkpoint/solver.mjs';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const max=a=>Math.max(...a.map(Math.abs));
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const sha=s=>createHash('sha256').update(s).digest('hex');
const start=performance.now(),rows=[];
function check(name,fn){const t=performance.now();try{rows.push({name,status:'pass',...fn(),wallMs:performance.now()-t});}catch(error){rows.push({name,status:'fail',error:error.message,wallMs:performance.now()-t});throw error;}}
try {
  check('square constructor and pinned numerical compatibility',()=>{
    const cfg={nx:8,nz:12,dx:.5,viscosity:1.5e-5},g=geometry(cfg),explicit=geometry({...cfg,dx:undefined,hx:.5,hz:.5}),old=square.geometry(cfg);
    assert(g.identity===explicit.identity,'square descriptor compatibility');
    const source={dtMax:.005,forcingAt:()=>({sources:[{cell:9,heatJS:10,smokeKgS:1e-5}]})};
    const a=advance(g,initial(g,3),.1,source),b=advance(explicit,initial(explicit,3),.1,source);
    assert(JSON.stringify(a)===JSON.stringify(b),'square constructor output compatibility');
    const prior=square.advance(old,square.initial(old,3),.1,source);
    const velocityError=max(a.state.velocity.map((v,i)=>v-prior.state.velocity[i]));
    const heatError=max(a.state.heat.map((h,i)=>h-prior.state.heat[i]));
    const smokeError=max(a.state.smoke.map((m,i)=>m-prior.state.smoke[i]));
    const receiptError=max(a.receipt.air.map((q,i)=>q-prior.receipt.air[i]));
    assert(velocityError<1e-9&&heatError<1e-5&&smokeError<1e-10&&receiptError<1e-9,'pinned square equations differ');
    return {velocityError,heatError,smokeError,receiptError,steps:a.state.steps,oldSteps:prior.state.steps,exactSquareConstructors:true};
  });
  check('rectangular metric areas and conservative receipt units',()=>{
    const g=geometry({nx:8,nz:8,hx:1,hz:.54,depth:1,periodicX:true,periodicZ:true,buoyancy:false,
      viscosity:0,tracerDiffusivity:0,thermalDiffusivity:0});
    let s=initial(g);s.velocity=g.faces.map(f=>f.axis==='u'?.2:.1);
    s.smoke=g.cells.map(c=>g.volume*(1+.2*Math.sin(2*Math.PI*c.x/8)));s.initialSmoke=s.smoke.reduce((a,b)=>a+b,0);
    s.heat=g.cells.map(c=>RHO*CP*g.volume*(2*Math.sin(2*Math.PI*c.z/4.32)));s.initialHeat=s.heat.reduce((a,b)=>a+b,0);
    const r=advance(g,s,.1,{dtMax:.1});
    const u=g.faces.find(f=>f.axis==='u'),v=g.faces.find(f=>f.axis==='v');
    assert(g.volume===.54&&u.area===.54&&v.area===1&&u.distance===1&&v.distance===.54,'metric units');
    assert(Math.abs(r.receipt.air[u.k]-.2*.54*.1)<1e-14&&Math.abs(r.receipt.air[v.k]-.1*.1)<1e-14,'directional receipt area');
    const massError=Math.abs(totals(g,r.state).smoke-s.initialSmoke),heatError=Math.abs(totals(g,r.state).heat-s.initialHeat);
    assert(massError<1e-10&&heatError<1e-5,'rectangular scalar balance');
    return {volume:g.volume,uArea:u.area,vArea:v.area,uReceipt:r.receipt.air[u.k],vReceipt:r.receipt.air[v.k],massError,heatError};
  });
  check('rectangular Taylor-Green same physical domain',()=>{
    const results=[],lx=8,lz=4.32,kx=2*Math.PI/lx,kz=2*Math.PI/lz,U=.4,nu=.01,time=.5,dt=.002;
    for(const n of [8,16,32]) {
      const g=geometry({nx:n,nz:n,hx:lx/n,hz:lz/n,depth:1,periodicX:true,periodicZ:true,
        viscosity:nu,buoyancy:false,tracerDiffusivity:0,thermalDiffusivity:0});
      const exact=(f,t)=>{
        const x=(f.x+(f.axis==='v'?.5:0))*g.metric.hx,z=(f.z+(f.axis==='u'?.5:0))*g.metric.hz;
        return (f.axis==='u'?U*Math.sin(kx*x)*Math.cos(kz*z):-U*kx/kz*Math.cos(kx*x)*Math.sin(kz*z))*Math.exp(-nu*(kx*kx+kz*kz)*t);
      };
      const s=initial(g);s.velocity=g.faces.map(f=>exact(f,0));
      const p=project(g,predict(g,s,dt)),pressure=[...g.workspace.phi].map(x=>RHO*x/dt),mean=pressure.reduce((a,b)=>a+b,0)/pressure.length;
      const pressureError=rms(g.cells.map(c=>pressure[c.i]-mean-RHO*U*U/4*(Math.cos(2*kx*c.x)+(kx/kz)**2*Math.cos(2*kz*c.z))));
      assert(p.iterations>0,'nonlinear pressure not exercised');
      const r=advance(g,s,time,{dtMax:dt});
      results.push({n,hx:g.metric.hx,hz:g.metric.hz,lx:n*g.metric.hx,lz:n*g.metric.hz,
        velocityRmsError:rms(g.faces.map(f=>r.state.velocity[f.k]-exact(f,time))),pressureRmsError:pressureError,
        divergence:r.maxDivergence,momentumCourant:r.maxMomentumCourant,steps:r.state.steps,iterations:g.workspace.iterations});
    }
    for(let i=1;i<results.length;i++) {
      assert(results[i].velocityRmsError<results[i-1].velocityRmsError*.8,'rectangular velocity refinement');
      assert(results[i].pressureRmsError<results[i-1].pressureRmsError,'rectangular pressure refinement');
    }
    return {domain:[lx,lz],results};
  });
  check('rectangular hydrostatic rest and exact metric restart',()=>{
    const cfg={nx:8,nz:8,hx:1,hz:.54,depth:1},g=geometry(cfg);
    const r=advance(g,initial(g,5),.5,{dtMax:.02});
    assert(max(r.state.velocity)<1e-9,'rectangular hydrostatic acceleration');
    const opts={dtMax:.02,forcingAt:()=>({sources:[{cell:9,heatJS:50,smokeKgS:1e-5}]})};
    const half=advance(g,initial(g),.2,opts),s=JSON.parse(JSON.stringify(half.state));
    const a=advance(g,half.state,.2,opts),b=advance(geometry(cfg),s,.2,opts);
    assert(JSON.stringify(a)===JSON.stringify(b),'metric restart differs');
    const failures=[];
    for(const [name,change] of [['hz',{hz:.55}],['hx',{hx:1.1}],['depth',{depth:2}]]) {
      let rejected=false;try{advance(geometry({...cfg,...change}),s,.1);}catch(error){rejected=true;failures.push({name,message:error.message});}
      assert(rejected,`metric ${name} mismatch accepted`);
    }
    let rejected=false;try{geometry({...cfg,dx:1});}catch{rejected=true;}assert(rejected,'conflicting square alias');
    return {restMaxVelocity:max(r.state.velocity),restDivergence:r.maxDivergence,exactRestart:true,failures};
  });
  check('summed advection viscosity adversarial bound',()=>{
    const cfg={nx:8,nz:8,dx:.125,periodicX:true,periodicZ:true,viscosity:.0625,
      thermalDiffusivity:0,tracerDiffusivity:0,buoyancy:false},g=geometry(cfg),s=initial(g);
    s.velocity=g.faces.map(f=>.5+(f.axis==='u'?1:-1)*.01*((f.x+f.z)%2?-1:1));
    const oldSeparateDt=Math.min(.20*.125/.51,.20*.125*.125/.0625);
    const actualInteriorRate=.51/.125+.5/.125+4*.0625/(.125*.125);
    const oldCombined=oldSeparateDt*actualInteriorRate;
    assert(oldCombined>1,'adversarial case does not expose old bound');
    const r=advance(g,s,.05,{dtMax:.05});
    assert(r.maxMomentumCourant<=.45000000001&&r.state.steps>=3,'summed bound not applied');
    const oldG=square.geometry(cfg),oldS=square.initial(oldG);oldS.velocity=[...s.velocity];
    const oldResult=square.advance(oldG,oldS,.05,{dtMax:.05});
    const initialAmplitude=max(s.velocity.map(v=>v-.5)),newAmplitude=max(r.state.velocity.map(v=>v-.5)),oldAmplitude=max(oldResult.state.velocity.map(v=>v-.5));
    assert(newAmplitude<initialAmplitude&&oldAmplitude>initialAmplitude,'adversarial amplitude amplification not exposed');
    const wall=geometry({...cfg,periodicZ:false});
    const ws=initial(wall),psi=(x,z)=>.04*Math.sin(2*Math.PI*x/8)*Math.sin(Math.PI*z/8);
    ws.velocity=wall.faces.map(f=>f.axis==='u'?(psi(f.x,f.z+1)-psi(f.x,f.z))/.125:-(psi(f.x+1,f.z)-psi(f.x,f.z))/.125);
    const at=(x,z)=>{x=(x+8)%8;const i=wall.vi[z*8+x];return i<0?0:ws.velocity[i];};
    let doubledRows=0,minimumBound=0;
    for(const f of wall.faces)if(f.axis==='u'&&f.z===0){
      const vertical=(at(f.x-1,0)+at(f.x,0)+at(f.x-1,1)+at(f.x,1))/4;
      if(vertical>0){doubledRows++;minimumBound=Math.max(minimumBound,Math.abs(ws.velocity[f.k])/.125+2*vertical/.125+5*.0625/(.125*.125));}
    }
    assert(doubledRows>0&&momentumRate(wall,ws.velocity)>=minimumBound,'tangential upwind ghost missing from bound');
    const wr=advance(wall,ws,.05,{dtMax:.05});
    const energy=a=>a.reduce((s,v)=>s+v*v,0);
    assert(wr.maxMomentumCourant<=.45000000001&&energy(wr.state.velocity)<energy(ws.velocity),'no-slip combined-rate dissipation');
    return {oldSeparateDt,oldCombined,newRate:momentumRate(g,s.velocity),newMaxCourant:r.maxMomentumCourant,
      initialAmplitude,newAmplitude,oldAmplitude,steps:r.state.steps,wallMaxCourant:wr.maxMomentumCourant,
      wallSteps:wr.state.steps,doubledRows,minimumWallBound:minimumBound};
  });
}finally {
  const result={sourceSha256:sha(readFileSync(new URL('solver.mjs',import.meta.url))),
    qualificationSha256:sha(readFileSync(new URL(import.meta.url))),
    squareOracleSha256:sha(readFileSync(new URL('square-checkpoint/solver.mjs',import.meta.url))),
    wallMs:performance.now()-start,rssBytes:process.memoryUsage().rss,rows};
  writeFileSync(new URL(process.argv[2]??'metric-qualification-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
