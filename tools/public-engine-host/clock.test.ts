import test from "node:test";
import {z} from "zod";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../src/engine/region/sqlite-test-owner.mjs";
import { clockRequest } from "./protocol.ts";
import { hostCadence } from "./host-cadence.ts";

test("leases gate recurring clocks while admitted occurrences remain due", () => {
 assert.deepEqual(hostCadence.demand(false, 15_000, 14_999), {kind:"active"});
 assert.deepEqual(hostCadence.demand(false, 15_000, 15_000), {kind:"quiet"});
 assert.deepEqual(hostCadence.demand(true, 50_000, 1), {kind:"quiet"});
 assert.throws(() => hostCadence.demand(false, 1.5, 1), /public-host-format/);
 const due = {singleton:1,format_version:2,pack:"formations",token_hash:"a".repeat(64),paused:0,next_sequence:2,
  lease_until_ms:15_000,due_sequence:2,due_request_json:JSON.stringify(clockRequest(2)),due_deadline_ms:15_100,wake_json:'{"state":"running"}'};
 assert.equal(hostCadence.admit(due, false, 15_000)?.due_deadline_ms, 15_100,
  "an admitted clock request remains an obligation after lease expiry");
 const paused={...due,paused:1,due_sequence:null,due_request_json:null,due_deadline_ms:null};
 const resumed=hostCadence.resume(paused,30_000,15_000);
 assert.equal(resumed.due_sequence,null,"resume changes demand; durable admission stays with the transaction caller");
 assert.equal(hostCadence.admit(resumed,false,15_000)?.due_sequence,2);
});

test("an overrun advances one physical occurrence without building an overdue alarm chain", () => {
 const row = {singleton:1,format_version:2,pack:"formations",token_hash:"a".repeat(64),paused:0,next_sequence:17,
  lease_until_ms:20_000,due_sequence:17,due_request_json:JSON.stringify(clockRequest(17)),due_deadline_ms:12_300,wake_json:'{"state":"running"}'};
 const first = hostCadence.complete(row, 12_350, false);
 assert.equal(first.next_sequence, 18);
 assert.deepEqual(JSON.parse(first.due_request_json!), { id:"clock-18", command:{kind:"step",delta:0.1} });
 assert.equal(first.due_deadline_ms, 12_450);
 const second = hostCadence.complete(first, 12_900, false);
 assert.equal(second.next_sequence, 19);
 assert.equal(second.due_deadline_ms, 13_000);
 assert.throws(() => hostCadence.complete({...row,next_sequence:Number.MAX_SAFE_INTEGER,due_sequence:Number.MAX_SAFE_INTEGER}, 0, false), /public-host-format/);
 assert.throws(() => hostCadence.complete({...row,due_deadline_ms:Number.MAX_SAFE_INTEGER}, Number.MAX_SAFE_INTEGER, false), /public-host-format/);
 assert.throws(() => hostCadence.complete(row, 12_299, false), /public-host-format/);
});

test("scheduled time survives sustained interleaved player revisions and lost receipt retry", () => {
 const db = new DatabaseSync(":memory:");
 const open = () => openRegion({owner: sqliteTestOwner(db), region:"clock-test", clock:{principal:"host"}, program:{
  id:"clock-test-v1", initial:()=>({state:{ticks:0,inputs:0},records:[]}),
  parseState:value=>z.object({ticks:z.number(),inputs:z.number()}).parse(value), parseCommand:value=>z.object({kind:z.string()}).parse(value),
  authorize:(who,command)=>who === (command.kind === "step" ? "host" : "player"),
  execute:(state,command)=>{if(command.kind === "step")state.ticks++;else state.inputs++;return {status:"applied",result:{},events:[]};}
 }});
 try {
  let region = open();
  for(let sequence=0;sequence<100;sequence++) {
   const scheduled = {sequence,request:clockRequest(sequence)};
   region.dispatch("player",{id:`input-${sequence}`,replayEpoch:region.readReplayWindow().epoch,command:{kind:"input"}});
   const receipt = region.dispatchOccurrence("host",scheduled);
   assert.equal(receipt.status,"applied");
   region = open();
   assert.deepEqual(region.dispatchOccurrence("host",scheduled),receipt);
   assert.deepEqual(region.readCommitted().state,{ticks:sequence+1,inputs:sequence+1});
  }
  const stale = region.dispatch("player",{id:"conditional",replayEpoch:region.readReplayWindow().epoch,expectedRevision:0,command:{kind:"input"}});
  assert.equal(stale.status,"rejected");
 } finally {db.close();}
});
