import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {geometry} from './geometry.mjs';
import {initial,advance,project,predict,transport,divergence,diagnostics,RHO,CP} from './solver.mjs';
import * as old from '../binding-checkpoint/solver.mjs';
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const max=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const sum=a=>a.reduce((s,x)=>s+x,0);
const sha=s=>createHash('sha256').update(s).digest('hex');
const start=performance.now(),rows=[];
function check(name,fn){const t=performance.now();try{rows.push({name,status:'pass',...fn(),wallMs:performance.now()-t});}catch(error){rows.push({name,status:'fail',error:error.message,wallMs:performance.now()-t});throw error;}}
const seedField=(g,s)=>{
  s.smoke=g.cells.map(c=>c.fluid?g.volume*(1+.2*Math.sin(c.center[0])*Math.cos(c.center[2])):0);
  s.heat=g.cells.map(c=>c.fluid?RHO*CP*g.volume*2*Math.sin(c.center[1])*Math.cos(c.center[2]):0);
  s.initialSmoke=sum(s.smoke);s.initialHeat=sum(s.heat);return s;
};
try{
  check('shared 2D operator and transport retain qualified numerical consumer',()=>{
    const g=geometry({size:[8,12],spacing:[.5,.5],extrusion:2}),prior=old.geometry({nx:8,nz:12,dx:.5,depth:2});
    const opts={dtMax:.005,forcingAt:()=>({sources:[{cell:9,heatJS:10,smokeKgS:1e-5}]})};
    const a=advance(g,initial(g,3),.1,opts),b=old.advance(prior,old.initial(prior,3),.1,opts);
    const velocityError=max(a.state.velocity.map((v,i)=>v-b.state.velocity[i])),heatError=max(a.state.heat.map((h,i)=>h-b.state.heat[i]));
    const smokeError=max(a.state.smoke.map((m,i)=>m-b.state.smoke[i])),receiptError=max(a.receipt.air.map((q,i)=>q-b.receipt.air[i]));
    require(velocityError<1e-9&&heatError<1e-5&&smokeError<1e-10&&receiptError<1e-9,'shared 2D numerical mismatch');
    return {dimensions:g.dimensions,velocityError,heatError,smokeError,receiptError};
  });
  check('3D voxel metrics, global identity and independent inputs',()=>{
    const cfg={size:[4,5,6],spacing:[1,.54,1],origin:[-8,-5,-11],solid:[2,17],open:['x+']},g=geometry(cfg),identity=g.identity;
    require(g.volume===.54&&g.faces.filter(f=>f.axis===0).every(f=>f.area===.54)&&g.faces.filter(f=>f.axis===1).every(f=>f.area===1)&&g.faces.filter(f=>f.axis===2).every(f=>f.area===.54),'3D volumes/areas');
    require(new Set(g.faces.map(f=>f.id)).size===g.faces.length,'unique global faces');
    require(JSON.stringify(g.cells[0].world)==='[-8,-5,-11]'&&Math.abs(g.cells[0].center[1]+2.43)<1e-12,'negative world origin');
    const before=JSON.stringify(g.cells);cfg.size[0]=99;cfg.spacing[1]=2;cfg.origin[0]=40;cfg.solid.splice(0);cfg.open.push('y+');
    require(g.identity===identity&&JSON.stringify(g.cells)===before&&g.size[0]===4&&g.metric.spacing[1]===.54&&g.solid.length===2,'caller aliases geometry');
    let rejected=false;try{geometry({size:[4,4,4],spacing:[1,.54,1],origin:[Number.MAX_SAFE_INTEGER-2,0,0]});}catch(error){rejected=error.message.includes('extent');}
    require(rejected,'unsafe global face extent');
    return {cells:g.n,faces:g.faces.length,volume:g.volume,firstCenter:g.cells[0].center,independentInputs:true,unsafeExtentRejected:true};
  });
  check('3D ambient and warm hydrostatic rest use world y',()=>{
    const g=geometry({size:[6,8,5],spacing:[1,.54,1]});
    const ambient=advance(g,initial(g),.1,{dtMax:.02});require(max(ambient.state.velocity)===0,'ambient motion');
    const warm=advance(g,initial(g,5),.1,{dtMax:.02});
    require(max(warm.state.velocity)<1e-9&&warm.maxDivergence<1e-8,'3D hydrostatic rest');
    return {verticalAxis:g.axes[g.verticalAxis],maxWarmSpeed:max(warm.state.velocity),divergence:warm.maxDivergence,...diagnostics(g)};
  });
  check('3D gradient and random-field projection',()=>{
    const g=geometry({size:[6,5,4],spacing:[1,.54,1],buoyancy:false});
    const phi=g.cells.map(c=>Math.sin(.71*c.center[0])*Math.cos(.31*c.center[1])+.2*Math.sin(.9*c.center[2]));
    const gradient=g.faces.map(f=>(phi[f.j]-phi[f.i])/f.distance),p=project(g,gradient);
    const remaining=max(p.velocity);require(remaining<1e-9,'3D gradient remains');
    const random=g.faces.map(f=>.2*Math.sin(12.9898*f.k)),energy=v=>g.faces.reduce((s,f)=>s+v[f.k]**2*f.area*f.distance,0);
    const q=project(g,random),retained=[...q.velocity],after=energy(retained),before=energy(random);
    const twice=project(g,retained),idempotence=max(retained.map((v,i)=>v-twice.velocity[i]));
    require(after<=before+1e-10&&idempotence<1e-9,'3D projection energy/idempotence');
    return {gradientResidual:remaining,beforeEnergy:before,afterEnergy:after,idempotence,divergence:twice.divergence};
  });
  check('3D decaying ABC flow nonlinear advection and pressure',()=>{
    const U=.3,nu=.02,dt=.002,time=.04;
    const field=([x,y,z],t=0)=>[Math.sin(z)+Math.cos(y),Math.sin(x)+Math.cos(z),Math.sin(y)+Math.cos(x)].map(v=>U*v*Math.exp(-nu*t));
    // Independent analytic identity: curl(q)=q and Laplacian(q)=-q.
    // Thus (q·grad)q=grad(|q|²/2), p=-rho|q|²/2 and q(t)=exp(-nu*t)q(0).
    const at=[.37,.61,1.17],q=field(at),[x,y,z]=at;
    const jac=[[0,-U*Math.sin(y),U*Math.cos(z)],[U*Math.cos(x),0,-U*Math.sin(z)],[-U*Math.sin(x),U*Math.cos(y),0]];
    const analyticResidual=max(q.map((_,i)=>sum(q.map((v,j)=>v*(jac[i][j]-jac[j][i])))));
    require(analyticResidual<1e-14,'analytic momentum identity');
    const results=[];
    for(const size of [[4,6,4],[8,12,8],[12,18,12]]){
      const g=geometry({size,spacing:size.map(n=>2*Math.PI/n),periodic:[true,true,true],viscosity:nu,buoyancy:false,tracerDiffusivity:0,thermalDiffusivity:0});
      const s=initial(g);s.velocity=g.faces.map(f=>field(f.center)[f.axis]);
      require(max(divergence(g,s.velocity))<1e-12,'ABC discrete incompressibility');
      const p=project(g,predict(g,s,dt)),pressure=[...p.potential].map(v=>RHO*v/dt),mean=sum(pressure)/pressure.length;
      const expected=g.cells.map(c=>-.5*RHO*sum(field(c.center).map(v=>v*v))),expectedMean=sum(expected)/expected.length;
      const pressureError=rms(pressure.map((v,i)=>v-mean-expected[i]+expectedMean));
      require(p.iterations>0,'3D nonlinear pressure not exercised');
      const r=advance(g,s,time,{dtMax:dt}),velocityError=rms(g.faces.map(f=>r.state.velocity[f.k]-field(f.center,time)[f.axis]));
      results.push({size,cells:g.n,domain:size.map((n,d)=>n*g.metric.spacing[d]),velocityRmsError:velocityError,pressureRmsError:pressureError,
        divergence:r.maxDivergence,momentumCourant:r.maxMomentumCourant,steps:r.state.steps,...diagnostics(g)});
    }
    for(let i=1;i<results.length;i++)require(results[i].velocityRmsError<results[i-1].velocityRmsError*.85&&results[i].pressureRmsError<results[i-1].pressureRmsError,'3D ABC refinement');
    return {analyticResidual,results};
  });
  check('three-axis scalar receipts and exact domain reload',()=>{
    const cfg={size:[6,8,6],spacing:[1,.54,1],periodic:[true,true,true],buoyancy:false,viscosity:0,tracerDiffusivity:0,thermalDiffusivity:0,
      domainId:'three-dimensional-cell-field',origin:[-10,-4,-8]},g=geometry(cfg),s=seedField(g,initial(g));
    const speed=[.2,.1,-.15];s.velocity=g.faces.map(f=>speed[f.axis]);
    const half=advance(g,s,.1,{dtMax:.02}),a=advance(g,half.state,.1,{dtMax:.02}),b=advance(geometry(cfg),JSON.parse(JSON.stringify(half.state)),.1,{dtMax:.02});
    require(JSON.stringify(a)===JSON.stringify(b),'3D exact reload');
    const massError=Math.abs(sum(a.state.smoke)-s.initialSmoke),heatError=Math.abs(sum(a.state.heat)-s.initialHeat);
    require(massError<1e-10&&heatError<1e-5,'3D scalar conservation');
    const faceReceipts=[0,1,2].map(axis=>{const f=g.faces.find(f=>f.axis===axis),expected=speed[axis]*f.area*.1;
      require(Math.abs(half.receipt.air[f.k]-expected)<1e-13,'family receipt units');return {axis:g.axes[axis],area:f.area,actual:half.receipt.air[f.k],expected};});
    const rejected=[];for(const [name,change] of [['domain',{domainId:'other-world'}],['origin',{origin:[0,0,0]}],['vertical spacing',{spacing:[1,.55,1]}]]){
      let failed=false;try{advance(geometry({...cfg,...change}),half.state,.1);}catch(error){failed=true;rejected.push({name,reason:error.message});}require(failed,'foreign 3D field admitted');}
    return {massError,heatError,minSmoke:Math.min(...a.state.smoke),faceReceipts,exactReload:true,rejected};
  });
}finally{
  const result={geometrySha256:sha(readFileSync(new URL('geometry.mjs',import.meta.url))),solverSha256:sha(readFileSync(new URL('solver.mjs',import.meta.url))),
    proofSha256:sha(readFileSync(new URL(import.meta.url))),wallMs:performance.now()-start,rssBytes:process.memoryUsage().rss,rows};
  writeFileSync(new URL(process.argv[2]??'qualification-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
