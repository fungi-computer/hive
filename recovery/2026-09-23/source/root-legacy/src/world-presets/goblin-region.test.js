import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadOptimizer } from "../engine/colony/loader.ts";
import { createGoblinRegionProgram } from "./goblin-region.ts";
const colony=await loadOptimizer(await WebAssembly.compile(await readFile(new URL("../engine/colony/colony.wasm",import.meta.url))));
const p=createGoblinRegionProgram(colony);
const dig={kind:"order",command:{kind:"dig",party:"home",actors:null,x:7,z:9,level:0}};
test("player and host grants differ; paused/no-change actions produce no false events",()=>{
 const s=p.initial();
 assert(p.authorize("goblin-player",dig,s)); assert(!p.authorize("goblin-host",dig,s));
 assert(!p.authorize("goblin-player",{kind:"advance",ticks:1},s));
 assert(!p.authorize("goblin-player",{...dig,command:{...dig.command,party:"other"}},s));
 assert.deepEqual(p.execute(s,{kind:"advance",ticks:120}),{status:"applied",result:{tick:0,advanced:0},events:[]});
 assert.deepEqual(p.execute(s,{kind:"set-paused",paused:true}).events,[]);
 assert(!Object.hasOwn(s.clearing,"commands"));
});
test("paused admitted dig becomes real pawn work; reconstruction preserves running work and one soil result",()=>{
 const s=p.initial(); const admitted=p.execute(s,dig);
 assert.equal(admitted.status,"applied"); assert.deepEqual(admitted.result.createdJobs,s.clearing.jobs.map(j=>j.id));
 assert.equal(s.clearing.tick,0); assert.deepEqual(s.clearing.terrain.edits,[]);
 p.execute(s,{kind:"set-paused",paused:false}); p.execute(s,{kind:"advance",ticks:10});
 const resumed=p.parseState(JSON.parse(JSON.stringify(s)));
 assert.equal(resumed.clearing.paused,false); assert.equal(resumed.clearing.tick,10);
 assert.deepEqual(resumed,s);
 p.execute(s,{kind:"advance",ticks:50}); p.execute(resumed,{kind:"advance",ticks:50});
 assert.deepEqual(resumed,s); assert.deepEqual(s.clearing.terrain.edits,[{x:7,z:9,level:0}]);
 assert.equal(s.clearing.materials.lots.filter(l=>l.material==="soil").reduce((n,l)=>n+l.quantity,0),1);
});

test("maintained optimizer identity is immutable and mismatched durable program refuses reopen without mutation", async t=>{
 const { DatabaseSync }=await import("node:sqlite");
 const { openRegion }=await import("../engine/region/index.ts");
 assert(Object.isFrozen(colony)); assert(p.id.includes(colony.buildId)); assert(p.id.length<=160);
 assert.throws(()=>createGoblinRegionProgram({...colony,buildId:"invented"}),/invalid-optimizer-build-identity/);
 const db=new DatabaseSync(":memory:");t.after(()=>db.close());
 const owner={sql:{exec(sql,...bindings){if(sql.startsWith("CREATE TABLE")){db.exec(sql);return {toArray:()=>[]};}const rows=db.prepare(sql).all(...bindings);return {toArray:()=>rows};}},transactionSync(fn){db.exec("BEGIN");try{const result=fn();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}}};
 const region=openRegion({owner,region:"goblin-law",program:p});
 region.dispatch("goblin-player",{id:"dig",expectedRevision:0,command:dig});
 const before=db.prepare("SELECT * FROM hive_region").all();
 // A different registered build changes the durable program contract.
 assert.throws(()=>openRegion({owner,region:"goblin-law",program:createGoblinRegionProgram({...colony,buildId:`${"0".repeat(64)}:${"1".repeat(64)}`})}),/region-identity-conflict/);
 assert.deepEqual(db.prepare("SELECT * FROM hive_region").all(),before);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM hive_region_receipts").get().n,1);
 assert.deepEqual(openRegion({owner,region:"goblin-law",program:createGoblinRegionProgram(colony)}).readCommitted(),region.readCommitted());
});
