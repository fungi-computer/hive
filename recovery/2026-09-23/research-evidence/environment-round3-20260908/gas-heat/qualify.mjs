import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { geometry, initial, project, predict, advance, transport, totals, RHO, CP } from './solver.mjs';
const require = (x, msg) => { if (!x) throw new Error(msg); };
const max = a => Math.max(...a.map(Math.abs));
const rms = a => Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const sha = text => createHash('sha256').update(text).digest('hex');
const rows = [], start = performance.now();
function check(name, fn) {
  const t = performance.now();
  try { const result = fn(); rows.push({ name, status: 'pass', wallMs: performance.now()-t, ...result }); }
  catch(error) { rows.push({ name, status: 'fail', wallMs: performance.now()-t, error: error.message }); throw error; }
}
const output = process.argv[2] ?? new URL('qualification-v1.json', import.meta.url);
try {
  check('ambient rest, immutable input', () => {
    const g = geometry({ nx: 12, nz: 16, dx: .25 }), s = initial(g), pin = JSON.stringify(s);
    const r = advance(g,s,1);
    require(max(r.state.velocity)===0 && max(r.state.smoke)===0 && max(r.state.heat)===0,'rest changed');
    require(JSON.stringify(s)===pin,'input mutated');
    return { ...totals(g,r.state), pressureSolves:g.workspace.pressureSolves, iterations:g.workspace.iterations };
  });
  check('closed uniform warm hydrostatic rest', () => {
    const g = geometry({ nx:12,nz:16,dx:.25 }), s=initial(g,5);
    const r=advance(g,s,.5);
    require(max(r.state.velocity)<1e-9,'hydrostatic rest accelerated');
    return { ...totals(g,r.state), iterations:g.workspace.iterations };
  });
  check('projection removes known discrete gradient', () => {
    const g=geometry({nx:16,nz:12,dx:.25,buoyancy:false});
    const potential=g.cells.map(c=>Math.sin(.71*c.x)*Math.cos(1.2*c.z));
    const velocity=g.faces.map(f=>(potential[f.j]-potential[f.i])/f.distance);
    const p=project(g,velocity);
    require(max([...p.velocity])<1e-9,'gradient remains');
    return { divergence:p.divergence, remainingVelocity:max([...p.velocity]),iterations:p.iterations };
  });
  check('random field projection, energy and idempotence', () => {
    const g=geometry({nx:16,nz:16,dx:.25,buoyancy:false});
    const v=g.faces.map(f=>Math.sin(f.k*12.9898)*.2);
    const energy=a=>a.reduce((s,x)=>s+x*x,0);
    const p=project(g,v), velocity=[...p.velocity], after=energy(velocity), iterations=p.iterations;
    const again=project(g,velocity);
    const err=max(velocity.map((x,i)=>x-again.velocity[i]));
    require(after<=energy(v)+1e-10 && err<1e-9,'projection energy/idempotence');
    return { before:energy(v),after,divergence:again.divergence,idempotenceError:err,iterations };
  });
  check('viscous periodic shear, exact decay/refinement', () => {
    const results=[];
    for(const n of [8,16]) {
      const g=geometry({nx:n,nz:n,dx:1/n,periodicX:true,periodicZ:true,viscosity:.05,
        buoyancy:false,tracerDiffusivity:0,thermalDiffusivity:0});
      const s=initial(g);s.velocity=g.faces.map(f=>f.axis==='u'?Math.sin(2*Math.PI*(f.z+.5)/n):0);
      const r=advance(g,s,.25,{dtMax:.001});
      const errors=g.faces.map(f=>r.state.velocity[f.k]-(f.axis==='u'?Math.sin(2*Math.PI*(f.z+.5)/n)*Math.exp(-.05*4*Math.PI*Math.PI*.25):0));
      results.push({n,rmsError:rms(errors),maxError:max(errors),steps:r.state.steps,iterations:g.workspace.iterations});
    }
    require(results[1].rmsError<results[0].rmsError*.35,'shear refinement');
    return {results};
  });
  check('Taylor-Green 2D nonlinear momentum and pressure', () => {
    const results=[];
    for(const n of [8,16,32]) {
      const g=geometry({nx:n,nz:n,dx:2*Math.PI/n,periodicX:true,periodicZ:true,
        viscosity:.01,buoyancy:false,tracerDiffusivity:0,thermalDiffusivity:0});
      const s=initial(g),exact=(f,t)=>f.axis==='u'?
        Math.sin(f.x*g.dx)*Math.cos((f.z+.5)*g.dx)*Math.exp(-.02*t):
        -Math.cos((f.x+.5)*g.dx)*Math.sin(f.z*g.dx)*Math.exp(-.02*t);
      s.velocity=g.faces.map(f=>exact(f,0));
      const p=project(g,predict(g,s,.005)),pressure=[...g.workspace.phi].map(v=>RHO*v/.005);
      const expected=g.cells.map(c=>RHO*(Math.cos(2*c.x)+Math.cos(2*c.z))/4);
      const mean=pressure.reduce((a,b)=>a+b,0)/pressure.length;
      const pressureError=rms(pressure.map((p,i)=>p-mean-expected[i]));
      require(p.iterations>0,'nonlinear pressure was not exercised');
      const r=advance(g,s,.25,{dtMax:.005});
      const velocityError=rms(g.faces.map(f=>r.state.velocity[f.k]-exact(f,.25)));
      results.push({n,velocityRmsError:velocityError,pressureRmsError:pressureError,iterations:g.workspace.iterations,divergence:r.maxDivergence});
    }
    require(results[1].velocityRmsError<results[0].velocityRmsError*.8&&results[2].velocityRmsError<results[1].velocityRmsError*.8,'nonlinear momentum refinement');
    require(results[1].pressureRmsError<results[0].pressureRmsError&&results[2].pressureRmsError<results[1].pressureRmsError,'pressure refinement');
    return {results};
  });
  check('no-slip wall shear decay and refinement', () => {
    const results=[];
    for(const n of [8,16]) {
      const g=geometry({nx:4,nz:n,dx:1/n,periodicX:true,viscosity:.05,buoyancy:false});
      const s=initial(g);s.velocity=g.faces.map(f=>f.axis==='u'?Math.sin(Math.PI*(f.z+.5)/n):0);
      const r=advance(g,s,.25,{dtMax:.001});
      const error=rms(g.faces.filter(f=>f.axis==='u').map(f=>r.state.velocity[f.k]-Math.sin(Math.PI*(f.z+.5)/n)*Math.exp(-.05*Math.PI*Math.PI*.25)));
      results.push({n,rmsError:error});
    }
    require(results[1].rmsError<results[0].rmsError*.4,'no-slip refinement');return {results};
  });
  check('thin floor seals scalar transport and separates momentum', () => {
    const walls=Array.from({length:8},(_,x)=>`v:${x}:8`);
    const g=geometry({nx:8,nz:16,dx:.125,periodicX:true,walls,viscosity:.05,buoyancy:false,thermalDiffusivity:.1,tracerDiffusivity:.1});
    const s=initial(g);s.smoke=g.cells.map(c=>c.z<1?g.volume:0);s.initialSmoke=s.smoke.reduce((a,b)=>a+b,0);
    s.heat=g.cells.map(c=>(c.z<1?5:-5)*RHO*CP*g.volume);s.initialHeat=s.heat.reduce((a,b)=>a+b,0);
    s.velocity=g.faces.map(f=>f.axis==='u'?(f.z<8?1:-1)*Math.sin(Math.PI*((f.z%8)+.5)/8):0);
    const r=advance(g,s,.1,{dtMax:.001});
    const upperSmoke=g.cells.filter(c=>c.z>=1).reduce((a,c)=>a+r.state.smoke[c.i],0);
    const maxHeatChange=max(s.heat.map((h,i)=>h-r.state.heat[i]));
    const momentumError=rms(g.faces.filter(f=>f.axis==='u').map(f=>r.state.velocity[f.k]-s.velocity[f.k]*Math.exp(-.05*Math.PI*Math.PI*.1)));
    require(upperSmoke===0&&maxHeatChange<1e-8&&momentumError<.002,'thin floor leakage/ghost');
    return {upperSmoke,maxHeatChange,momentumRmsError:momentumError};
  });
  check('conservative scalar translation, exact solution/refinement', () => {
    const results=[];
    for(const n of [8,16,32]) {
      const g=geometry({nx:n,nz:4,dx:1/n,periodicX:true,periodicZ:true,viscosity:0,
        buoyancy:false,tracerDiffusivity:0,thermalDiffusivity:0});
      let s=initial(g);s.velocity=g.faces.map(f=>f.axis==='u'?.4:0);
      s.smoke=g.cells.map(c=>g.volume*(1+.5*Math.sin(2*Math.PI*c.x)));
      s.heat=g.cells.map(c=>RHO*CP*g.volume*5*Math.sin(2*Math.PI*c.x));
      s.initialSmoke=s.smoke.reduce((a,b)=>a+b,0);s.initialHeat=s.heat.reduce((a,b)=>a+b,0);
      const before=totals(g,s), dt=.005, steps=100;
      for(let i=0;i<steps;i++) s=transport(g,s,s.velocity,dt).state;
      const exact=g.cells.map(c=>1+.5*Math.sin(2*Math.PI*(c.x-.4*.5)));
      const error=rms(s.smoke.map((m,i)=>m/g.volume-exact[i]));
      const balance=Math.abs(totals(g,s).smoke-before.smoke);
      const heatBalance=Math.abs(totals(g,s).heat-before.heat);
      require(balance<1e-10&&heatBalance<1e-5,'transport balance');
      require(Math.min(...s.smoke)>=0 && totals(g,s).maxTheta<=5+1e-10 && totals(g,s).minTheta>=-5-1e-10,'bounds');
      results.push({n,rmsConcentrationError:error,massError:balance,heatError:heatBalance});
    }
    require(results[1].rmsConcentrationError<results[0].rmsConcentrationError&&results[2].rmsConcentrationError<results[1].rmsConcentrationError,'transport refinement');
    return {results};
  });
  check('restart reconstructs cache and preserves velocity history', () => {
    const cfg={nx:8,nz:12,dx:.25,viscosity:.005},g=geometry(cfg),s=initial(g);
    const opts={dtMax:.02,forcingAt:t=>({sources:t<.2?[{cell:9,smokeKgS:1e-5,heatJS:100}]:[]}),events:[.2]};
    const half=advance(g,s,.2,opts), resumed=JSON.parse(JSON.stringify(half.state));
    const a=advance(g,half.state,.2,opts),g2=geometry(cfg),b=advance(g2,resumed,.2,opts);
    require(JSON.stringify(a)===JSON.stringify(b),'restart mismatch');
    const erased={...resumed,velocity:resumed.velocity.map(()=>0)},c=advance(geometry(cfg),erased,.2,opts);
    const historyDifference=max(c.state.velocity.map((x,i)=>x-b.state.velocity[i]));
    require(historyDifference>1e-5,'velocity history is not demonstrated');
    return {exactStateAndReceipts:true,historyDifference,operatorBuilds:g2.workspace.operatorBuilds,stateHash:sha(JSON.stringify(a.state))};
  });
  check('state admission rejects geometry/shape/nonfinite corruption', () => {
    const cfg={nx:8,nz:8,dx:.5,revision:3},g=geometry(cfg),s=initial(g),rejected=[];
    const cases=[
      ['same revision different wall',geometry({...cfg,walls:['u:3:3']}),s,.1,{}],
      ['same revision different units',geometry({...cfg,dx:.25}),s,.1,{}],
      ['same revision different viscosity',geometry({...cfg,viscosity:.002}),s,.1,{}],
      ['short velocity',g,{...s,velocity:s.velocity.slice(1)},.1,{}],
      ['NaN velocity',g,{...s,velocity:s.velocity.map((x,i)=>i===0?NaN:x)},.1,{}],
      ['Infinity interval',g,s,Infinity,{}],['NaN timestep',g,s,.1,{dtMax:NaN}],
      ['Infinity source',g,s,.1,{forcingAt:()=>({sources:[{cell:0,heatJS:Infinity}]})}],
      ['NaN forcing',g,s,.1,{forcingAt:()=>({accelerationZ:NaN})}],
      ['forged tracer ledger',g,{...s,smoke:s.smoke.map((x,i)=>i===0?1:x)},.1,{}]
    ];
    for(const [name,geom,state,dt,opts] of cases) {
      try{advance(geom,state,dt,opts);}catch(error){rejected.push({name,reason:error.message});continue;}
      throw new Error(`admitted ${name}`);
    }
    return {rejected};
  });
  check('warm open boundary resolves balanced counterflow', () => {
    const g=geometry({nx:8,nz:16,dx:.25,open:['left'],viscosity:.005}),s=initial(g,5);
    const r=advance(g,s,.5,{dtMax:.02});
    const boundary=g.faces.filter(f=>f.boundary==='left');
    const flows=boundary.map(f=>-r.state.velocity[f.k]*f.area);
    const inward=flows.reduce((s,q)=>s+Math.max(-q,0),0),outward=flows.reduce((s,q)=>s+Math.max(q,0),0);
    require(inward>1e-4&&outward>1e-4&&Math.abs(inward-outward)<1e-8,'counterflow balance');
    return {inward,outward,carrierMismatch:Math.abs(inward-outward),divergence:r.maxDivergence};
  });
} finally {
  const result={sourceSha256:sha(readFileSync(new URL('solver.mjs',import.meta.url))),
    qualificationSha256:sha(readFileSync(new URL(import.meta.url))),
    wallMs:performance.now()-start,rssBytes:process.memoryUsage().rss,rows};
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
