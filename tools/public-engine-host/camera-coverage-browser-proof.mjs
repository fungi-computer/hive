#!/usr/bin/env node
/** Hosted far-terrain and exact-face picking receipt, using real pan inputs. */
import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
const output=resolve(args.get("--output")??".botanical/camera-coverage-browser");
const url=new URL("/engine/colony-performance.html",args.get("--base-url"));url.search="size=256&workers=8&diagnostics=draw";
await mkdir(output,{recursive:true});
const report={url:url.href,startedAt:new Date().toISOString(),errors:[],terrainReplies:[],success:false};
let browser,page;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader"]});
 page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 page.on("pageerror",error=>report.errors.push(error.message));
 const reads=[];page.on("response",response=>{if(new URL(response.url()).pathname.endsWith("/terrain"))reads.push(response.json().then(reply=>{
   const summaries=(reply.chunks??[]).flatMap(chunk=>(chunk.surfaces??[]).filter(surface=>Math.abs(surface.cell[0])>32).map(surface=>({cell:surface.cell,cover:surface.cover})));
   report.terrainReplies.push({status:response.status(),protocol:reply.protocol??reply.version,chunkCount:reply.chunks?.length,outside32Count:summaries.length,outside32Examples:summaries.slice(0,4)});
 }).catch(error=>report.errors.push(error.message)));});
 await page.goto(url.href,{waitUntil:"domcontentloaded"});await page.getByText("Online · server saved",{exact:true}).first().waitFor();
 await page.waitForFunction(()=>window.__HIVE_PERFORMANCE_DIAGNOSTICS?.().frames>=20);
 await page.getByRole("button",{name:"Pause",exact:true}).click();await page.waitForFunction(()=>window.__HIVE_PERFORMANCE_DIAGNOSTICS().paused);
 const settle=()=>page.waitForFunction(()=>{const c=window.__HIVE_DRAW_DIAGNOSTICS().spatialDraw.coverage;return c.demandComplete&&!c.pending;});
 await settle();const canvas=page.locator("canvas").first();await canvas.focus();const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 for(let i=0;i<96;i++){await page.keyboard.press("ArrowRight");await page.waitForTimeout(20);}await settle();
 report.far=await page.evaluate(()=>{
  const scene=window.__HIVE_DRAW_DIAGNOSTICS({scene:true}),{camera}=scene,canvas=document.querySelector("canvas");
  const onScreen=record=>{const b=record.screenBounds;return b&&b.left*camera.zoom+camera.x>=0&&b.right*camera.zoom+camera.x<canvas.clientWidth&&b.top*camera.zoom+camera.y>=0&&b.bottom*camera.zoom+camera.y<canvas.clientHeight-80;};
  const topFaces=scene.records.filter(record=>record.role==="terrain"&&record.id.endsWith(":top")&&Math.abs(record.cell[0])>32&&onScreen(record));
  const cover=scene.records.filter(record=>record.role==="terrain-cover"&&Math.abs(Number(record.id.split(":")[1]))>32&&onScreen(record));
  const picks=[];for(const face of topFaces.slice(0,100)){
    const points=face.orderGeometry.points,point={x:0,y:0,z:0};for(const vertex of points)for(const axis of ["x","y","z"])point[axis]+=vertex[axis]/points.length;
    const projected=window.__HIVE_DRAW_DIAGNOSTICS({project:point}).projected;
    const picked=window.__HIVE_DRAW_DIAGNOSTICS({terrainAt:projected}).terrainAt;
    if(picked?.cell?.[0]===face.cell[0]&&picked?.cell?.[2]===face.cell[2])picks.push({face:face.id,expectedCell:face.cell,projected,picked,screen:{x:projected.x*camera.zoom+camera.x,y:projected.y*camera.zoom+camera.y}});
    if(picks.length>=3)break;
  }
  return {camera,view:scene.view,metrics:scene.spatialDraw,farVisibleTopFaces:topFaces.length,farVisibleCover:cover.length,coverExamples:cover.slice(0,3),picks};
 });
 assert(report.far.farVisibleTopFaces>0,"no visible top faces outside old32 radius");assert(report.far.farVisibleCover>0,"no visible streamed grass outside old32 radius");assert(report.far.picks.length>=3,"far terrain exactface picking failed");
 await canvas.screenshot({path:resolve(output,"far-grass-and-picking.png")});await Promise.all(reads);
 assert(report.terrainReplies.some(reply=>reply.outside32Count>0),"no authoritative chunk reply contained far surface metadata");
 assert.equal(report.errors.length,0,report.errors.join("; "));report.success=true;
}catch(error){report.errors.push(error.stack??String(error));report.failureState=await page?.evaluate(()=>({body:document.body.innerText,draw:window.__HIVE_DRAW_DIAGNOSTICS?.()})).catch(()=>null);}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(output,"REPORT.json"),JSON.stringify(report,null,2)+"\n");}
console.log(JSON.stringify({success:report.success,output,far:report.far&&{topFaces:report.far.farVisibleTopFaces,grass:report.far.farVisibleCover,picks:report.far.picks},errors:report.errors}));if(!report.success)process.exitCode=1;
