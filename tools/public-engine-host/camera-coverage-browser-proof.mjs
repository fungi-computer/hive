#!/usr/bin/env node
/** Hosted far-terrain and exact-face picking receipt, using real pan inputs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir,writeFile,readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
const output=resolve(args.get("--output")??".botanical/camera-coverage-browser");
const url=new URL("/engine/colony-performance.html",args.get("--base-url"));url.search="size=256&workers=8&diagnostics=draw";
await mkdir(output,{recursive:true});
const report={url:url.href,startedAt:new Date().toISOString(),errors:[],captureErrors:[],networkFailures:[],terrainReplies:[],success:false};
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const checkpoint=async(stage)=>{report.stage=stage;await writeFile(resolve(output,"PROGRESS.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({stage,output}));};
let browser,page;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
 page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 page.on("pageerror",error=>report.errors.push(error.message));
 page.on("crash",()=>report.errors.push("browser renderer crashed"));
 page.on("requestfailed",request=>report.networkFailures.push({url:new URL(request.url()).pathname,reason:request.failure()?.errorText}));
 const reads=[];page.on("response",response=>{if(new URL(response.url()).pathname.endsWith("/terrain"))reads.push(response.json().then(reply=>{
   const summaries=(reply.chunks??[]).flatMap(chunk=>(chunk.surfaces??[]).filter(surface=>Math.abs(surface.cell[0])>32).map(surface=>({cell:surface.cell,cover:surface.cover})));
   report.terrainReplies.push({status:response.status(),protocol:reply.protocol??reply.version,chunkCount:reply.chunks?.length,outside32Count:summaries.length,outside32Examples:summaries.slice(0,4)});
 }).catch(error=>report.captureErrors.push({path:new URL(response.url()).pathname,status:response.status(),failure:response.request().failure(),message:error.message})));});
 await page.goto(url.href,{waitUntil:"domcontentloaded"});await page.getByText("Online · server saved",{exact:true}).first().waitFor();
 await page.waitForFunction(()=>window.__HIVE_PERFORMANCE_DIAGNOSTICS?.().frames>=20);
 await page.getByRole("button",{name:"Pause",exact:true}).click();await page.waitForFunction(()=>window.__HIVE_PERFORMANCE_DIAGNOSTICS().paused);
 const settle=()=>page.waitForFunction(()=>{const c=window.__HIVE_DRAW_DIAGNOSTICS().spatialDraw.coverage;return c.demandComplete&&!c.pending;});
 await settle();const canvas=page.locator("canvas").first();await canvas.focus();const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 const cdp=await page.context().newCDPSession(page);
 const budget=metrics=>{const m=metrics.meshes;assert(m,"mesh residency diagnostics missing");assert.equal(m.spareRecords,0);assert(m.spareMeshes<=m.limits.spareMeshes);assert(m.spareQuads<=m.limits.spareQuads);assert(metrics.coverage.cachedChunks<=metrics.coverage.capacity);};
 const state=async()=>{const result={draw:await page.evaluate(()=>window.__HIVE_DRAW_DIAGNOSTICS()),performance:await page.evaluate(()=>window.__HIVE_PERFORMANCE_DIAGNOSTICS()),heap:await cdp.send("Runtime.getHeapUsage")};budget(result.draw.spatialDraw);return result;};
 const pan=async(key,count)=>{await canvas.focus();for(let i=0;i<count;i++){await page.keyboard.press(key);await page.waitForTimeout(20);}};
 const capture=async(name)=>{await pan("ArrowRight",1);await pan("ArrowLeft",1);await settle();const scene=await page.evaluate(()=>window.__HIVE_DRAW_DIAGNOSTICS({scene:true}));await writeFile(resolve(output,`${name}.scene.json`),JSON.stringify(scene));await canvas.screenshot({path:resolve(output,`${name}.png`)});};
 await capture("initial");report.initial=await state();
 await pan("ArrowRight",3);await pan("ArrowLeft",3);report.smallPan=await state();
 assert.equal(report.smallPan.draw.spatialDraw.counts.staticRebuild,report.initial.draw.spatialDraw.counts.staticRebuild,"small pan rebuilt static scene");await checkpoint("small-pan");
 if(args.get("--smoke")!=="true"){
 await pan("ArrowRight",96);await settle();
 report.far=await page.evaluate(()=>{
  const scene=window.__HIVE_DRAW_DIAGNOSTICS({scene:true}),{camera}=scene,canvas=document.querySelector("canvas");
  const onScreen=record=>{const b=record.screenBounds;return b&&b.left*camera.zoom+camera.x>=0&&b.right*camera.zoom+camera.x<canvas.clientWidth&&b.top*camera.zoom+camera.y>=0&&b.bottom*camera.zoom+camera.y<canvas.clientHeight-80;};
  const topFaces=scene.records.filter(record=>record.role==="terrain"&&record.id.endsWith(":top")&&Math.abs(record.cell[0])>32&&onScreen(record));
  const cover=scene.records.filter(record=>record.role==="terrain-cover"&&Math.abs(Number(record.id.split(":")[1]))>32&&onScreen(record));
  const picks=[];for(const face of topFaces.slice(0,100)){
    const points=face.orderGeometry.points,point={x:0,y:0,z:0};for(const vertex of points)for(const axis of ["x","y","z"])point[axis]+=vertex[axis]/points.length;
    const projected=window.__HIVE_DRAW_DIAGNOSTICS({project:point}).projected;
    const picked=window.__HIVE_DRAW_DIAGNOSTICS({terrainAt:projected}).terrainAt;
    if(picked?.cell?.[0]===face.cell[0]&&picked?.cell?.[2]===face.cell[2])picks.push({face:face.id,expectedCell:face.cell,world:point,projected,picked,screen:{x:projected.x*camera.zoom+camera.x,y:projected.y*camera.zoom+camera.y}});
    if(picks.length>=3)break;
  }
  return {camera,view:scene.view,metrics:scene.spatialDraw,farVisibleTopFaces:topFaces.length,farVisibleCover:cover.length,coverExamples:cover.slice(0,3),picks};
 });
 assert(report.far.farVisibleTopFaces>0,"no visible top faces outside old32 radius");assert(report.far.farVisibleCover>0,"no visible streamed grass outside old32 radius");assert(report.far.picks.length>=3,"far terrain exactface picking failed");
 await canvas.screenshot({path:resolve(output,"far-grass-and-picking.png")});report.farState=await state();await checkpoint("far-grass-and-picking");
 const chosen=report.far.picks[0],targetLevel=chosen.expectedCell[1]-1,steps=report.far.view.level-targetLevel;
 assert(steps>0&&steps<=72,"cutaway target is outside supported level range");
 await page.getByRole("button",{name:"Toggle cutaway",exact:true}).click();await canvas.focus();
 for(let i=0;i<steps;i++)await page.keyboard.press("PageDown");await settle();
 report.cut=await page.evaluate(({chosen,targetLevel})=>{
   const scene=window.__HIVE_DRAW_DIAGNOSTICS({scene:true});
   const world={...chosen.world,y:chosen.world.y*(targetLevel+.5)/(chosen.expectedCell[1]+.5)};
   const projected=window.__HIVE_DRAW_DIAGNOSTICS({project:world}).projected;
   return {view:scene.view,picked:window.__HIVE_DRAW_DIAGNOSTICS({terrainAt:projected}).terrainAt,
    staleCover:scene.records.filter(r=>r.role==="terrain-cover"&&Number(r.id.split(":")[2])>targetLevel).length,metrics:scene.spatialDraw};
 },{chosen,targetLevel});
 budget(report.cut.metrics);
 assert.equal(report.cut.view.level,targetLevel);assert.equal(report.cut.view.cutaway,true);
 assert.equal(report.cut.staleCover,0,"upright grass survived above the cut");
 assert.deepEqual(report.cut.picked?.cell,[chosen.expectedCell[0],targetLevel,chosen.expectedCell[2]],"cut cap picking did not follow displayed face");
 await canvas.screenshot({path:resolve(output,"far-cut-cap.png")});await checkpoint("real-cut-cap");
 for(let i=0;i<steps;i++)await page.keyboard.press("PageUp");
 await page.getByRole("button",{name:"Toggle cutaway",exact:true}).click();await settle();
 await pan("ArrowLeft",96);await settle();await capture("pre-zoom");report.preZoom=await state();await checkpoint("pre-zoom");
 await canvas.focus();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 for(let i=0;i<10;i++){await page.mouse.wheel(0,100);await page.waitForTimeout(60);}await settle();report.zoomOut=await state();
 assert.equal(report.zoomOut.draw.camera.zoom,1,"zoom did not reach the supported minimum");await checkpoint("minimum-zoom");
 for(let i=0;i<10;i++){await page.mouse.wheel(0,-100);await page.waitForTimeout(60);}await settle();report.returned=await state();
 await capture("returned");
 report.imageHashes={initial:hash(await readFile(resolve(output,"initial.png"))),preZoom:hash(await readFile(resolve(output,"pre-zoom.png"))),returned:hash(await readFile(resolve(output,"returned.png")))};
 for(const axis of ["x","y","zoom"])assert(Math.abs(report.returned.draw.camera[axis]-report.initial.draw.camera[axis])<.001);
 assert.deepEqual(report.returned.draw.view,report.initial.draw.view);
 await cdp.send("HeapProfiler.collectGarbage");report.afterGarbageCollection=await state();
 await Promise.all(reads);
 assert.equal(report.imageHashes.preZoom,report.imageHashes.initial,"return image differs before zoom after far cutaway restore");
 assert.equal(report.imageHashes.returned,report.imageHashes.initial,"return image differs after minimum zoom restore");
 assert(report.terrainReplies.some(reply=>reply.outside32Count>0),"no authoritative chunk reply contained far surface metadata");
 }else{await Promise.all(reads);report.smokeOnly=true;}
 assert.equal(report.errors.length,0,report.errors.join("; "));report.success=true;
}catch(error){report.errors.push(error.stack??String(error));report.failureState=await page?.evaluate(()=>({body:document.body.innerText,draw:window.__HIVE_DRAW_DIAGNOSTICS?.()})).catch(()=>null);}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(output,"REPORT.json"),JSON.stringify(report,null,2)+"\n");}
console.log(JSON.stringify({success:report.success,output,far:report.far&&{topFaces:report.far.farVisibleTopFaces,grass:report.far.farVisibleCover,picks:report.far.picks},errors:report.errors}));if(!report.success)process.exitCode=1;
