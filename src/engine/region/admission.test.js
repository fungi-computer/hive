import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openRegion } from './index.ts';
import { sqliteTestOwner } from './sqlite-test-owner.mjs';
function setup(t) {
 const db=new DatabaseSync(':memory:'); t.after(()=>db.close());
 let fail=false;
 const owner=sqliteTestOwner(db,sql=>{if(fail&&sql.startsWith('INSERT INTO hive_region_receipts')) throw Error('failed receipt');});
 const program={id:'admission-v1',initial:()=>({state:{goods:3,ticks:0},records:[]}),parseState:s=>structuredClone(s),parseCommand:c=>{if(!['tick','take'].includes(c.kind))throw Error('command');return c;},authorize:p=>p==='player',execute(s,c){if(c.kind==='tick')s.ticks++;else if(s.goods>0)s.goods--;else return {status:'rejected',result:{reason:'empty'}};return {status:'applied',result:{goods:s.goods},events:[]};}};
 return {open:()=>openRegion({owner,region:'admission',program}),fail:value=>{fail=value;}};
}
test('unconditional intent follows advancing world and replays once while conditional revision remains enforced',t=>{
 const f=setup(t),r=f.open();
 for(let i=0;i<4;i++)r.dispatch('player',{id:`tick-${i}`,command:{kind:'tick'}});
 const take={id:'take',command:{kind:'take'}};
 const receipt=r.dispatch('player',take);assert.equal(receipt.status,'applied');assert.equal(receipt.revision,5);
 r.dispatch('player',{id:'tick-next',command:{kind:'tick'}});
 const current=r.readCommitted();assert.equal(current.state.goods,2);
 assert.deepEqual(f.open().dispatch('player',take),receipt);assert.deepEqual(f.open().readCommitted(),current);
 assert.throws(()=>r.dispatch('player',{...take,command:{kind:'tick'}}),/region-command-conflict/);
 const stale=r.dispatch('player',{id:'conditional',expectedRevision:0,command:{kind:'take'}});
 assert.equal(stale.status,'rejected');assert.equal(stale.result.reason,'stale-revision');assert.equal(r.readCommitted().state.goods,2);
});
test('unconditional intent still rolls back and checks authority',t=>{
 const f=setup(t),r=f.open(),before=r.readCommitted(),take={id:'take',command:{kind:'take'}};
 assert.throws(()=>r.dispatch('stranger',take),/region-forbidden/);
 f.fail(true);assert.throws(()=>r.dispatch('player',take),/failed receipt/);assert.deepEqual(r.readCommitted(),before);
 f.fail(false);const receipt=r.dispatch('player',take);assert.equal(receipt.status,'applied');assert.equal(r.readCommitted().state.goods,2);
 assert.deepEqual(f.open().dispatch('player',take),receipt);
});
