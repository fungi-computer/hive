import test from "node:test";
import {z} from "zod";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../src/engine/region/sqlite-test-owner.mjs";
import { clockRequest } from "./protocol.ts";

test("scheduled time survives sustained interleaved player revisions and lost receipt retry", () => {
 const db = new DatabaseSync(":memory:");
 const open = () => openRegion({owner: sqliteTestOwner(db), region:"clock-test", clock:{principal:"host"}, program:{
  id:"clock-test-v1", initial:()=>({ticks:0,inputs:0}),
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
