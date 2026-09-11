import { checkedCueList, type PresentationCue } from "./presentation-cues";
import { checkedAction } from "./actions";
import type { WorkerCommand, WorkerEvent } from "./protocol";
import type { RuntimeConnection } from "./browser-client";
import type { ActionResult, RenderFact, SupportSurface, Vec3 } from "../contracts";
import type { PresentationControl } from "../presentation";
import { WebSocket as PartySocket } from "partysocket";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SocketLike = {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  send(data: string): void;
  close(): void;
};
export interface RemoteRuntimeOptions {
  readonly endpoint: string | URL;
  readonly game: string;
  /** Authentication is supplied by the caller; this function adds no secret. */
  readonly fetch: AuthorizedFetch;
  readonly token: string;
  readonly requestTimeoutMs?: number;
  readonly createCommandId?: () => string;
  readonly createSocket?: (url: string) => SocketLike;
}

type ObservationWire = {
  readonly revision: number;
  readonly observation: {
    readonly time: number;
    readonly paused: boolean;
    readonly epoch: number;
    readonly sequence: number;
    readonly facts: readonly RenderFact[];
    readonly cues: readonly PresentationCue[];
    readonly presentationFacts: readonly {
      readonly id: string;
      readonly label: string;
      readonly value: string | number | boolean;
    }[];
    readonly presentationControls: readonly PresentationControl[];
  };
};
type PendingIntent = {
  command: unknown;
  retries: number;
  staleRetries: number;
  id?: string;
  body?: string;
};

const MAX_PENDING = 16;
const MAX_RETRIES = 3;
const MAX_STALE_RESUBMISSIONS = 3;
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
function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function safeNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function vec3(value: unknown): value is Vec3 {
  return isRecord(value) && finite(value.x) && finite(value.y) && finite(value.z);
}
function pose(value: unknown): boolean {
  return isRecord(value) && vec3(value.position) && finite(value.facing);
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
  if (value.pose !== undefined && !pose(value.pose)) return false;
  if (value.local !== undefined && !pose(value.local)) return false;
  if (value.support !== undefined && value.support !== null && typeof value.support !== "string") return false;
  if (value.surface !== undefined && value.surface !== null && !surface(value.surface)) return false;
  for (const key of ["visual", "label"] as const)
      if (value[key] !== undefined && value[key] !== null && (typeof value[key] !== "string" || value[key].length > 512)) return false;
  if (value.aim !== undefined && value.aim !== null) {
    const aim = value.aim;
    if (!isRecord(aim) || !vec3(aim.origin) || !vec3(aim.muzzle) || !vec3(aim.inheritedVelocity) ||
        ![aim.radius, aim.gravity, aim.penetration, aim.maxRange, aim.maxLifetime, aim.speed].every(finite) ||
        Number(aim.radius) <= 0 || Number(aim.maxRange) <= 0 || Number(aim.maxLifetime) <= 0 || Number(aim.speed) <= 0)
      return false;
  }
  if (value.collision !== undefined && value.collision !== null) {
    const collider = value.collision;
    if (!isRecord(collider) || collider.id !== value.id || !vec3(collider.origin) || !vec3(collider.velocity) ||
        !["ball", "cuboid"].includes(String(collider.shape)) ||
        ![collider.radius, collider.halfX, collider.halfY, collider.halfZ, collider.yaw, collider.offsetX, collider.offsetY, collider.offsetZ].every(finite) ||
        !isRecord(collider.material) || !["stop", "pierce", "ground"].includes(String(collider.material.response)) ||
        ![collider.material.resistance, collider.material.restitution, collider.material.friction, collider.material.embedSpeed].every(finite))
      return false;
  }
  if (value.projectile !== undefined && value.projectile !== null) {
    const shot = value.projectile;
    if (!isRecord(shot) || !vec3(shot.velocity) || !vec3(shot.rollNormal) ||
        ![shot.gravity, shot.embedDepth, shot.penetration].every(finite) ||
        !["flying", "rolling", "resting", "embedded"].includes(String(shot.state))) return false;
  }
  if (value.direct !== undefined && value.direct !== null) {
    const d = value.direct;
    if (!isRecord(d) || typeof d.stream !== "string" || d.stream.length > 64 ||
        !safeNonnegativeInteger(d.lastQueued) || !safeNonnegativeInteger(d.lastProcessed) || d.lastProcessed > d.lastQueued ||
        !finite(d.speed) || d.speed < 0 || !Array.isArray(d.blocked) || d.blocked.length > 4096 ||
        !d.blocked.every(cell => Array.isArray(cell) && cell.length === 3 && cell.every(Number.isSafeInteger))) return false;
    if (d.bounds !== null && (!isRecord(d.bounds) || !finite(d.bounds.min_x) || !finite(d.bounds.max_x) || !finite(d.bounds.min_z) || !finite(d.bounds.max_z) || d.bounds.min_x > d.bounds.max_x || d.bounds.min_z > d.bounds.max_z)) return false;
  }
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
async function requestJson(
  fetcher: AuthorizedFetch,
  input: RequestInfo | URL,
  init: RequestInit,
  parent: AbortSignal,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ response: Response; value: unknown }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectParent: ((error: unknown) => void) | undefined;
  const parentAbort = new Promise<never>((_, reject) => {
    rejectParent = reject;
  });
  const onAbort = () => {
    controller.abort();
    rejectParent?.(new DOMException("aborted", "AbortError"));
  };
  parent.addEventListener("abort", onAbort, { once: true });
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("remote request timed out"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetcher(input, { ...init, signal: controller.signal }),
      deadline,
      parentAbort,
    ]);
    if (!response.body) {
      const text = await Promise.race([response.text(), deadline, parentAbort]);
      if (new TextEncoder().encode(text).byteLength > maxBytes)
        throw new Error("remote response too large");
      return { response, value: parseJsonOrUndefined(text) };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await Promise.race([reader.read(), deadline, parentAbort]);
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maxBytes) {
          void reader.cancel("remote response too large").catch(() => undefined);
          throw new Error("remote response too large");
        }
        chunks.push(part.value);
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    }
    const bytesValue = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytesValue.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      response,
      value: parseJsonOrUndefined(new TextDecoder().decode(bytesValue)),
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    parent.removeEventListener("abort", onAbort);
  }
}
function parseObservation(value: unknown): ObservationWire {
  if (!isRecord(value) || !safeNonnegativeInteger(value.revision)) throw new Error("invalid remote observation revision");
  const observation = value.observation;
  if (!isRecord(observation)) throw new Error("missing remote observation");
  const facts = observation.facts;
  const presentationFacts = observation.presentationFacts;
  const presentationControls = observation.presentationControls;
  if (typeof observation.paused !== "boolean" || !finite(observation.time) || observation.time < 0 ||
    !safeNonnegativeInteger(observation.epoch) || !safeNonnegativeInteger(observation.sequence) ||
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
      cues: checkedCueList(observation.cues, observation.time),
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
function actionResult(value: unknown): value is ActionResult {
  return isRecord(value) && typeof value.accepted === "boolean" &&
    safeNonnegativeInteger(value.revision) &&
    (value.reason === undefined || (typeof value.reason === "string" && value.reason.length <= 256));
}
function directInputBatch(value: unknown) {
  if (!isRecord(value) || value.kind !== "action") return undefined;
  try {
    const action = checkedAction(value.action);
    return action.kind === "direct-input" ? action : undefined;
  } catch { return undefined; }
}
function coalesceDirectInput(previous: PendingIntent, next: PendingIntent): boolean {
  if (previous.body !== undefined || previous.id !== undefined) return false;
  const first = directInputBatch(previous.command);
  const second = directInputBatch(next.command);
  if (!first || !second || first.entity !== second.entity || first.stream !== second.stream ||
    first.inputs.length + second.inputs.length > 50 ||
    first.inputs.at(-1)!.sequence + 1 !== second.inputs[0].sequence) return false;
  previous.command = {
    kind: "action",
    action: {
      kind: "direct-input",
      entity: first.entity,
      stream: first.stream,
      inputs: [...first.inputs, ...second.inputs],
    },
  };
  return true;
}

export function connectRemoteRuntime(options: RemoteRuntimeOptions): RuntimeConnection {
  if (options.requestTimeoutMs !== undefined && (!Number.isFinite(options.requestTimeoutMs) || options.requestTimeoutMs < 10 || options.requestTimeoutMs > 60_000))
    throw new Error("remote request timeout must be between 10ms and 60s");
  const requestTimeoutMs = Math.round(options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
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
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let pumpRunning = false;
  let blocked = false;
  let socket: SocketLike | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let admissionAttempts = 0;

  const emit = (event: WorkerEvent) => { if (!disposed) for (const listener of listeners) listener(event); };
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
    emit({ type: "frame", time: candidate.observation.time, epoch: candidate.observation.epoch, sequence: candidate.observation.sequence, facts: candidate.observation.facts, cues: candidate.observation.cues });
    emit({ type: "presentation", facts: candidate.observation.presentationFacts, controls: candidate.observation.presentationControls });
    return true;
  };
  const openSocket = async () => {
    try {
      const handleResponse = await requestJson(options.fetch, endpointUrl(options.endpoint, "/connect"), { method: "GET" }, abort.signal, 16 * 1024, requestTimeoutMs);
      if (!handleResponse.response.ok) {
        const reason = isRecord(handleResponse.value) && typeof handleResponse.value.error === "string" ? handleResponse.value.error : "remote socket admission failed";
        throw new Error(reason);
      }
      if (!isRecord(handleResponse.value) || typeof handleResponse.value.handle !== "string" || handleResponse.value.handle.length === 0 || handleResponse.value.handle.length > 256)
        throw new Error("remote socket admission failed");
      const url = new URL(endpointUrl(options.endpoint, "/socket/" + encodeURIComponent(handleResponse.value.handle)));
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (disposed) return;
      socket = options.createSocket
        ? options.createSocket(url.toString())
        : new PartySocket(url.toString(), [], { maxEnqueuedMessages: 0, maxRetries: 8 });
    } catch (error) {
      if (!disposed && error instanceof Error && error.message === "unsupported-world") {
        emit({ type: "error", message: "This saved demo uses an older engine. New world starts separately; saved data retained." });
      } else if (!disposed && admissionAttempts++ < MAX_RETRIES) {
        await retryDelay(admissionAttempts);
        if (!disposed) void openSocket();
      } else if (!disposed) {
        emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    admissionAttempts = 0;
    socket.addEventListener("message", (event) => {
      let value: unknown;
      const raw = String(event.data);
      if (new TextEncoder().encode(raw).byteLength > MAX_OBSERVATION_BYTES) { emit({ type: "error", message: "remote socket message too large" }); return; }
      try { value = JSON.parse(raw); } catch { emit({ type: "error", message: "invalid remote socket message" }); return; }
      if (!isRecord(value)) return;
      if (value.type === "ready") {
        readyEmitted = true;
        emit({ type: "ready", game: options.game });
        return;
      }
      if (value.type === "error") { emit({ type: "error", message: typeof value.error === "string" ? value.error : "remote socket error" }); return; }
      if (value.type !== "observation") return;
      try {
        const accepted = acceptObservation(parseObservation(value));
        if (accepted && !blocked && pending.length > 0 && !pumpRunning) schedulePump();
      } catch (error) { emit({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
    });
    socket.addEventListener("error", () => { if (!disposed) emit({ type: "error", message: "remote socket failed; reconnecting" }); });
    socket.addEventListener("close", () => { if (!disposed) emit({ type: "error", message: "remote socket disconnected; reconnecting" }); });
    socket.addEventListener("open", () => {
      socket?.send(JSON.stringify({ type: "authenticate", token: options.token }));
      if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => { if (!disposed && socket) socket.send(JSON.stringify({ type: "heartbeat" })); }, 5_000);
    });
  };
  const retryDelay = (attempt: number) =>
    new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const onAbort = () => finish();
      const finish = () => {
        retryTimers.delete(timer);
        clearTimeout(timer);
        abort.signal.removeEventListener("abort", onAbort);
        resolve();
      };
      timer = setTimeout(finish, Math.min(1000, 100 * 2 ** attempt));
      retryTimers.add(timer);
      abort.signal.addEventListener("abort", onAbort, { once: true });
    });
  const pump = async () => {
    if (disposed || blocked || pumpRunning || pending.length === 0) return;
    if (revision === undefined || awaitRevision !== undefined) return;
    pumpRunning = true;
    const item = pending[0];
    try {
      if (!item.body) {
        item.id = safeId(options.createCommandId);
        item.body = JSON.stringify({ id: item.id, command: item.command });
      }
      while (!disposed && !blocked) {
        try {
          const responseData = await requestJson(options.fetch, endpointUrl(options.endpoint, "/command"), {
            method: "POST", headers: { "Content-Type": "application/json" }, body: item.body,
          }, abort.signal, MAX_RECEIPT_BYTES, requestTimeoutMs);
          const response = responseData.response;
          if (response.status >= 500 || response.status === 408) {
            if (item.retries++ < MAX_RETRIES) { await retryDelay(item.retries); continue; }
            blocked = true;
            emit({ type: "error", message: `remote command retry limit exceeded for ${item.id}` });
            return;
          }
          if (response.status === 409) {
            pending.shift();
            emit({ type: "error", message: "remote command conflict" });
            return;
          }
          if (!response.ok) throw new Error(`remote command failed (${response.status})`);
          const receipt = responseData.value as Record<string, unknown>;
          if (receipt.commandId !== item.id) throw new Error("remote receipt command id mismatch");
          if (receipt.status === "rejected") {
            const rejectedRevision = receipt.revision;
            const staleResult = receipt.result;
            const stale = safeNonnegativeInteger(rejectedRevision) && isRecord(staleResult) &&
              staleResult.reason === "stale-revision";
            if (stale) {
              if (item.staleRetries >= MAX_STALE_RESUBMISSIONS) {
                pending.shift();
                emit({ type: "error", message: `remote stale revision retry limit exceeded for ${item.id}` });
                return;
              }
              item.staleRetries++;
              item.retries = 0;
              if (revision === undefined || revision < rejectedRevision)
                awaitRevision = rejectedRevision;
              return;
            }
            pending.shift();
            emit({ type: "error", message: "remote command rejected" });
            return;
          }
          if (receipt.status !== "applied" || !safeNonnegativeInteger(receipt.revision))
            throw new Error("invalid remote command receipt");
          if (receipt.revision > (revision ?? -1)) awaitRevision = receipt.revision;
          const payload = receipt.result;
          if (isRecord(payload) && payload.results !== undefined) {
            if (!Array.isArray(payload.results) || payload.results.length > 256 || payload.results.some((item) => !actionResult(item)))
              throw new Error("invalid remote action results");
          }
          pending.shift();
          if (isRecord(payload) && Array.isArray(payload.results))
            emit({ type: "results", results: payload.results });
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
    if (disposed || blocked || pumpRunning || pending.length === 0 || awaitRevision !== undefined) return;
    queueMicrotask(() => void pump());
  }
  const send = (command: WorkerCommand) => {
    if (disposed) throw new Error("runtime connection disposed");
    if (command.type === "start") {
      if (command.game !== options.game) throw new Error(`remote game is ${options.game}`);
        if (!started) { started = true; void openSocket(); }
      return;
    }
    if (!started) throw new Error("remote runtime has not started");
    if (command.type === "step" || command.type === "reset" || command.type === "save" || command.type === "restore") {
      emit({ type: "error", message: `remote command ${command.type} is unsupported` });
      return;
    }
    const commandValue = command.type === "action" ? { kind: "action", action: command.action } :
      command.type === "command" ? { kind: "command", name: command.name, ...(command.input === undefined ? {} : { input: command.input }) } :
      { kind: command.type };
    const next: PendingIntent = { command: structuredClone(commandValue), retries: 0, staleRetries: 0 };
    const previous = pending.at(-1);
    if (previous && coalesceDirectInput(previous, next)) { schedulePump(); return; }
    if (pending.length >= MAX_PENDING) { if (command.type === "action" && (command.action.kind === "direct-input" || command.action.kind === "begin-direct")) throw new Error("remote command queue full");
      emit({ type: "error", message: "remote command queue full" }); return; }
    pending.push(next);
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
    abort.abort();
    socket?.close();
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    pending.length = 0;
    listeners.clear();
  };
  return { send, subscribe, dispose };
}
