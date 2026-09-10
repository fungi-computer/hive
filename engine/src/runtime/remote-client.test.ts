import { strict as assert } from "node:assert";
import { test } from "node:test";
import { connectRemoteRuntime } from "./remote-client";
import type { WorkerEvent } from "./protocol";

function observation(revision: number, sequence = revision) {
  return Response.json({
    revision,
    observation: {
      time: revision,
      paused: false,
      epoch: 0,
      sequence,
      facts: [{ id: "actor.1", pose: { position: { x: 0, y: 0, z: 0 }, facing: 0 } }],
      presentationFacts: [],
      presentationControls: [],
    },
  });
}

function applied(id: string, revision: number) {
  return Response.json({
    commandId: id,
    status: "applied",
    revision,
    result: { tick: revision, paused: false, results: [] },
  });
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

test("remote retries a lost response with the identical command envelope", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let commandAttempts = 0;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input.toString(), init });
    if (input.toString().endsWith("/observe")) return observation(0);
    commandAttempts++;
    if (commandAttempts === 1) throw new Error("lost response");
    const body = JSON.parse(String(init?.body)) as { id: string };
    return applied(body.id, 1);
  };
  const events: WorkerEvent[] = [];
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: fetcher,
    pollMs: 60_000,
    createCommandId: () => "stable-command",
  });
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "survival" });
  await wait(0);
  runtime.send({ type: "pause" });
  await wait(260);
  const commandBodies = calls
    .filter((call) => call.url.endsWith("/command"))
    .map((call) => String(call.init?.body));
  assert.equal(commandBodies.length, 2);
  assert.equal(commandBodies[0], commandBodies[1]);
  assert.equal(events.filter((event) => event.type === "frame").length, 1);
  runtime.dispose();
});

test("remote ignores stale observations and never performs a client step", async () => {
  let observeCount = 0;
  const commandIds: string[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString().endsWith("/observe")) {
      observeCount++;
      return observation(4);
    }
    const body = JSON.parse(String(init?.body)) as { id: string };
    commandIds.push(body.id);
    return Response.json({
      commandId: body.id,
      status: "rejected",
      revision: 4,
      result: { reason: "stale-revision" },
    });
  };
  const events: WorkerEvent[] = [];
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: fetcher,
    pollMs: 60_000,
    createCommandId: (() => {
      let next = 0;
      return () => `stale-${++next}`;
    })(),
  });
  runtime.subscribe((event) => events.push(event));
  runtime.send({ type: "start", game: "survival" });
  await wait(0);
  runtime.send({ type: "pause" });
  await wait(0);
  runtime.send({ type: "step", delta: 0.1 });
  assert.equal(observeCount, 5);
  assert.equal(commandIds.length, 4);
  assert.equal(new Set(commandIds).size, 4);
  assert.equal(events.filter((event) => event.type === "frame").length, 1);
  assert.ok(events.some((event) => event.type === "error"));
  runtime.dispose();
});

test("a confirmed stale revision gets one new envelope and one applied effect", async () => {
  let observedRevision = 0;
  let commandCount = 0;
  const commands: { id: string; expectedRevision: number }[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString().endsWith("/observe")) return observation(observedRevision);
    const body = JSON.parse(String(init?.body)) as { id: string; expectedRevision: number };
    commands.push(body);
    commandCount++;
    if (commandCount === 1) {
      observedRevision = 1;
      return Response.json({
        commandId: body.id,
        status: "rejected",
        revision: 1,
        result: { reason: "stale-revision" },
      });
    }
    return applied(body.id, 2);
  };
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: fetcher,
    pollMs: 60_000,
    createCommandId: (() => {
      let next = 0;
      return () => `confirmed-${++next}`;
    })(),
  });
  runtime.send({ type: "start", game: "survival" });
  await wait(0);
  runtime.send({ type: "pause" });
  await wait(20);
  assert.equal(commandCount, 2);
  assert.notEqual(commands[0].id, commands[1].id);
  assert.deepEqual(commands.map(({ expectedRevision }) => expectedRevision), [0, 1]);
  runtime.dispose();
});

test("queued intents receive the refreshed revision only when they become head", async () => {
  let revision = 0;
  const commands: { id: string; expectedRevision: number }[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString().endsWith("/observe")) return observation(revision);
    const body = JSON.parse(String(init?.body)) as {
      id: string;
      expectedRevision: number;
    };
    commands.push(body);
    revision++;
    return applied(body.id, revision);
  };
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: fetcher,
    pollMs: 60_000,
    createCommandId: (() => {
      let next = 0;
      return () => `command-${++next}`;
    })(),
  });
  runtime.send({ type: "start", game: "survival" });
  await wait(0);
  runtime.send({ type: "pause" });
  runtime.send({ type: "resume" });
  await wait(20);
  assert.deepEqual(commands.map(({ expectedRevision }) => expectedRevision), [0, 1]);
  assert.notEqual(commands[0]?.id, commands[1]?.id);
  runtime.dispose();
});

test("a receipt already covered by polling does not block the next intent", async () => {
  let observeRevision = 0;
  let commandCount = 0;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString().endsWith("/observe"))
      return observation(observeRevision);
    const body = JSON.parse(String(init?.body)) as { id: string };
    commandCount++;
    observeRevision = commandCount;
    if (commandCount === 1) await wait(150);
    return applied(body.id, observeRevision);
  };
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: fetcher,
    pollMs: 100,
    createCommandId: (() => {
      let next = 0;
      return () => `concurrent-${++next}`;
    })(),
  });
  runtime.send({ type: "start", game: "survival" });
  await wait(0);
  runtime.send({ type: "pause" });
  runtime.send({ type: "resume" });
  await wait(350);
  assert.equal(commandCount, 2);
  runtime.dispose();
});

test("remote observation body limits and deadlines cover headers-to-body", async () => {
  const stalled = new ReadableStream<Uint8Array>({ start() {} });
  const timeoutEvents: WorkerEvent[] = [];
  const timeoutRuntime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    requestTimeoutMs: 10,
    fetch: async () => new Response(stalled),
  });
  timeoutRuntime.subscribe((event) => timeoutEvents.push(event));
  timeoutRuntime.send({ type: "start", game: "survival" });
  await wait(30);
  assert.ok(timeoutEvents.some((event) => event.type === "error"));
  timeoutRuntime.dispose();

  const oversized = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      controller.close();
    },
  });
  const oversizedEvents: WorkerEvent[] = [];
  const oversizedRuntime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: async () => new Response(oversized),
  });
  oversizedRuntime.subscribe((event) => oversizedEvents.push(event));
  oversizedRuntime.send({ type: "start", game: "survival" });
  await wait(0);
  assert.ok(oversizedEvents.some((event) => event.type === "error"));
  oversizedRuntime.dispose();
});

test("disposing remote runtime aborts its in-flight observation", async () => {
  let aborted = false;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  const runtime = connectRemoteRuntime({
    endpoint: "https://hive.test/world",
    game: "survival",
    fetch: fetcher,
  });
  runtime.send({ type: "start", game: "survival" });
  runtime.dispose();
  await wait(0);
  assert.equal(aborted, true);
});
