import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {geometry} from '../nd-checkpoint/geometry.mjs';
import {initial,advance,diagnostics,RHO,CP} from '../nd-checkpoint/solver.mjs';
import {H,W,A,NU,steady,startup,modalAlgebra} from './reference.mjs';
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const max=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0),sum=a=>a.reduce((s,x)=>s+x,0);
const rms=a=>Math.sqrt(sum(a.map(x=>x*x))/a.length);
const sha=b=>createHash('sha256').update(b).digest('hex');
const started=performance.now(),cpuStart=process.cpuUsage(),rows=[];
const budget=()=>require(performance.now()-started<30000,'30-second boundary qualification budget');
function check(name,fn){const t=performance.now();try{rows.push({name,status:'pass',...fn(),wallMs:performance.now()-t});}catch(error){rows.push({name,status:'fail',error:error.message,wallMs:performance.now()-t});throw error;}}
function duct({nx,ny,nz,length,height,width,periodic,viscosity}){
  const size=[nx,ny+2,nz+2],solid=[];
  for(let z=0;z<size[2];z++)for(let y=0;y<size[1];y++)for(let x=0;x<nx;x++)
    if(y===0||y===size[1]-1||z===0||z===size[2]-1)solid.push(x+nx*(y+size[1]*z));
  return geometry({size,spacing:[length/nx,height/ny,width/nz],origin:[0,-1,-1],solid,
    periodic:[periodic,false,false],open:periodic?[]:['x-','x+'],viscosity,
    thermalDiffusivity:0,tracerDiffusivity:0,buoyancy:false,domainId:'declared-boundary-qualification'});
}
function progress(g,state,time,options){
  let maxDivergence=0,maxCourant=0,maxMomentumCourant=0,rejected=0;
  const end=state.time+time;
  while(state.time<end){budget();const r=advance(g,state,Math.min(.1,end-state.time),options);state=r.state;
    maxDivergence=Math.max(maxDivergence,r.maxDivergence);maxCourant=Math.max(maxCourant,r.maxCourant);
    maxMomentumCourant=Math.max(maxMomentumCourant,r.maxMomentumCourant);rejected+=r.rejected;}
  return {state,maxDivergence,maxCourant,maxMomentumCourant,rejected};
}
try{
  check('independent reference PDE, walls, initial residual and truncation',()=>{
    const points=[[H/2,W/2],[.09,1/12],[.27,.25],[H-.09,W-1/12],[.37,.61]];
    const initialResiduals=[15,31,63,127].map(cutoff=>({cutoff,error:max(points.map(([y,z])=>startup(y,z,0,511,cutoff)))}));
    const truncationDifference=max(points.map(([y,z])=>startup(y,z,2,511,127)-startup(y,z,2,255,63)));
    const wallPoints=[[0,W/2],[H,W/2],[H/2,0],[H/2,W],[.27,0],[.27,W]];
    const wallResidual=max(wallPoints.map(([y,z])=>startup(y,z,2)));
    const modal=[1,3,7,15].flatMap(m=>[1,5,11].map(n=>({m,n,...modalAlgebra(m,n,.37)})));
    require(modal.every(x=>x.initial===0&&Math.abs(x.residual)<1e-14),'mode ODE or zero initial value');
    require(initialResiduals.at(-1).error<1e-6&&initialResiduals.at(-1).error<initialResiduals[0].error,'initial residual convergence');
    require(truncationDifference<1e-7&&wallResidual<1e-7,'reference truncation/wall residual');
    // Separate central differences on the continuum expression, not the gas stencil.
    const [y,z]=[.37,.61],h=1e-4,t=.7,dt=1e-5;
    const timeDerivative=(startup(y,z,t+dt)-startup(y,z,t-dt))/(2*dt);
    const laplacian=(startup(y+h,z,t)+startup(y-h,z,t)+startup(y,z+h,t)+startup(y,z-h,t)-4*startup(y,z,t))/(h*h);
    const numericalPdeResidual=timeDerivative-A-NU*laplacian;
    require(Math.abs(numericalPdeResidual)<1e-6,'independent continuum PDE residual');
    return {initialResiduals,truncationDifference,wallResidual,modalMaximumResidual:max(modal.map(x=>x.residual)),numericalPdeResidual,
      centerSteadySpeed:steady(H/2,W/2),centerStartupSpeed:startup(H/2,W/2,2)};
  });
  check('3D solid-wall rectangular startup Poiseuille refinement',()=>{
    const cases=[];
    for(const n of [4,8,12]){
      budget();const t=performance.now(),g=duct({nx:2,ny:n,nz:n,length:2,height:H,width:W,periodic:true,viscosity:NU});
      require(g.faces.every(f=>f.i>=0&&f.j>=0&&g.fluid[f.i]&&g.fluid[f.j]),'flow face crosses solid/exterior');
      const r=progress(g,initial(g),2,{dtMax:.005,forcingAt:()=>({acceleration:[A,0,0]})});
      const axial=g.faces.filter(f=>f.axis===0),expected=axial.map(f=>startup(f.center[1],f.center[2],2));
      const error=rms(axial.map((f,i)=>r.state.velocity[f.k]-expected[i])),relative=error/rms(expected);
      const transverse=max(g.faces.filter(f=>f.axis!==0).map(f=>r.state.velocity[f.k]));
      const wallRows=axial.filter(f=>[g.metric.spacing[1]/2,H-g.metric.spacing[1]/2].some(y=>Math.abs(f.center[1]-y)<1e-12)&&
        [g.metric.spacing[2]/2,W-g.metric.spacing[2]/2].some(z=>Math.abs(f.center[2]-z)<1e-12));
      require(wallRows.length===8,'actual solid corner rows');
      require(transverse<1e-9&&r.maxDivergence<1e-8&&r.maxMomentumCourant<=.45000000001,'duct balance/stability');
      require(r.state.smoke.every(x=>x===0)&&r.state.heat.every(x=>x===0),'unforced scalar stock');
      cases.push({crossSection:[n,n],fluidDimensions:[2,H,W],spacing:g.metric.spacing,fluidCells:g.fluid.reduce((n,x)=>n+x,0),
        allCells:g.n,faces:g.faces.length,velocityRmsError:error,relativeRmsError:relative,maxTransverseSpeed:transverse,
        cornerRows:wallRows.length,maxDivergence:r.maxDivergence,maxMomentumCourant:r.maxMomentumCourant,
        steps:r.state.steps,rejected:r.rejected,wallMs:performance.now()-t,...diagnostics(g)});
    }
    for(let i=1;i<cases.length;i++)require(cases[i].velocityRmsError<cases[i-1].velocityRmsError*.8,'duct spatial convergence');
    require(cases.at(-1).relativeRmsError<.05,'finest duct relative error');
    return {cases};
  });
  check('finite open straight duct volume and scalar transport refinement',()=>{
    const cases=[],speed=.5,time=3,height=1.08,width=1,density=.001,thermalDensity=RHO*CP*5;
    for(const nx of [8,16,32]){
      budget();const t=performance.now(),g=duct({nx,ny:2,nz:2,length:4,height,width,periodic:false,viscosity:0}),s=initial(g);
      s.velocity=g.faces.map(f=>f.axis===0?speed:0);
      s.smoke=g.cells.map(c=>c.fluid&&c.center[0]>=2&&c.center[0]<3?density*g.volume:0);
      s.heat=s.smoke.map(m=>m/density*thermalDensity);s.initialSmoke=sum(s.smoke);s.initialHeat=sum(s.heat);
      require(g.faces.every(f=>(f.i<0||g.fluid[f.i])&&(f.j<0||g.fluid[f.j])&&(!f.boundary||['x-','x+'].includes(f.boundary))),'closed wall flow');
      const inletArea=sum(g.faces.filter(f=>f.boundary==='x-').map(f=>f.area)),outletArea=sum(g.faces.filter(f=>f.boundary==='x+').map(f=>f.area));
      require(Math.abs(inletArea-height*width)<1e-13&&inletArea===outletArea,'finite open area');
      const r=progress(g,s,time,{dtMax:.025});
      const expectedAir=speed*height*width*time,airError=Math.max(Math.abs(r.state.airImport-expectedAir),Math.abs(r.state.airExport-expectedAir));
      const expectedSmoke=s.initialSmoke/2,expectedHeat=s.initialHeat/2;
      const massError=Math.abs(sum(r.state.smoke)+r.state.smokeBoundary-s.initialSmoke),heatError=Math.abs(sum(r.state.heat)+r.state.heatBoundary-s.initialHeat);
      const exportError=Math.abs(r.state.smokeBoundary-expectedSmoke),heatExportError=Math.abs(r.state.heatBoundary-expectedHeat);
      const expectedCell=g.cells.map(c=>{if(!c.fluid)return 0;const x=c.at[0]*g.metric.spacing[0],overlap=Math.max(0,Math.min(x+g.metric.spacing[0],4.5)-Math.max(x,3.5));
        return density*overlap*g.metric.spacing[1]*g.metric.spacing[2];});
      const l1Error=sum(r.state.smoke.map((m,i)=>Math.abs(m-expectedCell[i])))/s.initialSmoke;
      const speedError=max(r.state.velocity.map((v,i)=>v-s.velocity[i]));
      require(airError<1e-9&&massError<1e-10&&heatError<1e-5&&speedError<1e-9&&r.maxDivergence<1e-8,'open flow/ledger');
      require(r.state.smoke.every((m,i)=>g.fluid[i]||m===0)&&r.state.heat.every((h,i)=>g.fluid[i]||h===0),'scalar leaked to solid');
      cases.push({nx,fluidDimensions:[4,height,width],spacing:g.metric.spacing,inletArea,outletArea,expectedAir,airImport:r.state.airImport,airExport:r.state.airExport,
        airError,initialSmoke:s.initialSmoke,expectedSmokeExport:expectedSmoke,actualSmokeExport:r.state.smokeBoundary,smokeExportError:exportError,
        expectedHeatExport:expectedHeat,actualHeatExport:r.state.heatBoundary,heatExportError,l1RelativeFieldError:l1Error,
        massError,heatError,speedError,maxDivergence:r.maxDivergence,maxCourant:r.maxCourant,steps:r.state.steps,
        wallMs:performance.now()-t,...diagnostics(g)});
    }
    for(let i=1;i<cases.length;i++)require(cases[i].l1RelativeFieldError<cases[i-1].l1RelativeFieldError&&cases[i].smokeExportError<cases[i-1].smokeExportError,'open scalar refinement');
    return {cases};
  });
}finally{
  const pins=['../nd-checkpoint/geometry.mjs','../nd-checkpoint/solver.mjs','reference.mjs','CONTRACT.md','qualify.mjs'].map(path=>({path,sha256:sha(readFileSync(new URL(path,import.meta.url)))}));
  const cpu=process.cpuUsage(cpuStart),result={pins,wallMs:performance.now()-started,cpuMs:(cpu.user+cpu.system)/1000,rssBytes:process.memoryUsage().rss,rows};
  writeFileSync(new URL(process.argv[2]??'qualification-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
