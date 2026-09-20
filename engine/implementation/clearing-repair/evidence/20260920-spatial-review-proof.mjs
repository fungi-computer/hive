import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
const root=process.cwd(),out=root+'/.botanical/spatial-review';
await mkdir(out,{recursive:true});
const built=process.env.SPATIAL_REVIEW_BUILT==='1';
const server=built?await preview({configFile:root+'/engine/vite.config.js',preview:{host:'127.0.0.1',port:0}}):await createServer({root,configFile:false,optimizeDeps:{noDiscovery:true,include:['pixi.js','three']},server:{host:'127.0.0.1',port:0}});
let browser;
const errors=[];
try{
 if(!built)await server.listen();
 browser=await chromium.launch({headless:true,executablePath:'/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:1200,height:950}});
 page.on('pageerror',e=>{errors.push(String(e));console.log(String(e));});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/engine/spatial-render-review.html`);
 await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:45000});
 await page.click('#turn');assert.equal(await page.evaluate(()=>window.__SPATIAL_REVIEW.snapshot().turn),1);
 await page.check('#mown');assert.equal(await page.evaluate(()=>window.__SPATIAL_REVIEW.snapshot().mown),true);
 await page.check('#moving');await page.waitForFunction(()=>window.__SPATIAL_REVIEW.snapshot().walk>0);await page.uncheck('#moving');
 const cases=[],bankCases=[],wallCases=[],stairCases=[],mowing=[];
 for(let turn=0;turn<4;turn++){
  for(let walk=0;walk<10;walk+=.5)await page.evaluate(args=>window.__SPATIAL_REVIEW.render(args),{turn,walk,mown:false});
  await page.evaluate(turn=>window.__SPATIAL_REVIEW.render({turn,walk:3,mown:false}),turn);
  await page.screenshot({path:`${out}/scene-${turn}.png`});
  const check=await page.evaluate(()=>{
   const api=window.__SPATIAL_REVIEW,tall=api.pixels();api.render({mown:true});const short=api.pixels();
   let changed=0;for(let i=0;i<tall.length;i+=4)if(tall.slice(i,i+4).some((v,k)=>v!==short[i+k]))changed++;
   return {changed,snapshot:api.snapshot()};
  });
  assert(check.changed>50,'mowing must visibly change the original grass frames');
  mowing.push({turn,changed:check.changed});
  if(turn===0)await page.screenshot({path:out+'/mown.png'});
  for(const walk of [3,3.5,4,8,8.5,9]){
   const result=await page.evaluate(({turn,walk})=>{
    const api=window.__SPATIAL_REVIEW;api.render({turn,walk,mown:false});
    const actor=api.pairPixels(['actor']),bed=api.pairPixels(['bed']),actual=api.pairPixels(['actor','bed']);
    const f=api.fixture(),actorNear=(f.actor.feet.x-2)*-f.projection.direction.x>0;
    const expected=actorNear?actor:bed;
    let overlap=0,wrong=0;
    for(let i=0;i<actual.length;i+=4)if(actor[i+3]===255&&bed[i+3]===255){overlap++;if(actual.slice(i,i+4).some((v,k)=>v!==expected[i+k]))wrong++;}
    return {turn,walk,actorNear,overlap,wrong};
   },{turn,walk});
   cases.push(result);
  }
  const bankCheck=await page.evaluate(turn=>{
   const api=window.__SPATIAL_REVIEW;api.render({turn,walk:0,mown:false,actorAt:undefined,supportPart:undefined});
   const f=api.fixture(),bankIds=f.terrain.filter(r=>r.cell?.[0]===5&&r.cell?.[1]===1&&r.cell?.[2]===2).map(r=>r.id),coverIds=f.cover.map(r=>r.id);
   const bank=api.pairPixels(bankIds),cover=api.pairPixels(coverIds),actual=api.pairPixels([...bankIds,...coverIds]);
   let overlap=0,wrong=0;
   for(let i=0;i<actual.length;i+=4)if(bank[i+3]===255&&cover[i+3]===255){overlap++;if(actual.slice(i,i+4).some((v,k)=>v!==bank[i+k]))wrong++;}
   return {turn,bankIds,coverPieces:f.cover.length,overlap,wrong};
  },turn);bankCases.push(bankCheck);
  for(const x of [4.5,6.5]){
   const result=await page.evaluate(({turn,x})=>{
    const api=window.__SPATIAL_REVIEW;api.render({turn,actorAt:{x,y:.27,z:3},supportPart:undefined});
    const actor=api.pairPixels(['actor']),wall=api.pairPixels(['wall:3']),actual=api.pairPixels(['actor','wall:3']);
    const actorNear=(x-5.5)*-api.fixture().projection.direction.x>0,expected=actorNear?actor:wall;
    let overlap=0,wrong=0;
    for(let i=0;i<actual.length;i+=4)if(actor[i+3]===255&&wall[i+3]===255){overlap++;if(actual.slice(i,i+4).some((v,k)=>v!==expected[i+k]))wrong++;}
    return {turn,x,actorNear,overlap,wrong};
   },{turn,x});wallCases.push(result);
  }
  for(const t of [0,.25,.5,.75,1]){
   const results=await page.evaluate(({turn,t})=>{
    const api=window.__SPATIAL_REVIEW;api.render({turn,actorAt:{x:0,y:.27+2.16*t,z:3+2*t},supportPart:{id:'stair',part:'surface'}});
    return api.fixture().stairs.map(part=>{
     const actor=api.pairPixels(['actor']),stair=api.pairPixels([`stair/${part.part}`]),actual=api.pairPixels(['actor',`stair/${part.part}`]);
     const middle=(part.orderGeometry.min.x+part.orderGeometry.max.x)/2;
     const actorNear=part.part==='surface'||(-middle)*-api.fixture().projection.direction.x>0,expected=actorNear?actor:stair;
     let overlap=0,wrong=0;
     for(let i=0;i<actual.length;i+=4)if(actor[i+3]===255&&stair[i+3]===255){overlap++;if(actual.slice(i,i+4).some((v,k)=>v!==expected[i+k]))wrong++;}
     return {turn,t,part:part.part,actorNear,overlap,wrong};
    });
   },{turn,t});stairCases.push(...results);
   if(turn===0&&t===.5)await page.screenshot({path:out+'/stairs.png'});
  }
  await page.evaluate(()=>window.__SPATIAL_REVIEW.render({actorAt:undefined,supportPart:undefined}));
  console.log(JSON.stringify({turn,mownChanged:check.changed,bank:bankCheck,walls:wallCases.filter(c=>c.turn===turn),stairs:stairCases.filter(c=>c.turn===turn)}));
 }
 await writeFile(out+'/results.json',JSON.stringify({built,cases,bankCases,wallCases,stairCases,mowing,errors},null,2));
 assert.deepEqual(errors,[]);
 assert(bankCases.every(c=>c.overlap>0&&c.wrong===0),'raised bank must cover the lower surface appearance');
 assert(wallCases.every(c=>c.wrong===0)&&wallCases.some(c=>c.overlap>0),'wall overlap must match axis separation');
 assert(stairCases.every(c=>c.wrong===0)&&stairCases.some(c=>c.overlap>0),'stair rails and support must enclose the actor correctly');
 assert(cases.every(c=>c.wrong===0),'independent bed-side alpha overlap must match the nearer object');
 for(let turn=0;turn<4;turn++)assert(cases.some(c=>c.turn===turn&&c.overlap>0),'each camera must certify real overlap');
}finally{await browser?.close();if(built)await new Promise(resolve=>server.httpServer.close(resolve));else await server.close();}
