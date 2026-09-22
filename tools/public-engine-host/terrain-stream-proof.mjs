#!/usr/bin/env node
/** Actual DO socket contract proof; uses a fresh isolated bearer world. */
import assert from 'node:assert/strict';
import {validateTerrainMaterialPatch} from '../../engine/src/runtime/terrain-region-materials.js';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
assert(args.has('--endpoint')&&args.has('--origin')&&args.has('--output'),'--endpoint BACKEND --origin FRONTEND --output DIR');
const base=args.get('--endpoint').replace(/\/$/,''),origin=args.get('--origin'),output=args.get('--output');
const running=args.get('--running')==='true',heartbeatMs=Number(args.get('--heartbeat-ms')??0),durationMs=Number(args.get('--duration-ms')??0);
assert(Number.isFinite(heartbeatMs)&&heartbeatMs>=0);assert(Number.isFinite(durationMs)&&durationMs>=0&&durationMs<=120000);
const route=`${base}/v1/colony-performance-256-8`,token=randomBytes(32).toString('hex'),started=Date.now();
const report={endpoint:base,origin,running,heartbeatMs,durationMs,socketExtensions:[],startedAt:new Date().toISOString(),http:[],events:[],requests:[],checks:[],success:false};
const sockets=[];let socketNumber=0;
const save=async()=>{await mkdir(output,{recursive:true});await writeFile(`${output}/REPORT.json`,JSON.stringify(report,null,2)+'\n');};
async function http(path,body){
 assert.notEqual(path,'terrain','proof must not issue HTTP terrain requests');report.http.push({path,method:body?'POST':'GET',atMs:Date.now()-started});
 const response=await fetch(`${route}/${path}`,{method:body?'POST':'GET',headers:{Origin:origin,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200,`${path}: ${response.status}`);return response.json();
}
async function command(kind){const id=`terrain-proof-${randomBytes(12).toString('hex')}`,receipt=await http('command',{id,command:{kind}});assert.equal(receipt.commandId,id);assert.equal(receipt.status,'applied');return receipt;}
async function connect(){
 const {handle}=await http('connect');assert.equal(typeof handle,'string');const url=new URL(`${route}/socket/${encodeURIComponent(handle)}`);url.protocol=url.protocol==='https:'?'wss:':'ws:';
 const socket=new WebSocket(url,{origin}),number=++socketNumber,events=[],received=new Map();sockets.push(socket);
 socket.on('message',raw=>{const event=JSON.parse(raw.toString());events.push(event);report.events.push({socket:number,atMs:Date.now()-started,bytes:raw.length,type:event.type,...(event.type==='terrain-regions'?{event}:{} )});if(event.type==='terrain-regions'&&event.event.kind==='patch'){const requestId=event.event.requestId,count=(received.get(requestId)??0)+1;received.set(requestId,count);if(count%4===0){const credit={type:'terrain-credit',requestId,received:count};report.requests.push({socket:number,atMs:Date.now()-started,...credit});socket.send(JSON.stringify(credit));}}});
 const wait=async(predicate,timeout=30000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const error=events.find(e=>e.type==='error');assert(!error,JSON.stringify(error));const found=events.find(predicate);if(found)return found;assert(socket.readyState!==WebSocket.CLOSED,'socket unexpectedly closed');await new Promise(r=>setTimeout(r,10));}throw new Error('socket event deadline exceeded');};
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});socket.send(JSON.stringify({type:'authenticate',token}));await wait(e=>e.type==='ready');report.socketExtensions.push({socket:number,extensions:socket.extensions});if(heartbeatMs){const timer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN){report.requests.push({socket:number,atMs:Date.now()-started,type:'heartbeat'});socket.send(JSON.stringify({type:'heartbeat'}));}},heartbeatMs);socket.once('close',()=>clearInterval(timer));}const observation=await wait(e=>e.type==='observation');
 return{socket,events,wait,observation,send(value){if(value.type==='terrain-regions')received.set(value.requestId,0);report.requests.push({socket:number,atMs:Date.now()-started,...value});socket.send(JSON.stringify(value));}};
}
function checked(event,request){
 assert.equal(event.requestId,request.requestId);for(const key of ['epoch','terrainRevision'])assert.equal(event[key],request[key],`${key} mismatch`);
 assert(['patch','complete'].includes(event.kind),`unexpected terrain event ${event.kind}`);
 if(event.kind==='patch'){assert(request.regions.some(key=>key.join(',')===event.patch.key.join(',')),'unrequested patch');validateTerrainMaterialPatch(event.patch);assert(Array.isArray(event.patch.surfaces));}
}
async function complete(connection,request){await connection.wait(e=>e.type==='terrain-regions'&&e.event.requestId===request.requestId&&e.event.kind!=='patch');const events=connection.events.filter(e=>e.type==='terrain-regions'&&e.event.requestId===request.requestId).map(e=>e.event);for(const event of events)checked(event,request);assert.equal(events.at(-1).kind,'complete');const patches=events.filter(e=>e.kind==='patch');assert.equal(patches.length,request.regions.length);assert.equal(new Set(patches.map(e=>e.patch.key.join(','))).size,patches.length);return patches;}
try{
 await mkdir(output,{recursive:true});const source=await readFile(new URL(import.meta.url));await writeFile(`${output}/driver.mjs`,source);report.driverSha256=createHash('sha256').update(source).digest('hex');
 await http('observe');await command(running?'resume':'pause');const initial=await http('observe');assert.equal(initial.observation.paused,!running);const first=await connect(),terrain=first.observation.observation.terrain;
 assert.equal(terrain.baseline.protocolVersion,5);const identity={epoch:first.observation.observation.epoch,terrainRevision:terrain.revision};assert(Number.isInteger(identity.terrainRevision));
 const regions=Array.from({length:32},(_,i)=>[i%8-4,Math.floor(i/8)-2,0]);const request={type:'terrain-regions',requestId:1,...identity,regions};first.send(request);
 const patch=await first.wait(e=>e.type==='terrain-regions'&&e.event.requestId===1);checked(patch.event,request);assert.equal(patch.event.kind,'patch','completion arrived before any patch');
 // Pause command shares the durable owner queue while region reads are in flight.
 await command(running?'resume':'pause');const patches=await complete(first,request);assert(patches.some(p=>p.patch.columns.length>0));report.checks.push(`incremental useful region patches precede completion; ${running?'resume':'pause'} interleaved`);
 let repeatId=100;while(Date.now()-started<durationMs){const repeat={...request,requestId:repeatId++};first.send(repeat);await complete(first,repeat);}
 const canceled={...request,requestId:2,regions:Array.from({length:128},(_,i)=>[i%16-8,Math.floor(i/16)-4,0])};first.send(canceled);
 await first.wait(e=>e.type==='terrain-regions'&&e.event.requestId===2&&e.event.kind==='patch');first.send({type:'terrain-cancel',requestId:2});const replacement={...request,requestId:3,regions:[[8,0,0],[8,1,0]]};first.send(replacement);await complete(first,replacement);
 const canceledEvents=first.events.filter(e=>e.type==='terrain-regions'&&e.event.requestId===2).map(e=>e.event);report.cancellation={patches:canceledEvents.filter(e=>e.kind==='patch').length,completed:canceledEvents.some(e=>e.kind==='complete'),requested:canceled.regions.length};assert(report.cancellation.patches<canceled.regions.length,'cancellation failed: all128 patches delivered');assert(!report.cancellation.completed,'canceled stream delivered completion');
 const replacementFirst=first.events.findIndex(e=>e.type==='terrain-regions'&&e.event.requestId===3);assert(!first.events.slice(replacementFirst).some(e=>e.type==='terrain-regions'&&e.event.requestId===2),'canceled stream leaked after replacement started');report.checks.push('cancel and replace settles new identity without old-stream leakage');
 const reconnect={...canceled,requestId:4};first.send(reconnect);await first.wait(e=>e.type==='terrain-regions'&&e.event.requestId===4&&e.event.kind==='patch');first.socket.close();await new Promise(r=>first.socket.once('close',r));
 const retained=first.events.filter(e=>e.type==='terrain-regions'&&e.event.requestId===4&&e.event.kind==='patch').map(e=>e.event);for(const event of retained)checked(event,reconnect);const seen=new Set(retained.map(e=>e.patch.key.join(','))),missing=reconnect.regions.filter(key=>!seen.has(key.join(',')));assert(missing.length>0,'stream finished before reconnect exercise');
 const second=await connect();if(!running)assert.equal(second.observation.observation.time,initial.observation.time);const resumed={...reconnect,regions:missing};second.send(resumed);const recovered=await complete(second,resumed);assert(recovered.every(e=>!seen.has(e.patch.key.join(','))));assert.equal(seen.size+recovered.length,reconnect.regions.length);report.reconnect={retained:seen.size,requestedMissing:missing.length};report.checks.push('reauthenticated same world; only missing region keys requested and returned');
 const final=await http('observe');assert.equal(final.observation.paused,!running);if(!running)assert.equal(final.observation.time,initial.observation.time,'terrain reads advanced paused simulation time');else assert(final.observation.time>initial.observation.time,'unpaused world did not advance');report.simulationTime={before:initial.observation.time,after:final.observation.time};report.checks.push(running?'running simulation advances alongside terrain reads':'terrain reads do not advance paused simulation time');report.success=true;
}catch(error){report.error=String(error).replaceAll(token,'[redacted]');process.exitCode=1;}finally{if(running)await command('pause').catch(error=>{report.cleanupError=String(error).replaceAll(token,'[redacted]');});for(const socket of sockets)socket.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({success:report.success,checks:report.checks,error:report.error}));}
