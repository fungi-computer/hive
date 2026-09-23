import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{geometry}from'./geometry.mjs';
import * as candidate from'./solver.mjs';
import * as baseline from'../nd-checkpoint/solver.mjs';
import{transportDiagnostics}from'./transport.mjs';
const{RHO,CP,TREF}=candidate;
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const sum=a=>a.reduce((s,x)=>s+x,0),max=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const rms=a=>Math.sqrt(sum(a.map(v=>v*v))/a.length);
const sha=b=>createHash('sha256').update(b).digest('hex');
const started=performance.now(),cpuStart=process.cpuUsage(),rows=[];
const budget=()=>require(performance.now()-started<30000,'30-second scalar qualification budget');
function check(name,fn){budget();const t=performance.now();try{rows.push({name,status:'pass',...fn(),wallMs:performance.now()-t});}catch(error){rows.push({name,status:'fail',error:error.message,wallMs:performance.now()-t});throw error;}}
const temperature=(g,s)=>s.heat.filter((_,i)=>g.fluid[i]).map(h=>TREF+h/(RHO*CP*g.volume));
function seed(g,s,smoke,theta){s.smoke=g.cells.map(c=>c.fluid?smoke(c)*g.volume:0);s.heat=g.cells.map(c=>c.fluid?theta(c)*RHO*CP*g.volume:0);
  s.initialSmoke=sum(s.smoke);s.initialHeat=sum(s.heat);return s;}
function pipe(nx){const size=[nx,4,4],solid=[];for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<nx;x++)if(y===0||y===3||z===0||z===3)solid.push(x+nx*(y+4*z));
  return geometry({size,spacing:[4/nx,.54,.5],origin:[0,-1,-1],solid,open:['x-','x+'],viscosity:0,thermalDiffusivity:0,tracerDiffusivity:0,buoyancy:false});}
function slab(method,nx){const wall=performance.now(),cpu=process.cpuUsage(),g=pipe(nx),s=seed(g,method.initial(g),c=>c.center[0]>=2&&c.center[0]<3?.001:0,c=>c.center[0]>=2&&c.center[0]<3?5:0);
  s.velocity=g.faces.map(f=>f.axis===0?.5:0);const r=method.advance(g,s,3,{dtMax:.025});
  const expected=g.cells.map(c=>{if(!c.fluid)return 0;const x=c.at[0]*g.metric.spacing[0],overlap=Math.max(0,Math.min(x+g.metric.spacing[0],4.5)-Math.max(x,3.5));return .001*overlap*.54*.5;});
  const l1=sum(r.state.smoke.map((m,i)=>Math.abs(m-expected[i])))/s.initialSmoke;
  const massError=Math.abs(sum(r.state.smoke)+r.state.smokeBoundary-s.initialSmoke),heatError=Math.abs(sum(r.state.heat)+r.state.heatBoundary-s.initialHeat);
  require(massError<1e-10&&heatError<1e-5&&Math.abs(r.state.airImport-1.62)<1e-9&&Math.abs(r.state.airExport-1.62)<1e-9,'open slab ledgers');
  require(Math.min(...r.state.smoke)>=0&&Math.min(...temperature(g,r.state))>0,'open slab positivity');
  const work=method.diagnostics(g),used=process.cpuUsage(cpu);
  return{nx,l1RelativeFieldError:l1,smokeExportError:Math.abs(r.state.smokeBoundary-s.initialSmoke/2),massError,heatError,
    cpuMs:(used.user+used.system)/1000,wallMs:performance.now()-wall,steps:r.state.steps,rejected:r.rejected,faces:g.faces.length,
    scalarFaceEvaluations:work.scalarFaceEvaluations??r.state.steps*g.faces.length,...work};
}
try{
  check('admission and rejection preserve caller state including second Euler stage',()=>{
    const g=geometry({size:[4,2,2],spacing:[1,.54,1],periodic:[true,true,true],viscosity:0,thermalDiffusivity:0,tracerDiffusivity:0,buoyancy:false});
    const s=seed(g,candidate.initial(g),c=>c.i%3===0?0:1e-20,()=>-TREF+1),before=JSON.stringify(s),cell=0,absoluteEnergy=RHO*CP*g.volume;
    const v=g.faces.map(()=>0),prior=transportDiagnostics(g);
    const rejected=candidate.transport(g,s,v,1,{sources:[{cell,heatJS:-.4*absoluteEnergy}]});
    const after=transportDiagnostics(g);require(rejected===null&&JSON.stringify(s)===before,'second-stage cooling rejection mutated state');
    require(after.scalarEulerStages-prior.scalarEulerStages===1&&after.scalarRejectedStages-prior.scalarRejectedStages===1,'expected first-pass second-stage rejection');
    const moving=g.faces.map(f=>f.axis===0?1:0);
    require(candidate.transport(g,s,moving,.3)===null&&JSON.stringify(s)===before,'rate rejection mutation');
    const accepted=candidate.transport(g,s,moving,.1);require(accepted&&Math.min(...accepted.state.smoke)>=0&&Math.min(...temperature(g,accepted.state))>0,'positive accepted Euler combination');
    const invalid=JSON.parse(before);invalid.heat[0]=-RHO*CP*g.volume*TREF;invalid.initialHeat=sum(invalid.heat);
    let invalidRejected=false;try{candidate.advance(g,invalid,0);}catch(error){invalidRejected=true;}require(invalidRejected,'absolute-zero restore admitted');
    let oldRejected=false;try{candidate.advance(g,baseline.initial(g),0);}catch(error){oldRejected=true;}require(oldRejected,'baseline method state silently restored');
    return{secondStageRejected:true,stateTimeLedgerUnchanged:true,rateRejected:true,minAcceptedSmoke:Math.min(...accepted.state.smoke),
      minAcceptedKelvin:Math.min(...temperature(g,accepted.state)),invalidTemperatureRejected:invalidRejected,baselineMethodRejected:oldRejected};
  });
  check('smooth periodic scalar advection spatial accuracy',()=>{
    const cases=[];for(const nx of[16,32,64]){budget();const h=4/nx,k=Math.PI/2,sinc=Math.sin(k*h/2)/(k*h/2);
      const g=geometry({size:[nx,2,2],spacing:[h,.54,1],periodic:[true,true,true],viscosity:0,thermalDiffusivity:0,tracerDiffusivity:0,buoyancy:false});
      const s=seed(g,candidate.initial(g),c=>1+.2*sinc*Math.sin(k*c.center[0]),c=>-10+5*sinc*Math.sin(k*c.center[0]));s.velocity=g.faces.map(f=>f.axis===0?1:0);
      const r=candidate.advance(g,s,.4,{dtMax:.1*h});
      const errors=g.cells.map(c=>r.state.smoke[c.i]/g.volume-(1+.2*sinc*Math.sin(k*(c.center[0]-.4))));
      const heatErrors=g.cells.map(c=>r.state.heat[c.i]/(RHO*CP*g.volume)-(-10+5*sinc*Math.sin(k*(c.center[0]-.4))));
      require(Math.abs(sum(r.state.smoke)-s.initialSmoke)<1e-10&&Math.abs(sum(r.state.heat)-s.initialHeat)<1e-5,'periodic ledgers');
      cases.push({nx,dtMax:.1*h,smokeRms:rms(errors),temperatureRms:rms(heatErrors),steps:r.state.steps,maxStageCoefficient:r.maxCourant});}
    for(let i=1;i<cases.length;i++)require(cases[i].smokeRms<.5*cases[i-1].smokeRms,'smooth scalar convergence');
    return{cases};
  });
  check('SSPRK2 time accuracy against exact semidiscrete diffusion eigenmode',()=>{
    const nx=8,h=.5,k=Math.PI/2,D=.1,lambda=-4*D/(h*h)*Math.sin(k*h/2)**2,time=1,cases=[];
    for(const dt of[.1,.05,.025]){budget();const g=geometry({size:[nx,2,2],spacing:[h,1,1],periodic:[true,true,true],viscosity:0,thermalDiffusivity:D,tracerDiffusivity:D,buoyancy:false});
      const s=seed(g,candidate.initial(g),c=>1+.2*Math.sin(k*c.center[0]),c=>-20+10*Math.sin(k*c.center[0]));
      const r=candidate.advance(g,s,time,{dtMax:dt}),expected=c=>1+.2*Math.sin(k*c.center[0])*Math.exp(lambda*time);
      const error=rms(g.cells.map(c=>r.state.smoke[c.i]/g.volume-expected(c)));cases.push({dt,error,steps:r.state.steps});}
    for(let i=1;i<cases.length;i++)require(cases[i].error<.27*cases[i-1].error,'second-order time convergence');
    return{discreteEigenvalue:lambda,cases};
  });
  check('obstruction, signed heat, sources and exact restart',()=>{
    const size=[6,4,4],solid=[];for(let z=0;z<4;z++)for(let y=0;y<4;y++)if(y!==1||z!==1)solid.push(3+6*(y+4*z));
    const cfg={size,spacing:[1,.54,1],solid,viscosity:0,thermalDiffusivity:.02,tracerDiffusivity:.02,buoyancy:false,domainId:'scalar-obstruction'};
    const g=geometry(cfg),s=seed(g,candidate.initial(g),c=>c.i%5===0?0:.001*(1+.5*Math.sin(c.i)),c=>c.i%2===0?-200:20);
    s.velocity=Array.from(candidate.project(g,g.faces.map(f=>.05*Math.sin(f.k))).velocity);
    require(g.faces.every(f=>f.i>=0&&f.j>=0&&g.fluid[f.i]&&g.fluid[f.j]),'obstacle face identity');
    const opts={dtMax:.01,forcingAt:()=>({sources:[{cell:0,smokeKgS:1e-5,heatJS:-100}]})};
    const half=candidate.advance(g,s,.1,opts),a=candidate.advance(g,half.state,.1,opts),b=candidate.advance(geometry(cfg),JSON.parse(JSON.stringify(half.state)),.1,opts);
    require(JSON.stringify(a)===JSON.stringify(b),'exact method/cache restart');
    const massError=Math.abs(sum(a.state.smoke)-a.state.smokeSource-s.initialSmoke),heatError=Math.abs(sum(a.state.heat)-a.state.heatSource-s.initialHeat);
    require(massError<1e-10&&heatError<1e-5&&a.state.smoke.every((m,i)=>m>=0&&(g.fluid[i]||m===0)),'obstacle conservation/positivity');
    require(Math.min(...temperature(g,a.state))>0&&a.maxDivergence<1e-8,'obstacle heat/divergence');
    return{massError,heatError,minKelvin:Math.min(...temperature(g,a.state)),maxKelvin:Math.max(...temperature(g,a.state)),
      exactRestart:true,smokeAdded:a.state.smokeSource,heatAdded:a.state.heatSource,maxDivergence:a.maxDivergence,...candidate.diagnostics(g)};
  });
  check('cold ambient inflow and negative thermal anomaly next to a wall',()=>{
    const base=pipe(8),g=geometry({size:base.size,spacing:base.metric.spacing,origin:base.origin,solid:base.solid,open:['x-','x+'],
      viscosity:0,thermalDiffusivity:.02,tracerDiffusivity:0,buoyancy:false});
    const s=seed(g,candidate.initial(g),()=>.001,c=>c.at[1]===1&&c.at[0]===6?-100:20);s.velocity=g.faces.map(f=>f.axis===0?.5:0);
    const r=candidate.advance(g,s,.2,{dtMax:.01}),temps=temperature(g,r.state);
    const massError=Math.abs(sum(r.state.smoke)+r.state.smokeBoundary-s.initialSmoke),heatError=Math.abs(sum(r.state.heat)+r.state.heatBoundary-s.initialHeat);
    require(Math.min(...temps)>=TREF-100-1e-9&&Math.max(...temps)<=TREF+20+1e-9,'cold/warm thermal bounds');
    require(massError<1e-10&&heatError<1e-5&&r.state.airImport>0,'cold inflow receipts');
    require(g.cells.some(c=>c.fluid&&r.state.heat[c.i]<0),'negative anomaly lost');
    return{ambientKelvin:TREF,minKelvin:Math.min(...temps),maxKelvin:Math.max(...temps),airImported:r.state.airImport,heatBoundary:r.state.heatBoundary,massError,heatError};
  });
  check('sharp-front accuracy and total CPU/work at the same field-error target',()=>{
    // Warm both implementations on a declared small case before measured runs.
    slab(baseline,8);slab(candidate,8);const cases=[];
    for(const nx of[8,16,32])for(const [name,method]of[['baseline',baseline],['candidate',candidate]]){budget();cases.push({method:name,...slab(method,nx)});}
    const target=.32,matched=['baseline','candidate'].map(method=>{const choices=cases.filter(r=>r.method===method&&r.l1RelativeFieldError<=target);require(choices.length>0,method+' did not reach equal-error target');return choices.sort((a,b)=>a.nx-b.nx)[0];});
    const sameGrid=cases.filter(r=>r.nx===32);require(sameGrid[1].l1RelativeFieldError<sameGrid[0].l1RelativeFieldError*.7,'sharp-front accuracy improvement');
    return{target,matched,cases};
  });
}finally{
  const paths=['geometry.mjs','solver.mjs','transport.mjs','physics.mjs','qualify.mjs','CONTRACT.md','../nd-checkpoint/solver.mjs'];
  const pins=paths.map(path=>({path,sha256:sha(readFileSync(new URL(path,import.meta.url)))}));const cpu=process.cpuUsage(cpuStart);
  const result={pins,wallMs:performance.now()-started,cpuMs:(cpu.user+cpu.system)/1000,rssBytes:process.memoryUsage().rss,rows};
  writeFileSync(new URL(process.argv[2]??'qualification-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
