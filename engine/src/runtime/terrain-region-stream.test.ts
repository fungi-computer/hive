import { strict as assert } from "node:assert";
import { test } from "node:test";
import { startTerrainRegionStream } from "./terrain-region-stream";
import { createTerrainRegionClient } from "./terrain-region-client";
import { terrainRegionRequestSchema, type TerrainRegionRequest, type TerrainRegionEvent } from "./terrain-regions";

const request: TerrainRegionRequest = { requestId: 1, epoch: 2, terrainRevision: 3, level: 7, regions: [[0,0],[1,0]] };
const identity = { requestId: 1, epoch: 2, terrainRevision: 3, level: 7 };
const patch = (key: [number, number], requestId = 1): TerrainRegionEvent & { kind: "patch" } => ({ kind: "patch", ...identity, requestId,
  patch: { key, bounds: { minX: key[0]*8, maxX: key[0]*8+8, minZ: key[1]*8, maxZ: key[1]*8+8 }, faces: [], surfaces: [] } });

test("one region request delivers all patches without acknowledgements, yielding between bounded reads", async () => {
  const events: TerrainRegionEvent[] = []; let yields = 0;
  const stream = startTerrainRegionStream(request, key => patch(key), event => events.push(event), async () => { yields++; });
  await stream.done;
  assert.deepEqual(events.map(event => event.kind), ["patch","patch","complete"]);
  assert.equal(yields, 2);
});
test("cancellation during a read discards its late result and stops further region work", async () => {
  const events: TerrainRegionEvent[] = []; let finish!: (event: ReturnType<typeof patch>) => void, reads = 0;
  const stream = startTerrainRegionStream(request, () => { reads++; return new Promise(resolve => { finish = resolve; }); }, event => events.push(event));
  await Promise.resolve(); stream.cancel(); finish(patch([0,0])); await stream.done;
  assert.equal(reads, 1); assert.equal(events.length, 0);
});
test("changed world revision terminates the stream rather than mixing terrain revisions", async () => {
  const events: TerrainRegionEvent[] = [];
  await startTerrainRegionStream(request, () => ({ kind: "stale", ...identity, terrainRevision: 4 }), event => events.push(event)).done;
  assert.deepEqual(events.map(event => event.kind), ["stale"]);
});
test("client queues until authenticated, resumes only missing patches, ignores duplicates and checks completion", () => {
  const commands: unknown[] = [], events: TerrainRegionEvent[] = [];
  const client = createTerrainRegionClient(command => commands.push(command), { connected: false });
  try {
    client.request(request, event => events.push(event)); assert.equal(commands.length, 0);
    client.setConnected(true); assert.equal(commands.length, 1);
    client.accept(patch([0,0])); client.accept(patch([0,0])); assert.equal(events.length, 1);
    client.setConnected(false); client.setConnected(true);
    assert.deepEqual((commands[1] as TerrainRegionRequest).regions, [[1,0]]);
    client.accept(patch([1,0])); client.accept({ kind: "complete", ...identity });
    assert.deepEqual(events.map(event => event.kind), ["patch","patch","complete"]);
  } finally { client.dispose(); }
});
test("old cancellation and late replies cannot cancel or publish into a replacement request", () => {
  const commands: unknown[] = [], events: TerrainRegionEvent[] = [];
  const client = createTerrainRegionClient(command => commands.push(command));
  try {
    const cancel = client.request(request, event => events.push(event));
    client.request({ ...request, requestId: 2 }, event => events.push(event));
    const count = commands.length; cancel(); assert.equal(commands.length, count);
    client.accept(patch([0,0])); assert.equal(events.length, 0);
    client.accept(patch([0,0],2)); assert.equal(events.length, 1);
  } finally { client.dispose(); }
});
test("missing or unrequested patch data fails closed; inactivity releases the query", async () => {
  const events: TerrainRegionEvent[] = [];
  const client = createTerrainRegionClient(() => {}, { idleMs: 10 });
  try {
    client.request(request, event => events.push(event)); client.accept({ kind: "complete", ...identity });
    assert.equal(events.at(-1)?.kind, "unavailable");
    client.request(request, event => events.push(event)); client.accept(patch([2,0]));
    assert.equal(events.at(-1)?.kind, "unavailable");
    client.request(request, event => events.push(event));
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(events.at(-1)?.kind, "unavailable");
    assert.equal(events.length, 3);
  } finally { client.dispose(); }
});
test("request bounds reject duplicates and unbounded region lists", () => {
  assert.throws(() => terrainRegionRequestSchema.parse({ ...request, regions: [[0,0],[0,0]] }));
  assert.throws(() => terrainRegionRequestSchema.parse({ ...request, regions: Array.from({length:257}, (_,x) => [x,0]) }));
});

test("a request queued before authentication still expires and releases its callback", async () => {
  const commands: unknown[] = [], events: TerrainRegionEvent[] = [];
  const client = createTerrainRegionClient(command => commands.push(command), {connected:false,idleMs:10});
  try {
    client.request(request, event => events.push(event));
    await new Promise(resolve => setTimeout(resolve,25));
    assert.equal(events.length,1); assert.equal(events[0].kind,"unavailable");
    client.setConnected(true); assert.equal(commands.length,0);
  } finally { client.dispose(); }
});

test("conflicting replay fails and duplicate-only traffic does not extend incomplete reads", async () => {
  const events: TerrainRegionEvent[] = [];
  const client = createTerrainRegionClient(() => {}, {idleMs:20});
  try {
    client.request(request,event=>events.push(event)); client.accept(patch([0,0]));
    const conflicting=patch([0,0]); conflicting.patch.bounds.maxX=7;
    client.accept(conflicting); assert.equal(events.at(-1)?.kind,"unavailable");
    events.length=0; client.request(request,event=>events.push(event)); client.accept(patch([0,0]));
    const replay=setInterval(()=>client.accept(patch([0,0])),5);
    try { await new Promise(resolve=>setTimeout(resolve,45)); } finally { clearInterval(replay); }
    assert.deepEqual(events.map(event=>event.kind),["patch","unavailable"]);
  } finally { client.dispose(); }
});
