import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "../sdk/authoring";
import { connectRemoteRuntime } from "./remote-client";
import type { WorkerEvent } from "./protocol";
import type { WhistleAgentProjection } from "@fungi.computer/whistle";
import type { WhistleContextualTarget } from "./whistle";

const token = "a".repeat(64);
function observation(revision: number) {
  return { revision, observation: { time: revision, paused: false, epoch: 0, sequence: revision, facts: [], cues: [], presentationFacts: [], whistleAgent: [] as WhistleAgentProjection[], whistleTargets: [] as WhistleContextualTarget[], terrainMarks: [], environmentVisuals: [] } };
}
function whistleObservation(revision: number) {
  const value = observation(revision);
  value.observation.whistleAgent = [{ commandId: "survival:order", sourceId: "hive.survival", title: "Order", category: "Test", order: 0, availability: { status: "available" }, action: { inputSchema: { type: "object" } } }];
  value.observation.whistleTargets = [{ commandId: "survival:order", subjects: [entity("worker")] }];
  return value;
}
class FakeSocket {
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  readonly sent: string[] = [];
  constructor(private readonly initial = observation(0), private readonly onReconnect?: () => void) {}
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  send(value: string) {
    this.sent.push(value);
    if (JSON.parse(value).type === "authenticate") {
      queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "ready", game: "survival" }) }));
      queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "observation", ...this.initial }) }));
    }
  }
  close() { this.emit("close", {}); }
  reconnect() { this.emit("close", {}); this.onReconnect?.(); }
  emit(type: string, event: { data?: unknown }) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
}
const wait = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await wait(2);
  }
  throw new Error("condition was not reached");
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
}
function setup(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, socket = new FakeSocket()) {
  let commandNumber = 0;
  return connectRemoteRuntime({
    endpoint: "https://hive.test/v1/survival",
    game: "survival",
    token,
    fetch: fetcher,
    createSocket: () => { queueMicrotask(() => socket.emit("open", {})); return socket; },
    createCommandId: () => `stable-command-${++commandNumber}`,
  });
}

test("Colony v2 persists the participant credential before join and keeps it out of routes", async () => {
  const invite = "b".repeat(64);
  const storage = memoryStorage();
  const socket = new FakeSocket();
  const calls: { url: string; init?: RequestInit }[] = [];
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/arena",
    game: "colony",
    token: invite,
    invite,
    storage,
    cryptoSource: { getRandomValues(bytes: Uint8Array) { bytes.fill(7); return bytes; }, subtle: crypto.subtle } as Crypto,
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/join")) return Response.json({
        player: "player:1",
        party: "party:1",
        people: ["party:1.person.0", "party:1.person.1"],
      });
      if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
      const body = JSON.parse(String(init?.body));
      if (String(input).endsWith("/placement")) return Response.json({ observationRevision: 2, nativeRevision: 3, placementRevision: 2, decisions: body.candidates.map(({ site }: { site: string }) => ({ site, status: "ready" })) });
      if (String(input).endsWith("/terrain")) return Response.json({ kind: "ready", requestId: body.requestId, epoch: body.epoch, terrainRevision: body.terrainRevision, chunks: [{ key: body.chunks[0], min: [0,0,0], max: [1,1,1], surfaces: [], columns: [{ x: 0, z: 0, runs: [{ minY: 0, maxY: 1, material: 0 }] }] }] });
      return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
    },
    createSocket: (url) => { calls.push({ url }); queueMicrotask(() => socket.emit("open", {})); return socket; },
    createCommandId: () => "colony-command-1",
  });
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "colony" });
  await waitFor(() => calls.some((call) => call.url.includes("/socket/")));
  const join = calls.find((call) => call.url.endsWith("/join"));
  assert(join);
  const joinHeaders = new Headers(join.init?.headers);
  const credential = joinHeaders.get("Authorization")?.slice("Bearer ".length);
  assert.match(credential ?? "", /^[0-9a-f]{64}$/);
  assert.equal(storage.getItem(`hive:colony-v2:credential:${await crypto.subtle.digest("SHA-256", new TextEncoder().encode(invite)).then(bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join(""))}`), credential);
  assert.equal(JSON.parse(String(join.init?.body)).invite, invite);
  const party = events.find((event) => event.type === "party");
  assert.deepEqual(party, {
    type: "party",
    player: "player:1",
    party: "party:1",
    people: ["party:1.person.0", "party:1.person.1"],
  });
  const socketUrl = calls.find((call) => call.url.includes("/socket/"))?.url ?? "";
  assert.equal(socketUrl, `wss://hive.test/arena/v2/colony/worlds/${await crypto.subtle.digest("SHA-256", new TextEncoder().encode(invite)).then(bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join(""))}/socket/opaque`);
  assert.equal(socketUrl.includes(credential!), false);
  const auth = JSON.parse(socket.sent.at(-1) ?? "{}");
  assert.equal(auth.credential, credential);
  const placement = await runtime.placementDecisions({ party: "party:1", candidates: [{ site: "site:1" as never, catalog: "floor" as never, target: { kind: "cell", cell: { x: 0, y: 0, z: 0 }, orientation: "north" } }] });
  assert.equal(placement.decisions[0]?.status, "ready");
  const placementCall = calls.find((call) => call.url.endsWith("/placement"));
  assert.equal(new Headers(placementCall?.init?.headers).get("Authorization"), `Bearer ${credential}`);
  const terrain = await runtime.terrainChunks({ requestId: 5, epoch: 0, terrainRevision: 0, chunks: [[0,0,0]] });
  assert.equal(terrain.kind, "ready");
  assert.equal(new Headers(calls.find(call => call.url.endsWith("/terrain"))?.init?.headers).get("Authorization"), `Bearer ${credential}`);
  runtime.send({ type: "pause" });
  await wait(10);
  const command = calls.find((call) => call.url.endsWith("/command"));
  assert(command);
  assert.equal(new Headers(command.init?.headers).get("Authorization"), `Bearer ${credential}`);
  runtime.dispose();
});

test("socket admission emits only authenticated observations and command omits implicit revision", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const runtime = setup(async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    const body = JSON.parse(String(init?.body));
    return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
  });
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "survival" });
  await wait();
  assert.ok(events.some((event) => event.type === "ready"));
  runtime.send({ type: "pause" });
  await wait(20);
  const command = calls.find((call) => call.url.endsWith("/command"));
  assert(command);
  assert.equal(Object.hasOwn(JSON.parse(String(command.init?.body)), "expectedRevision"), false);
  runtime.dispose();
});

test("an applied receipt releases the next FIFO command without waiting for its observation", async () => {
  const commandBodies: string[] = [];
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    commandBodies.push(String(init?.body));
    const body = JSON.parse(String(init?.body));
    return Response.json({ commandId: body.id, status: "applied", revision: commandBodies.length, result: { results: [] } });
  });
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    runtime.send({ type: "pause" });
    runtime.send({ type: "resume" });
    await wait(20);
    assert.equal(commandBodies.length, 2, "the second command is independent of observation delivery");
    assert.notEqual(JSON.parse(commandBodies[0]).id, JSON.parse(commandBodies[1]).id);
  } finally { runtime.dispose(); }
});

test("socket observations reject older committed revisions", async () => {
  const socket = new FakeSocket(observation(2));
  const runtime = setup(async (input) => String(input).endsWith("/connect") ? Response.json({ handle: "opaque" }) : Response.json({}), socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "survival" });
  await wait();
  socket.emit("message", { data: JSON.stringify({ type: "observation", ...observation(1) }) });
  assert.equal(events.filter((event) => event.type === "frame").length, 1);
  runtime.dispose();
});

test("reconnect installs a same-revision Whistle baseline before accepting a delta", async () => {
  const socket = new FakeSocket(whistleObservation(1));
  const runtime = setup(async (input) => String(input).endsWith("/connect") ? Response.json({ handle: "opaque" }) : Response.json({}), socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    socket.emit("open", {});
    await wait();
    const next = observation(2);
    const { whistleAgent: _agent, whistleTargets: _targets, ...withoutWhistle } = next.observation;
    socket.emit("message", { data: JSON.stringify({ type: "observation", revision: next.revision, observation: withoutWhistle }) });
    assert.equal(events.filter(event => event.type === "error").length, 0);
    const whistle = events.filter(event => event.type === "whistle").at(-1);
    assert.equal(whistle?.type, "whistle");
    assert.deepEqual(whistle?.targets, [{ commandId: "survival:order", subjects: ["worker"] }]);
  } finally { runtime.dispose(); }
});

test("remote Whistle updates require agent and target fields together", async () => {
  const socket = new FakeSocket(observation(0));
  const runtime = setup(async (input) => String(input).endsWith("/connect") ? Response.json({ handle: "opaque" }) : Response.json({}), socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    const partial = observation(1);
    partial.observation.whistleAgent = [];
    const { whistleTargets: _targets, ...partialObservation } = partial.observation;
    socket.emit("message", { data: JSON.stringify({ type: "observation", revision: partial.revision, observation: partialObservation }) });
    assert.ok(events.some(event => event.type === "error" && event.message === "invalid remote observation"));
  } finally { runtime.dispose(); }
});

test("work activity crosses the real JSON frame boundary and rejects unsupported poses", async () => {
  const socket = new FakeSocket();
  const runtime = setup(async () => Response.json({ handle: "opaque" }), socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    const next = observation(1);
    socket.emit("message", { data: JSON.stringify({ type: "observation", ...next,
      observation: { ...next.observation, facts: [{ id: "worker", activity: { kind: "dig", target: [1, 2] } }],
        presentationFacts: [{ id: "worker.work", label: "Work", value: "digging", subjects: ["worker"] }],
        whistleAgent: [{ commandId: "survival:order", sourceId: "hive.survival", title: "Order", category: "Test", order: 0, availability: { status: "available" }, action: { inputSchema: { type: "object" } } }],
        whistleTargets: [{ commandId: "survival:order", subjects: ["worker"] }] } }) });
    const frames = events.filter(event => event.type === "frame");
    assert.deepEqual(frames.at(-1)?.facts[0]?.activity, { kind: "dig", target: [1, 2] });
    const presentation = events.filter(event => event.type === "presentation").at(-1);
    assert.deepEqual(presentation && presentation.type === "presentation" ? (presentation.facts[0] as { subjects?: readonly string[] }).subjects : undefined, ["worker"]);
    const whistle = events.filter(event => event.type === "whistle").at(-1);
    assert.deepEqual(whistle && whistle.type === "whistle" ? whistle.targets[0].subjects : undefined, ["worker"]);
    const carrying = observation(2);
    socket.emit("message", { data: JSON.stringify({ type: "observation", ...carrying,
      observation: { ...carrying.observation, facts: [{ id: "worker", activity: {
        kind: "delivery", phase: "to-destination", material: "wood", target: [3, 4],
      } }] } }) });
    assert.deepEqual(events.filter(event => event.type === "frame").at(-1)?.facts[0]?.activity,
      { kind: "delivery", phase: "to-destination", material: "wood", target: [3, 4] });
    const acceptedFrameCount = events.filter(event => event.type === "frame").length;
    const bad = observation(3);
    socket.emit("message", { data: JSON.stringify({ type: "observation", ...bad,
      observation: { ...bad.observation, facts: [{ id: "worker", activity: { kind: "invented", target: [1, 2] } }] } }) });
    assert.equal(events.filter(event => event.type === "frame").length, acceptedFrameCount);
  } finally { runtime.dispose(); }
});

test("remote inventory rejects mismatched portable identity and over-capacity contents", async () => {
  const socket = new FakeSocket();
  const runtime = setup(async () => Response.json({ handle: "opaque" }), socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    for (const item of [
      { kind: "pail", quantity: 1, container: { capacity: 4, contents: { items: [] } } },
      { kind: "pail", quantity: 1, id: "pail.a" },
      { kind: "pail", quantity: 1, id: "pail.a", container: { capacity: 4, contents: { items: [{ kind: "water", quantity: 5 }] } } },
    ]) {
      const next = observation(events.length + 1);
      socket.emit("message", { data: JSON.stringify({ type: "observation", ...next,
        observation: { ...next.observation, facts: [{ id: "worker", inventory: { items: [item] } }] } }) });
    }
    assert.equal(events.filter(event => event.type === "frame").length, 1);
    assert.equal(events.filter(event => event.type === "error" && event.message === "invalid remote observation").length, 3);
  } finally { runtime.dispose(); }
});

test("remote observations reject malformed visual placement", async () => {
  const socket = new FakeSocket();
  const runtime = setup(async (input) => String(input).endsWith("/connect") ? Response.json({ handle: "opaque" }) : Response.json({}), socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    const next = observation(1);
    socket.emit("message", { data: JSON.stringify({ type: "observation", ...next,
      observation: { ...next.observation, facts: [{ id: "site.floor", placement: { kind: "footprint", footprint: [[0.5, 0]], orientation: "north" } }] } }) });
    assert.equal(events.filter(event => event.type === "frame").length, 1);
    assert.equal(events.filter(event => event.type === "error" && event.message === "invalid remote observation").length, 1);
  } finally { runtime.dispose(); }
});

test("disposing during socket handle admission aborts the request", async () => {
  let aborted = false;
  const runtime = setup((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
  }));
  runtime.send({ type: "start", game: "survival" });
  runtime.dispose();
  await wait();
  assert.equal(aborted, true);
});

test("lost HTTP receipt retries the identical command body and identity", async () => {
  let attempts = 0;
  const bodies: string[] = [];
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    bodies.push(String(init?.body));
    attempts++;
    if (attempts === 1) throw new Error("lost response");
    const body = JSON.parse(bodies[0]);
    return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
  });
  runtime.send({ type: "start", game: "survival" });
  await wait();
  runtime.send({ type: "pause" });
  await wait(250);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  runtime.dispose();
});

test("healthy socket recovery resumes the same pending command body", async () => {
  let socket!: FakeSocket;
  socket = new FakeSocket(observation(0), () => queueMicrotask(() => socket.emit("open", {})));
  let attempts = 0;
  const bodies: string[] = [];
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    bodies.push(String(init?.body));
    attempts++;
    if (attempts < 5) throw new Error("temporary command transport failure");
    const body = JSON.parse(bodies[0]);
    return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
  }, socket);
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    runtime.send({ type: "pause" });
    await wait(2_000);
    assert.equal(bodies.length, 5);
    assert.ok(bodies.every((body) => body === bodies[0]), "recovery retries the immutable command");
  } finally { runtime.dispose(); }
});

test("HTTP recovery does not wait for an ordinary observation", async () => {
  const socket = new FakeSocket();
  let attempts = 0;
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    attempts++;
    if (attempts < 5) throw new Error("temporary command transport failure");
    const body = JSON.parse(String(init?.body));
    return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
  }, socket);
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    runtime.send({ type: "pause" });
    await wait(2_000);
    assert.equal(attempts, 5, "HTTP recovery succeeds without waiting for observation delivery");
  } finally { runtime.dispose(); }
});

test("ordinary commands synchronously refuse admission when the queue is full", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    await held;
    const body = JSON.parse(String(init?.body));
    return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
  });
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    for (let index = 0; index < 16; index++) runtime.send({ type: "pause" });
    assert.throws(() => runtime.send({ type: "resume" }), /remote command queue full/);
  } finally {
    release();
    runtime.dispose();
  }
});

test("socket recovery has a bounded per-command budget", async () => {
  let socket!: FakeSocket;
  socket = new FakeSocket(observation(0), () => queueMicrotask(() => socket.emit("open", {})));
  let attempts = 0;
  const bodies: string[] = [];
  const events: WorkerEvent[] = [];
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    bodies.push(String(init?.body));
    attempts++;
    if (attempts <= 16) throw new Error("permanent command transport failure");
    const body = JSON.parse(String(init?.body));
    return Response.json({ commandId: body.id, status: "applied", revision: attempts, result: { results: [] } });
  }, socket);
  runtime.subscribe((event) => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    runtime.send({ type: "pause" });
    await wait(6_200);
    assert.equal(attempts, 16);
    assert.ok(events.some((event) => event.type === "error" && event.message.includes("recovery limit exceeded")));
    assert.throws(() => runtime.send({ type: "resume" }), /remote runtime unavailable/);
    assert.equal(new Set(bodies).size, 1, "exhaustion retains the exact original ID and body");
    runtime.recovery?.retry();
    await wait(100);
    assert.equal(attempts, 17);
    assert.equal(bodies[16], bodies[0], "explicit recovery retries the retained ID and body");
    runtime.send({ type: "resume" });
    await wait(100);
    assert.equal(attempts, 18, "the next intent is admitted after recovery succeeds");
  } finally { runtime.dispose(); }
  assert.throws(() => runtime.recovery?.retry(), /runtime connection disposed/);
});

test("coalesces contiguous unsent direct input behind command barriers and retries immutable batches", async () => {
  const socket = new FakeSocket();
  const calls: string[] = [];
  let revision = 0;
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  let retryStarted!: () => void;
  let finalStarted!: () => void;
  const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const firstSeen = new Promise<void>((resolve) => { firstStarted = resolve; });
  const retrySeen = new Promise<void>((resolve) => { retryStarted = resolve; });
  const finalSeen = new Promise<void>((resolve) => { finalStarted = resolve; });
  let heldFirst = true;
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    const body = String(init?.body);
    calls.push(body);
    const command = JSON.parse(body).command;
    const inputs = command.action?.inputs;
    if (Array.isArray(inputs) && inputs.length === 10 && heldFirst) {
      heldFirst = false;
      firstStarted();
      await firstHeld;
      throw new Error("lost direct receipt");
    }
    if (Array.isArray(inputs) && inputs.length === 10) retryStarted();
    if (Array.isArray(inputs) && inputs[0]?.sequence === 11) finalStarted();
    await wait(15);
    revision++;
    queueMicrotask(() => socket.emit("message", { data: JSON.stringify({ type: "observation", ...observation(revision) }) }));
    return Response.json({ commandId: JSON.parse(body).id, status: "applied", revision, result: { results: [] } });
  }, socket);
  runtime.send({ type: "start", game: "survival" });
  await wait(20);
  runtime.send({ type: "action", action: { kind: "begin-direct", entity: entity("player"), stream: "held" } });
  await wait(40);
  const batch = (first: number) => Array.from({ length: 5 }, (_, index) => ({ sequence: first + index, x: 1, z: 0 }));
  runtime.send({ type: "action", action: { kind: "direct-input", entity: entity("player"), stream: "held", inputs: batch(1) } });
  runtime.send({ type: "action", action: { kind: "direct-input", entity: entity("player"), stream: "held", inputs: batch(6) } });
  runtime.send({ type: "pause" });
  runtime.send({ type: "action", action: { kind: "direct-input", entity: entity("player"), stream: "held", inputs: batch(11) } });
  await firstSeen;
  runtime.send({ type: "action", action: { kind: "direct-input", entity: entity("player"), stream: "held", inputs: batch(16) } });
  releaseFirst();
  await retrySeen;
  await finalSeen;
  const parsed = calls.map((body) => JSON.parse(body).command);
  const directBodies = calls.filter((body) => Array.isArray(JSON.parse(body).command.action?.inputs));
  assert.equal(directBodies.length, 3);
  assert.equal(directBodies[0], directBodies[1], "the retry preserves the exact body and command id");
  assert.ok(parsed.some((command) => command.kind === "pause"), "the unrelated command remains a barrier");
  const final = parsed.find((command) => command.action?.inputs?.[0]?.sequence === 11);
  assert.deepEqual(final.action.inputs.map((input: { sequence: number }) => input.sequence), Array.from({ length: 10 }, (_, index) => index + 11));
  runtime.dispose();
});


test("transient handle admission recovers without a new world", async () => {
  let attempts = 0;
  const runtime = setup(async () => {
    if (++attempts === 1) return Response.json({ error: "world-unavailable" }, { status: 503 });
    return Response.json({ handle: "same-world" });
  });
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "survival" });
  try {
    await wait(250);
    assert.equal(attempts, 2);
    assert.ok(events.some((event) => event.type === "ready"));
  } finally { runtime.dispose(); }
});

test("unsupported saved world is reported without retry or replacement", async () => {
  let attempts = 0;
  const runtime = setup(async () => {
    attempts++;
    return Response.json({ error: "unsupported-world" }, { status: 503 });
  });
  const events: WorkerEvent[] = [];
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "survival" });
  try {
    await wait(250);
    assert.equal(attempts, 1);
    assert.ok(events.some((event) => event.type === "error" && event.message.includes("saved data retained")));
    assert.equal(events.some((event) => event.type === "ready"), false);
  } finally { runtime.dispose(); }
});

test("definite command refusals release later orders without reconnecting", async () => {
  let reconnects = 0;
  const socket = new FakeSocket(observation(0), () => { reconnects++; });
  const calls: string[] = [];
  const runtime = setup(async (input, init) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    const body = JSON.parse(String(init?.body));
    calls.push(body.id);
    if (calls.length === 1) return Response.json({ error: "bad-request" }, { status: 400 });
    return Response.json({ commandId: body.id, status: "applied", revision: 1, result: { results: [] } });
  }, socket);
  const events: WorkerEvent[] = [];
  runtime.subscribe(event => events.push(event));
  try {
    runtime.send({ type: "start", game: "survival" });
    await wait();
    runtime.send({ type: "command", name: "build", input: { invalid: true } });
    runtime.send({ type: "pause" });
    await wait(30);
    assert.equal(calls.length, 2);
    assert.equal(new Set(calls).size, 2);
    assert.equal(reconnects, 0);
    assert(events.some(event => event.type === "error" && event.message.includes("Order refused")));
    assert(events.some(event => event.type === "connection" && event.status === "online" && event.pending === 0));
  } finally { runtime.dispose(); }
});

test("private performance worlds use authenticated terrain routes and report received bytes", async () => {
  const calls: {url:string;init?:RequestInit}[]=[];
  const samples: import('./remote-client').RemoteTransportSample[]=[];
  const socket=new FakeSocket();
  const runtime=connectRemoteRuntime({endpoint:'https://hive.test/v1/colony-performance-256-8',game:'colony-performance-256-8',token,
    onTransport: sample=>samples.push(sample),
    fetch:async(input,init)=>{
      calls.push({url:String(input),init});
      if(String(input).endsWith('/connect'))return Response.json({handle:'opaque'});
      assert.equal(new Headers(init?.headers).get('Authorization'),null,'v1 authentication belongs to the authorized fetch supplied by the connection owner');
      const body=JSON.parse(String(init?.body));
      return Response.json({kind:'ready',requestId:body.requestId,epoch:body.epoch,terrainRevision:body.terrainRevision,chunks:[{key:[0,0,0],min:[0,0,0],max:[1,1,1],surfaces:[],columns:[{x:0,z:0,runs:[{minY:0,maxY:1,material:0}]}]}]});
    },createSocket:()=>{queueMicrotask(()=>socket.emit('open',{}));return socket;},
  });
  try {
    runtime.send({type:'start',game:'colony-performance-256-8'});
    await waitFor(()=>samples.some(s=>s.kind==='socket'));
    const reply=await runtime.terrainChunks({requestId:1,epoch:0,terrainRevision:0,chunks:[[0,0,0]]});
    assert.equal(reply.kind,'ready');
    assert(calls.some(c=>c.url==='https://hive.test/v1/colony-performance-256-8/terrain'));
    assert(samples.some(s=>s.kind==='http'&&s.operation==='terrain'&&s.receivedBytes>0&&s.durationMs>=0));
  } finally {runtime.dispose();}
});

test("transport telemetry includes rejected network attempts without changing their errors", async () => {
  const samples: import('./remote-client').RemoteTransportSample[]=[];
  const runtime=connectRemoteRuntime({endpoint:'https://hive.test/v1/colony-performance-256-8',game:'colony-performance-256-8',token,
    onTransport:sample=>samples.push(sample),fetch:async()=>{throw new Error('network unavailable');},
  });
  try {
    await assert.rejects(runtime.terrainChunks({requestId:1,epoch:0,terrainRevision:0,chunks:[[0,0,0]]}),/network unavailable/);
    assert.equal(samples.length,1);assert.equal(samples[0].kind,'http');
    if(samples[0].kind==='http'){assert.equal(samples[0].status,null);assert.equal(samples[0].operation,'terrain');}
  } finally {runtime.dispose();}
});
