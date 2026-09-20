#!/usr/bin/env node
/** Cold remote terrain loading proof. All camera movement uses real keys. */
import assert from "node:assert/strict";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium } from "playwright";
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
assert(args.get("--base-url")&&args.get("--output"),"--base-url URL --output DIR [--mode before|after] [--scenario stationary|pan|both]");
const output=resolve(args.get("--output")),mode=args.get("--mode")??"before",scenario=args.get("--scenario")??"both";
assert(["before","after"].includes(mode));assert(["stationary","pan","both"].includes(scenario));
const url=new URL("/engine/colony-performance.html",args.get("--base-url"));url.search="size=256&workers=8&diagnostics=draw";
await mkdir(output,{recursive:true});const driver=await readFile(new URL(import.meta.url));await writeFile(resolve(output,"driver.mjs"),driver);
const report={proof:"cold-terrain-loading",url:url.href,mode,startedAt:new Date().toISOString(),driverSha256:createHash("sha256").update(driver).digest("hex"),viewport:{width:1280,height:900},sampling:"35 terrain ray picks plus projected side-face polygon tests across visible canvas, excluding HUD footer. Useful ground means center plus at least nine hits. Complete visible means all35 samples; exact owner completeness recorded separately when exposed.",cases:[],success:false};
const save=()=>writeFile(resolve(output,"REPORT.json"),JSON.stringify(report,null,2)+"\n");
async function runCase(name){
 const result={name,milestones:{},samples:[],httpTerrain:[],wsFrames:[],wsRequests:[],wsCredits:[],wsCreditCount:0,wsCreditBytes:0,browserWorkers:[],errors:[],captureErrors:[],networkFailures:[],screenshots:[],success:false};report.cases.push(result);
 let browser,page;const pending=[];let navigationAt;
 const elapsed=()=>Date.now()-navigationAt;
 try{
  browser=await chromium.launch({channel:"chromium",executablePath:process.env.CHROMIUM_PATH,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--enable-gpu","--use-gl=angle","--use-angle=swiftshader"]});
  const browserCDP=await browser.newBrowserCDPSession(), system=await browserCDP.send("SystemInfo.getInfo");
  result.browserRendering={version:browser.version(),commandLine:system.commandLine,devices:system.gpu.devices,featureStatus:system.gpu.featureStatus};
  await browserCDP.detach();
  assert.equal(system.gpu.featureStatus.gpu_compositing,"enabled","rendered proof requires compositing; software canvas readback distorts loading");
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(120000);
  page.on("worker",worker=>result.browserWorkers.push(worker.url()));page.on("pageerror",error=>result.errors.push(error.message));page.on("crash",()=>result.errors.push("renderer crashed"));
  page.on("requestfailed",request=>result.networkFailures.push({atMs:elapsed(),path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
  const requests=new Map();page.on("request",request=>{if(new URL(request.url()).pathname.endsWith("/terrain")){const record={requestAtMs:elapsed(),method:request.method()};requests.set(request,record);result.httpTerrain.push(record);}});
  page.on("response",response=>{const record=requests.get(response.request());if(!record)return;record.headersAtMs=elapsed();record.status=response.status();pending.push(response.body().then(body=>{record.bodyAtMs=elapsed();record.bytes=body.byteLength;const reply=JSON.parse(body.toString());record.kind=reply.kind;record.chunks=reply.chunks?.length??0;record.surfaces=reply.chunks?.reduce((sum,chunk)=>sum+(chunk.surfaces?.length??0),0)??0;}).catch(error=>result.captureErrors.push({atMs:elapsed(),failure:response.request().failure(),message:error.message})));});
  page.on("websocket",socket=>{result.socketOrigin=new URL(socket.url()).origin;socket.on("framesent",frame=>{try{const value=JSON.parse(frame.payload.toString());if(value.type==="terrain-credit"){result.wsCreditCount++;result.wsCreditBytes+=Buffer.byteLength(frame.payload);if(result.wsCredits.length<2048)result.wsCredits.push({atMs:elapsed(),bytes:Buffer.byteLength(frame.payload),requestId:value.requestId,received:value.received});}if(value.type==="terrain-regions")result.wsRequests.push({atMs:elapsed(),bytes:Buffer.byteLength(frame.payload),request:value.request??value});}catch{}});socket.on("framereceived",frame=>{const payload=frame.payload,bytes=Buffer.byteLength(payload);let value;try{value=JSON.parse(payload.toString());}catch{}result.wsFrames.push({atMs:elapsed(),bytes,type:value?.type??value?.kind??null,keys:value&&typeof value==="object"?Object.keys(value):[],chunks:value?.chunks?.length??value?.reply?.chunks?.length??0,...(value?.type==="terrain-regions"?{terrain:{kind:value.event?.kind,requestId:value.event?.requestId,epoch:value.event?.epoch,terrainRevision:value.event?.terrainRevision,level:value.event?.level,key:value.event?.patch?.key,faces:value.event?.patch?.faces?.length??0,surfaces:value.event?.patch?.surfaces?.length??0}}:{})});});});
  await page.addInitScript(()=>{
   const clock={readyAt:null,visibleAt:null,paddedAt:null};
   Object.defineProperty(window,"__TERRAIN_PROOF_CLOCK",{value:clock});
   setInterval(()=>{const read=window.__HIVE_DRAW_DIAGNOSTICS;if(!read)return;const d=read(),c=d.spatialDraw?.coverage,now=performance.now();if(d.assetsReady&&d.runtimeReady)clock.readyAt??=now;if(c?.visibleRegions>0&&c.visibleComplete)clock.visibleAt??=now;if(c?.requestedRegions>0&&c.demandComplete&&!c.pending)clock.paddedAt??=now;},25);
  });
  navigationAt=Date.now();result.navigationAt=new Date(navigationAt).toISOString();await page.goto(url.href,{waitUntil:"domcontentloaded"});result.domContentLoadedMs=elapsed();
  let coldPanDone=false,groundPanDone=false;const deadline=Date.now()+240000;
  const screenshot=async(label)=>{const filename=`${name}-${label}.png`;await page.locator("canvas").first().screenshot({path:resolve(output,filename)});result.screenshots.push({filename,atMs:elapsed()});};
  const pan=async(label)=>{const before=await page.evaluate(()=>window.__HIVE_DRAW_DIAGNOSTICS().camera);await page.locator("canvas").first().focus();for(let i=0;i<12;i++)await page.keyboard.press("ArrowRight");const after=await page.evaluate(()=>window.__HIVE_DRAW_DIAGNOSTICS().camera);assert.equal(after.x-before.x,288);result.milestones[label]={atMs:elapsed(),before,after};console.log(JSON.stringify({case:name,stage:label,atMs:elapsed()}));};
  // Cold input is scheduled before the expensive picking/screenshot loop. Ground
  // may already have one useful patch; unfinished padded demand is still cold.
  if(name==="pan"&&mode==="after"){
   await page.waitForFunction(()=>{const d=window.__HIVE_DRAW_DIAGNOSTICS?.();return d?.assetsReady&&d.runtimeReady&&d.spatialDraw?.coverage?.requestedRegions>0;},{},{polling:25});
   result.coldPanStart=await page.evaluate(()=>{const d=window.__HIVE_DRAW_DIAGNOSTICS();return{atMs:performance.now(),coverage:d.spatialDraw.coverage,clock:{...window.__TERRAIN_PROOF_CLOCK}};});
   assert(!result.coldPanStart.coverage.demandComplete,"initial demand completed before cold-pan scheduling");
   coldPanDone=true;await pan("coldPan");
  }
  while(Date.now()<deadline){
   const sample=await page.evaluate(()=>{
    const canvas=document.querySelector("canvas"),read=window.__HIVE_DRAW_DIAGNOSTICS;if(!canvas||!read)return{atMs:performance.now(),ready:false};
    const draw=read(),camera=draw.camera,points=[];let hits=0,center=false,terrainFaces;
    const inside=(point,polygon)=>{let found=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)found=!found;}return found;};
    const sideAt=local=>{terrainFaces??=read({scene:true}).records.filter(record=>record.role==="terrain"&&!record.id.endsWith(":top"));for(const record of terrainFaces){const b=record.screenBounds;if(!b||local.x<b.left||local.x>b.right||local.y<b.top||local.y>b.bottom)continue;const polygon=record.orderGeometry?.points?.map(point=>read({project:point}).projected);if(polygon&&inside(local,polygon))return{cell:record.cell,face:"side"};}return null;};
    if(draw.visibleDrawRecords>0)for(let row=0;row<5;row++)for(let col=0;col<7;col++){
      const screen={x:canvas.clientWidth*(.08+col*.14),y:canvas.clientHeight*(.08+row*.19)};
      const local={x:(screen.x-camera.x)/camera.zoom,y:(screen.y-camera.y)/camera.zoom};const hit=read({terrainAt:local}).terrainAt??sideAt(local);
      points.push({row,col,screen,cell:hit?.cell??null,face:hit?.face??(hit?"top":null)});if(hit){hits++;if(row===2&&col===3)center=true;}
    }
    const subjects=draw.subjects.filter(subject=>{const x=subject.screen.x*camera.zoom+camera.x,y=subject.screen.y*camera.zoom+camera.y;return x>=0&&x<canvas.clientWidth&&y>=0&&y<canvas.clientHeight;});
    return{atMs:performance.now(),clock:{...window.__TERRAIN_PROOF_CLOCK},ready:draw.visibleDrawRecords>0,assetsReady:draw.assetsReady,runtimeReady:draw.runtimeReady,camera,visibleSubjects:subjects.length,hits,center,points,coverage:draw.spatialDraw.coverage,cameraCoverage:draw.spatialDraw.cameraCoverage,meshes:draw.spatialDraw.meshes,loading:draw.spatialDraw.loading??null,performance:window.__HIVE_PERFORMANCE_DIAGNOSTICS?.()};
   });sample.observedAtMs=elapsed();sample.httpRequests=result.httpTerrain.length;sample.httpBytes=result.httpTerrain.reduce((sum,r)=>sum+(r.bytes??0),0);sample.wsBytes=result.wsFrames.reduce((sum,r)=>sum+r.bytes,0);result.samples.push(sample);
   if(sample.assetsReady&&sample.runtimeReady&&!result.milestones.independentReady)result.milestones.independentReady={atMs:sample.observedAtMs,sample};
   if(mode==="after"&&sample.coverage){assert(!sample.coverage.error,JSON.stringify(sample.coverage.error));assert(sample.coverage.retainedBytes<=sample.coverage.maxBytes,"terrain byte budget exceeded");assert(sample.coverage.cachedRegions<=sample.coverage.capacity,"terrain region budget exceeded");}
   if(sample.ready&&!result.milestones.sceneReady)result.milestones.sceneReady={atMs:sample.observedAtMs,sample};
   if(sample.ready&&sample.visibleSubjects>0&&sample.hits===0&&!result.milestones.subjectsWithoutGround){result.milestones.subjectsWithoutGround={atMs:sample.observedAtMs,sample};if(mode==="before")await screenshot("subjects-without-ground");else result.screenshots.push({label:"subjects-without-ground",skipped:"latency measurement: do not block first useful ground on software screenshot",atMs:elapsed()});}
   if(name==="pan"&&!coldPanDone&&sample.ready&&sample.hits===0){coldPanDone=true;await pan("coldPan");await screenshot("cold-pan");await save();continue;}
   if(sample.hits>=9&&sample.center&&!result.milestones.usefulGround){result.milestones.usefulGround={atMs:sample.observedAtMs,sample};if(mode==="before")await screenshot("first-useful-ground");else result.screenshots.push({label:"first-useful-ground",skipped:"early image unavailable: capture deferred until padded completion to avoid perturbing streaming",atMs:elapsed()});console.log(JSON.stringify({case:name,stage:"first-useful-ground",atMs:sample.observedAtMs,httpRequests:sample.httpRequests}));}
   if(name==="pan"&&result.milestones.usefulGround&&!groundPanDone){groundPanDone=true;await pan("afterGroundPan");await save();continue;}
   if(sample.hits===35&&(mode!=="after"||sample.coverage?.visibleComplete)&&!result.milestones.visibleGround){result.milestones.visibleGround={atMs:sample.observedAtMs,sample};if(mode==="before")await screenshot("visible-ground");else result.screenshots.push({label:"visible-ground",skipped:"early image unavailable: capture deferred until padded completion to avoid perturbing streaming",atMs:elapsed()});}
   if(sample.coverage?.demandComplete&&!sample.coverage.pending&&sample.hits===35&&(name!=="pan"||groundPanDone)){result.milestones.paddedComplete={atMs:sample.observedAtMs,sample};await screenshot("padded-complete");break;}
   await save();await page.waitForTimeout(150);
  }
  assert(result.milestones.usefulGround,"no useful visible ground");assert(result.milestones.visibleGround,"visible ground sample grid never completed");assert(result.milestones.paddedComplete,"padded coverage never completed");
  if(mode==="after"){
   assert.equal(result.httpTerrain.length,0,"terrain still uses HTTP fan-out");
   assert(result.wsFrames.some(frame=>frame.terrain?.kind==="patch"&&frame.terrain.faces>0),"no useful terrain patch received over WebSocket");
   assert(result.wsFrames.some(frame=>frame.terrain?.kind==="complete"),"no terrain stream completion received");
   assert(result.milestones.independentReady,"independent assets/runtime readiness unavailable");
   assert(result.milestones.visibleGround.sample.coverage.visibleComplete,"visible region demand incomplete");
   assert.equal(result.milestones.visibleGround.sample.coverage.readyVisibleRegions,result.milestones.visibleGround.sample.coverage.visibleRegions);
   const clock=result.milestones.paddedComplete.sample.clock;
   const earliest=(...values)=>{const finite=values.filter(value=>typeof value==="number"&&Number.isFinite(value));assert(finite.length>0,"missing finite milestone timestamp");return Math.min(...finite);};
   const readyAt=earliest(clock.readyAt,result.milestones.independentReady.sample.atMs);
   const visibleAt=earliest(clock.visibleAt,result.milestones.visibleGround.sample.atMs);
   const paddedAt=earliest(clock.paddedAt,result.milestones.paddedComplete.sample.atMs);
   result.measuredClock={readyAt,visibleAt,paddedAt};
   result.readinessLatency={usefulGroundMs:result.milestones.usefulGround.sample.atMs-readyAt,visibleGroundMs:visibleAt-readyAt,paddedCompleteMs:paddedAt-readyAt};
   // Stationary case is the comparable latency benchmark. Pan intentionally changes demand.
   if(name==="stationary"){
    assert(result.readinessLatency.usefulGroundMs<=1000,"useful ground exceeded 1s after assets/runtime readiness");
    assert(result.readinessLatency.visibleGroundMs<=3000,"visible ground exceeded 3s after assets/runtime readiness");
   }
  }
  assert.equal(result.browserWorkers.length,0,"browser simulation Worker started");assert(result.socketOrigin?.includes("hive-performance-engine-preview"),"not connected to separate real DO backend");
  if(name==="pan"){assert(coldPanDone,"could not exercise a pan during initial demand");assert(groundPanDone);}
  await Promise.all(pending);assert.equal(result.errors.length,0,result.errors.join("; "));result.success=true;
 }catch(error){result.errors.push(error.stack??String(error));result.failureState=await page?.evaluate(()=>({body:document.body.innerText,draw:window.__HIVE_DRAW_DIAGNOSTICS?.()})).catch(()=>null);}
 finally{await browser?.close();result.finishedAt=new Date().toISOString();await save();}
 console.log(JSON.stringify({case:name,success:result.success,milestones:Object.fromEntries(Object.entries(result.milestones).map(([key,value])=>[key,value.atMs])),httpRequests:result.httpTerrain.length,httpBytes:result.httpTerrain.reduce((sum,r)=>sum+(r.bytes??0),0),errors:result.errors}));
}
for(const name of scenario==="both"?["stationary","pan"]:[scenario])await runCase(name);
report.success=report.cases.every(item=>item.success);report.finishedAt=new Date().toISOString();await save();if(!report.success)process.exitCode=1;
