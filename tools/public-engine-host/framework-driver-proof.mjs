/** Short local workerd law, not the 10-minute hosted capacity qualification. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import WebSocket from "ws";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";

assert(process.argv[2] === "--output", "Usage: node framework-driver-proof.mjs --output <directory> [--minimum-sequence <3..100>] [--clients <0..4>]");
const cliOptions = new Map();
for (let index = 4; index < process.argv.length; index += 2) {
  assert(["--minimum-sequence", "--clients"].includes(process.argv[index]) && process.argv[index + 1] !== undefined, "invalid proof option");
  cliOptions.set(process.argv[index], process.argv[index + 1]);
}
const minimumSequence = Number(cliOptions.get("--minimum-sequence") ?? 25);
const clientCount = Number(cliOptions.get("--clients") ?? 2);
assert(Number.isInteger(minimumSequence) && minimumSequence >= 3 && minimumSequence <= 100);
assert(Number.isInteger(clientCount) && clientCount >= 0 && clientCount <= 4);
const output = resolve(process.argv[3]);
await mkdir(output, {recursive:true});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const ledger = [];
const token = randomBytes(32).toString("hex");
const tokenHash = hash(token);
const game = "colony-framework-proof-256-100-v3";
const root = process.cwd();
const workerPath = resolve(output,"worker.mjs"), wasmPath = resolve(output,"hive_kernel_bg.wasm");
// Proof-only RPC invokes the real Region replay boundary; no public route,
// schedule mutation, replacement driver or step acceleration is added.
const entry = `import production, {PublicEngineRegion as Base} from ${JSON.stringify(resolve("tools/public-engine-host/worker.ts"))};
import {clockRequest} from ${JSON.stringify(resolve("tools/public-engine-host/protocol.ts"))};
export default production;
export class PublicEngineRegion extends Base {
  async proofReplayLastClock() {
    await this.ready;
    return this.serial(() => {
      const sequence = this.hostRow().next_sequence - 1;
      return JSON.stringify(this.region.dispatchOccurrence(this.pack + '-host', {sequence,request:clockRequest(sequence)}));
    });
  }
}`;
await build({stdin:{contents:entry,resolveDir:root,loader:"ts"},outfile:workerPath,bundle:true,format:"esm",platform:"neutral",target:"es2022",external:["cloudflare:workers"],
  plugins:[{name:"wasm",setup(build){build.onResolve({filter:/\.wasm$/},()=>({path:"./hive_kernel_bg.wasm",external:true}));}}]});
await copyFile(resolve("engine/generated/hive_kernel_bg.wasm"),wasmPath);
const inventory = await Promise.all(["tools/public-engine-host/worker.ts","tools/public-engine-host/host-cadence.ts","tools/public-engine-host/pack-registration.ts","engine/src/runtime/occurrence-driver.ts","engine/src/runtime/region-program.ts","src/engine/region/index.ts","engine/src/games/colony-framework-proof-v2-driver.ts","engine/src/games/colony-performance-config.ts","engine/src/games/colony-framework-proof-v3.ts","src/engine/region/records.ts","engine/generated/hive_kernel_bg.wasm"].map(async path=>({path,sha256:hash(await readFile(path))})));
const implementationHash = hash(JSON.stringify(inventory));
let mf;
const options = { workers: [{ name:"hive-framework-driver-proof", modules:[{type:"ESModule",path:workerPath},{type:"CompiledWasm",path:wasmPath}],
  compatibilityDate:"2026-09-04", durableObjects:{REGIONS:{className:"PublicEngineRegion",useSQLite:true}},
  bindings:{IMPLEMENTATION_HASH:implementationHash,PUBLIC_ORIGIN:"https://framework-proof.invalid"} }],
  resourcePersistencePath:resolve(output,"storage"),isolatedResourcePersistencePath:resolve(output,"storage"),log:new Log(LogLevel.ERROR),port:0, handleStructuredLogs(log) { try { const value=JSON.parse(log.message); if(value.proof === "framework-host-cost-v1") ledger.push(value); } catch {} } };
const start = async()=>{mf=new Miniflare(convertV4MiniflareOptions(options));await mf.ready;};
const endpoint = `http://framework.test/v1/${game}`;
const request = async(operation,body)=>{
  const response=await mf.dispatchFetch(`${endpoint}/${operation}`,{headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{method:"POST",body:JSON.stringify(body)}:{})});
  const text=await response.text();assert.equal(response.status,200,text);return JSON.parse(text);
};
const rows = async()=>{
  for(const path of await readdir(resolve(output,"storage"),{recursive:true}).catch(error=>{if(error.code==="ENOENT")return[];throw error;})) {
    if(!path.endsWith(".sqlite"))continue;
    let db;
    try {
      db=new DatabaseSync(resolve(output,"storage",path),{readOnly:true});
      if(!db.prepare("SELECT name FROM sqlite_master WHERE name='hive_public_host'").get())continue;
      const host=db.prepare("SELECT * FROM hive_public_host WHERE token_hash=?").get(tokenHash);
      if(host){const clock=db.prepare("SELECT * FROM hive_region_clock").get();const region=db.prepare("SELECT revision,state_json FROM hive_region").get();const stockpiles=host.paused ? db.prepare("SELECT record_bytes FROM hive_region_records WHERE record_key LIKE 'kernel/state/entities/%'").all().map(row=>JSON.parse(new TextDecoder().decode(row.record_bytes))).filter(row=>row.components["hive.stockpile-cell"]) : [];
        return{host,clock,region,stockpiles};}
    } catch(error) {
      if(error?.errcode===5 || error?.errstr==="database is locked") return undefined;
      throw error;
    } finally { db?.close(); }
  }
};
const until = async(check,label)=>{const deadline=Date.now()+30_000;while(Date.now()<deadline){const value=await check();if(value)return value;await delay(20);}throw new Error(`timed out: ${label}`);};
const checkpoints=[];
const clients=[];
const occurrenceObservations=[];
let lastObservedSequence;
let lastObservedAt;
async function connectClient(number) {
  const { handle } = await request("connect");
  const local = await mf.ready;
  const url = new URL(`/v1/${game}/socket/${encodeURIComponent(handle)}`, local);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url, { origin: "https://framework-proof.invalid", headers: { host: "framework.test" } });
  const events = [];
  const client = { number, socket, events, observations: 0, slow: number === 2 };
  clients.push(client);
  socket.on("message", raw => {
    const event = JSON.parse(raw.toString());
    events.push(event);
    if (event.type === "observation") {
      client.observations++;
      if (!client.slow) socket.send(JSON.stringify({ type: "observation-ack", revision: event.revision, replayEpoch: event.replayEpoch }));
    }
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "authenticate", token }));
  await until(() => events.find(event => event.type === "ready"), `socket ${number} authentication`);
  await until(() => events.find(event => event.type === "observation"), `socket ${number} initial observation`);
  return client;
}
try {
  await start();
  const started = performance.now();
  const initial=await request("observe");
  for (let index = 0; index < clientCount; index++) await connectClient(index + 1);
  await until(async()=>{const value=await rows();if(value){
    const observedAt=performance.now();
    if(lastObservedSequence!==value.host.next_sequence){
      if(lastObservedSequence!==undefined) occurrenceObservations.push({sequence:value.host.next_sequence,observedIntervalMs:observedAt-lastObservedAt,deadlineAheadMs:value.host.due_deadline_ms===null?null:value.host.due_deadline_ms-Date.now()});
      lastObservedSequence=value.host.next_sequence;lastObservedAt=observedAt;
    }
    if(value.host.next_sequence>=minimumSequence)return value;
  }return null;},"scheduled second occurrence");
  if(clients.length>=2){
    assert.ok(clients[0].observations>1,"fast client keeps receiving committed observations");
    assert.equal(clients[1].observations,1,"slow client retains one unacknowledged frame without blocking simulation");
    clients[1].socket.send(JSON.stringify({type:"observation-ack",revision:clients[1].events.find(event=>event.type==="observation").revision,replayEpoch:clients[1].events.find(event=>event.type==="observation").replayEpoch}));
    await until(()=>clients[1].observations>1?true:null,"slow client resumes after acknowledging");
  }
  const pauseBody={id:"proof-pause",replayEpoch:initial.replayEpoch,command:{kind:"pause"}};
  const paused=await request("command",pauseBody);
  assert.deepEqual(await request("command",pauseBody),paused,"lost ordinary reply preserves exact result");
  const checkpoint=await rows();
  assert.equal(checkpoint.host.paused,1);
  assert.equal(checkpoint.stockpiles.length,4,"all four scheduled stockpile cells are durable");
  const saved=JSON.parse(checkpoint.region.state_json).session;
  assert.ok(saved.now>=.3);
  // The four scheduled stockpiles are canonical authored entities, not UI labels.
  const namespace=await mf.getDurableObjectNamespace("REGIONS");
  const stub=namespace.get(namespace.idFromName(`${game}:${tokenHash}`));
  const receipt=JSON.parse(await stub.proofReplayLastClock());
  assert.deepEqual(receipt,JSON.parse(checkpoint.clock.last_receipt_json));
  assert.deepEqual((await rows()).region,checkpoint.region,"duplicate occurrence does not mutate world");
  checkpoints.push({stage:"paused",sequence:checkpoint.host.next_sequence,revision:checkpoint.region.revision,clockResult:receipt.result,stockpiles:checkpoint.stockpiles});
  await mf.dispose();mf=undefined;
  await start();
  const reopenedNamespace=await mf.getDurableObjectNamespace("REGIONS");
  const reopened=reopenedNamespace.get(reopenedNamespace.idFromName(`${game}:${tokenHash}`));
  assert.deepEqual(JSON.parse(await reopened.proofReplayLastClock()),receipt,"clock receipt survives process restart");
  const resume=await request("command",{id:"proof-resume",replayEpoch:paused.replayEpoch,command:{kind:"resume"}});
  await mf.dispose();mf=undefined;
  const before=await rows();
  await start();
  // Read the persisted DB from Node: no request to the Region wakes it.
  const progressed=await until(async()=>{const value=await rows();return value?.host.next_sequence>before.host.next_sequence?value:null;},"autonomous alarm after process restart");
  checkpoints.push({stage:"autonomous-restart",beforeSequence:before.host.next_sequence,sequence:progressed.host.next_sequence,revision:progressed.region.revision});
  const stop=await request("command",{id:"proof-stop",replayEpoch:resume.replayEpoch,command:{kind:"pause"}});
  assert.equal(stop.status,"applied");
  await delay(50);
  for (const client of clients) client.socket.close();
  const final=await rows();
  const distribution=values=>{const sorted=[...values].sort((a,b)=>a-b),at=f=>sorted[Math.max(0,Math.ceil(sorted.length*f)-1)]??0;return{count:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)??0,total:values.reduce((a,b)=>a+b,0)}};
  const elapsedIntervals=occurrenceObservations.map(sample=>sample.observedIntervalMs);
  const wakeLateness=ledger.filter(sample=>sample.kind==="committed-steps").flatMap(sample=>sample.samples.map(step=>step.alarmLatenessMs));
  const transactionElapsed=ledger.filter(sample=>sample.kind==="committed-steps").flatMap(sample=>sample.samples.map(step=>step.transactionWallMs));
  await writeFile(resolve(output,"RESULT.json"),JSON.stringify({source:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),dirtySource:execFileSync("git",["status","--porcelain"],{encoding:"utf8"}).trim(),implementationHash,inventory,game,checkpoints,ledger,clients:clients.map(({number,observations,slow})=>({number,observations,slow})),elapsedWallMs:performance.now()-started,minimumSequence,clientCount,finalSequence:final.host.next_sequence,
    cadenceLedger:{clock:"performance.now() observation between durable sequence changes; 20ms storage polling can add observation delay",observedIntervalsMs:distribution(elapsedIntervals),alarmLatenessMs:distribution(wakeLateness),transactionElapsedMs:distribution(transactionElapsed),samples:occurrenceObservations},
    limits:["Short actual-workerd host law, not capacity or 10-minute qualification","Elapsed timers are wall measurements, not CPU measurements; observer polling adds latency","Proof-only RPC replays the last actual Region occurrence; production routes are unchanged","Exhaustive schedule parity and real native command rollback are covered by occurrence-driver.test.ts"]},null,2));
  console.log(JSON.stringify({proof:"framework-driver-workerd",status:"passed",output,checkpoints,clients:clients.map(({number,observations})=>({number,observations}))}));
}finally{for (const client of clients) client.socket.close();await mf?.dispose();}
