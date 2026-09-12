import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "../sdk/authoring";
import { connectRemoteRuntime } from "./remote-client";
import type { WorkerEvent } from "./protocol";

const token = "a".repeat(64);
function observation(revision: number) {
  return { revision, observation: { time: revision, paused: false, epoch: 0, sequence: revision, facts: [], cues: [], presentationFacts: [], presentationControls: [], terrainMarks: [], environmentVisuals: [] } };
}
class FakeSocket {
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  constructor(private readonly initial = observation(0), private readonly onReconnect?: () => void) {}
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  send(value: string) {
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
function setup(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, socket = new FakeSocket()) {
  return connectRemoteRuntime({
    endpoint: "https://hive.test/v1/survival",
    game: "survival",
    token,
    fetch: fetcher,
    createSocket: () => { queueMicrotask(() => socket.emit("open", {})); return socket; },
    createCommandId: () => "stable-command",
  });
}

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
  const events: WorkerEvent[] = [];
  const runtime = setup(async (input) => {
    if (String(input).endsWith("/connect")) return Response.json({ handle: "opaque" });
    attempts++;
    throw new Error("permanent command transport failure");
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
  } finally { runtime.dispose(); }
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
