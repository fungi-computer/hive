import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createPublicationQueue } from "./publication-queue.ts";

const wait = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("publication requests coalesce while one publication is running", async () => {
  let release!: () => void;
  const started = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const queue = createPublicationQueue(async () => {
    calls++;
    if (calls === 1) await started;
  }, () => { throw new Error("unexpected publication failure"); });
  const first = queue.request();
  await wait();
  assert.equal(calls, 1);
  queue.request(); queue.request();
  release();
  await first;
  assert.equal(calls, 2);
});

test("publication failures are reported without detached rejection", async () => {
  const failures: unknown[] = [];
  const queue = createPublicationQueue(async () => { throw new Error("publish failed"); }, (error) => failures.push(error));
  await queue.request();
  assert.equal(failures.length, 1);
  assert.equal((failures[0] as Error).message, "publish failed");
});

test("synchronous failure and reentrant requests keep the queue alive", async () => {
  let calls = 0;
  let first = true;
  let queue!: ReturnType<typeof createPublicationQueue>;
  queue = createPublicationQueue(() => {
    calls++;
    if (first) {
      first = false;
      queue.request();
      throw new Error("sync publish failed");
    }
    return Promise.resolve();
  }, () => {});
  await queue.request();
  assert.equal(calls, 2);
  await queue.request();
  assert.equal(calls, 3);
});
