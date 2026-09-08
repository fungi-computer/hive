import { createOverviewSampler, createWorldSpec } from "./terrain.js";

const ROW_BATCH = 8;
const canceled = new Set();
let activeRequestId = null;

const yieldToMessages = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function generateOverview(request, options = {}) {
  const shouldCancel = options.shouldCancel || (() => false);
  const yieldControl = options.yieldControl || yieldToMessages;
  const spec = createWorldSpec(request.spec);
  const sampler = createOverviewSampler(spec, request.options);
  const started = performance.now();
  let progress;
  do {
    if (shouldCancel())
      return { type: "canceled", requestId: request.requestId };
    progress = sampler.sampleRows(ROW_BATCH);
    if (!progress.done) await yieldControl();
  } while (!progress.done);
  if (shouldCancel()) return { type: "canceled", requestId: request.requestId };
  const overview = sampler.result();
  return {
    type: "result",
    requestId: request.requestId,
    generationMs: performance.now() - started,
    overview,
  };
}

function transferOverview(message) {
  return [
    message.overview.terrain.buffer,
    message.overview.features.buffer,
    message.overview.elevation.buffer,
    message.overview.moisture.buffer,
  ];
}

const isWorkerScope =
  typeof WorkerGlobalScope !== "undefined" &&
  globalThis instanceof WorkerGlobalScope;

if (isWorkerScope) {
  globalThis.addEventListener("message", async (event) => {
    const request = event.data;
    if (request.type === "cancel") {
      if (activeRequestId === request.requestId)
        canceled.add(request.requestId);
      return;
    }
    if (request.type !== "sample") return;
    if (activeRequestId !== null) {
      globalThis.postMessage({
        type: "error",
        requestId: request.requestId,
        message: "overview worker already has an active request",
      });
      return;
    }
    activeRequestId = request.requestId;
    try {
      const message = await generateOverview(request, {
        shouldCancel: () => canceled.has(request.requestId),
      });
      if (message.type === "result")
        globalThis.postMessage(message, transferOverview(message));
      else globalThis.postMessage(message);
    } catch (error) {
      globalThis.postMessage({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      canceled.delete(request.requestId);
      activeRequestId = null;
    }
  });
}
