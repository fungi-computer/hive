import{REFERENCE_HEAT_DENSITY}from'./physics.mjs';
const require=(ok,message)=>{if(!ok)throw new Error(message);};
export const SCALAR_VERSION='mac-boussinesq-nd-muscl-mc-ssprk2-v1';
const caches=new WeakMap();
export function validateSources(g,f){
  require(Array.isArray(f.sources??[]),'source list');
  for(const source of f.sources??[]){
    require(Number.isSafeInteger(source.cell)&&source.cell>=0&&source.cell<g.n&&g.fluid[source.cell],'fluid source cell');
    require(Number.isFinite(source.smokeKgS??0)&&(source.smokeKgS??0)>=0&&Number.isFinite(source.heatJS??0),'finite source rate');
  }
}
export function physicalFields(g,s){
  return s.smoke?.length===g.n&&s.heat?.length===g.n&&s.smoke.every((m,i)=>Number.isFinite(m)&&m>=0&&(g.fluid[i]||(m===0&&s.heat[i]===0)))&&
    s.heat.every((h,i)=>Number.isFinite(h)&&(!g.fluid[i]||h+REFERENCE_HEAT_DENSITY*g.volume>0));
}
function workspace(g){
  if(caches.has(g))return caches.get(g);
  const cell=()=>new Float64Array(g.n),face=()=>new Float64Array(g.faces.length),nd=g.n*g.dimensions;
  const neighbor=new Int32Array(2*nd).fill(-2),neighborFace=new Int32Array(2*nd).fill(-1);
  for(const f of g.faces){
    if(f.i>=0){const k=2*(f.i*g.dimensions+f.axis)+1;neighbor[k]=f.j;neighborFace[k]=f.k;}
    if(f.j>=0){const k=2*(f.j*g.dimensions+f.axis);neighbor[k]=f.i;neighborFace[k]=f.k;}
  }
  const w={neighbor,neighborFace,smokeSlope:new Float64Array(nd),heatSlope:new Float64Array(nd),outgoing:cell(),conductance:cell(),divergence:cell(),
    smokeRate:cell(),heatRate:cell(),smokeA:cell(),heatA:cell(),smokeB:cell(),heatB:cell(),smokeFluxA:face(),heatFluxA:face(),smokeFluxB:face(),heatFluxB:face(),
    cacheBuilds:1,eulerStages:0,faceEvaluations:0,reconstructions:0,rejectedStages:0};
  caches.set(g,w);return w;
}
export function transportDiagnostics(g){const w=workspace(g);return{scalarCacheBuilds:w.cacheBuilds,scalarEulerStages:w.eulerStages,
  scalarFaceEvaluations:w.faceEvaluations,scalarReconstructions:w.reconstructions,scalarRejectedStages:w.rejectedStages,
  scalarWorkspaceBytes:Object.values(w).reduce((n,x)=>n+(x?.byteLength??0),0)};}
function mc(a,b){if(a*b<=0)return 0;return Math.sign(a)*Math.min(2*Math.abs(a),Math.abs(a+b)/2,2*Math.abs(b));}
function slope(g,w,field,out,v){
  for(let i=0;i<g.n;i++)for(let d=0;d<g.dimensions;d++){
    const k=i*g.dimensions+d,c=field[i];
    if(!g.fluid[i]){out[k]=0;continue;}
    const value=side=>{const slot=2*k+side,n=w.neighbor[slot];if(n>=0)return field[n];if(n===-2)return c;
      const outward=(side===1?1:-1)*v[w.neighborFace[slot]];return outward<0?0:c;};
    out[k]=mc(c-value(0),value(1)-c);
  }
  w.reconstructions++;
}
function prepare(g,w,v,f){
  w.outgoing.fill(0);w.conductance.fill(0);w.divergence.fill(0);w.smokeRate.fill(0);w.heatRate.fill(0);
  const diffusivity=Math.max(g.tracerDiffusivity,g.thermalDiffusivity);
  for(const face of g.faces){const q=v[face.k]*face.area,k=diffusivity*face.area/face.distance;
    if(face.i>=0){w.outgoing[face.i]+=Math.max(q,0);w.conductance[face.i]+=k;w.divergence[face.i]+=q;}
    if(face.j>=0){w.outgoing[face.j]+=Math.max(-q,0);w.conductance[face.j]+=k;w.divergence[face.j]-=q;}
  }
  for(const source of f.sources??[]){w.smokeRate[source.cell]+=source.smokeKgS??0;w.heatRate[source.cell]+=source.heatJS??0;}
  require(w.smokeRate.every(Number.isFinite)&&w.heatRate.every(Number.isFinite),'finite combined source rates');
}
function stage(g,w,s,v,dt,outSmoke,outHeat,fluxSmoke,fluxHeat){
  let coefficient=0;
  for(let i=0;i<g.n;i++)if(g.fluid[i]){
    const absoluteHeat=s.heat[i]+REFERENCE_HEAT_DENSITY*g.volume;
    require(absoluteHeat>0,'positive absolute temperature before scalar stage');
    const thermalLoss=Math.max(-w.heatRate[i],0)+Math.max(-REFERENCE_HEAT_DENSITY*w.divergence[i],0);
    const rate=(2*w.outgoing[i]+w.conductance[i])/g.volume+thermalLoss/absoluteHeat;
    coefficient=Math.max(coefficient,dt*rate);
  }
  if(coefficient>.45000000001){w.rejectedStages++;return null;}
  slope(g,w,s.smoke,w.smokeSlope,v);slope(g,w,s.heat,w.heatSlope,v);
  outSmoke.set(s.smoke);outHeat.set(s.heat);
  let smokeBoundary=0,heatBoundary=0,airImport=0,airExport=0;
  for(const face of g.faces){const{i,j,axis}=face,q=v[face.k]*face.area,donor=q>=0?i:j,sign=q>=0?1:-1;
    const reconstructed=(field,slopes)=>donor<0?0:(field[donor]+sign*.5*slopes[donor*g.dimensions+axis])/g.volume;
    const diffusion=field=>((i<0?0:field[i])-(j<0?0:field[j]))/g.volume*face.area/face.distance;
    const ds=dt*(q*reconstructed(s.smoke,w.smokeSlope)+g.tracerDiffusivity*diffusion(s.smoke));
    const dh=dt*(q*reconstructed(s.heat,w.heatSlope)+g.thermalDiffusivity*diffusion(s.heat));
    fluxSmoke[face.k]=ds;fluxHeat[face.k]=dh;
    if(i>=0){outSmoke[i]-=ds;outHeat[i]-=dh;}if(j>=0){outSmoke[j]+=ds;outHeat[j]+=dh;}
    if(face.boundary){const outward=j<0?1:-1,flow=outward*q;smokeBoundary+=outward*ds;heatBoundary+=outward*dh;
      airImport+=dt*Math.max(-flow,0);airExport+=dt*Math.max(flow,0);}
  }
  let smokeSource=0,heatSource=0;
  for(let i=0;i<g.n;i++){const ds=dt*w.smokeRate[i],dh=dt*w.heatRate[i];outSmoke[i]+=ds;outHeat[i]+=dh;smokeSource+=ds;heatSource+=dh;}
  w.eulerStages++;w.faceEvaluations+=g.faces.length;
  if(!physicalFields(g,{smoke:outSmoke,heat:outHeat})){w.rejectedStages++;return null;}
  return{coefficient,smokeSource,heatSource,smokeBoundary,heatBoundary,airImport,airExport};
}
export function transport(g,s,v,dt,f={}){
  require(Number.isFinite(dt)&&dt>0&&v.length===g.faces.length&&v.every(Number.isFinite),'finite scalar interval/velocity');
  require(physicalFields(g,s),'positive scalar/absolute-temperature admission');validateSources(g,f);
  const w=workspace(g);prepare(g,w,v,f);
  const a=stage(g,w,s,v,dt,w.smokeA,w.heatA,w.smokeFluxA,w.heatFluxA);if(!a)return null;
  const b=stage(g,w,{smoke:w.smokeA,heat:w.heatA},v,dt,w.smokeB,w.heatB,w.smokeFluxB,w.heatFluxB);if(!b)return null;
  const average=name=>(a[name]+b[name])/2;
  const state={...s,time:s.time+dt,steps:s.steps+1,velocity:Array.from(v),smoke:s.smoke.map((m,i)=>(m+w.smokeB[i])/2),heat:s.heat.map((h,i)=>(h+w.heatB[i])/2),
    smokeSource:s.smokeSource+average('smokeSource'),heatSource:s.heatSource+average('heatSource'),
    smokeBoundary:s.smokeBoundary+average('smokeBoundary'),heatBoundary:s.heatBoundary+average('heatBoundary'),
    airImport:s.airImport+average('airImport'),airExport:s.airExport+average('airExport')};
  require(physicalFields(g,state),'positive SSPRK2 successor');
  return{state,courant:Math.max(a.coefficient,b.coefficient),receipt:{start:s.time,end:state.time,smokeSource:average('smokeSource'),heatSource:average('heatSource'),
    air:Array.from(v,(speed,i)=>dt*speed*g.faces[i].area),smoke:Array.from(w.smokeFluxA,(q,i)=>(q+w.smokeFluxB[i])/2),heat:Array.from(w.heatFluxA,(q,i)=>(q+w.heatFluxB[i])/2)}};
}
