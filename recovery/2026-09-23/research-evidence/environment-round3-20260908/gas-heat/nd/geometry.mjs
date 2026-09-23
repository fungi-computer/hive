// One rectilinear metric/topology owner for 2-D reference sections and 3-D cells.
// World y is vertical. No quantities are created when this geometry is built.
export const WORLD_AXES=['x','y','z'];
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const product=a=>a.reduce((p,x)=>p*x,1);
const key=a=>a.join(',');
const flat=(p,size)=>p.reduceRight((n,x,a)=>n*size[a]+x,0);
function coordinates(i,size){return size.map(n=>{const x=i%n;i=Math.floor(i/n);return x;});}

export function geometry({size,spacing,extrusion=1,axes=size?.length===2?['x','y']:WORLD_AXES,
  origin=[0,0,0],domainId='isolated-study',revision=0,periodic=size?.map(()=>false),
  open=[],solid=[],walls=[],viscosity=1.5e-5,thermalDiffusivity=2.2e-5,
  tracerDiffusivity=1e-5,buoyancy=true}){
  require(Array.isArray(size)&&[2,3].includes(size.length)&&size.every(n=>Number.isSafeInteger(n)&&n>=2),'2-D/3-D bounded grid');
  const dimensions=size.length,n=product(size);
  require(Number.isSafeInteger(n)&&n<=32768,'32768-cell research geometry budget');
  require(Array.isArray(spacing)&&spacing.length===dimensions&&spacing.every(h=>Number.isFinite(h)&&h>0),'positive directional spacings');
  require(Array.isArray(axes)&&axes.length===dimensions&&new Set(axes).size===dimensions&&axes.includes('y')&&axes.every(a=>WORLD_AXES.includes(a)),'unique world axes including vertical y');
  require(dimensions===2||axes.every((a,i)=>a===WORLD_AXES[i]),'3-D axis order is world x/y/z');
  require(Number.isFinite(extrusion)&&extrusion>0&&(dimensions===2||extrusion===1),'extrusion applies only to a 2-D reference');
  require(Array.isArray(origin)&&origin.length===3&&origin.every(Number.isSafeInteger),'signed global voxel origin');
  for(let a=0;a<3;a++){
    const d=axes.indexOf(WORLD_AXES[a]),extent=d<0?1:size[d];
    require(Number.isSafeInteger(origin[a]+extent),'safe global cell/face extent');
  }
  require(typeof domainId==='string'&&domainId.trim().length>0,'nonempty numerical domain');
  require(Number.isSafeInteger(revision)&&revision>=0,'geometry revision');
  require(Array.isArray(periodic)&&periodic.length===dimensions&&periodic.every(x=>typeof x==='boolean'),'periodic axis flags');
  require([viscosity,thermalDiffusivity,tracerDiffusivity].every(x=>Number.isFinite(x)&&x>=0)&&typeof buoyancy==='boolean','finite coefficients');
  require(Array.isArray(solid)&&solid.every(i=>Number.isSafeInteger(i)&&i>=0&&i<n),'solid cell index');
  require(Array.isArray(open)&&open.every(x=>typeof x==='string')&&Array.isArray(walls)&&walls.every(x=>typeof x==='string'),'boundary lists');
  size=[...size];spacing=[...spacing];axes=[...axes];origin=[...origin];periodic=[...periodic];
  open=[...open];solid=[...solid];walls=[...walls];
  const volume=product(spacing)*extrusion,area=spacing.map(h=>volume/h);
  require([volume,...area,...spacing.map(h=>h*h),...spacing.map(h=>1/(h*h))].every(x=>Number.isFinite(x)&&x>0),'representable metric');
  const metric=Object.freeze({spacing:Object.freeze([...spacing]),extrusion,volume,area:Object.freeze(area)});
  const openings=new Set(open),wallSet=new Set(walls),solidSet=new Set(solid);
  for(const side of openings){const axis=axes.indexOf(side.slice(0,-1));require(axis>=0&&['-','+'].includes(side.at(-1))&&!periodic[axis],'known nonperiodic open side');}
  const fluid=Int8Array.from({length:n},(_,i)=>!solidSet.has(i));
  const worldSpacing=WORLD_AXES.map(name=>axes.includes(name)?spacing[axes.indexOf(name)]:extrusion);
  const toWorld=p=>WORLD_AXES.map((name,i)=>origin[i]+(axes.includes(name)?p[axes.indexOf(name)]:0));
  const cells=Array.from({length:n},(_,i)=>{
    const at=coordinates(i,size),world=toWorld(at);
    return {i,at,world,id:`cell:${key(world)}`,center:world.map((v,a)=>(v+.5)*worldSpacing[a]),fluid:!!fluid[i]};
  });
  const faces=[],lookup=Array.from({length:dimensions},()=>new Map()),seenWalls=new Set();
  for(let axis=0;axis<dimensions;axis++){
    const limits=size.map((n,a)=>n+(a===axis?1:0));
    for(let index=0;index<product(limits);index++){
      const at=coordinates(index,limits);
      if(periodic[axis]&&at[axis]===size[axis])continue;
      const left=[...at],right=[...at];left[axis]--;
      if(periodic[axis]&&left[axis]<0)left[axis]=size[axis]-1;
      const i=left[axis]<0?-1:flat(left,size),j=right[axis]>=size[axis]?-1:flat(right,size);
      const boundary=i<0?`${axes[axis]}-`:j<0?`${axes[axis]}+`:null;
      const world=toWorld(at),id=`${axes[axis]}:${key(world)}`;
      if(wallSet.has(id)){seenWalls.add(id);continue;}
      if((i>=0&&!fluid[i])||(j>=0&&!fluid[j])||(boundary&&!openings.has(boundary)))continue;
      const f={k:faces.length,id,axis,at,world,i,j,area:area[axis],distance:spacing[axis]/(boundary?2:1),boundary};
      f.center=world.map((v,a)=>(v+(WORLD_AXES[a]===axes[axis]?0:.5))*worldSpacing[a]);
      faces.push(f);lookup[axis].set(key(at),f.k);
    }
  }
  require([...wallSet].every(id=>seenWalls.has(id)),'wall names a canonical grid face');
  function faceIndex(axis,position){
    const at=[...position];
    for(let d=0;d<dimensions;d++){
      if(periodic[d])at[d]=((at[d]%size[d])+size[d])%size[d];
      if(at[d]<0||at[d]>size[d]-(d===axis?0:1))return -1;
    }
    return lookup[axis].get(key(at))??-1;
  }
  function outsideOpen(axis,at){
    return at.some((p,d)=>(p<0&&openings.has(`${axes[d]}-`))||
      (p>size[d]-(axis===d?0:1)&&openings.has(`${axes[d]}+`)));
  }
  function neighbor(f,d,sign){
    const at=[...f.at];at[d]+=sign;const index=faceIndex(f.axis,at);
    if(index<0)return {index:-1,other:0,center:outsideOpen(f.axis,at)?1:d===f.axis?0:-1};
    if(d===f.axis)return {index,other:1,center:0};
    const crossing=[...f.at];crossing[d]+=sign>0?1:0;
    const a=[...crossing],b=[...crossing];a[f.axis]--;
    const fraction=((faceIndex(d,a)>=0?1:0)+(faceIndex(d,b)>=0?1:0))/2;
    return {index,other:fraction,center:-(1-fraction)};
  }
  const stencil=faces.map(f=>Array.from({length:dimensions},(_,d)=>[neighbor(f,d,-1),neighbor(f,d,1)]));
  const cross=faces.map(f=>Array.from({length:dimensions},(_,d)=>{
    if(d===f.axis)return [f.k];
    const ids=[];for(const alongOwn of [-1,0])for(const alongOther of [0,1]){
      const at=[...f.at];at[f.axis]+=alongOwn;at[d]+=alongOther;ids.push(faceIndex(d,at));
    }
    return ids;
  }));
  const adjacency=Array.from({length:n},()=>[]),external=new Set(),diagonal=new Float64Array(n);
  for(const f of faces){
    const weight=f.area/f.distance;
    if(f.i>=0)diagonal[f.i]+=weight;if(f.j>=0)diagonal[f.j]+=weight;
    if(f.i>=0&&f.j>=0){adjacency[f.i].push(f.j);adjacency[f.j].push(f.i);}else external.add(Math.max(f.i,f.j));
  }
  const seen=new Set(),pins=new Set();
  for(let i=0;i<n;i++){
    if(!fluid[i]||seen.has(i))continue;
    const stack=[i],component=[];let hasOutside=false;
    while(stack.length){const j=stack.pop();if(seen.has(j))continue;seen.add(j);component.push(j);hasOutside||=external.has(j);stack.push(...adjacency[j]);}
    if(!hasOutside)pins.add(Math.min(...component));
  }
  const fixed=Int8Array.from({length:n},(_,i)=>!fluid[i]||pins.has(i));
  for(let i=0;i<n;i++)if(fixed[i])diagonal[i]=1;
  const descriptor={version:'mac-boussinesq-nd-v1',domainId,revision,size:[...size],axes:[...axes],origin:[...origin],
    metric,periodic:[...periodic],open:[...openings].sort(),solid:[...solidSet].sort((a,b)=>a-b),walls:[...wallSet].sort(),
    viscosity,thermalDiffusivity,tracerDiffusivity,buoyancy,
    faces:faces.map(f=>[f.id,f.i,f.j,f.area,f.distance])};
  return Object.freeze({...descriptor,identity:JSON.stringify(descriptor),dimensions,n,volume,verticalAxis:axes.indexOf('y'),
    cells,faces,fluid,fixed,diagonal,stencil,cross});
}
