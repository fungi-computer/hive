import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { command, component, entity, query } from "../sdk/authoring";
import { encodeDefinition } from "../sdk/common";
import type { GamePack } from "../contracts";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { z } from "zod";
const emptyInput = z.object({}).strict();

initSync({module:readFileSync("engine/generated/hive_kernel_bg.wasm")});
const Order = component<{stage:string}>("example.order",{version:1,fields:{stage:"string"}});
const id = entity("order.1");
const pack: GamePack = {
  id:"authored-orders",version:1,components:[Order],systems:[],
  definition:encodeDefinition("authored-orders",[Order]),
  commands:{
    designate:command({input:emptyInput,writes:[],lifecycle:[Order],run:()=>({actions:[],writes:[],creates:[{id,components:{[Order.id]:{stage:"queued"}}}]})}),
    cancel:command({input:emptyInput,writes:[],lifecycle:[Order],run:()=>({actions:[],writes:[],removes:[id]})}),
  },
};

test("native authored orders queue while paused, reload, commit on resume and cancel",()=>{
  const port = wasmKernelPort(new WasmKernel());
  const restoredPort = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({port,pack});
    session.start(); session.pause(); session.command("designate",{});
    const queued = session.save();
    const restored = new GameSession({port:restoredPort,pack});
    restored.start(); restored.restore(queued); restored.step(.1);
    assert.equal(restored.save().now,0,"paused orders earn no simulation time");
    assert.equal(restored.save().pendingCreates.length,1,"paused order remains durably queued");
    restored.resume(); restored.step(.1);
    assert.equal(restored.query(query(Order)).length,1);
    const committed = restored.save();
    session.restore(committed);
    assert.equal(session.query(query(Order))[0].id,id);
    assert.throws(()=>session.command("designate",{}),/already exists/);
    session.command("cancel",{}); session.step(.1);
    assert.equal(session.query(query(Order)).length,0);
    restored.restore(session.save());
    assert.equal(restored.query(query(Order)).length,0);
  } finally { port.dispose(); restoredPort.dispose(); }
});
