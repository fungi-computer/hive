/** Short local workerd law, not the 10-minute hosted capacity qualification. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";

assert(process.argv[2] === "--output" && (process.argv.length === 4 || process.argv.length === 6 && process.argv[4] === "--minimum-sequence"), "Usage: node framework-driver-proof.mjs --output <directory> [--minimum-sequence <3..100>]");
const minimumSequence = Number(process.argv[5] ?? 3);
assert(Number.isInteger(minimumSequence) && minimumSequence >= 3 && minimumSequence <= 100);
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
const inventory = await Promise.all(["tools/public-engine-host/worker.ts","tools/public-engine-host/pack-registration.ts","engine/src/runtime/occurrence-driver.ts","engine/src/runtime/region-program.ts","src/engine/region/index.ts","engine/src/games/colony-framework-proof-v2-driver.ts","engine/src/games/colony-performance-config.ts","engine/src/games/colony-framework-proof-v3.ts","src/engine/region/records.ts","engine/generated/hive_kernel_bg.wasm"].map(async path=>({path,sha256:hash(await readFile(path))})));
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
    const db=new DatabaseSync(resolve(output,"storage",path),{readOnly:true});
    try {
      if(!db.prepare("SELECT name FROM sqlite_master WHERE name='hive_public_host'").get())continue;
      const host=db.prepare("SELECT * FROM hive_public_host WHERE token_hash=?").get(tokenHash);
      if(host){const clock=db.prepare("SELECT * FROM hive_region_clock").get();const region=db.prepare("SELECT revision,state_json FROM hive_region").get();const stockpiles=host.paused ? db.prepare("SELECT record_bytes FROM hive_region_records WHERE record_key LIKE 'kernel/state/entities/%'").all().map(row=>JSON.parse(new TextDecoder().decode(row.record_bytes))).filter(row=>row.components["hive.stockpile-cell"]) : [];
        return{host,clock,region,stockpiles};}
    }finally{db.close();}
  }
};
const until = async(check,label)=>{const deadline=Date.now()+30_000;while(Date.now()<deadline){const value=await check();if(value)return value;await delay(50);}throw new Error(`timed out: ${label}`);};
const checkpoints=[];
try {
  await start();
  const started = performance.now();
  const initial=await request("observe");
  await until(async()=>{const value=await rows();return value?.host.next_sequence>=minimumSequence?value:null;},"scheduled second occurrence");
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
  const final=await rows();
  await writeFile(resolve(output,"RESULT.json"),JSON.stringify({source:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),dirtySource:execFileSync("git",["status","--porcelain"],{encoding:"utf8"}).trim(),implementationHash,inventory,game,checkpoints,ledger,elapsedWallMs:performance.now()-started,minimumSequence,finalSequence:final.host.next_sequence,
    limits:["Short actual-workerd host law, not capacity or 10-minute qualification","Proof-only RPC replays the last actual Region occurrence; production routes are unchanged","Exhaustive schedule parity and real native command rollback are covered by occurrence-driver.test.ts"]},null,2));
  console.log(JSON.stringify({proof:"framework-driver-workerd",status:"passed",output,checkpoints}));
}finally{await mf?.dispose();}
