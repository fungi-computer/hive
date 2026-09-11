import { strict as assert } from "node:assert";
import { test } from "node:test";
import { connectRemoteRuntime } from "./remote-client";
import type { WorkerEvent } from "./protocol";

const token = "a".repeat(64);
function observation(revision: number) {
  return { revision, observation: { time: revision, paused: false, epoch: 0, sequence: revision, facts: [], presentationFacts: [], presentationControls: [] } };
}
class FakeSocket {
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  constructor(private readonly initial = observation(0)) {}
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  send(value: string) {
    if (JSON.parse(value).type === "authenticate") {
      queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "ready", game: "survival" }) }));
      queueMicrotask(() => this.emit("message", { data: JSON.stringify({ type: "observation", ...this.initial }) }));
    }
  }
  close() { this.emit("close", {}); }
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
