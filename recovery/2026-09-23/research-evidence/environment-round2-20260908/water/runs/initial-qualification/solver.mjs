// Standalone authored numerical research. SI. No game imports or runtime owner.
// LI: de Almeida/Bates (2013) eqs 7–11, with explicitly solver-owned donor limiter.
// SWE: Rusanov flux + Audusse et al. (2004) hydrostatic reconstruction, 2D Cartesian.
export const G = 9.81;
const arr = n => new Float64Array(n);
export const sum = a => a.reduce((x,y)=>x+y,0);
export function geometry(n=32, length=64, fixture='diversion', rotation=0) {
  const dx=length/n, z=arr(n*n), solid=new Uint8Array(n*n), region=new Uint8Array(n*n);
  const inside=(x,y,x0,x1,y0,y1)=>x>=x0&&x<x1&&y>=y0&&y<y1;
  const physical=(x,y)=>{ for(let k=0;k<rotation;k++) [x,y]=[y,length-x]; return [x,y]; };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const i=y*n+x; const [X,Y]=physical((x+.5)*dx,(y+.5)*dx);
    if(fixture==='diversion') {
      solid[i]=1;
      if(inside(X,Y,4,16,24,40)) {solid[i]=0;z[i]=.4;region[i]=1;}
      if(inside(X,Y,16,60,30,34)) {solid[i]=0;z[i]=.4-.004*(X-16);region[i]=2;}
      if(inside(X,Y,24,28,24,30)||inside(X,Y,24,32,20,24)) {solid[i]=0;z[i]=.18;region[i]=3;}
      if(inside(X,Y,32,48,8,28)) {solid[i]=0;z[i]=.08;region[i]=4;}
      if(inside(X,Y,38,42,16,20)) {solid[i]=1;region[i]=5;}
      if(inside(X,Y,56,60,30,34)) region[i]=6;
    } else if(fixture==='rest') {
      z[i]=.25*Math.sin(X*.3)*Math.cos(Y*.2)+.15;
      if(Math.hypot(X-length/2,Y-length/2)<length*.12)z[i]=.9;
    }
  }
  const faces=[], xids=new Int32Array((n+1)*n), yids=new Int32Array(n*(n+1));
  function face(a,b,axis,x,y) {
    const p=physical(axis===0?x*dx:(x+.5)*dx,axis===1?y*dx:(y+.5)*dx);
    // Rotated endpoints are tested too, so a 90-degree gate has identical support.
    const isGate=fixture==='diversion'&&Math.abs(p[1]-30)<1e-7&&p[0]>=24&&p[0]<28;
    const id=faces.length, open=a>=0&&b>=0&&!solid[a]&&!solid[b]&&!isGate;
    faces.push({id,a,b,axis,x,y,open,gate:isGate});return id;
  }
  for(let y=0;y<n;y++)for(let x=0;x<=n;x++) xids[y*(n+1)+x]=face(x?y*n+x-1:-1,x<n?y*n+x:-1,0,x,y);
  for(let y=0;y<=n;y++)for(let x=0;x<n;x++) yids[y*n+x]=face(y?(y-1)*n+x:-1,y<n?y*n+x:-1,1,x,y);
  for(const f of faces) {
    const {x,y,axis}=f;
    f.collinear=axis===0?[x>0?xids[y*(n+1)+x-1]:-1,x<n?xids[y*(n+1)+x+1]:-1]
      :[y>0?yids[(y-1)*n+x]:-1,y<n?yids[(y+1)*n+x]:-1];
    f.transverse=axis===0?[x>0?yids[y*n+x-1]:-1,x<n?yids[y*n+x]:-1,x>0?yids[(y+1)*n+x-1]:-1,x<n?yids[(y+1)*n+x]:-1]
      :[y>0?xids[(y-1)*(n+1)+x]:-1,y<n?xids[y*(n+1)+x]:-1,y>0?xids[(y-1)*(n+1)+x+1]:-1,y<n?xids[y*(n+1)+x+1]:-1];
  }
  return {n,length,dx,area:dx*dx,z,solid,region,faces,xids,yids,fixture,rotation,revision:0};
}
export function makeFixture({n=32,length=64,fixture='diversion',model='li',theta=.7,rotation=0,roughness=.07}={}) {
  const geom=geometry(n,length,fixture,rotation),V=arr(n*n);
  for(let i=0;i<V.length;i++) {
    const x=(i%n+.5)*geom.dx,y=(Math.floor(i/n)+.5)*geom.dx;
    const depth=fixture==='diversion'?(geom.region[i]===1?.6:0):fixture==='rest'?Math.max(0,.6-geom.z[i]):fixture==='dam'?(x<length/2?1:0):fixture==='radial'?(Math.hypot(x-length/2,y-length/2)<12?.1:0):0;
    V[i]=depth*geom.area;
  }
  return {version:'water-round2-v1',model,theta,roughness,geom,V,q:arr(geom.faces.length),mx:arr(V.length),my:arr(V.length),time:0,stepCount:0,collected:0,initialVolume:sum(V),events:{gate:false,dig:false}};
}
export function serialize(state) {
  const {geom,...rest}=state;
  return {...rest,V:Array.from(state.V),q:Array.from(state.q),mx:Array.from(state.mx),my:Array.from(state.my),geom:{...geom,z:Array.from(geom.z),solid:Array.from(geom.solid),region:Array.from(geom.region),xids:Array.from(geom.xids),yids:Array.from(geom.yids)}};
}
export function restore(s) {
  if(s.version!=='water-round2-v1')throw Error('unsupported model state');
  return {...s,V:Float64Array.from(s.V),q:Float64Array.from(s.q),mx:Float64Array.from(s.mx),my:Float64Array.from(s.my),events:{...s.events},geom:{...s.geom,z:Float64Array.from(s.geom.z),solid:Uint8Array.from(s.geom.solid),region:Uint8Array.from(s.geom.region),xids:Int32Array.from(s.geom.xids),yids:Int32Array.from(s.geom.yids),faces:s.geom.faces.map(f=>({...f,collinear:[...f.collinear],transverse:[...f.transverse]}))}};
}
export function edit(state,kind) {
  const next=restore(serialize(state));
  const touched=new Set();
  if(kind==='gate-open') {
    for(const f of next.geom.faces)if(f.gate&&f.a>=0&&f.b>=0&&!next.geom.solid[f.a]&&!next.geom.solid[f.b]) {f.open=true;next.q[f.id]=0;touched.add(f.a);touched.add(f.b);}
    next.events.gate=true;
  } else if(kind==='dig-pond') {
    for(let i=0;i<next.V.length;i++)if(next.geom.region[i]===4){next.geom.z[i]-=.1;touched.add(i);}
    for(const f of next.geom.faces)if(touched.has(f.a)||touched.has(f.b))next.q[f.id]=0;
    next.events.dig=true;
  } else throw Error('unsupported edit');
  // Explicit local momentum dissipation at edited geometry. No liquid is removed.
  for(const i of touched)next.mx[i]=next.my[i]=0;
  next.geom.revision++;return next;
}
export function stableDt(state,maxDt=.1) {
  let wave=0;const {V,mx,my,geom,model}=state;
  for(let i=0;i<V.length;i++)if(V[i]>0) {
    const h=V[i]/geom.area,c=Math.sqrt(G*h);
    const speed=model==='swe'&&h>1e-12?Math.max(Math.abs(mx[i]),Math.abs(my[i]))/h:0;
    wave=Math.max(wave,c+speed);
  }
  return wave?Math.min(maxDt,.2*geom.dx/wave):maxDt;
}
// Face evaluation may be arbitrarily partitioned/permuted. All reductions commit
// canonical face order; shared infrastructure must validate, not modify, these exchanges.
export function step(state,dt,{faceOrder,withdrawRate=0}={}) {
  if(!(dt>0&&Number.isFinite(dt)))throw Error('invalid dt');
  const {geom,V,q,mx,my,model}=state,{faces,area,dx,z,solid}=geom,N=V.length,E=faces.length;
  const h=Float64Array.from(V,v=>v/area),flux=arr(E),ax=arr(E),ay=arr(E),bx=arr(E),by=arr(E);
  const requested=arr(N),orders=faceOrder??faces.map(f=>f.id);
  if(orders.length!==E||new Set(orders).size!==E||orders.some(i=>!Number.isInteger(i)||i<0||i>=E))throw Error('face coverage');
  const history=j=>j>=0&&faces[j].open?q[j]:0;
  for(const id of orders) {
    const f=faces[id],{a,b,axis}=f;
    if(model==='li') {
      if(!f.open)continue;
      const etaA=z[a]+h[a],etaB=z[b]+h[b],hf=Math.max(0,Math.max(etaA,etaB)-Math.max(z[a],z[b]));
      if(hf<=1e-12)continue;
      const qbar=state.theta*q[id]+(1-state.theta)*(history(f.collinear[0])+history(f.collinear[1]))/2;
      const qt=f.transverse.reduce((s,j)=>s+history(j),0)/4;
      flux[id]=(qbar-G*hf*dt*(etaB-etaA)/dx)/(1+G*dt*state.roughness**2*Math.hypot(q[id],qt)/hf**(7/3));
    } else if(model==='swe') {
      if(!f.open) {
        // A wall has reflected normal velocity and independent pressures on sides.
        for(const [i,side] of [[a,1],[b,-1]]) if(i>=0&&!solid[i]) {
          const hi=h[i],un=hi>1e-12?(axis===0?mx[i]:my[i])/hi:0;
          const pressure=hi*un*un+G*hi*hi/2+side*(Math.abs(un)+Math.sqrt(G*hi))*hi*un;
          if(side===1){if(axis===0)ax[id]=pressure;else ay[id]=pressure;}
          else {if(axis===0)bx[id]=pressure;else by[id]=pressure;}
        }
        continue;
      }
      const za=Math.max(z[a],z[b]),ha=Math.max(0,z[a]+h[a]-za),hb=Math.max(0,z[b]+h[b]-za);
      const ua=h[a]>1e-12?mx[a]/h[a]:0,va=h[a]>1e-12?my[a]/h[a]:0;
      const ub=h[b]>1e-12?mx[b]/h[b]:0,vb=h[b]>1e-12?my[b]/h[b]:0;
      const unA=axis===0?ua:va,unB=axis===0?ub:vb;
      const speed=Math.max(Math.abs(unA)+Math.sqrt(G*ha),Math.abs(unB)+Math.sqrt(G*hb));
      flux[id]=(ha*unA+hb*unB-speed*(hb-ha))/2;
      const fx=(ha*unA*ua+hb*unB*ub+(axis===0?G*(ha*ha+hb*hb)/2:0)-speed*(hb*ub-ha*ua))/2;
      const fy=(ha*unA*va+hb*unB*vb+(axis===1?G*(ha*ha+hb*hb)/2:0)-speed*(hb*vb-ha*va))/2;
      ax[id]=fx+(axis===0?G*(h[a]*h[a]-ha*ha)/2:0);ay[id]=fy+(axis===1?G*(h[a]*h[a]-ha*ha)/2:0);
      bx[id]=fx+(axis===0?G*(h[b]*h[b]-hb*hb)/2:0);by[id]=fy+(axis===1?G*(h[b]*h[b]-hb*hb)/2:0);
    } else throw Error('unknown solver');
  }
  for(const f of faces)if(f.open) {const d=flux[f.id]>=0?f.a:f.b;requested[d]+=Math.abs(flux[f.id])*dx*dt;}
  const withdrawal=arr(N),withdrawCells=[];
  if(withdrawRate>0)for(let i=0;i<N;i++)if(geom.region[i]===6)withdrawCells.push(i);
  for(const i of withdrawCells) {withdrawal[i]=withdrawRate*dt/withdrawCells.length;requested[i]+=withdrawal[i];}
  const factor=arr(N);let limitedDonors=0,minFactor=1;
  for(let i=0;i<N;i++) {
    factor[i]=requested[i]>V[i]?V[i]/requested[i]:1;
    if(factor[i]<1&&requested[i]>1e-16){limitedDonors++;minFactor=Math.min(minFactor,factor[i]);}
    // SWE positivity is a timestep condition; no post-solve scaling of momentum fluxes.
    if(model==='swe'&&requested[i]-withdrawal[i]>V[i]+1e-12)throw Error('SWE outgoing budget: reject dt');
  }
  const nextV=Float64Array.from(V),nextMx=Float64Array.from(mx),nextMy=Float64Array.from(my),acceptedQ=arr(E),exchanges=arr(E);
  for(const f of faces) {
    const {a,b,id}=f;
    if(f.open) {
      const donor=flux[id]>=0?a:b;
      acceptedQ[id]=flux[id]*(model==='li'?factor[donor]:1);
      const dV=acceptedQ[id]*dx*dt;exchanges[id]=dV;nextV[a]-=dV;nextV[b]+=dV;
    }
    if(model==='swe') {
      if(a>=0&&!solid[a]){nextMx[a]-=dt/dx*ax[id];nextMy[a]-=dt/dx*ay[id];}
      if(b>=0&&!solid[b]){nextMx[b]+=dt/dx*bx[id];nextMy[b]+=dt/dx*by[id];}
    }
  }
  let collected=state.collected;
  const withdrawals=arr(N);
  for(const i of withdrawCells) {
    // SWE local sink is an explicit later operator, debiting available post-flux stock
    // and proportionate momentum; LI withdrawal competes in the same old donor budget.
    const take=model==='li'?withdrawal[i]*factor[i]:Math.min(withdrawal[i],Math.max(0,nextV[i]));
    const ratio=nextV[i]>0?(nextV[i]-take)/nextV[i]:0;
    nextV[i]-=take;nextMx[i]*=ratio;nextMy[i]*=ratio;collected+=take;withdrawals[i]=take;
  }
  let maxFr=0,wet=0,frAboveHalf=0,frAboveOne=0,maxGradient=0,minDepth=Infinity;
  for(let i=0;i<N;i++) {
    if(nextV[i]<-1e-12||!Number.isFinite(nextV[i]))throw Error(`inadmissible V ${i}: ${nextV[i]}`);
    const depth=nextV[i]/area;minDepth=Math.min(minDepth,depth);
    if(model==='swe'&&depth>0) {
      const speed=Math.hypot(nextMx[i],nextMy[i])/Math.max(depth,1e-12);
      const drag=1+dt*G*state.roughness**2*speed/Math.max(depth,1e-12)**(4/3);
      nextMx[i]/=drag;nextMy[i]/=drag;
    }
    if(model==='swe'&&depth<=0&&(nextMx[i]!==0||nextMy[i]!==0))throw Error('dry momentum');
  }
  for(const f of faces)if(f.open) {
    const hf=Math.max(0,Math.max(z[f.a]+h[f.a],z[f.b]+h[f.b])-Math.max(z[f.a],z[f.b]));
    if(hf>=.01) { // exclude vanishing film from advertised distribution; max film below is separate
      const qt=f.transverse.reduce((s,j)=>s+(j>=0?acceptedQ[j]:0),0)/4;
      const fr=Math.hypot(acceptedQ[f.id],qt)/(hf*Math.sqrt(G*hf));
      maxFr=Math.max(maxFr,fr);wet++;if(fr>.5)frAboveHalf++;if(fr>1)frAboveOne++;
      maxGradient=Math.max(maxGradient,Math.abs(z[f.a]+h[f.a]-z[f.b]-h[f.b])/dx);
    }
  }
  return {state:{...state,V:nextV,q:acceptedQ,mx:nextMx,my:nextMy,time:state.time+dt,stepCount:state.stepCount+1,collected},
    interval:{start:state.time,end:state.time+dt,dt,geometryRevision:geom.revision},exchanges,withdrawals,
    diagnostics:{limitedDonors,minFactor,maxFr,wetFaces:wet,frAboveHalf,frAboveOne,maxGradient,minDepth}};
}
export function metrics(s) {
  const volumes={reservoir:0,reach:0,diversion:0,pond:0,user:0};const keys={1:'reservoir',2:'reach',3:'diversion',4:'pond',6:'user'};
  for(let i=0;i<s.V.length;i++)if(keys[s.geom.region[i]])volumes[keys[s.geom.region[i]]]+=s.V[i];
  return {time:s.time,...volumes,collected:s.collected,total:sum(s.V),balanceError:sum(s.V)+s.collected-s.initialVolume};
}
