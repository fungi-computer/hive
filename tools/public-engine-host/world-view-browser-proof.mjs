#!/usr/bin/env node
/** Combined rendered-world proof. Consumes an already paired hosted frontend/DO. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const args = new Map();
const allowed = new Set(['--base-url','--backend-origin','--output','--source-root','--frontend-source','--backend-source','--sizes']);
for (let i = 2; i < process.argv.length; i += 2) {
  assert(allowed.has(process.argv[i]) && process.argv[i + 1], `invalid argument ${process.argv[i]}`);
  args.set(process.argv[i], process.argv[i + 1]);
}
assert(args.get('--base-url') && args.get('--backend-origin') && args.get('--output'),
  '--base-url HTTPS_URL --backend-origin HTTPS_DO_ORIGIN --output NEW_DIR [--source-root DIR] [--frontend-source PIN] [--backend-source PIN] [--sizes 64,256]');
const base = new URL(args.get('--base-url')), backend = new URL(args.get('--backend-origin'));
assert(base.protocol === 'https:', 'this driver requires the hosted HTTPS frontend');
assert(backend.protocol === 'https:' && backend.hostname.includes('hive-performance-engine-preview') && backend.hostname.endsWith('.workers.dev'),
  'backend must be the separate hosted performance DO');
const sizes = (args.get('--sizes') ?? '64,256').split(',').map(Number);
assert(sizes.length > 0 && new Set(sizes).size === sizes.length && sizes.every(size => [64,256].includes(size)), 'sizes must be 64,256 or one of those presets');
const output = resolve(args.get('--output'));
await mkdir(dirname(output), {recursive:true});
await mkdir(output); // Never overwrite a failed or earlier proof.
const driverBytes = await readFile(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(resolve(output, 'driver.mjs'), driverBytes);
const sourceRoot = resolve(args.get('--source-root') ?? fileURLToPath(new URL('../..', import.meta.url)));
const sourcePaths = ['engine/src/client/client.js','engine/src/client/world-view-owner.js','engine/src/client/cut-terrain-layer.js',
  'engine/src/client/actor-presentation-owner.js','engine/src/client/spatial-scene-owner.js','engine/src/client/spatial-draw-order.js',
  'engine/src/client/terrain-region-cache.js','engine/src/client/multipart-visual-owner.js','engine/src/client/animation.js',
  'engine/src/client/performance-page.js','engine/src/client/performance-observer.js','engine/src/runtime/remote-client.ts',
  'engine/src/runtime/terrain-regions.ts','engine/src/runtime/terrain-region-materials.js','engine/src/runtime/terrain-presentation.ts',
  'engine/src/games/colony-performance.ts','tools/public-engine-host/worker.ts'];
const sourceHashes = await Promise.all(sourcePaths.map(async path => {
  try { return {path,sha256:hash(await readFile(resolve(sourceRoot,path)))}; }
  catch(error) { return {path,error:error.message}; }
}));
const git = (...argv) => { try { return execFileSync('git',['-C',sourceRoot,...argv],{encoding:'utf8'}).trim(); } catch { return null; } };
const report = {
  proof:'combined-hosted-world-view', startedAt:new Date().toISOString(), success:false,
  frontend:base.href, backendOrigin:backend.origin, requestedSizes:sizes, scope:sizes.length===2?'paired presets':'single-preset diagnosis',
  viewport:{width:1280,height:900}, deviceScaleFactor:1, workers:8,
  driverSha256:hash(driverBytes), source:{root:sourceRoot,head:git('rev-parse','HEAD'),dirty:git('status','--porcelain'),
    frontendPin:args.get('--frontend-source') ?? null,backendPin:args.get('--backend-source') ?? null,
    provenance:'Local source hashes and operator-supplied pins are not deployed-source attestation. Served frontend code is hashed separately.'},
  limits:{usefulAfterIndependentReadyMs:1000,visibleAfterIndependentReadyMs:3000,caseWallMs:225000,totalWallMs:510000},
  measurementNotes:[
    'Fresh browser process/context and fresh private DO world per preset; eight workers remain unpaused.',
    'Loading starts at navigation. First assetsReady && runtimeReady is never reset by camera normalization or later phases.',
    'Input queue estimate is event creation timestamp to window-capture listener; next-rAF is a callback opportunity, not painted pixels.',
    'EventTiming is browser-reported and thresholded/quantized; no entries does not mean zero latency. Long tasks are separate.',
    'Ground means published picking geometry at 35 samples, including cliff sides, plus owner completeness; screenshots occur afterward.',
    'ANGLE SwiftShader is software rendering on a shared host. No hardware GPU throughput or 60fps claim follows.',
    'Owner capacities are gated. Heap and repeated post-GC deltas are observational; short trips do not prove globally bounded memory.'
  ], cases:[], errors:[]
};
await writeFile(resolve(output,'source-hashes.json'), JSON.stringify(sourceHashes,null,2)+'\n');
if(sourceHashes.some(entry=>entry.error))report.errors.push('local source inventory is incomplete');
const save = () => writeFile(resolve(output,'REPORT.json'),JSON.stringify(report,null,2)+'\n');
const summary = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  return sorted.length ? {samples:sorted.length,median:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)} : null;
};
let liveBrowser, stopped = false;
const stop = reason => { stopped = true; report.errors.push(reason); void liveBrowser?.close().catch(()=>{}); };
const watchdog = setTimeout(()=>stop('driver total wall deadline exceeded'),report.limits.totalWallMs);
const signal = name => stop(`received ${name}; closing only this driver browser`);
const onTerm = () => signal('SIGTERM'), onInt = () => signal('SIGINT');
process.on('SIGTERM',onTerm); process.on('SIGINT',onInt);

// Installed before application scripts. Window capture runs before the keymap's
// document/bubble handlers, even when they stop propagation.
function installProbe() {
  const p = {phase:'navigation',running:true,clock:{readyAt:null,receivedVisibleAt:null,receivedPaddedAt:null},
    inputs:[],eventTiming:[],longTasks:[],frames:[],work:[],dropped:{},lastDemand:null,supported:PerformanceObserver.supportedEntryTypes};
  window.__WORLD_VIEW_PROOF = p;
  const push = (name,value,limit=4096) => { p[name].push(value); if(p[name].length>limit){p[name].shift();p.dropped[name]=(p.dropped[name]??0)+1;} };
  const onInput = event => {
    if(!p.running || (event.type==='keydown' && !['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','PageUp','PageDown','q','e','Q','E'].includes(event.key))) return;
    const at=performance.now(), raw=event.timeStamp, eventAt=raw>1e12?raw-performance.timeOrigin:raw;
    const item={phase:p.phase,type:event.type,key:event.key??null,deltaY:event.deltaY??null,trusted:event.isTrusted,
      eventTimestamp:raw,eventAt,captureAt:at,captureWallAt:Date.now(),queueEstimateMs:eventAt>=0&&eventAt<=at+1?Math.max(0,at-eventAt):null,
      receivedDemandAtCapture:p.lastDemand,rafAt:null,rafOpportunityMs:null};
    push('inputs',item);
    requestAnimationFrame(()=>{if(!p.running)return;item.rafAt=performance.now();item.rafOpportunityMs=item.rafAt-at;
      const d=window.__HIVE_DRAW_DIAGNOSTICS?.();item.camera=d?.camera;item.displayedView=d?.displayedView;});
  };
  for(const type of ['keydown','wheel','pointerdown']) window.addEventListener(type,onInput,{capture:true,passive:true});
  const observers=[];
  for(const type of ['longtask','event']) if(p.supported.includes(type)) {
    const observer=new PerformanceObserver(list=>{for(const e of list.getEntries()) {
      if(type==='longtask')push('longTasks',{phaseAtDelivery:p.phase,startTime:e.startTime,duration:e.duration});
      else push('eventTiming',{phaseAtDelivery:p.phase,name:e.name,startTime:e.startTime,duration:e.duration,
        processingStart:e.processingStart,processingEnd:e.processingEnd,interactionId:e.interactionId});
    }});
    observer.observe(type==='event'?{type,buffered:true,durationThreshold:16}:{type,buffered:true});observers.push(observer);
  }
  let previousFrame, lastWork=-Infinity;
  const frame=at=>{if(!p.running)return;if(previousFrame!==undefined)push('frames',{at,interval:at-previousFrame,phase:p.phase});previousFrame=at;requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
  const timer=setInterval(()=>{
    const d=window.__HIVE_DRAW_DIAGNOSTICS?.();if(!d)return;
    const now=performance.now(),c=d.spatialDraw?.coverage;
    if(d.assetsReady&&d.runtimeReady)p.clock.readyAt??=now;
    if(c?.visibleRegions>0&&c.receivedVisibleComplete)p.clock.receivedVisibleAt??=now;
    if(c?.requestedRegions>0&&c.receivedComplete)p.clock.receivedPaddedAt??=now;
    p.lastDemand=c?{at:now,pending:c.pending,receivedVisibleComplete:c.receivedVisibleComplete,receivedComplete:c.receivedComplete,
      publishedVisibleComplete:c.visibleComplete,publishedDemandComplete:c.demandComplete,preparationPending:d.spatialDraw?.preparation?.pending}:null;
    if(now-lastWork>=250){lastWork=now;const w=window.__HIVE_PERFORMANCE_DIAGNOSTICS?.();if(w)push('work',{at:now,phase:p.phase,...w},1600);}
  },25);
  p.stop=()=>{p.running=false;clearInterval(timer);for(const o of observers)o.disconnect();
    for(const type of ['keydown','wheel','pointerdown'])window.removeEventListener(type,onInput,true);};
  window.addEventListener('pagehide',p.stop,{once:true});
}

function readPage({ground=false}={}) {
  const read=window.__HIVE_DRAW_DIAGNOSTICS, d=read?.(), canvas=document.querySelector('canvas');
  const sample={at:performance.now(),wallAt:Date.now(),clock:{...window.__WORLD_VIEW_PROOF?.clock},
    draw:d?{assetsReady:d.assetsReady,runtimeReady:d.runtimeReady,presentationFrames:d.presentationFrames,frameSequence:d.frameSequence,
      frameEpoch:d.frameEpoch,paused:d.paused,camera:d.camera,view:d.view,displayedView:d.displayedView,
      visibleDrawRecords:d.visibleDrawRecords,spatialDraw:d.spatialDraw}:null,
    performance:window.__HIVE_PERFORMANCE_DIAGNOSTICS?.(),canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight}:null};
  if(!ground||!d||!canvas)return sample;
  const points=[],camera=d.camera;let hits=0,center=false,sides;
  const inside=(p,polygon)=>{let found=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)found=!found;
  }return found;};
  const sideAt=p=>{
    sides??=read({scene:true}).records.filter(r=>r.role==='terrain'&&!r.id.endsWith(':top'));
    for(const r of sides){const b=r.screenBounds;if(!b||p.x<b.left||p.x>b.right||p.y<b.top||p.y>b.bottom)continue;
      const polygon=r.orderGeometry?.points?.map(point=>read({project:point}).projected);
      if(polygon&&inside(p,polygon))return{cell:r.cell,face:'side'};
    }return null;
  };
  if(d.assetsReady&&d.runtimeReady&&d.visibleDrawRecords>0)for(let row=0;row<5;row++)for(let col=0;col<7;col++) {
    const screen={x:canvas.clientWidth*(.08+col*.14),y:canvas.clientHeight*(.08+row*.19)};
    const local={x:(screen.x-camera.x)/camera.zoom,y:(screen.y-camera.y)/camera.zoom};
    const hit=read({terrainAt:local}).terrainAt??sideAt(local);
    points.push({row,col,cell:hit?.cell??null,face:hit?.face??(hit?'top':null)});
    if(hit){hits++;if(row===2&&col===3)center=true;}
  }
  sample.ground={hits,center,points,samplingMs:performance.now()-sample.at};return sample;
}

function capacityFailures(sample) {
  const errors=[],m=sample.draw?.spatialDraw,c=m?.coverage,mesh=m?.meshes;
  if(c){if(c.error)errors.push(`terrain error: ${JSON.stringify(c.error)}`);
    if(c.cachedRegions>c.capacity)errors.push('terrain region capacity exceeded');
    if(c.retainedBytes>c.maxBytes)errors.push('terrain payload byte capacity exceeded');}
  if(mesh?.limits){if(mesh.spareRecords!==0)errors.push('spare meshes retain records');
    if(mesh.spareMeshes>mesh.limits.spareMeshes)errors.push('spare mesh capacity exceeded');
    if(mesh.spareQuads>mesh.limits.spareQuads)errors.push('spare quad capacity exceeded');}
  return errors;
}

async function runCase(size) {
  const url=new URL('/engine/colony-performance.html',base);url.search=new URLSearchParams({size:String(size),workers:'8',diagnostics:'draw'});
  const result={size,url:url.href,phases:[],samples:[],memory:[],screenshots:[],servedCode:[],browserWorkers:[],driverInputs:[],errors:[],networkFailures:[],httpErrors:[],
    transport:{sockets:[],httpTerrain:0,patches:0,complete:0,terrainBytes:0,incomingBytes:0,requests:[],patchEvents:[],droppedPatchEvents:0},success:false};
  report.cases.push(result);let browser,page,context,cdp,timer;const bodyReads=new Set();
  const phase=async(name,run)=>{
    const item={name,startedAt:new Date().toISOString(),success:false};result.phases.push(item);
    result.activePhase=name;
    await save();console.log(JSON.stringify({size,phase:name,state:'started'}));
    try {assert(!stopped,'driver stopping');item.browserStartedAt=await page?.evaluate(name=>{if(window.__WORLD_VIEW_PROOF)window.__WORLD_VIEW_PROOF.phase=name;return performance.now();},name);
      item.before=await snapshot(`${name}:before`);await run(item);item.success=true;}
    catch(error){item.error=error.stack??String(error);}
    if(page&&!page.isClosed())item.after=await snapshot(`${name}:after`).catch(()=>null);
    item.browserFinishedAt=item.after?.at;
    item.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({size,phase:name,success:item.success,error:item.error??null}));return item;
  };
  const snapshot=async(name,ground=false)=>{
    const s=await page.evaluate(readPage,{ground});s.name=name;s.phase=result.activePhase;result.samples.push(s);
    for(const error of capacityFailures(s))if(!result.errors.includes(error))result.errors.push(error);
    return s;
  };
  const waitFor=async(predicate,timeoutMs=30000)=>{
    const until=Date.now()+timeoutMs;let s;
    while(Date.now()<until&&!stopped){s=await snapshot('wait');if(predicate(s))return s;await page.waitForTimeout(100);}
    throw new Error(`condition timed out after ${timeoutMs}ms; last view ${JSON.stringify(s?.draw?.displayedView)}`);
  };
  const settle=()=>waitFor(s=>{const d=s.draw,c=d?.spatialDraw?.coverage;return d?.visibleDrawRecords>0&&c?.requestedRegions>0&&
    c.visibleComplete&&c.demandComplete&&!c.pending&&d.spatialDraw.preparation?.pending===false;});
  const canvas=()=>page.locator('canvas').first();
  const dispatch=async action=>{
    const start=performance.now(),entry={...action,startedWallAt:Date.now()};result.driverInputs.push(entry);
    try {if(action.key)await page.keyboard.press(action.key);else await page.mouse.wheel(0,action.wheel);}
    finally {entry.roundTripMs=performance.now()-start;entry.finishedWallAt=Date.now();}
  };
  const input=async(key,count=1)=>{await canvas().focus();for(let n=0;n<count;n++){await dispatch({key});await page.waitForTimeout(25);}};
  const memory=async(name,gc=false)=>{if(gc)await cdp.send('HeapProfiler.collectGarbage');
    const s=await snapshot(name);const value={name,afterForcedGC:gc,at:s.at,heap:await cdp.send('Runtime.getHeapUsage'),resources:s.draw?.spatialDraw};result.memory.push(value);return value;};
  const screenshot=async(name)=>{const filename=`${size}-${name}.png`;const start=Date.now();await canvas().screenshot({path:resolve(output,filename),timeout:20000});result.screenshots.push({filename,captureMs:Date.now()-start});};
  try {
    browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH,headless:true,timeout:30000,
      args:['--no-sandbox','--enable-unsafe-swiftshader','--enable-gpu','--use-gl=angle','--use-angle=swiftshader']});liveBrowser=browser;
    timer=setTimeout(()=>{result.errors.push('case wall deadline exceeded');void browser.close().catch(()=>{});},report.limits.caseWallMs);
    const systemCDP=await browser.newBrowserCDPSession(),system=await systemCDP.send('SystemInfo.getInfo');await systemCDP.detach();
    result.browserRendering={version:browser.version(),commandLine:system.commandLine,devices:system.gpu.devices,featureStatus:system.gpu.featureStatus};
    assert.equal(system.gpu.featureStatus.gpu_compositing,'enabled','full compositing must be enabled');
    context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});await context.addInitScript(installProbe);
    page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(45000);cdp=await context.newCDPSession(page);
    page.on('worker',w=>result.browserWorkers.push(w.url()));page.on('pageerror',e=>result.errors.push(e.message));page.on('crash',()=>result.errors.push('renderer crashed'));
    page.on('requestfailed',r=>result.networkFailures.push({wallAt:Date.now(),path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
    page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/terrain'))result.transport.httpTerrain++;});
    page.on('response',response=>{
      const u=new URL(response.url());if(response.status()>=400)result.httpErrors.push({path:u.pathname,status:response.status()});
      if(u.origin!==base.origin||!u.pathname.startsWith('/engine/')||!(/\.(html|m?js|css|wasm|json)$/.test(u.pathname)))return;
      const promise=response.body().then(bytes=>result.servedCode.push({path:u.pathname,status:response.status(),bytes:bytes.length,sha256:hash(bytes)}))
        .catch(error=>result.networkFailures.push({kind:'code-hash-capture',path:u.pathname,error:error.message})).finally(()=>bodyReads.delete(promise));
      bodyReads.add(promise);
    });
    page.on('websocket',socket=>{
      const u=new URL(socket.url());result.transport.sockets.push({origin:u.origin,path:u.pathname.replace(/\/socket\/.+$/, '/socket/<redacted>')});
      socket.on('framesent',({payload})=>{try{const m=JSON.parse(payload.toString());if(m.type==='terrain-regions')result.transport.requests.push({wallAt:Date.now(),requestId:m.requestId??m.request?.requestId});}catch{}});
      socket.on('framereceived',({payload})=>{const bytes=Buffer.byteLength(payload);result.transport.incomingBytes+=bytes;
        let m;try{m=JSON.parse(payload.toString());}catch{return;}if(m.type!=='terrain-regions')return;
        result.transport.terrainBytes+=bytes;if(m.event?.kind==='complete')result.transport.complete++;
        if(m.event?.kind==='patch'){result.transport.patches++;const p=m.event.patch;
          result.transport.patchEvents.push({wallAt:Date.now(),requestId:m.event.requestId,key:p?.key,coverage:p?.coverage,bytes});
          if(result.transport.patchEvents.length>2048){result.transport.patchEvents.shift();result.transport.droppedPatchEvents++;}}
      });
    });
    await phase('cold-loading',async item=>{
      const start=Date.now();const response=await page.goto(url.href,{waitUntil:'domcontentloaded'});
      item.browserStartedAt=0;
      await page.evaluate(()=>{window.__WORLD_VIEW_PROOF.phase='cold-loading';});
      item.domContentLoadedFromNavigationMs=Date.now()-start;assert.equal(response?.status(),200);
      await canvas().waitFor({state:'visible'});const deadline=Date.now()+45000;item.milestones={};
      while(Date.now()<deadline){const s=await snapshot('cold-loading',true),d=s.draw,c=d?.spatialDraw?.coverage;
        if(d?.assetsReady&&d.runtimeReady){item.readyAt??=s.clock.readyAt??s.at;
          if(s.ground?.center&&s.ground.hits>=9)item.milestones.usefulAt??=s.at;
          if(s.ground?.hits===35&&c?.visibleRegions>0&&c.visibleComplete)item.milestones.visibleAt??=s.at;
          if(s.ground?.hits===35&&c?.requestedRegions>0&&c.demandComplete&&!c.pending)item.milestones.paddedAt??=s.at;
        }
        if(item.milestones.paddedAt!==undefined)break;await page.waitForTimeout(100);
      }
      item.navigationClock=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),readyClock:{...window.__WORLD_VIEW_PROOF.clock}}));
      item.startupCamera=(await snapshot('startup-final')).draw?.camera;
      item.readinessLatency={usefulMs:item.milestones.usefulAt-item.readyAt,visibleMs:item.milestones.visibleAt-item.readyAt,paddedMs:item.milestones.paddedAt-item.readyAt};
      assert(Number.isFinite(item.readyAt),'independent readiness was not observed');
      assert(Number.isFinite(item.milestones.usefulAt),'no useful published ground');
      assert(Number.isFinite(item.milestones.visibleAt),'35 published samples and complete visible demand were not observed');
      assert(item.readinessLatency.usefulMs<=1000,'useful ground exceeded 1s after independent readiness');
      assert(item.readinessLatency.visibleMs<=3000,'visible ground exceeded 3s after independent readiness');
    });
    await phase('normalize-interaction-view',async item=>{
      await waitFor(s=>s.draw?.assetsReady&&s.draw.runtimeReady);
      const reset=page.getByRole('button',{name:'Reset view',exact:true});
      if(await reset.count()){item.method='real Reset view button';await reset.click();}
      else {item.method='ordinary viewport resize through ResizeObserver';await page.setViewportSize({width:1281,height:900});
        await page.waitForTimeout(100);await page.setViewportSize(report.viewport);}
      await settle();const s=await snapshot('normalized',true);result.normalized=s;item.camera=s.draw.camera;item.displayedView=s.draw.displayedView;
      assert.equal(s.draw.camera.turn,0);assert.equal(s.draw.displayedView.cutaway,false);
      assert.equal(s.draw.camera.zoom,2);assert(Math.abs(s.draw.camera.x-(s.canvas.width-640*2)/2)<.01);
      assert(Math.abs(s.draw.camera.y-(s.canvas.height-400*2)/2)<.01);
      await memory('normalized-gc',true);await screenshot('normalized');
    });
    for(let trip=1;trip<=2;trip++)await phase(`cold-travel-return-${trip}`,async item=>{
      assert(result.normalized,'interaction view was not normalized');await canvas().focus();
      const box=await canvas().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      const count=size===256?96:36,patchesBefore=result.transport.patches,actions=[];
      item.inputStartedWallAt=Date.now();item.before=await snapshot(`trip-${trip}-before`);
      // Start inputs without polling/settling between individual commands. Keys
      // and wheel are native Playwright input, never synthetic DOM events.
      let outboundFailure;
      try {
        for(let n=0;n<count;n++){
          actions.push({key:'ArrowRight'});await dispatch(actions.at(-1));
          if(n%8===0){actions.push({wheel:(Math.floor(n/8)%2===0?1:-1)*100});await dispatch(actions.at(-1));}
          await page.waitForTimeout(25);
        }
        item.inputEndedWallAt=Date.now();await settle();item.far=await snapshot(`trip-${trip}-far`,true);
        item.patchesDuringInput=result.transport.patchEvents.filter(e=>e.wallAt>=item.inputStartedWallAt&&e.wallAt<=item.inputEndedWallAt).length;
        item.totalNewPatches=result.transport.patches-patchesBefore;
        await memory(`trip-${trip}-far`);
      } catch(error) {outboundFailure=error;item.outboundFailure=error.stack??String(error);}
      // Restore even after an outbound failure so later diagnosis has a fair view.
      // Pan and centered zoom do not commute; reverse the exact action sequence.
      for(const action of actions.reverse()){
        await dispatch(action.key?{key:'ArrowLeft'}:{wheel:-action.wheel});await page.waitForTimeout(25);
      }
      await settle();item.returned=await snapshot(`trip-${trip}-returned`,true);
      await memory(`trip-${trip}-returned-gc`,true);if(trip===2)await screenshot('returned');
      if(outboundFailure)throw outboundFailure;
      assert(item.far.ground.hits>0,'cold travel showed no sampled published terrain');
      if(size===256)assert(item.far.ground.points.some(p=>p.cell&&(Math.abs(p.cell[0])>32||Math.abs(p.cell[2])>32)),
        'large-world travel did not draw sampled terrain outside the old 64x64 window');
      if(trip===1)assert(item.totalNewPatches>0&&item.patchesDuringInput>0,'cold input did not overlap actual incoming terrain patches');
      for(const key of ['x','y','zoom','turn'])assert(Math.abs(item.returned.draw.camera[key]-result.normalized.draw.camera[key])<.01,`camera ${key} did not return`);
      assert.deepEqual(item.returned.draw.displayedView,result.normalized.draw.displayedView);
      assert.deepEqual(item.returned.ground.points.map(p=>p.cell),result.normalized.ground.points.map(p=>p.cell),'returned terrain picks differ from the normalized view');
    });
    await phase('repeated-cuts-and-rotations',async item=>{
      item.transitions=[];item.cutGround=[];const initial=await snapshot('before-cuts'),view=initial.draw.displayedView,turn=initial.draw.camera.turn;
      const adopt=async expected=>{const s=await waitFor(s=>s.draw?.displayedView?.level===expected.level&&s.draw.displayedView.cutaway===expected.cutaway&&s.draw.camera.turn===expected.turn);
        item.transitions.push({expected,at:s.at,displayedView:s.draw.displayedView,camera:s.draw.camera,resources:s.draw.spatialDraw});return s;};
      for(let round=0;round<2;round++){
        await page.getByRole('button',{name:'Toggle cutaway',exact:true}).click();await adopt({...view,cutaway:true,turn});
        for(let step=1;step<=2;step++){await input('PageDown');await adopt({level:view.level-step,cutaway:true,turn});}
        const cut=await snapshot(`cut-${round}`,true);item.cutGround.push(cut.ground);
        assert(cut.ground.hits>0&&cut.ground.points.every(p=>!p.cell||p.cell[1]<=view.level-2),'published cut picking contains missing ground or terrain above the cut');
        await input('e');await adopt({level:view.level-2,cutaway:true,turn:(turn+1)%4});
        await input('q');await adopt({level:view.level-2,cutaway:true,turn});
        for(let step=1;step<=2;step++){await input('PageUp');await adopt({level:view.level-2+step,cutaway:true,turn});}
        await page.getByRole('button',{name:'Toggle cutaway',exact:true}).click();await adopt({...view,cutaway:false,turn});
      }
      await settle();item.after=await snapshot('after-cuts',true);await memory('after-cuts-gc',true);await screenshot('after-cuts');
    });
    await phase('live-work-and-transport',async item=>{
      await waitFor(s=>s.performance?.observedWorkers===8&&s.performance.stumps>0,45000);
      item.final=await snapshot('final');assert.equal(item.final.performance.source,'durable-object');assert.equal(item.final.performance.paused,false);
      assert.equal(result.browserWorkers.length,0,'browser simulation Worker was started');assert.equal(result.transport.httpTerrain,0,'HTTP terrain fan-out remains');
      assert(result.transport.sockets.some(s=>s.origin===backend.origin.replace('https:','wss:')),'actual socket did not reach expected separate DO');
      assert(result.transport.patches>0&&result.transport.complete>0,'real DO terrain stream missing patches/completion');
      assert(item.final.draw.spatialDraw.coverage?.capacity>0&&item.final.draw.spatialDraw.meshes?.limits,'owner memory capacities missing');
      assert.equal(typeof item.final.draw.spatialDraw.coverage.receivedVisibleComplete,'boolean','published/received coverage distinction missing');
      assert.equal(typeof item.final.draw.spatialDraw.preparation?.pending,'boolean','world-view preparation diagnostics missing');
    });
  } catch(error) {result.errors.push(error.stack??String(error));}
  finally {
    clearTimeout(timer);
    if(page&&!page.isClosed()){
      result.probe=await page.evaluate(()=>{const p=window.__WORLD_VIEW_PROOF;if(!p)return null;p.stop();const {stop,...snapshot}=p;return snapshot;}).catch(()=>null);
      result.failureState=await page.evaluate(()=>({body:document.body.innerText.slice(0,4000),draw:window.__HIVE_DRAW_DIAGNOSTICS?.()})).catch(()=>null);
    }
    await Promise.allSettled([...bodyReads]);await cdp?.detach().catch(()=>{});await context?.close().catch(()=>{});await browser?.close().catch(()=>{});liveBrowser=undefined;
    const p=result.probe;
    if(p){
      result.inputSummary={queueEstimateMs:summary(p.inputs.map(e=>e.queueEstimateMs)),nextRafOpportunityMs:summary(p.inputs.map(e=>e.rafOpportunityMs)),
        driverDispatchRoundTripMs:summary(result.driverInputs.map(e=>e.roundTripMs)),
        trustedEvents:p.inputs.filter(e=>e.trusted).length,keydown:p.inputs.filter(e=>e.type==='keydown').length,wheel:p.inputs.filter(e=>e.type==='wheel').length,
        eventTimingInputDelayMs:summary(p.eventTiming.map(e=>e.processingStart-e.startTime)),eventTimingDurationMs:summary(p.eventTiming.map(e=>e.duration)),
        longTasksMs:summary(p.longTasks.map(e=>e.duration)),rafIntervalsMs:summary(p.frames.map(e=>e.interval)),dropped:p.dropped};
      result.inputByPhase=Object.fromEntries(result.phases.map(phase=>{
        const events=p.inputs.filter(e=>e.phase===phase.name);
        const inPhase=e=>e.startTime>=phase.browserStartedAt&&e.startTime<phase.browserFinishedAt;
        return [phase.name,{inputCount:events.length,queueEstimateMs:summary(events.map(e=>e.queueEstimateMs)),
          nextRafOpportunityMs:summary(events.map(e=>e.rafOpportunityMs)),
          eventTimingDurationMs:summary(p.eventTiming.filter(inPhase).map(e=>e.duration)),longTasksMs:summary(p.longTasks.filter(inPhase).map(e=>e.duration)),
          rafIntervalsMs:summary(p.frames.filter(e=>e.phase===phase.name).map(e=>e.interval))}];
      }));
      if(!result.inputSummary.keydown||!result.inputSummary.wheel)result.errors.push('real key/wheel capture evidence missing');
      const work=p.work.filter(w=>Number.isFinite(w.simulationTime));
      result.workEvidence={samples:work.length,first:work[0],last:work.at(-1),maxWorkers:Math.max(0,...work.map(w=>w.observedWorkers)),
        maxMovingWorkers:Math.max(0,...work.map(w=>w.movingWorkers)),maxStumps:Math.max(0,...work.map(w=>w.stumps)),maxWood:Math.max(0,...work.map(w=>w.wood))};
      if(!work.length||work.at(-1).simulationTime<=work[0].simulationTime||result.workEvidence.maxWorkers!==8||result.workEvidence.maxMovingWorkers===0||result.workEvidence.maxStumps===0||
        !(result.workEvidence.maxStumps>work[0].stumps||result.workEvidence.maxWood>work[0].wood))
        result.errors.push('live authoritative time, eight workers, motion and completed work not all demonstrated');
      if(work.some(w=>w.paused))result.errors.push('workload paused during combined proof');
    }else result.errors.push('browser probe unavailable');
    const returns=result.memory.filter(m=>/returned-gc$/.test(m.name));
    result.heapObservation={returnedUsedBytes:returns.map(m=>m.heap.usedSize),secondMinusFirst:returns.length===2?returns[1].heap.usedSize-returns[0].heap.usedSize:null,
      verdict:'Observational only. Explicit owner limits are gated; persistent return growth needs review and is not a green total-memory proof.'};
    if(result.httpErrors.length)result.errors.push('HTTP errors were observed');
    result.success=result.phases.length>=6&&result.phases.every(p=>p.success)&&result.errors.length===0;
    result.finishedAt=new Date().toISOString();await save();
  }
}
try {
  for(const size of sizes){if(stopped)break;await runCase(size);}
  const normalized=report.cases.map(c=>c.normalized?.draw);
  report.interactionComparison={matched:false,initialLevels:normalized.map(d=>d?.displayedView?.level)};
  if(normalized.length===2&&normalized.every(Boolean)){
    report.interactionComparison.matched=JSON.stringify(normalized[0].camera)===JSON.stringify(normalized[1].camera)&&
      normalized.every(d=>d.displayedView.cutaway===false);
    if(!report.interactionComparison.matched)report.errors.push('64/256 interaction camera or uncut rendered view did not match');
  }
} catch(error){report.errors.push(error.stack??String(error));}
finally {
  clearTimeout(watchdog);process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);
  await liveBrowser?.close().catch(()=>{});report.finishedAt=new Date().toISOString();
  report.success=report.cases.length===sizes.length&&report.cases.every(c=>c.success)&&report.errors.length===0;await save();
}
console.log(JSON.stringify({success:report.success,output,cases:report.cases.map(c=>({size:c.size,success:c.success,phases:c.phases.map(p=>({name:p.name,success:p.success})),errors:c.errors})),errors:report.errors}));
if(!report.success)process.exitCode=1;
