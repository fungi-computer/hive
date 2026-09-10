import type { WorkerCommand, WorkerEvent } from "./protocol";
import type { RuntimeConnection } from "./browser-client";
import type { RenderFact, SupportSurface, Vec3, WorldPosition } from "../contracts";
import type { PresentationControl } from "../presentation";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export interface RemoteRuntimeOptions {
  readonly endpoint: string | URL;
  readonly game: string;
  /** Authentication is supplied by the caller; this function adds no secret. */
  readonly fetch: AuthorizedFetch;
  readonly pollMs?: number;
  readonly createCommandId?: () => string;
}

type ObservationWire = {
  readonly revision: number;
  readonly observation: {
    readonly time: number;
    readonly paused: boolean;
    readonly epoch: number;
    readonly sequence: number;
    readonly facts: readonly RenderFact[];
    readonly presentationFacts: readonly {
      readonly id: string;
      readonly label: string;
      readonly value: string | number | boolean;
    }[];
    readonly presentationControls: readonly PresentationControl[];
  };
};
type PendingIntent = {
  readonly command: unknown;
  retries: number;
  id?: string;
  body?: string;
};

const MAX_PENDING = 16;
const MAX_RETRIES = 3;
const DEFAULT_POLL_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_OBSERVATION_BYTES = 1024 * 1024;
const MAX_RECEIPT_BYTES = 64 * 1024;

function endpointUrl(endpoint: string | URL, path: string): string {
  const url = new URL(endpoint.toString());
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  return url.toString();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function vec3(value: unknown): value is Vec3 {
  return isRecord(value) && finite(value.x) && finite(value.y) && finite(value.z);
}
function worldPosition(value: unknown): value is WorldPosition {
  return vec3(value) && finite(value.facing);
}
function surface(value: unknown): value is SupportSurface {
  return (
    isRecord(value) && finite(value.minX) && finite(value.maxX) &&
    finite(value.minZ) && finite(value.maxZ) && finite(value.height) &&
    value.minX <= value.maxX && value.minZ <= value.maxZ
  );
}
function renderFact(value: unknown): value is RenderFact {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 160)
    return false;
  if (value.pose !== undefined && (!isRecord(value.pose) || !vec3(value.pose.position) || !finite(value.pose.facing))) return false;
  if (value.local !== undefined && !worldPosition(value.local)) return false;
  if (value.support !== undefined && value.support !== null && typeof value.support !== "string") return false;
  if (value.surface !== undefined && value.surface !== null && !surface(value.surface)) return false;
  for (const key of ["visual", "label"] as const)
    if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > 512)) return false;
  return value.selected === undefined || typeof value.selected === "boolean";
}
function presentationFact(value: unknown): value is ObservationWire["observation"]["presentationFacts"][number] {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 128 &&
    typeof value.label === "string" && value.label.length <= 128 &&
    (typeof value.value === "string" || typeof value.value === "boolean" || (typeof value.value === "number" && Number.isFinite(value.value)));
}
function presentationControl(value: unknown): value is PresentationControl {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 128 &&
    typeof value.label === "string" && value.label.length <= 128 && typeof value.command === "string" &&
    value.command.length > 0 && value.command.length <= 128 &&
    (value.selection === undefined || value.selection === "entities");
}
async function responseJson(response: Response, maxBytes: number): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("remote response too large");
  return JSON.parse(text);
}
async function requestWithTimeout(fetcher: AuthorizedFetch, input: RequestInfo | URL, init: RequestInit, parent: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  parent.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("remote request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
    parent.removeEventListener("abort", onAbort);
  }
}
function parseObservation(value: unknown): ObservationWire {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("invalid remote observation revision");
  const observation = value.observation;
  if (!isRecord(observation)) throw new Error("missing remote observation");
  const facts = observation.facts;
  const presentationFacts = observation.presentationFacts;
  const presentationControls = observation.presentationControls;
  if (typeof observation.paused !== "boolean" || !finite(observation.time) || observation.time < 0 ||
    !Number.isSafeInteger(observation.epoch) || observation.epoch < 0 || !Number.isSafeInteger(observation.sequence) || observation.sequence < 0 ||
    !Array.isArray(facts) || facts.length > 512 || facts.some((item) => !renderFact(item)) ||
    !Array.isArray(presentationFacts) || presentationFacts.length > 32 || presentationFacts.some((item) => !presentationFact(item)) ||
    !Array.isArray(presentationControls) || presentationControls.length > 16 || presentationControls.some((item) => !presentationControl(item)))
    throw new Error("invalid remote observation");
  return {
    revision: value.revision,
    observation: {
      time: observation.time,
      paused: observation.paused,
      epoch: observation.epoch,
      sequence: observation.sequence,
      facts: facts as RenderFact[],
      presentationFacts: presentationFacts as ObservationWire["observation"]["presentationFacts"],
      presentationControls: presentationControls as PresentationControl[],
    },
  };
}
function safeId(create?: () => string): string {
  const value = create ? create() : crypto.randomUUID();
  if (typeof value !== "string" || value.length === 0 || value.length > 160) throw new Error("remote command id must be bounded");
  return value;
}

export function connectRemoteRuntime(options: RemoteRuntimeOptions): RuntimeConnection {
  if (options.pollMs !== undefined && (!Number.isFinite(options.pollMs) || options.pollMs < 100 || options.pollMs > 60_000))
    throw new Error("remote poll interval must be between 100ms and 60s");
  const pollMs = Math.round(options.pollMs ?? DEFAULT_POLL_MS);
  const listeners = new Set<(event: WorkerEvent) => void>();
  const pending: PendingIntent[] = [];
  const abort = new AbortController();
  let disposed = false;
  let started = false;
  let readyEmitted = false;
  let revision: number | undefined;
  let awaitRevision: number | undefined;
  let lastPaused: boolean | undefined;
  let lastSequence: number | undefined;
  let lastTime: number | undefined;
  let pollPromise: Promise<boolean> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let pumpRunning = false;
  let blocked = false;

  const emit = (event: WorkerEvent) => { if (!disposed) for (const listener of listeners) listener(event); };
  const schedulePoll = () => {
    if (disposed || !started || pollTimer !== undefined) return;
    pollTimer = setTimeout(() => { pollTimer = undefined; void poll(); }, pollMs);
  };
  const acceptObservation = (candidate: ObservationWire): boolean => {
    if (revision !== undefined && candidate.revision <= revision) return false;
    if (lastSequence !== undefined && (candidate.observation.sequence < lastSequence ||
      (candidate.observation.sequence === lastSequence && candidate.observation.time < (lastTime ?? 0)))) return false;
    revision = candidate.revision;
    if (awaitRevision !== undefined && candidate.revision >= awaitRevision) awaitRevision = undefined;
    lastSequence = candidate.observation.sequence;
    lastTime = candidate.observation.time;
    const pauseChanged = lastPaused === undefined || lastPaused !== candidate.observation.paused;
    lastPaused = candidate.observation.paused;
    if (pauseChanged) emit({ type: "state", paused: lastPaused });
    emit({ type: "frame", time: candidate.observation.time, epoch: candidate.observation.epoch, sequence: candidate.observation.sequence, facts: candidate.observation.facts });
    emit({ type: "presentation", facts: candidate.observation.presentationFacts, controls: candidate.observation.presentationControls });
    return true;
  };
  const poll = (): Promise<boolean> => {
    if (disposed || !started) return Promise.resolve(false);
    if (pollPromise) return pollPromise;
    pollPromise = (async () => {
      try {
        const response = await requestWithTimeout(options.fetch, endpointUrl(options.endpoint, "/observe"), { method: "GET" }, abort.signal);
        if (!response.ok) throw new Error(`remote observation failed (${response.status})`);
        const candidate = parseObservation(await responseJson(response, MAX_OBSERVATION_BYTES));
        if (!readyEmitted) { readyEmitted = true; emit({ type: "ready", game: options.game }); }
        return acceptObservation(candidate);
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError"))
          emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
        return false;
      }
    })();
    void pollPromise.finally(() => {
      pollPromise = undefined;
      schedulePoll();
      if (!disposed && !blocked && pending.length > 0 && !pumpRunning) schedulePump();
    });
    return pollPromise;
  };
  const retryDelay = (attempt: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        resolve();
      }, Math.min(1000, 100 * 2 ** attempt));
      retryTimers.add(timer);
      abort.signal.addEventListener(
        "abort",
        () => {
          if (retryTimers.delete(timer)) {
            clearTimeout(timer);
            resolve();
          }
        },
        { once: true },
      );
    });
  const pump = async () => {
    if (disposed || blocked || pumpRunning || pending.length === 0) return;
    if (pollPromise || revision === undefined || awaitRevision !== undefined) { void poll(); return; }
    pumpRunning = true;
    const item = pending[0];
    try {
      if (!item.body) {
        item.id = safeId(options.createCommandId);
        item.body = JSON.stringify({ id: item.id, expectedRevision: revision, command: item.command });
      }
      while (!disposed && !blocked) {
        try {
          const response = await requestWithTimeout(options.fetch, endpointUrl(options.endpoint, "/command"), {
            method: "POST", headers: { "Content-Type": "application/json" }, body: item.body,
          }, abort.signal);
          if (response.status >= 500 || response.status === 408) {
            if (item.retries++ < MAX_RETRIES) { await retryDelay(item.retries); continue; }
            blocked = true;
            emit({ type: "error", message: `remote command retry limit exceeded for ${item.id}` });
            return;
          }
          if (response.status === 409) {
            pending.shift();
            emit({ type: "error", message: "remote command conflict" });
            await poll();
            return;
          }
          if (!response.ok) throw new Error(`remote command failed (${response.status})`);
          const receipt = await responseJson(response, MAX_RECEIPT_BYTES) as Record<string, unknown>;
          if (receipt.commandId !== item.id) throw new Error("remote receipt command id mismatch");
          if (receipt.status === "rejected") {
            pending.shift();
            emit({ type: "error", message: "remote command rejected" });
            await poll();
            return;
          }
          if (receipt.status !== "applied" || !Number.isSafeInteger(receipt.revision) || receipt.revision < 0)
            throw new Error("invalid remote command receipt");
          awaitRevision = receipt.revision;
          pending.shift();
          const result = receipt.result;
          if (isRecord(result) && Array.isArray(result.results)) emit({ type: "results", results: result.results });
          await poll();
          return;
        } catch (error) {
          if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
          if (item.retries++ < MAX_RETRIES) { await retryDelay(item.retries); continue; }
          blocked = true;
          emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
          return;
        }
      }
    } finally {
      pumpRunning = false;
      if (!disposed && !blocked && pending.length > 0 && !awaitRevision) schedulePump();
    }
  };
  function schedulePump() {
    if (disposed || blocked || pumpRunning || pollPromise || pending.length === 0 || awaitRevision !== undefined) return;
    queueMicrotask(() => void pump());
  }
  const send = (command: WorkerCommand) => {
    if (disposed) throw new Error("runtime connection disposed");
    if (command.type === "start") {
      if (command.game !== options.game) throw new Error(`remote game is ${options.game}`);
      if (!started) { started = true; void poll(); }
      return;
    }
    if (!started) throw new Error("remote runtime has not started");
    if (command.type === "step" || command.type === "reset" || command.type === "save" || command.type === "restore") {
      emit({ type: "error", message: `remote command ${command.type} is unsupported` });
      return;
    }
    if (pending.length >= MAX_PENDING) { emit({ type: "error", message: "remote command queue full" }); return; }
    const commandValue = command.type === "action" ? { kind: "action", action: command.action } :
      command.type === "command" ? { kind: "command", name: command.name, ...(command.input === undefined ? {} : { input: command.input }) } :
      { kind: command.type };
    pending.push({ command: structuredClone(commandValue), retries: 0 });
    schedulePump();
  };
  const subscribe = (listener: (event: WorkerEvent) => void) => {
    if (disposed) throw new Error("runtime connection disposed");
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    abort.abort();
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    pending.length = 0;
    listeners.clear();
  };
  return { send, subscribe, dispose };
}
