// Disposable geometry query over canonical world.read. No terrain or gas save.
import{MATERIAL}from'../../worldgen/volume-v2/voxel-world.mjs';
import{geometry}from'../transport-v2/checkpoint/geometry.mjs';
import{advance}from'../transport-v2/checkpoint/solver.mjs';
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):
  Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const json=value=>JSON.stringify(canonical(value));
const domain=(identity,origin,size)=>json({kind:'voxel-gas-window-v1',identity,origin,size,axes:['x','y','z'],boundary:'explicitly-sealed-window'});
function descriptor(world){const d=world.describe(),u=d.identity?.base?.units;
  require(u?.horizontalMetres===1&&u?.verticalMetres===.54,'qualified voxel metric required');
  require(Number.isSafeInteger(d.revision)&&d.revision>=0,'canonical world revision');return d;}
export function compileVoxelGas(world,{origin,size}){
  require(Array.isArray(origin)&&origin.length===3&&origin.every(Number.isSafeInteger),'signed global window origin');
  require(Array.isArray(size)&&size.length===3&&size.every(n=>Number.isSafeInteger(n)&&n>=2)&&size.reduce((n,x)=>n*x,1)<=512,'bounded 3D window');
  origin=[...origin];size=[...size];const before=descriptor(world),bounds=before.identity.base.bounds;
  for(const [d,axis]of['X','Y','Z'].entries())require(Number.isSafeInteger(origin[d]+size[d])&&origin[d]>=bounds['min'+axis]&&origin[d]+size[d]<=bounds['max'+axis],'window outside declared world bounds');
  const solid=[];let pointReads=0;
  // Solver order is x-fastest, y-next, z-last. World brick order is different.
  for(let z=0;z<size[2];z++)for(let y=0;y<size[1];y++)for(let x=0;x<size[0];x++){
    const material=world.read({x:origin[0]+x,y:origin[1]+y,z:origin[2]+z});pointReads++;
    require([MATERIAL.air,MATERIAL.soil,MATERIAL.stone].includes(material),'unsupported canonical solid material');
    if(material!==MATERIAL.air)solid.push(x+size[0]*(y+size[1]*z));
  }
  const after=descriptor(world);require(after.revision===before.revision&&json(after.identity)===json(before.identity),'world changed during geometry query');
  const g=geometry({size,origin,spacing:[1,.54,1],axes:['x','y','z'],solid,open:[],periodic:[false,false,false],
    domainId:domain(before.identity,origin,size),revision:before.revision});
  return Object.freeze({geometry:g,pointReads,boundary:'explicitly-sealed-window',occupancyMeaning:'solid versus void; gas fill is a separate initial condition'});
}
export function assertVoxelGasCurrent(world,compiled){
  const d=descriptor(world),g=compiled.geometry;
  require(d.revision===g.revision&&domain(d.identity,g.origin,g.size)===g.domainId,'stale or foreign voxel gas binding');
}
export function advanceBound(world,compiled,input,interval,options){
  assertVoxelGasCurrent(world,compiled);const result=advance(compiled.geometry,input,interval,options);
  // The present world/solver call is synchronous; also fence result admission.
  assertVoxelGasCurrent(world,compiled);return result;
}
