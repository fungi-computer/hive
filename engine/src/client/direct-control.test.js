import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDirectControl} from './direct-control.js';
function fixture() {
 const sent=[],replays=[];
 const controller=createDirectControl({entity:'player',send:c=>sent.push(c),makeStream:()=> 'stream',predict:input=>{replays.push(input);return {position:input.position};}});
 const fact=(ack=0)=>({id:'player',support:null,pose:{position:{x:0,y:0,z:0},facing:0},local:{position:{x:0,y:0,z:0},facing:0},direct:{stream:'stream',lastQueued:ack,lastProcessed:ack,speed:2,blocked:[],bounds:null}});
 controller.observe([fact()]);controller.observe([fact()]);
 return {controller,sent,replays,fact};
}
test('held direction generates fixed samples independently of OS repeat and acknowledges only consumed inputs',()=>{
 const {controller:c,sent,replays,fact}=fixture();
 c.key('d',true);c.tick(0);c.tick(100);
 assert.equal(sent[1].action.inputs.length,5);
 assert.deepEqual(sent[1].action.inputs.map(i=>i.sequence),[1,2,3,4,5]);
 c.observe([fact(2)]);
 assert.deepEqual(replays.at(-1).inputs.map(i=>i.sequence),[3,4,5]);
 c.key('d',false);c.tick(200);
 assert.equal(sent.length,2, "idle adds no movement commands");
});
test('pause and replay horizon do not bank movement or grow without acknowledgements',()=>{
 const {controller:c,sent}=fixture(); c.key('d',true);c.tick(0);
 for(let i=1;i<=30;i++)c.tick(i*100);
 assert.equal(c.pendingCount,50);
 assert.equal(sent.length,11);
 c.tick(100000,true);c.tick(100020);
 assert.equal(c.pendingCount,50);
 c.reset();assert.equal(c.pendingCount,0);
});
test('prediction switch changes display only, not commands or authoritative observations',()=>{
 const sent=[];const base={id:'player',pose:{position:{x:0,y:0,z:0},facing:0},direct:{stream:'s',lastQueued:0,lastProcessed:0,speed:2,blocked:[],bounds:null}};
 const c=createDirectControl({entity:'player',makeStream:()=> 's',send:v=>sent.push(v),predict:()=>({position:{x:1,y:0,z:0,facing:1}})});
 c.observe([base]);c.observe([base]);assert.equal(c.display([base])[0].pose.position.x,1);
 c.setPrediction(false);assert.equal(c.display([base])[0],base);assert.equal(base.pose.position.x,0);assert.equal(sent.length,1);
});
test('a refused transport batch resets replay rather than marking lost inputs as sent',()=>{
 const failures=[];
 const base={id:'player',pose:{position:{x:0,y:0,z:0},facing:0},direct:{stream:'s',lastQueued:0,lastProcessed:0,speed:2,blocked:[],bounds:null}};
 const c=createDirectControl({entity:'player',makeStream:()=> 's',onError:e=>failures.push(e.message),send:command=>{if(command.action.kind==='direct-input')throw new Error('full');},predict:v=>({position:v.position})});
 c.observe([base]);c.observe([base]);c.key('d',true);c.tick(0);c.tick(100);
 assert.equal(c.pendingCount,0);assert.deepEqual(failures,['full']);assert.equal(c.display([base])[0],base);
});
test('a different authoritative stream cannot display old prediction',()=>{
 const {controller:c,fact}=fixture();c.key('d',true);c.tick(0);c.tick(100);
 const other={...fact(),direct:{...fact().direct,stream:'other'}};
 c.observe([other]);assert.equal(c.pendingCount,0);assert.equal(c.display([other])[0],other);
});
