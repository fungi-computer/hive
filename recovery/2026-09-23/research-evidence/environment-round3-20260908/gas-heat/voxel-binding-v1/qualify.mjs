import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{isDeepStrictEqual}from'node:util';
import{worldIdentity,createVoxelWorld,MATERIAL}from'../../worldgen/volume-v2/voxel-world.mjs';
import{createWorldSpec,sampleCell,floorDiv,mod}from'../../worldgen/height-sea/terrain.js';
import{initial,validate,diagnostics,RHO,CP,TREF}from'../transport-v2/checkpoint/solver.mjs';
import{compileVoxelGas,assertVoxelGasCurrent,advanceBound}from'./binding.mjs';
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const sum=a=>a.reduce((s,x)=>s+x,0),max=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const sha=b=>createHash('sha256').update(b).digest('hex');
const started=performance.now(),cpuStart=process.cpuUsage(),rows=[];
const budget=()=>require(performance.now()-started<30000,'30-second voxel/gas proof budget');
function check(name,fn){budget();const t=performance.now();try{rows.push({name,status:'pass',...fn(),wallMs:performance.now()-t});}catch(error){rows.push({name,status:'fail',error:error.message,wallMs:performance.now()-t});throw error;}}
const workDelta=(before,after)=>({coldGeneratedBricks:after.generatedBricks-before.generatedBricks,
  decodedBaseCells:(after.generatedBricks-before.generatedBricks)*4096,heightColumnSamples:after.heightSamples-before.heightSamples,
  caveMetricEvaluations:after.caveMetricEvaluations-before.caveMetricEvaluations,evictions:after.evictions-before.evictions,
  residentBricks:after.residentBricks,residentBytes:after.residentBytes,changedCells:after.changedCells});
const identity=worldIdentity({worldId:'volume-v2-fixed-world',spaceId:'surface',seed:'volume-v2-fixed-cave-pocket-v1'});
const world=createVoxelWorld(identity,{maxResidentBricks:2}),window={origin:[16,-50,-66],size:[8,8,8]},sourceAt={x:19,y:-47,z:-62};
let compiled,state,finalState,worldCheckpoint,gasSave;
try{
  check('actual generated cave pocket and 3D point-read geometry',()=>{
    const before=world.stats();compiled=compileVoxelGas(world,window);const compileWork=workDelta(before,world.stats()),g=compiled.geometry;
    require(compiled.pointReads===512&&g.n===512&&g.volume===.54&&g.axes.join(',')==='x,y,z','cell metric/count');
    require(g.faces.every(f=>f.i>=0&&f.j>=0),'chunk/window edges silently opened');
    let pocketAir=0;for(let z=-64;z<=-62;z++)for(let y=-48;y<=-45;y++)for(let x=18;x<=20;x++){
      require(world.read({x,y,z})===MATERIAL.air,'retained generated pocket changed');pocketAir++;}
    const spec=createWorldSpec({seed:identity.base.heightSeed});require(sampleCell(spec,19,-62).bedLevel-4>=-45,'pocket is not below protected cap');
    const mapping=[];for(const c of g.cells){const [x,y,z]=c.world;require(c.fluid===(world.read({x,y,z})===MATERIAL.air),'point material mapping');
      require(c.i===c.at[0]+8*(c.at[1]+8*c.at[2]),'gas index order');
      require(c.center.every((v,d)=>Math.abs(v-(c.world[d]+.5)*[1,.54,1][d])<1e-12),'physical cell center');}
    for(const f of g.faces){require(f.id===`${g.axes[f.axis]}:${f.world.join(',')}`,'global face identity');
      require(f.area===[.54,1,.54][f.axis]&&f.distance===[1,.54,1][f.axis],'directional face metric');}
    for(const at of[{x:18,y:-48,z:-64},{x:19,y:-47,z:-62},{x:16,y:-49,z:-65}]){
      const b=world.readBrick({x:floorDiv(at.x,16),y:floorDiv(at.y,16),z:floorDiv(at.z,16)}),bi=(mod(at.y,16)*16+mod(at.z,16))*16+mod(at.x,16);
      require(b.material[bi]===world.read(at),'brick/point correspondence');mapping.push({at,brick:b.key,brickIndex:bi,material:b.material[bi]});}
    window.origin[0]=999;window.size[0]=99;require(g.origin[0]===16&&g.size[0]===8,'caller window aliases geometry');
    const domain=JSON.parse(g.domainId);require(isDeepStrictEqual(domain.identity,identity),'full world/realm/recipe binding');
    return{compiledPointReads:compiled.pointReads,compileWork,pocketAir,fluidCells:g.fluid.reduce((n,x)=>n+x,0),faces:g.faces.length,
      implicitInitialReferenceAirKg:g.fluid.reduce((n,x)=>n+x,0)*g.volume*RHO,sealedWindow:true,mapping,geometryIdentitySha256:sha(g.identity)};
  });
  check('negative x/z zero and negative y brick boundaries',()=>{
    const negative=createVoxelWorld(identity,{maxResidentBricks:8}),before=negative.stats(),c=compileVoxelGas(negative,{origin:[-2,-18,-2],size:[4,4,4]}),after=negative.stats();
    const points=c.geometry.cells.filter(p=>[-1,0].includes(p.world[0])&&[-17,-16].includes(p.world[1])&&[-1,0].includes(p.world[2]));
    require(points.length===8,'negative boundary points');
    for(const p of points){const[x,y,z]=p.world,b=negative.readBrick({x:floorDiv(x,16),y:floorDiv(y,16),z:floorDiv(z,16)});
      require(p.fluid===(b.material[(mod(y,16)*16+mod(z,16))*16+mod(x,16)]===MATERIAL.air),'negative brick mapping');
      require(p.center.every((v,d)=>v===(p.world[d]+.5)*[1,.54,1][d]),'negative center');}
    return{pointReads:c.pointReads,work:workDelta(before,after),boundaryPoints:points.map(p=>({world:p.world,center:p.center,fluid:p.fluid}))};
  });
  check('brick eviction is not a world or gas revision',()=>{
    const before=world.stats(),identityBefore=compiled.geometry.identity;world.evictAll();assertVoxelGasCurrent(world,compiled);
    const again=compileVoxelGas(world,{origin:[16,-50,-66],size:[8,8,8]});require(again.geometry.identity===identityBefore,'eviction changed geometry/domain');
    require(world.save().changes.length===0&&world.describe().revision===0,'cache residency created saved terrain');
    return{work:workDelta(before,world.stats()),geometryExact:true,worldRevision:world.describe().revision,terrainOverrides:0};
  });
  check('nonzero gas step, source conservation and same-domain world/gas reload',()=>{
    const g=compiled.geometry,source=g.cells.find(c=>c.world[0]===sourceAt.x&&c.world[1]===sourceAt.y&&c.world[2]===sourceAt.z);
    require(source?.fluid&&source.i===283,'actual source cell gas order');state=initial(g);const options={dtMax:.05,forcingAt:()=>({sources:[{cell:source.i,heatJS:30,smokeKgS:1e-5}]})};
    const half=advanceBound(world,compiled,state,1,options);worldCheckpoint=world.save();gasSave=JSON.parse(JSON.stringify(half.state));
    writeFileSync(new URL('world-checkpoint.json',import.meta.url),JSON.stringify(worldCheckpoint,null,2)+'\n');
    writeFileSync(new URL('gas-state.json',import.meta.url),JSON.stringify(gasSave)+'\n');
    const restoredWorld=createVoxelWorld(identity,{checkpoint:JSON.parse(readFileSync(new URL('world-checkpoint.json',import.meta.url))),maxResidentBricks:2});
    const restored=compileVoxelGas(restoredWorld,{origin:[16,-50,-66],size:[8,8,8]});
    const a=advanceBound(world,compiled,half.state,1,options),b=advanceBound(restoredWorld,restored,JSON.parse(readFileSync(new URL('gas-state.json',import.meta.url))),1,options);
    require(JSON.stringify(a)===JSON.stringify(b),'exact same-domain continuation');finalState=a.state;validate(g,finalState);
    const massError=Math.abs(sum(finalState.smoke)-finalState.smokeSource),heatError=Math.abs(sum(finalState.heat)-finalState.heatSource),speed=max(finalState.velocity);
    require(finalState.time===2&&finalState.smokeSource>0&&finalState.heatSource>0&&speed>1e-8,'zero fake simulation');
    require(Math.abs(finalState.smokeSource-2e-5)<1e-12&&Math.abs(finalState.heatSource-60)<1e-8&&massError<1e-10&&heatError<1e-5,'gas stock/source laws');
    require(finalState.smoke.every((m,i)=>g.fluid[i]||m===0)&&finalState.heat.every((h,i)=>g.fluid[i]||h===0),'solid stock changed');
    return{source:sourceAt,sourceIndex:source.i,seconds:finalState.time,maxFaceSpeedMS:speed,maxKelvin:TREF+Math.max(...finalState.heat)/(RHO*CP*g.volume),
      tracerSourceKg:finalState.smokeSource,heatSourceJ:finalState.heatSource,massErrorKg:massError,heatErrorJ:heatError,
      maxCellFluxImbalanceM3S:Math.max(half.maxDivergence,a.maxDivergence),exactReload:true,checkpointChanges:worldCheckpoint.changes.length,...diagnostics(g)};
  });
  check('foreign world and realm reject without a gas call',()=>{
    const prior=JSON.stringify(finalState),before=diagnostics(compiled.geometry),rejections=[];
    for(const change of[{worldId:'other-world'},{spaceId:'other-realm'}]){const id=worldIdentity({worldId:identity.worldId,spaceId:identity.spaceId,seed:identity.base.heightSeed,...change}),foreign=createVoxelWorld(id);
      let rejected=false;try{advanceBound(foreign,compiled,finalState,.1);}catch(error){rejected=error.message.includes('foreign');rejections.push({change,error:error.message});}require(rejected,'foreign domain admitted');}
    require(JSON.stringify(finalState)===prior&&diagnostics(compiled.geometry).pressureSolves===before.pressureSolves,'foreign rejection ran gas');return{rejections,stateUntouched:true,solverCallsAdded:0};
  });
  check('fill then reopen voxel: reject before steps, preserve quantities, no remap',()=>{
    const g=compiled.geometry,prior=JSON.stringify(finalState),before=diagnostics(g),sourceIndex=283,transposedIndex=227;
    require(finalState.heat[sourceIndex]>0&&finalState.smoke[sourceIndex]>0,'edited cell has no stock');
    const fill=world.edit({expectedRevision:0,cells:[{...sourceAt,expectedMaterial:MATERIAL.air,material:MATERIAL.stone}]});require(fill.ok&&fill.revision===1,'atomic fill');
    let stale=false;try{advanceBound(world,compiled,finalState,.1);}catch(error){stale=error.message.includes('stale');}require(stale,'stale world stepped');
    const rebuilt=compileVoxelGas(world,{origin:[16,-50,-66],size:[8,8,8]});require(!rebuilt.geometry.fluid[sourceIndex]&&rebuilt.geometry.fluid[transposedIndex],'solid source index was transposed');
    const brick=world.readBrick({x:1,y:-3,z:-4});require(brick.material[291]===MATERIAL.stone&&brick.material[531]===MATERIAL.air,'actual brick order not distinguished');
    let restoreRejected=false;try{validate(rebuilt.geometry,finalState);}catch(error){restoreRejected=true;}require(restoreRejected,'old field transplanted after fill');
    const reopen=world.edit({expectedRevision:1,cells:[{...sourceAt,expectedMaterial:MATERIAL.stone,material:MATERIAL.air}]});require(reopen.ok&&reopen.revision===2,'atomic reopen');
    const sameShape=compileVoxelGas(world,{origin:[16,-50,-66],size:[8,8,8]});require(JSON.stringify(sameShape.geometry.solid)===JSON.stringify(g.solid),'reopen changed base geometry');
    let sameShapeRejected=false;try{advanceBound(world,sameShape,finalState,.1);}catch(error){sameShapeRejected=error.message.includes('identity');}require(sameShapeRejected,'same-shape stale state accepted');
    require(JSON.stringify(finalState)===prior&&diagnostics(g).pressureSolves===before.pressureSolves,'edit rejection mutated original gas');
    require(world.save().changes.length===0&&world.describe().revision===2,'base-equal overlay/revision distinction');
    writeFileSync(new URL('edit-receipts.json',import.meta.url),JSON.stringify({sourceAt,fill,reopen,gasRemapped:false,newGasInitialized:false},null,2)+'\n');
    return{fill,reopen,sourceGasIndex:sourceIndex,wrongAxisIndex:transposedIndex,brickIndex:291,wrongBrickAxisIndex:531,
      retainedSourceHeatJ:finalState.heat[sourceIndex],retainedSourceTracerKg:finalState.smoke[sourceIndex],staleRejected:stale,
      changedShapeRestoreRejected:restoreRejected,sameShapeNewRevisionRejected:sameShapeRejected,gasStateUntouched:true,newGasInitialized:false,solverCallsAdded:0};
  });
}finally{
  const paths=['binding.mjs','DECISION.md','qualify.mjs','../../worldgen/volume-v2/voxel-world.mjs','../../worldgen/height-sea/terrain.js',
    '../transport-v2/checkpoint/geometry.mjs','../transport-v2/checkpoint/solver.mjs','../transport-v2/checkpoint/transport.mjs','../transport-v2/checkpoint/physics.mjs'];
  const pins=paths.map(path=>({path,sha256:sha(readFileSync(new URL(path,import.meta.url)))})),cpu=process.cpuUsage(cpuStart);
  const result={pins,wallMs:performance.now()-started,cpuMs:(cpu.user+cpu.system)/1000,rssBytes:process.memoryUsage().rss,rows};
  writeFileSync(new URL(process.argv[2]??'qualification-v1.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
