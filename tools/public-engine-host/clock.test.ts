import test from "node:test";
import {z} from "zod";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../src/engine/region/sqlite-test-owner.mjs";
import { clockRequest } from "./protocol.ts";
import { advanceClockOccurrence } from "./clock-schedule.ts";

test("late catchup advances one occurrence and keeps the scheduled cadence", () => {
 const first = advanceClockOccurrence(17, 12_300);
 assert.equal(first.sequence, 18);
 assert.deepEqual(JSON.parse(first.request), { id:"clock-18", command:{kind:"step",delta:0.1} });
 assert.equal(first.deadline, 12_400);
 const second = advanceClockOccurrence(first.sequence, first.deadline);
 assert.equal(second.sequence, 19);
 assert.equal(second.deadline, 12_500);
 assert.throws(() => advanceClockOccurrence(Number.MAX_SAFE_INTEGER, 0), /public-host-format/);
 assert.throws(() => advanceClockOccurrence(0, Number.MAX_SAFE_INTEGER), /public-host-format/);
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
   region.dispatch("player",{id:`input-${sequence}`,command:{kind:"input"}});
   const receipt = region.dispatchOccurrence("host",scheduled);
   assert.equal(receipt.status,"applied");
   region = open();
   assert.deepEqual(region.dispatchOccurrence("host",scheduled),receipt);
   assert.deepEqual(region.readCommitted().state,{ticks:sequence+1,inputs:sequence+1});
  }
  const stale = region.dispatch("player",{id:"conditional",expectedRevision:0,command:{kind:"input"}});
  assert.equal(stale.status,"rejected");
 } finally {db.close();}
});
