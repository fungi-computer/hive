/** Bounded actual-workerd fault/restart law. Injection exists only in this bundle. */
import assert from "node:assert/strict";
import {build} from "esbuild";
import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from "miniflare";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,copyFile,readFile,writeFile,readdir} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {execFileSync} from "node:child_process";
assert(process.argv[2]==="--output" && process.argv.length===4,"--output <new directory>");
const output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const game="colony-framework-proof-256-100-v3";
const workerPath=resolve(output,"worker.mjs"),wasmPath=resolve(output,"hive_kernel_bg.wasm");
const entry=`import production,{PublicEngineRegion as Base} from ${JSON.stringify(resolve("tools/public-engine-host/worker.ts"))};
import {clockRequest} from ${JSON.stringify(resolve("tools/public-engine-host/protocol.ts"))};
export default production;
export class PublicEngineRegion extends Base {
 constructor(state,env){super(state,env);const execute=this.owner.sql.exec;
  this.owner.sql.exec=(sql,...bindings)=>{const result=execute(sql,...bindings);
   if(sql.startsWith('UPDATE hive_region_clock SET') && bindings[0]===2 && this.hostStatus().state==='running'){
    console.log(JSON.stringify({proof:'injected-clock-failure',code:env.PROOF_FAILURE_CODE}));
    throw Error(env.PROOF_FAILURE_CODE);
   }return result;
  };
 }
 async proofInspect(){await this.ready;return JSON.stringify({host:this.hostRow(),alarm:await this.state.storage.getAlarm(),startupFailure:this.startupFailure});}
 async proofReplay(){await this.ready;return this.serial(()=>JSON.stringify(this.region.dispatchOccurrence(this.pack+'-host',{sequence:0,request:clockRequest(0)})));}
 async proofUnsupported(){await this.ready;this.owner.sql.exec('UPDATE hive_public_host SET format_version=1');await this.state.storage.setAlarm(Date.now()+1000);}
}`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:"ts"},outfile:workerPath,bundle:true,format:"esm",platform:"neutral",target:"es2022",external:["cloudflare:workers"],plugins:[{name:"wasm",setup(b){b.onResolve({filter:/\.wasm$/},()=>({path:"./hive_kernel_bg.wasm",external:true}));}}]});
await copyFile("engine/generated/hive_kernel_bg.wasm",wasmPath);
const inventory=await Promise.all(["tools/public-engine-host/worker.ts","tools/public-engine-host/host-cadence.ts","engine/src/runtime/host-status.ts","src/engine/region/index.ts","src/engine/region/records.ts","engine/generated/hive_kernel_bg.wasm"].map(async path=>({path,sha256:hash(await readFile(path))})));
const implementationHash=hash(JSON.stringify(inventory));
const results=[];
for(const code of ["region-record-capacity","injected-storage-failure"]){
 const dir=resolve(output,code),storage=resolve(dir,"storage");await mkdir(dir,{recursive:true});
 const token=randomBytes(32).toString("hex"),tokenHash=hash(token);let mf;
 const injections=[];
 const opts={workers:[{name:"host-fault-proof",modules:[{type:"ESModule",path:workerPath},{type:"CompiledWasm",path:wasmPath}],compatibilityDate:"2026-09-04",durableObjects:{REGIONS:{className:"PublicEngineRegion",useSQLite:true}},bindings:{IMPLEMENTATION_HASH:implementationHash,PUBLIC_ORIGIN:"https://fault.invalid",PROOF_FAILURE_CODE:code}}],resourcePersistencePath:storage,isolatedResourcePersistencePath:storage,log:new Log(LogLevel.ERROR),port:0,handleStructuredLogs(log){try{const value=JSON.parse(log.message);if(value.proof==='injected-clock-failure')injections.push(value);}catch{}}};
 const start=async()=>{mf=new Miniflare(convertV4MiniflareOptions(opts));await mf.ready;};
 const request=async(operation,body,status=200)=>{const response=await mf.dispatchFetch(`http://proof/v1/${game}/${operation}`,{headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{method:"POST",body:JSON.stringify(body)}:{})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
 const stub=async()=>{const ns=await mf.getDurableObjectNamespace("REGIONS");return ns.get(ns.idFromName(`${game}:${tokenHash}`));};
 const rows=async()=>{for(const path of await readdir(storage,{recursive:true}).catch(()=>[])){if(!path.endsWith('.sqlite'))continue;const db=new DatabaseSync(resolve(storage,path),{readOnly:true});try{if(!db.prepare("SELECT name FROM sqlite_master WHERE name='hive_public_host'").get())continue;const host=db.prepare("SELECT * FROM hive_public_host WHERE token_hash=?").get(tokenHash);if(host)return{host,region:db.prepare('SELECT revision,state_json,record_count,record_bytes,limits_json FROM hive_region').get(),clock:db.prepare('SELECT * FROM hive_region_clock').get(),records:db.prepare('SELECT * FROM hive_region_records ORDER BY record_key').all().map(row=>({...row,record_bytes:Buffer.from(row.record_bytes).toString('hex')}))};}finally{db.close();}}};
 const until=async(check,label)=>{const end=Date.now()+30_000;while(Date.now()<end){const value=await check();if(value)return value;await delay(40);}throw Error(label);};
 try{
  await start();
  const pause={id:"pause-before-clock",replayEpoch:0,command:{kind:"pause"}};
  const paused=await request("command",pause);
  const resume={id:"resume-original",replayEpoch:0,command:{kind:"resume"}};
  const resumed=await request("command",resume);
  const failed=await until(async()=>{const r=await rows();return r && JSON.parse(r.host.wake_json).state!=='running'?r:null;},"fault metadata");
  const policy=JSON.parse(failed.region.limits_json); assert.equal(policy.records,65536); assert.equal(policy.storageBytes,32*1024*1024);
  assert.equal(failed.host.next_sequence,1);assert.equal(failed.clock.next_sequence,1);
  const expected=code==='region-record-capacity'?'faulted':'retrying';assert.equal(JSON.parse(failed.host.wake_json).state,expected);
  const persistedReceipt=JSON.parse(failed.clock.last_receipt_json);
  if(expected==='faulted'){
   const inspection=JSON.parse(await (await stub()).proofInspect());assert.equal(inspection.alarm,null);
   const observation=await request('observe');assert.equal(observation.hostStatus.state,'faulted');
   const connection=await request('connect');assert.deepEqual(connection.hostStatus,observation.hostStatus);
   assert.deepEqual(await request('command',pause),paused);assert.deepEqual(await request('command',resume),resumed);
   const rejected=await request('command',{id:'new-order',replayEpoch:0,command:{kind:'pause'}},423);assert.equal(rejected.hostStatus.state,'faulted');
   assert.deepEqual(JSON.parse(await (await stub()).proofReplay()),persistedReceipt);
   await mf.dispose();mf=undefined;await start();
   // No Region request during this interval: only externally read SQLite state.
   await delay(1200);const after=await rows();
   assert.deepEqual(after.region,failed.region);assert.deepEqual(after.records,failed.records);assert.deepEqual(after.clock,failed.clock);
   assert.equal(after.host.due_request_json,failed.host.due_request_json);assert.equal(after.host.due_sequence,failed.host.due_sequence);
   assert.equal(JSON.parse(await (await stub()).proofInspect()).alarm,null);
   assert.equal((await request('observe')).hostStatus.state,'faulted');
   assert.equal(injections.length,1);
   await (await stub()).proofUnsupported();await mf.dispose();mf=undefined;await start();
   const unsupported=JSON.parse(await (await stub()).proofInspect());assert.equal(unsupported.alarm,null);assert.equal(unsupported.startupFailure,'unsupported-world');
   assert.equal((await request('observe',undefined,503)).error,'unsupported-world');
   assert.deepEqual((await rows()).records,failed.records);
   results.push({code,status:expected,attempts:injections.length,sequence:failed.host.next_sequence,recordCount:failed.region.record_count,alarm:null,restartPreservedWorld:true,unsupportedStopsAlarm:true});
  }else{
   await mf.dispose();mf=undefined;await start();
   const recovered=await until(async()=>{const r=await rows();return r?.host.next_sequence>=2?r:null;},'transient autonomous recovery');
   assert.equal(JSON.parse(recovered.host.wake_json).state,'running');
   await request('command',{id:'stop-after-recovery',replayEpoch:0,command:{kind:'pause'}});
   assert.equal(injections.length,1);
   results.push({code,status:'recovered',attempts:injections.length,fromSequence:1,toSequence:recovered.host.next_sequence,requestFreeRecovery:true});
  }
 }finally{await mf?.dispose();}
}
await writeFile(resolve(output,'RESULT.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inventory,implementationHash,results,limits:['Local workerd crash/retry correctness, not hosted capacity.','If storage cannot persist retry/fault metadata or any alarm, finite platform retry law remains outside this application proof.','Injection throws after the real native candidate, record writes and clock UPDATE; it is not a production route.']},null,2));
console.log(JSON.stringify({proof:'host-fault-workerd',status:'passed',output,results}));
