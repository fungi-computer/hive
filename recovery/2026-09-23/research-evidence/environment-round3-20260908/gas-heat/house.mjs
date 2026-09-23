/** Matched layouts within a NEW explicit 2D house fixture, not a silent match
 * to the old model's sub-extrusion-width orifice. No work runs on import.
 */
import { geometry, initial, advance, totals, RHO, CP } from './solver.mjs';

export function house({ dx=.5, mode='sealed', exterior=2, revision=0 }={}) {
  if(!['sealed','local','high'].includes(mode)) throw new Error('house mode');
  for(const length of [4,6,3,1,exterior]) if(Math.abs(length/dx-Math.round(length/dx))>1e-9) throw new Error('grid must resolve fixed dimensions');
  const nx=Math.round((4+2*exterior)/dx),nz=Math.round((6+exterior)/dx);
  const left=Math.round(exterior/dx),right=Math.round((exterior+4)/dx),roof=Math.round(6/dx),floor=Math.round(3/dx);
  const walls=[];
  for(let z=0;z<roof;z++) {
    const height=(z+.5)*dx;
    const leftOpening=mode!=='sealed'&&(height<1||(mode==='local'&&height>=2&&height<3));
    const rightOpening=mode==='high'&&height>=5&&height<6;
    if(!leftOpening) walls.push(`u:${left}:${z}`);
    if(!rightOpening) walls.push(`u:${right}:${z}`);
  }
  for(let x=left;x<right;x++) {
    walls.push(`v:${x}:${roof}`);
    if((x-left+.5)*dx<3) walls.push(`v:${x}:${floor}`);
  }
  const config={nx,nz,dx,depth:2,open:['left','right','top'],walls,revision};
  const g=geometry(config),indoor=[],source=[],upper=[],lower=[];
  for(const c of g.cells) {
    const x=c.x-exterior;
    if(x>=0&&x<4&&c.z<6) indoor.push(c.i);
    if(x>=0&&x<1&&c.z<1) source.push(c.i);
    if(x>=0&&x<1&&c.z>=4&&c.z<5) upper.push(c.i);
    if(x>=2&&x<3&&c.z>=1&&c.z<2) lower.push(c.i);
  }
  return {g,config,indoor,source,upper,lower,mode,dx,exterior,
    apertureArea:2,apertureHeight:1,sourceDuration:120,observationDuration:900};
}

export function initialHouse(f) {
  const s=initial(f.g);for(const i of f.indoor)s.heat[i]=RHO*CP*f.g.volume*5;
  s.initialHeat=s.heat.reduce((a,b)=>a+b,0);
  return s;
}

export function concentration(f,s,ids) {
  return ids.reduce((total,i)=>total+s.smoke[i],0)/(ids.length*f.g.volume);
}

/** Keep forcing events exact. At t=120 switch from sealed to the chosen layout;
 * newly open faces start with zero canonical normal velocity, all surviving
 * faces preserve velocity by physical ID. No stock or retained momentum is
 * reset; pressure projection must still settle the changed connectivity.
 */
export function changeGeometry(oldG,newG,state) {
  if(oldG.n!==newG.n||oldG.dx!==newG.dx||oldG.volume!==newG.volume) throw new Error('unsupported cell-volume change');
  const oldIndex=new Map(oldG.faces.map(f=>[f.id,f.k]));
  return {...state,geometryRevision:newG.revision,geometryIdentity:newG.identity,
    velocity:newG.faces.map(f=>oldIndex.has(f.id)?state.velocity[oldIndex.get(f.id)]:0)};
}

export function runHouse({dx=.5,mode='sealed',exterior=2,duration=10,dtMax=.05,
  observationDt=.05,stopAfterWallMs=20000}={}) {
  let f=house({dx,mode:'sealed',exterior,revision:0}),s=initialHouse(f);
  const initialHeat=totals(f.g,s).heat,start=performance.now(),rows=[];
  let exposure=0,lowerExposure=0,maxDivergence=0,maxCourant=0,maxTheta=5,clear80=null;
  let pressureSolves=0,iterations=0,matrixProducts=0,operatorBuilds=1,rejected=0;
  const takeWork=()=>{pressureSolves+=f.g.workspace.pressureSolves;iterations+=f.g.workspace.iterations;matrixProducts+=f.g.workspace.matrixProducts;};
  const forcingAt=t=>({sources:t<120?f.source.map(cell=>({cell,smokeKgS:1e-5/f.source.length,heatJS:1000/f.source.length})):[]});
  while(s.time<duration-1e-10) {
    if(performance.now()-start>stopAfterWallMs) throw new Error(`declared wall budget reached at ${s.time} simulated seconds`);
    if(s.time>=120&&f.mode!==mode) {
      takeWork(); const oldG=f.g;f=house({dx,mode,exterior,revision:1});operatorBuilds++;
      s=changeGeometry(oldG,f.g,s);
    }
    const h=Math.min(observationDt,duration-s.time,s.time<120?120-s.time:Infinity);
    const before=concentration(f,s,f.upper),lowerBefore=concentration(f,s,f.lower);
    const r=advance(f.g,s,h,{dtMax,forcingAt,events:[120]});s=r.state;
    exposure+=h*(before+concentration(f,s,f.upper))/2;
    lowerExposure+=h*(lowerBefore+concentration(f,s,f.lower))/2;
    maxDivergence=Math.max(maxDivergence,r.maxDivergence);maxCourant=Math.max(maxCourant,r.maxCourant);rejected+=r.rejected;
    maxTheta=Math.max(maxTheta,totals(f.g,s).maxTheta);
    if(clear80===null&&s.time>=120&&s.smokeBoundary>=.8*.0012)clear80=s.time;
    if(s.time+1e-8>=Math.ceil((rows.at(-1)?.time??0)+1)) rows.push({time:s.time,smoke:s.smoke.reduce((a,b)=>a+b,0),export:s.smokeBoundary,upperExposure:exposure,maxVelocity:totals(f.g,s).maxVelocity});
  }
  takeWork();
  const t=totals(f.g,s);
  return {state:s,rows,result:{mode,dx,exterior,duration,dtMax,observationDt,cells:f.g.n,faces:f.g.faces.length,
    apertureAreaM2:f.apertureArea,apertureHeightM:f.apertureHeight,
    massErrorKg:Math.abs(t.smoke+s.smokeBoundary-s.smokeSource),
    heatErrorJ:Math.abs(t.heat+s.heatBoundary-initialHeat-s.heatSource),
    exportedFraction:s.smokeSource?s.smokeBoundary/s.smokeSource:0,clear80,
    upperExposure:exposure,lowerExposure,maxDivergence,maxCourant,peakThetaK:maxTheta,
    maxBoussinesqRatio:maxTheta/293.15,substeps:s.steps,rejected,
    pressureSolves,iterations,matrixProducts,operatorBuilds,wallMs:performance.now()-start,
    ...t}};
}
