// Shared numerical owners for every dimension supported by geometry.mjs.
// Geometry, momentum history and material ledgers never become a renderer state.
import{RHO,CP,TREF,G}from"./physics.mjs";
import{transport,transportDiagnostics,validateSources,physicalFields,SCALAR_VERSION}from"./transport.mjs";
export{RHO,CP,TREF,G,transport};
const require=(ok,text)=>{if(!ok)throw new Error(text);};
const maxAbs=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const sum=a=>a.reduce((s,x)=>s+x,0);
const workspaces=new WeakMap();
function workspace(g){
  if(workspaces.has(g))return workspaces.get(g);
  const cell=()=>new Float64Array(g.n),face=()=>new Float64Array(g.faces.length);
  const w={rhs:cell(),phi:cell(),r:cell(),z:cell(),p:cell(),ap:cell(),predicted:face(),projected:face(),
    pressureSolves:0,iterations:0,matrixProducts:0,operatorBuilds:1};
  workspaces.set(g,w);return w;
}
export function diagnostics(g){const w=workspace(g);return {pressureSolves:w.pressureSolves,iterations:w.iterations,
  matrixProducts:w.matrixProducts,operatorBuilds:w.operatorBuilds,workspaceBytes:Object.values(w).reduce((n,x)=>n+(x?.byteLength??0),0),...transportDiagnostics(g)};}
export function initial(g,temperature=0){
  require(Number.isFinite(temperature)&&temperature+TREF>0,'finite initial temperature');
  return {version:SCALAR_VERSION,geometryIdentity:g.identity,time:0,steps:0,velocity:Array(g.faces.length).fill(0),
    smoke:Array(g.n).fill(0),heat:g.cells.map(c=>c.fluid?RHO*CP*g.volume*temperature:0),
    initialSmoke:0,initialHeat:g.cells.filter(c=>c.fluid).length*RHO*CP*g.volume*temperature,
    smokeSource:0,heatSource:0,smokeBoundary:0,heatBoundary:0,airImport:0,airExport:0};
}
export function validate(g,s){
  require(s.version===SCALAR_VERSION&&s.geometryIdentity===g.identity,'state/domain geometry identity');
  require(Number.isFinite(s.time)&&s.time>=0&&Number.isSafeInteger(s.steps)&&s.steps>=0,'finite canonical clock');
  for(const [name,length] of [['velocity',g.faces.length],['smoke',g.n],['heat',g.n]])
    require(Array.isArray(s[name])&&s[name].length===length&&s[name].every(Number.isFinite),`finite ${name} shape`);
  for(const name of ['initialSmoke','initialHeat','smokeSource','heatSource','smokeBoundary','heatBoundary','airImport','airExport'])require(Number.isFinite(s[name]),`finite ${name}`);
  require(s.initialSmoke>=0&&s.smokeSource>=0&&s.airImport>=0&&s.airExport>=0,'positive ledger');
  require(physicalFields(g,s),'physical scalar/absolute temperature');
  require(Math.abs(sum(s.smoke)+s.smokeBoundary-s.smokeSource-s.initialSmoke)<1e-10,'tracer ledger');
  require(Math.abs(sum(s.heat)+s.heatBoundary-s.heatSource-s.initialHeat)<1e-5,'heat ledger');
}
function forcing(g,f){
  const acceleration=f.acceleration??Array(g.dimensions).fill(0);
  require(Array.isArray(acceleration)&&acceleration.length===g.dimensions&&acceleration.every(Number.isFinite),'finite directional acceleration');
  validateSources(g,f);
  return acceleration;
}
export function divergence(g,velocity,out=new Float64Array(g.n)){
  out.fill(0);for(const f of g.faces){const q=velocity[f.k]*f.area;if(f.i>=0)out[f.i]+=q;if(f.j>=0)out[f.j]-=q;}return out;
}
function matrix(g,x,out){
  for(let i=0;i<g.n;i++)out[i]=g.diagonal[i]*x[i];
  for(const f of g.faces){if(f.i<0||f.j<0||g.fixed[f.i]||g.fixed[f.j])continue;
    const k=f.area/f.distance;out[f.i]-=k*x[f.j];out[f.j]-=k*x[f.i];}
}
export function project(g,velocity){
  require(velocity.length===g.faces.length&&velocity.every(Number.isFinite),'finite face velocity');
  const w=workspace(g);divergence(g,velocity,w.rhs);let rz=0;
  for(let i=0;i<g.n;i++){w.rhs[i]=g.fixed[i]?0:-w.rhs[i];w.phi[i]=0;w.r[i]=w.rhs[i];w.z[i]=w.r[i]/g.diagonal[i];w.p[i]=w.z[i];rz+=w.r[i]*w.z[i];}
  let iterations=0;
  while(maxAbs(w.r)>1e-11){
    require(iterations<6*g.n+100,'projection convergence');matrix(g,w.p,w.ap);w.matrixProducts++;
    let pap=0;for(let i=0;i<g.n;i++)pap+=w.p[i]*w.ap[i];require(pap>0&&Number.isFinite(pap),'positive pressure operator');
    const alpha=rz/pap;let nextRz=0;
    for(let i=0;i<g.n;i++){w.phi[i]+=alpha*w.p[i];w.r[i]-=alpha*w.ap[i];w.z[i]=w.r[i]/g.diagonal[i];nextRz+=w.r[i]*w.z[i];}
    const beta=rz?nextRz/rz:0;for(let i=0;i<g.n;i++)w.p[i]=w.z[i]+beta*w.p[i];rz=nextRz;iterations++;
  }
  for(const f of g.faces)w.projected[f.k]=velocity[f.k]+((f.i>=0?w.phi[f.i]:0)-(f.j>=0?w.phi[f.j]:0))/f.distance;
  const error=maxAbs(divergence(g,w.projected,w.rhs));require(error<1e-8,`divergence ${error}`);
  w.pressureSolves++;w.iterations+=iterations;
  return {velocity:w.projected,potential:w.phi,iterations,divergence:error};
}
function advector(g,v,face,d){const indices=g.cross[face.k][d];return indices.reduce((s,i)=>s+(i<0?0:v[i]),0)/indices.length;}
function neighbor(v,f,relation){return (relation.index<0?0:relation.other*v[relation.index])+relation.center*v[f.k];}
export function momentumRate(g,v){
  let rate=0;for(const f of g.faces){let row=0;for(let d=0;d<g.dimensions;d++){
    const speed=advector(g,v,f,d),h=g.metric.spacing[d],[negative,positive]=g.stencil[f.k][d];
    row+=Math.abs(speed)/h*(1-(speed>=0?negative:positive).center)+g.viscosity*(2-negative.center-positive.center)/(h*h);
  }rate=Math.max(rate,row);}return rate;
}
export function predict(g,s,dt,f={}){
  require(Number.isFinite(dt)&&dt>0,'positive predictor interval');const acceleration=forcing(g,f),out=workspace(g).predicted;
  for(const face of g.faces){const c=s.velocity[face.k];let advection=0,laplacian=0;
    for(let d=0;d<g.dimensions;d++){
      const [minus,plus]=g.stencil[face.k][d],negative=neighbor(s.velocity,face,minus),positive=neighbor(s.velocity,face,plus);
      const speed=advector(g,s.velocity,face,d),h=g.metric.spacing[d];
      advection+=speed*(speed>=0?c-negative:positive-c)/h;laplacian+=(negative+positive-2*c)/(h*h);
    }
    let force=acceleration[face.axis];
    if(g.buoyancy&&face.axis===g.verticalAxis){
      const ti=face.i<0?0:s.heat[face.i]/(RHO*CP*g.volume),tj=face.j<0?0:s.heat[face.j]/(RHO*CP*g.volume);
      force+=G*(ti+tj)/(2*TREF);
    }
    out[face.k]=c+dt*(-advection+g.viscosity*laplacian+force);
  }return out;
}
export function advance(g,input,interval,{dtMax=.05,forcingAt=()=>({}),events=[]}={}){
  validate(g,input);require(Number.isFinite(interval)&&interval>=0&&Number.isFinite(dtMax)&&dtMax>0,'finite interval');
  const end=input.time+interval;require(Number.isFinite(end)&&events.every(Number.isFinite),'finite boundary');
  let state=input,rejected=0,maxDivergence=0,maxCourant=0,maxMomentumCourant=0;
  const receipt={start:input.time,end,smokeSource:0,heatSource:0,air:Array(g.faces.length).fill(0),smoke:Array(g.faces.length).fill(0),heat:Array(g.faces.length).fill(0)};
  while(state.time<end){const beforeRate=momentumRate(g,state.velocity);let dt=Math.min(dtMax,end-state.time,beforeRate>0?.45/beforeRate:Infinity);
    for(const event of events)if(event>state.time)dt=Math.min(dt,event-state.time);
    const f=forcingAt(state.time);forcing(g,f);let accepted;
    for(;;){require(dt>0&&state.time+dt>state.time,'representable step');const p=project(g,predict(g,state,dt,f));
      const rate=Math.max(beforeRate,momentumRate(g,p.velocity))*dt;
      if(rate<=.45000000001)accepted=transport(g,state,p.velocity,dt,f);
      if(accepted){maxMomentumCourant=Math.max(maxMomentumCourant,rate);maxDivergence=Math.max(maxDivergence,p.divergence);break;}
      dt/=2;rejected++;
    }
    state=accepted.state;maxCourant=Math.max(maxCourant,accepted.courant);
    receipt.smokeSource+=accepted.receipt.smokeSource;receipt.heatSource+=accepted.receipt.heatSource;
    for(let i=0;i<g.faces.length;i++){receipt.air[i]+=accepted.receipt.air[i];receipt.smoke[i]+=accepted.receipt.smoke[i];receipt.heat[i]+=accepted.receipt.heat[i];}
  }
  return {state,receipt,rejected,maxDivergence,maxCourant,maxMomentumCourant};
}
