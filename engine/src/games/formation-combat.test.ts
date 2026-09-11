import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel, preview_projectile } from "../../generated/hive_kernel.js";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { GameSession } from "../runtime/session";
import { formationsPack, Health, Morale } from "./formations";
import { MaterialLot, Position } from "../sdk/common";
import { query } from "../sdk/authoring";
initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
const velocity={x:8*Math.cos(0.12),y:8*Math.sin(0.12),z:0};
test("one real formation shot hits three soldiers once and restores the same flight",()=>{
 const port=wasmKernelPort(new WasmKernel());
 try {
  const session=new GameSession({port,pack:formationsPack});session.start();
  const facts=port.renderFacts(); const launcher=facts.find(f=>f.aim)!; const {origin,muzzle,inheritedVelocity,radius,gravity,penetration,maxRange,maxLifetime}=launcher.aim!;
  const preview=JSON.parse(preview_projectile(JSON.stringify({origin,muzzle,inheritedVelocity,velocity,radius,gravity,penetration,maxRange,maxLifetime,colliders:facts.filter(f=>f.collision&&f.id!==launcher.id).map(f=>f.collision)})));
  assert.deepEqual(preview.contacts.filter((c:any)=>c.response==='pierce').map((c:any)=>c.targetId),['formations.unit.1','formations.unit.2','formations.unit.3']);
  assert(preview.contacts.some((c:any)=>c.response==='ground'));
  assert(preview.trajectory.some((p:any)=>p.position.y>origin.y+muzzle.y));
  session.command('fire',{velocity});session.step(0.1);const flight=session.save();
  const state=()=>session.query(query(Health,Morale,Position)).map(row=>({id:row.id,health:row.get(Health).value,morale:row.get(Morale).value,position:row.get(Position)}));
  for(let i=0;i<40;i++)session.step(0.1);
  const after=state();assert.deepEqual(after.map(r=>r.health),[80,80,80]);assert.deepEqual(after.map(r=>r.morale),[50,50,50]);
  assert.equal(session.query(query(MaterialLot))[0].get(MaterialLot).quantity,5);
  const settled=port.renderFacts().filter(f=>f.projectile);assert.equal(settled.length,1);assert(['resting','embedded'].includes(settled[0].projectile!.state));
  const saved=session.save();session.step(1);assert.deepEqual(port.renderFacts().filter(f=>f.projectile),settled);session.restore(saved);
  session.restore(flight);for(let i=0;i<40;i++)session.step(0.1);assert.deepEqual(state(),after);assert.deepEqual(port.renderFacts().filter(f=>f.projectile),settled);
 } finally {port.dispose();}
});
