import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket as PartySocket } from 'partysocket';
import WS, { WebSocketServer } from 'ws';
import { SnapshotInterpolation } from '@geckos.io/snapshot-interpolation';
const server = new WebSocketServer({port:0,host:'127.0.0.1'});
await once(server,'listening');
const port=server.address().port;
let connections=0;
server.on('connection',ws=>{connections++;ws.on('message',(data,isBinary)=>ws.send(data,{binary:isBinary}));});
const socket=new PartySocket(`ws://127.0.0.1:${port}`,[],{WebSocket:WS,minReconnectionDelay:10,maxReconnectionDelay:30,minUptime:20,maxRetries:3,maxEnqueuedMessages:0});
const event=(name)=>Promise.race([once(socket,name),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('timeout '+name)),1500);t.unref();})]);
try {
 await event('open');
 let reply=event('message');socket.send('first');assert.equal((await reply)[0].data,'first');
 const reopened=event('open');for(const peer of server.clients)peer.terminate();await reopened;
 reply=event('message');socket.send('second');assert.equal((await reply)[0].data,'second');
 assert.equal(connections,2);
 socket.close();await new Promise(r=>setTimeout(r,80));assert.equal(connections,2);
 console.log('PASS PartySocket real TCP echo, forced disconnect/reconnect, retained listener interface, explicit close stops reconnect');
} finally {socket.close();for(const peer of server.clients)peer.terminate();await new Promise(r=>server.close(r));}
const si=new SnapshotInterpolation(4);
assert.equal(si.interpolationBuffer.get(),750);
const a={id:'a',time:1000,state:[{id:'ship',x:0,y:0,z:0,yaw:0},{id:'crew',x:1,y:0,z:0,yaw:0}]};
const b={id:'b',time:1250,state:[{id:'ship',x:2,y:0,z:0,yaw:Math.PI/2},{id:'crew',x:1,y:0,z:0,yaw:0}]};
const original=JSON.stringify([a,b]);
const out=si.interpolate(a,b,.5,'x y z yaw(rad)');
assert.equal(out.state[0].x,1);assert.ok(Math.abs(out.state[0].yaw-Math.PI/4)<1e-9);
assert.equal(out.state[1].x,1);assert.equal(JSON.stringify([a,b]),original);
// Local support coordinates must be composed AFTER parent interpolation.
const ship=out.state[0],crew=out.state[1];
const composed={x:ship.x+Math.cos(ship.yaw)*crew.x,z:ship.z+Math.sin(ship.yaw)*crew.x};
assert.ok(Math.abs(Math.hypot(composed.x-ship.x,composed.z-ship.z)-1)<1e-9);
console.log('PASS Geckos linear/angular interpolation, input snapshots unchanged, usable local-parent composition; pause/epoch handling is NOT supplied');
console.log('PASS owned server closed; no live socket remains');
