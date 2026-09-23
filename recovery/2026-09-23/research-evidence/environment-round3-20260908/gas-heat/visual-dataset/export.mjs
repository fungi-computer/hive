import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{geometry}from'../transport-v2/checkpoint/geometry.mjs';
import{initial,advance,validate,diagnostics,RHO,CP,TREF}from'../transport-v2/checkpoint/solver.mjs';
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const sum=a=>a.reduce((s,x)=>s+x,0),max=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const sha=b=>createHash('sha256').update(b).digest('hex');
const started=performance.now(),cpuStart=process.cpuUsage(),caseSummaries=[];
const files=['../transport-v2/checkpoint/geometry.mjs','../transport-v2/checkpoint/solver.mjs','../transport-v2/checkpoint/transport.mjs','../transport-v2/checkpoint/physics.mjs','export.mjs','CONTRACT.md'];
const sourcePins=files.map(path=>({path,sha256:sha(readFileSync(new URL(path,import.meta.url)))}));
const config={size:[8,10,6],spacing:[1,.54,1],origin:[-4,0,-3],sampleSeconds:1,durationSeconds:45,dtMaxSeconds:.1,
  source:{localCell:[2,1,2],heatWatts:60,tracerKgPerSecond:1e-5,startsAt:0,endsAt:20},
  ports:[{localCell:[0,2,2],side:'x-',areaM2:.54},{localCell:[7,7,3],side:'x+',areaM2:.54}]};
const index=([x,y,z])=>x+config.size[0]*(y+config.size[1]*z);
const budget=()=>require(performance.now()-started<30000,'30-second total visual-data budget');
function geometryFor(name){const solid=[],ports=name==='ports'?new Set(config.ports.map(p=>index(p.localCell))):new Set();
  for(let z=0;z<6;z++)for(let y=0;y<10;y++)for(let x=0;x<8;x++)if((x===0||x===7||y===0||y===9||z===0||z===5)&&!ports.has(index([x,y,z])))solid.push(index([x,y,z]));
  return geometry({size:config.size,spacing:config.spacing,origin:config.origin,solid,open:name==='ports'?['x-','x+']:[],
    domainId:JSON.stringify({fixture:'exploratory-buoyant-box-v1',case:name,config}),revision:0});
}
function observation(g,s,target,interval){
  validate(g,s);require(s.time===target,'exact recorded simulation clock');
  const expectedSeconds=Math.min(target,20),expectedTracer=expectedSeconds*config.source.tracerKgPerSecond,expectedHeat=expectedSeconds*config.source.heatWatts;
  require(Math.abs(s.smokeSource-expectedTracer)<1e-12&&Math.abs(s.heatSource-expectedHeat)<1e-7,'admitted source event integral');
  require(s.smoke.every((m,i)=>Number.isFinite(m)&&m>=0&&(g.fluid[i]||(m===0&&s.heat[i]===0)))&&s.heat.every(Number.isFinite)&&s.velocity.every(Number.isFinite),'finite field/unchanged solid');
  const temps=s.heat.filter((_,i)=>g.fluid[i]).map(h=>TREF+h/(RHO*CP*g.volume)),maxKelvin=Math.max(...temps),minKelvin=Math.min(...temps);
  const temperatureRatio=Math.max(Math.abs(maxKelvin-TREF),Math.abs(minKelvin-TREF))/TREF;
  require(minKelvin>0&&temperatureRatio<=.05,'temperature/Boussinesq visual screen');
  const massError=Math.abs(sum(s.smoke)+s.smokeBoundary-s.smokeSource-s.initialSmoke),heatError=Math.abs(sum(s.heat)+s.heatBoundary-s.heatSource-s.initialHeat);
  require(massError<1e-10&&heatError<1e-5,'sample material ledger');
  return{timeSeconds:s.time,acceptedSteps:s.steps,heatJ:Array.from(s.heat),tracerKg:Array.from(s.smoke),faceVelocityMS:Array.from(s.velocity),
    ledger:{initialTracerKg:s.initialSmoke,initialHeatJ:s.initialHeat,tracerSourceKg:s.smokeSource,heatSourceJ:s.heatSource,
      tracerBoundaryKg:s.smokeBoundary,heatBoundaryJ:s.heatBoundary,airImportM3:s.airImport,airExportM3:s.airExport},
    measurements:{minKelvin,maxKelvin,temperatureRatio,maxFaceSpeedMS:max(s.velocity),massErrorKg:massError,heatErrorJ:heatError,
      maxCellFluxImbalanceM3S:interval?.maxDivergence??0,maxScalarStageCoefficient:interval?.maxCourant??0,
      maxMomentumCourant:interval?.maxMomentumCourant??0,rejectedIntervals:interval?.rejected??0}};
}
function geometryData(g){return{identity:g.identity,domainId:g.domainId,revision:g.revision,size:g.size,axes:g.axes,origin:g.origin,metric:g.metric,
  solidCellIndices:g.solid,openSides:g.open,periodic:g.periodic,cellCount:g.n,fluidCellCount:g.fluid.reduce((n,x)=>n+x,0),
  cells:g.cells,faces:g.faces,coefficients:{viscosityM2S:g.viscosity,thermalDiffusivityM2S:g.thermalDiffusivity,tracerDiffusivityM2S:g.tracerDiffusivity,buoyancy:g.buoyancy}};}
function runCase(name){budget();const start=performance.now(),cpu=process.cpuUsage(),g=geometryFor(name),frames=[],sourceCell=index(config.source.localCell);
  require(g.fluid[sourceCell],'source must occupy declared air');
  const exterior=g.faces.filter(f=>f.boundary);
  require(name==='sealed'?exterior.length===0:exterior.length===2&&exterior.every(f=>f.area===.54),'exact explicit openings');
  const result={format:'gas-visual-recording-v1',execution:'recorded-native-node-solver',case:name,status:'incomplete',
    label:name==='sealed'?'Exploratory sealed buoyant box':'Exploratory box with two prescribed ambient openings',
    claims:{liveBrowserSimulation:false,ventilationAccuracy:false,ambientExteriorSolved:false,oxygen:false,combustion:false},
    units:{coordinates:'metres',spacing:'metres',cellVolume:'m3',faceArea:'m2',faceDistance:'metres',time:'simulation seconds',heatJ:'J per cell anomaly from Tref',tracerKg:'kg per cell',faceVelocityMS:'metres per second'},
    constants:{rhoKgM3:RHO,cpJKgK:CP,referenceKelvin:TREF},algorithmVersion:initial(g).version,sourcePins,
    config:{...config,activePorts:name==='ports'?config.ports:[],sourceCellIndex:sourceCell},
    ambient:{pressureAnomalyPa:0,temperatureKelvin:TREF,tracerKgM3:0,domainSolved:false},
    pressureCriteria:{linearResidualStopM3S:1e-11,cellFluxImbalanceCapM3S:1e-8,iterationCapPerSolve:6*g.n+100},geometry:geometryData(g),frames};
  let state=initial(g),failure;
  try{
    const before=JSON.stringify(state);frames.push(observation(g,state,0));require(JSON.stringify(state)===before,'observation advanced initial state');
    for(let target=1;target<=45;target++){
      budget();const r=advance(g,state,target-state.time,{dtMax:.1,events:[20],forcingAt:time=>time<20?{sources:[{cell:sourceCell,smokeKgS:1e-5,heatJS:60}]}:{}});
      state=r.state;const snapshot=JSON.stringify(state);frames.push(observation(g,state,target,r));require(JSON.stringify(state)===snapshot,'emission mutated state/clock');
    }
    budget();result.status='complete';
  }catch(error){result.failure=error.message;failure=error;}
  finally{
    const used=process.cpuUsage(cpu),stats=frames.map(f=>f.measurements);
    result.measurements={wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000,samples:frames.length,
      recordedThroughSeconds:state.time,maxKelvin:Math.max(...stats.map(s=>s.maxKelvin)),minKelvin:Math.min(...stats.map(s=>s.minKelvin)),
      maxTemperatureRatio:Math.max(...stats.map(s=>s.temperatureRatio)),maxFaceSpeedMS:Math.max(...stats.map(s=>s.maxFaceSpeedMS)),
      maxCellFluxImbalanceM3S:Math.max(...stats.map(s=>s.maxCellFluxImbalanceM3S)),maxMassErrorKg:Math.max(...stats.map(s=>s.massErrorKg)),
      maxHeatErrorJ:Math.max(...stats.map(s=>s.heatErrorJ)),sourceCutoffIsSimulationEvent:true,observationMutatesState:false,...diagnostics(g)};
    const filename=name+'.json',bytes=JSON.stringify(result)+'\n';writeFileSync(new URL(filename,import.meta.url),bytes);
    caseSummaries.push({case:name,file:filename,status:result.status,sha256:sha(bytes),bytes:Buffer.byteLength(bytes),...result.measurements,...(result.failure?{failure:result.failure}:{})});
  }
  if(failure)throw failure;
}
let failure;
try{runCase('sealed');runCase('ports');}catch(error){failure=error;}
finally{const cpu=process.cpuUsage(cpuStart),manifest={format:'gas-visual-recording-index-v1',execution:'recorded-native-node-solver',status:failure?'incomplete':'complete',
  ...(failure?{failure:failure.message}:{}),sourcePins,config,wallMs:performance.now()-started,cpuMs:(cpu.user+cpu.system)/1000,rssBytes:process.memoryUsage().rss,cases:caseSummaries};
  writeFileSync(new URL('manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));}
if(failure)throw failure;
