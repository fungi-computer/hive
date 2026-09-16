import { checkedCueList, type PresentationCue } from "./presentation-cues";
import { checkedAction } from "./actions";
import type { PlacementDecisionQuery, PlacementDecisionResult, WorkerCommand, WorkerEvent } from "./protocol";
import type { RuntimeConnection } from "./browser-client";
import type { ActionResult, RenderFact, SupportSurface, Vec3 } from "../contracts";
import { presentationFactSchema, type EnvironmentVisual, type TerrainMark } from "../presentation";
import { parse as parseAgentProjection } from "@fungi.computer/whistle/wire";
import type { WhistleAgentProjection } from "@fungi.computer/whistle";
import type { WhistleContextualTarget } from "./whistle";
import { entity } from "../sdk/authoring";
import { parseTerrainObservation, type TerrainWireFrame } from "./terrain-wire";
import { activitySchema } from "./work-activity";
import { WebSocket as PartySocket } from "partysocket";
import { z } from "zod";
import { validVisualPlacement } from "./visual-projection";
import { parsePlacementDecisionResult, placementDecisionQuerySchema } from "./placement-decision";
import { MAX_TERRAIN_CHUNK_REPLY_BYTES, parseTerrainChunkReply, terrainChunkRequestSchema, type TerrainChunkReply, type TerrainChunkRequest } from "./terrain-chunks";

const rejectionReasonSchema = z.object({ reason: z.string().min(1) });
const partyJoinSchema = z.object({
  player: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  party: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  people: z.tuple([
    z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
    z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  ]),
}).strict();

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SocketLike = {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  send(data: string): void;
  close(): void;
  reconnect(): void;
};
export interface RemoteRuntimeOptions {
  readonly endpoint: string | URL;
  readonly game: string;
  /** Authentication is supplied by the caller; this function adds no secret. */
  readonly fetch: AuthorizedFetch;
  readonly token: string;
  /** Colony v2 invitation. It is submitted only in the join body. */
  readonly invite?: string;
  /** Browser persistence for the world-scoped participant credential. */
  readonly storage?: Storage;
  readonly cryptoSource?: Crypto;
  readonly requestTimeoutMs?: number;
  readonly createCommandId?: () => string;
  readonly createSocket?: (url: string) => SocketLike;
}

type ObservationWire = {
  readonly revision: number;
  readonly terrainBaseline: boolean;
  readonly whistleChanged: boolean;
  readonly observation: {
    readonly time: number;
    readonly paused: boolean;
    readonly epoch: number;
    readonly sequence: number;
    readonly facts: readonly RenderFact[];
    /** The parser hydrates references before this internal value is emitted. */
    readonly terrain?: TerrainWireFrame;
    readonly cues: readonly PresentationCue[];
    readonly presentationFacts: readonly {
      readonly id: string;
      readonly label: string;
      readonly value: string | number | boolean;
    }[];
    readonly whistleAgent: readonly WhistleAgentProjection[];
    readonly whistleTargets: readonly WhistleContextualTarget[];
    readonly terrainMarks: readonly TerrainMark[];
    readonly environmentVisuals: readonly EnvironmentVisual[];
  };
};
type PendingIntent = {
  command: unknown;
  retries: number;
  recoveries: number;
  id?: string;
  body?: string;
};

const MAX_PENDING = 16;
const MAX_RETRIES = 3;
const MAX_COMMAND_RECOVERIES = 3;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_OBSERVATION_BYTES = 1024 * 1024;
const MAX_RECEIPT_BYTES = 64 * 1024;

function endpointUrl(endpoint: string | URL, path: string): string {
  const url = new URL(endpoint.toString());
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  return url.toString();
}
const credentialPattern = /^[a-f0-9]{64}$/;
const sharedWorldPath = (endpoint: string | URL, world: string, operation: string, handle?: string) =>
  endpointUrl(endpoint, `/v2/colony/worlds/${world}/${operation}${handle === undefined ? "" : `/${encodeURIComponent(handle)}`}`);
function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function digestHex(value: string, cryptoSource: Crypto): Promise<string> {
  return hex(new Uint8Array(await cryptoSource.subtle.digest("SHA-256", new TextEncoder().encode(value))));
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
function inventoryItem(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string" || value.kind.length === 0 || value.kind.length > 128 ||
      !safeNonnegativeInteger(value.quantity) || value.quantity < 1 ||
      (value.id !== undefined && (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 160)) ||
      (value.container === undefined) !== (value.id === undefined)) return false;
  if (value.container === undefined) return true;
  const container = value.container;
  if (!isRecord(container) || !safeNonnegativeInteger(container.capacity) ||
    !isRecord(container.contents) || !Array.isArray(container.contents.items) || container.contents.items.length > 8 ||
    !(container.contents.overflow === undefined || typeof container.contents.overflow === "boolean") ||
    !container.contents.items.every((nested) => isRecord(nested) && typeof nested.kind === "string" &&
      nested.kind.length > 0 && nested.kind.length <= 128 && safeNonnegativeInteger(nested.quantity) && nested.quantity >= 1)) return false;
  const total = container.contents.items.reduce((sum, nested) => sum + nested.quantity, 0);
  return Number.isSafeInteger(total) && total <= container.capacity;
}
function renderFact(value: unknown): value is RenderFact {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 160)
    return false;
  if (value.activity !== undefined && !activitySchema.safeParse(value.activity).success) return false;
  if (value.view !== undefined && (!isRecord(value.view) || (value.view.pickable !== undefined && typeof value.view.pickable !== "boolean") || (value.view.cutawayTop !== undefined && !Number.isSafeInteger(value.view.cutawayTop)))) return false;
  if (value.pose !== undefined && !pose(value.pose)) return false;
  if (value.local !== undefined && !pose(value.local)) return false;
  if (value.support !== undefined && value.support !== null && typeof value.support !== "string") return false;
  if (value.surface !== undefined && value.surface !== null && !surface(value.surface)) return false;
  if (value.placement !== undefined && !validVisualPlacement(value.placement)) return false;
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
  if (value.inventory !== undefined) {
    const inventory = value.inventory;
    if (!isRecord(inventory) || !Array.isArray(inventory.items) || inventory.items.length > 8 ||
        (inventory.overflow !== undefined && typeof inventory.overflow !== "boolean") ||
        !inventory.items.every(inventoryItem))
      return false;
  }
  return value.selected === undefined || typeof value.selected === "boolean";
}
function presentationFact(value: unknown): value is ObservationWire["observation"]["presentationFacts"][number] {
  return presentationFactSchema.safeParse(value).success;
}
const whistleTargetSchema = z.object({
  commandId: z.string().min(3).max(256),
  subjects: z.array(z.string().min(1).max(128)).min(1).max(128),
}).strict();
function parseWhistleTargets(value: unknown): readonly WhistleContextualTarget[] | undefined {
  if (!Array.isArray(value) || value.length > 256) return undefined;
  const targets: WhistleContextualTarget[] = [];
  for (const item of value) {
    const parsed = whistleTargetSchema.safeParse(item);
    if (!parsed.success) return undefined;
    try {
      targets.push({ commandId: parsed.data.commandId, subjects: parsed.data.subjects.map(subject => entity(subject)) });
    } catch {
      return undefined;
    }
  }
  return targets;
}
function terrainMark(value: unknown): value is TerrainMark {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 128 &&
    Array.isArray(value.cell) && value.cell.length === 3 && value.cell.every(Number.isSafeInteger) &&
    (value.status === "queued" || value.status === "working" || value.status === "blocked");
}
function environmentVisual(value: unknown): value is EnvironmentVisual {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 128 ||
      !isRecord(value.position) || !finite(value.position.x) || !finite(value.position.y) || !finite(value.position.z) ||
      value.kind !== "smoke" && value.kind !== "fire" || !finite(value.intensity) || value.intensity < 0 || value.intensity > 1) return false;
  return true;
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
function parseObservation(value: unknown, cachedTerrain: TerrainWireFrame | undefined, cachedWhistle: { readonly agent: readonly WhistleAgentProjection[]; readonly targets: readonly WhistleContextualTarget[] } | undefined): ObservationWire {
  if (!isRecord(value) || !safeNonnegativeInteger(value.revision)) throw new Error("invalid remote observation revision");
  const observation = value.observation;
  if (!isRecord(observation)) throw new Error("missing remote observation");
  const facts = observation.facts;
  const presentationFacts = observation.presentationFacts;
  const whistleAgent = observation.whistleAgent;
  const whistleTargets = observation.whistleTargets;
  const completeWhistleUpdate = (whistleAgent === undefined) === (whistleTargets === undefined);
  const parsedAgent = whistleAgent === undefined
    ? cachedWhistle?.agent
    : parseAgentProjection(whistleAgent);
  const parsedTargets = whistleTargets === undefined
    ? cachedWhistle?.targets
    : parseWhistleTargets(whistleTargets);
  const terrainMarks = observation.terrainMarks;
  const environmentVisuals = observation.environmentVisuals;
  if (typeof observation.paused !== "boolean" || !finite(observation.time) || observation.time < 0 ||
    !safeNonnegativeInteger(observation.epoch) || !safeNonnegativeInteger(observation.sequence) ||
    !Array.isArray(facts) || facts.length > 512 || facts.some((item) => !renderFact(item)) ||
    !Array.isArray(presentationFacts) || presentationFacts.length > 32 || presentationFacts.some((item) => !presentationFact(item)) ||
    !completeWhistleUpdate ||
    (whistleAgent !== undefined && (!Array.isArray(whistleAgent) || whistleAgent.length > 256)) ||
    (whistleTargets !== undefined && parsedTargets === undefined) ||
    parsedAgent === undefined || parsedTargets === undefined ||
    !Array.isArray(terrainMarks) || terrainMarks.length > 256 || terrainMarks.some((item) => !terrainMark(item)) ||
    !Array.isArray(environmentVisuals) || environmentVisuals.length > 64 || environmentVisuals.some((item) => !environmentVisual(item)) ||
    new Set(environmentVisuals.map(item => (item as { id: string }).id)).size !== environmentVisuals.length)
    throw new Error("invalid remote observation");
  return {
    revision: value.revision,
    terrainBaseline: isRecord(observation.terrain) && Array.isArray(observation.terrain.surfaces),
    whistleChanged: whistleAgent !== undefined || whistleTargets !== undefined,
    observation: {
      time: observation.time,
      paused: observation.paused,
      epoch: observation.epoch,
      sequence: observation.sequence,
      facts: facts as RenderFact[],
      terrain: parseTerrainObservation(observation.terrain, cachedTerrain),
      cues: checkedCueList(observation.cues, observation.time),
      presentationFacts: presentationFacts as ObservationWire["observation"]["presentationFacts"],
      whistleAgent: parsedAgent,
      whistleTargets: parsedTargets,
      terrainMarks: terrainMarks as TerrainMark[],
      environmentVisuals: environmentVisuals as EnvironmentVisual[],
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
    (value.reason === undefined || (typeof value.reason === "string" && value.reason.length <= 256)) &&
    (value.entityId === undefined || (typeof value.entityId === "string" && value.entityId.length > 0 && value.entityId.length <= 128));
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
  let lastPaused: boolean | undefined;
  let lastSequence: number | undefined;
  let lastTime: number | undefined;
  let cachedTerrain: TerrainWireFrame | undefined;
  let cachedWhistle: { readonly agent: readonly WhistleAgentProjection[]; readonly targets: readonly WhistleContextualTarget[] } | undefined;
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();
  let pumpRunning = false;
  let blocked = false;
  let reconnectRequested = false;
  let socket: SocketLike | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let admissionAttempts = 0;
  const shared = options.game === "colony" && options.invite !== undefined;
  let sharedWorld: string | undefined;
  let sharedCredential = "";
  let sharedPrepared = false;
  const sharedBase = () => {
    if (!sharedWorld) throw new Error("remote Colony world is not prepared");
    return (operation: "join" | "observe" | "command" | "placement" | "terrain" | "connect" | "socket", handle?: string) =>
      sharedWorldPath(options.endpoint, sharedWorld!, operation, handle);
  };
  const prepareShared = async () => {
    if (!shared || sharedPrepared) return;
    const cryptoSource = options.cryptoSource ?? globalThis.crypto;
    if (!credentialPattern.test(options.invite!)) throw new Error("invalid Colony invitation");
    sharedWorld = await digestHex(options.invite!, cryptoSource);
    if (!credentialPattern.test(sharedWorld)) throw new Error("invalid Colony world handle");
    const storage = options.storage ?? globalThis.localStorage;
    if (!storage) throw new Error("Colony v2 requires browser persistence");
    const key = `hive:colony-v2:credential:${sharedWorld}`;
    const existing = storage.getItem(key);
    if (existing && credentialPattern.test(existing)) sharedCredential = existing;
    else {
      const bytes = new Uint8Array(32);
      cryptoSource.getRandomValues(bytes);
      sharedCredential = hex(bytes);
      // This write is deliberately before the first join request. A lost reply
      // or a second tab must retry with the same participant identity.
      storage.setItem(key, sharedCredential);
    }
    const joined = await requestJson(options.fetch, sharedBase()("join"), {
      method: "POST",
      headers: { Authorization: `Bearer ${sharedCredential}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invite: options.invite }),
    }, abort.signal, 16 * 1024, requestTimeoutMs);
    if (!joined.response.ok) throw new Error("shared Colony join failed");
    const party = partyJoinSchema.parse(joined.value);
    emit({ type: "party", player: party.player, party: party.party, people: party.people });
    sharedPrepared = true;
  };

  const emit = (event: WorkerEvent) => { if (!disposed) for (const listener of listeners) listener(event); };
  const emitConnection = (status: "online" | "recovering" | "unavailable") =>
    emit({ type: "connection", status, pending: pending.length });
  const acceptObservation = (candidate: ObservationWire): boolean => {
    // A reconnect can replay the same committed revision. Install its complete
    // baseline before stale-frame filtering, while still suppressing duplicate UI frames.
    const currentRevision = revision;
    const currentSequence = lastSequence;
    const currentTime = lastTime;
    const isCurrentOrNewer = currentRevision === undefined || candidate.revision > currentRevision ||
      (candidate.revision === currentRevision && (currentSequence === undefined ||
        candidate.observation.sequence > currentSequence ||
        (candidate.observation.sequence === currentSequence && candidate.observation.time >= (currentTime ?? 0))));
    if (candidate.terrainBaseline && cachedTerrain === undefined && candidate.observation.terrain !== undefined && isCurrentOrNewer)
      cachedTerrain = candidate.observation.terrain;
    if (candidate.whistleChanged && cachedWhistle === undefined && isCurrentOrNewer)
      cachedWhistle = { agent: candidate.observation.whistleAgent, targets: candidate.observation.whistleTargets };
    if (revision !== undefined && candidate.revision <= revision) return false;
    if (lastSequence !== undefined && (candidate.observation.sequence < lastSequence ||
      (candidate.observation.sequence === lastSequence && candidate.observation.time < (lastTime ?? 0)))) return false;
    revision = candidate.revision;
    lastSequence = candidate.observation.sequence;
    lastTime = candidate.observation.time;
    cachedTerrain = candidate.observation.terrain;
    cachedWhistle = { agent: candidate.observation.whistleAgent, targets: candidate.observation.whistleTargets };
    const pauseChanged = lastPaused === undefined || lastPaused !== candidate.observation.paused;
    lastPaused = candidate.observation.paused;
    if (pauseChanged) emit({ type: "state", paused: lastPaused });
    emit({ type: "frame", time: candidate.observation.time, epoch: candidate.observation.epoch, sequence: candidate.observation.sequence, facts: candidate.observation.facts, ...(candidate.observation.terrain === undefined ? {} : { terrain: candidate.observation.terrain }), cues: candidate.observation.cues });
    emit({ type: "presentation", facts: candidate.observation.presentationFacts, terrainMarks: candidate.observation.terrainMarks, environmentVisuals: candidate.observation.environmentVisuals });
    if (candidate.whistleChanged)
      emit({ type: "whistle", agent: candidate.observation.whistleAgent, targets: candidate.observation.whistleTargets });
    return true;
  };
  const openSocket = async () => {
    let connectedSocket: SocketLike;
    try {
      if (shared) await prepareShared();
      const connectPath = shared ? sharedBase()("connect") : endpointUrl(options.endpoint, "/connect");
      const handleResponse = await requestJson(options.fetch, connectPath, { method: "GET", headers: shared ? { Authorization: `Bearer ${sharedCredential}` } : undefined }, abort.signal, 16 * 1024, requestTimeoutMs);
      if (!handleResponse.response.ok) {
        const reason = isRecord(handleResponse.value) && typeof handleResponse.value.error === "string" ? handleResponse.value.error : "remote socket admission failed";
        throw new Error(reason);
      }
      if (!isRecord(handleResponse.value) || typeof handleResponse.value.handle !== "string" || handleResponse.value.handle.length === 0 || handleResponse.value.handle.length > 256)
        throw new Error("remote socket admission failed");
      const url = new URL(shared ? sharedBase()("socket", handleResponse.value.handle) : endpointUrl(options.endpoint, "/socket/" + encodeURIComponent(handleResponse.value.handle)));
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (disposed) return;
      connectedSocket = options.createSocket
        ? options.createSocket(url.toString())
        : new PartySocket(url.toString(), [], { maxEnqueuedMessages: 0, maxRetries: 8 });
      socket = connectedSocket;
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
    connectedSocket.addEventListener("message", (event) => {
      if (socket !== connectedSocket) return;
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
        const accepted = acceptObservation(parseObservation(value, cachedTerrain, cachedWhistle));
        if (accepted && !blocked && pending.length > 0 && !pumpRunning) schedulePump();
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
        // A missing or mismatched reference cannot be safely displayed. Force
        // the existing socket recovery path to obtain a complete baseline.
        try { socket?.reconnect(); } catch {}
      }
    });
    connectedSocket.addEventListener("error", () => { if (socket !== connectedSocket || disposed) return; emit({ type: "error", message: "remote socket failed; reconnecting" }); });
    connectedSocket.addEventListener("close", () => {
      if (socket !== connectedSocket) return;
      if (!disposed) emit({ type: "error", message: "remote socket disconnected; reconnecting" });
    });
    connectedSocket.addEventListener("open", () => {
      if (socket !== connectedSocket) return;
      reconnectRequested = false;
      // A websocket reconnect has a fresh server-side attachment, so its surface
      // reference must begin with no baseline even when the world revision matches.
      cachedTerrain = undefined;
      cachedWhistle = undefined;
      connectedSocket.send(JSON.stringify({ type: "authenticate", ...(shared ? { credential: sharedCredential } : { token: options.token }) }));
      if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => { if (!disposed && socket === connectedSocket) connectedSocket.send(JSON.stringify({ type: "heartbeat" })); }, 5_000);
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
  const blockForRecovery = (item: PendingIntent, message: string) => {
    blocked = true;
    emit({ type: "error", message });
    if (item.recoveries >= MAX_COMMAND_RECOVERIES) {
      blocked = true;
      emit({ type: "error", message: `remote command recovery limit exceeded for ${item.id}` });
      emitConnection("unavailable");
      return;
    }
    item.recoveries++;
    emitConnection("recovering");
    // HTTP receipts are authoritative and can be recovered independently of
    // observation delivery. Reconnect is only a best-effort view repair; it
    // must not gate retrying the exact command body and ID.
    if (!reconnectRequested && socket) {
      reconnectRequested = true;
      try { socket.reconnect(); } catch { reconnectRequested = false; }
    }
    blocked = false;
    item.retries = 0;
  };
  const pump = async () => {
    if (disposed || blocked || pumpRunning || pending.length === 0) return;
    if (revision === undefined) return;
    pumpRunning = true;
    const item = pending[0];
    try {
      if (!item.body) {
        item.id = safeId(options.createCommandId);
        item.body = JSON.stringify({ id: item.id, command: item.command });
      }
      while (!disposed && !blocked) {
        try {
          const responseData = await requestJson(options.fetch, shared ? sharedBase()("command") : endpointUrl(options.endpoint, "/command"), {
            method: "POST", headers: shared ? { "Content-Type": "application/json", Authorization: `Bearer ${sharedCredential}` } : { "Content-Type": "application/json" }, body: item.body,
          }, abort.signal, MAX_RECEIPT_BYTES, requestTimeoutMs);
          const response = responseData.response;
          if (response.status >= 500 || response.status === 408) {
            if (item.retries++ < MAX_RETRIES) { await retryDelay(item.retries); continue; }
            blockForRecovery(item, `remote command recovery pending for ${item.id}`);
            return;
          }
          if (response.status === 409) {
            pending.shift();
            emit({ type: "error", message: "remote command conflict" });
            return;
          }
          // These are definitive admission refusals from the public host.
          // Keep timeouts/rate limiting/server errors on the same-ID retry path.
          if ([400, 401, 403, 404, 405, 413, 422].includes(response.status)) {
            pending.shift();
            emitConnection("online");
            emit({ type: "error", message: `Order refused (HTTP ${response.status})` });
            return;
          }
          if (!response.ok) throw new Error(`remote command failed (${response.status})`);
          const receipt = responseData.value as Record<string, unknown>;
          if (receipt.commandId !== item.id) throw new Error("remote receipt command id mismatch");
          if (receipt.status === "rejected") {
            pending.shift();
            const reason = rejectionReasonSchema.safeParse(receipt.result);
            emitConnection("online");
            emit({ type: "error", message: reason.success ? `Order refused: ${reason.data.reason}` : "Order refused" });
            return;
          }
          if (receipt.status !== "applied" || !safeNonnegativeInteger(receipt.revision))
            throw new Error("invalid remote command receipt");
          const payload = receipt.result;
          if (isRecord(payload) && payload.results !== undefined) {
            if (!Array.isArray(payload.results) || payload.results.length > 256 || payload.results.some((item) => !actionResult(item)))
              throw new Error("invalid remote action results");
          }
          pending.shift();
          emitConnection("online");
          if (isRecord(payload) && Array.isArray(payload.results))
            emit({ type: "results", results: payload.results });
          return;
        } catch (error) {
          if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
          if (item.retries++ < MAX_RETRIES) { await retryDelay(item.retries); continue; }
          blockForRecovery(item, error instanceof Error ? error.message : String(error));
          return;
        }
      }
    } finally {
      pumpRunning = false;
      if (!disposed && !blocked && pending.length > 0) schedulePump();
    }
  };
  function schedulePump() {
    if (disposed || blocked || pumpRunning || pending.length === 0) return;
    queueMicrotask(() => void pump());
  }
  const retryRecovery = () => {
    if (disposed) throw new Error("runtime connection disposed");
    if (!blocked || pending.length === 0) return;
    blocked = false;
    pending[0].retries = 0;
    pending[0].recoveries = 0;
    emitConnection("recovering");
    schedulePump();
  };
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
    if (blocked) throw new Error("remote runtime unavailable; command recovery is exhausted");
    const next: PendingIntent = { command: structuredClone(commandValue), retries: 0, recoveries: 0 };
    const previous = pending.at(-1);
    if (previous && coalesceDirectInput(previous, next)) { schedulePump(); return; }
    if (pending.length >= MAX_PENDING) throw new Error("remote command queue full");
    pending.push(next);
    schedulePump();
  };
  const placementDecisions = async (raw: PlacementDecisionQuery): Promise<PlacementDecisionResult> => {
    if (disposed) throw new Error("runtime connection disposed");
    if (!shared) throw new Error("placement decisions require a shared Colony world");
    const query = placementDecisionQuerySchema.parse(raw);
    await prepareShared();
    const response = await requestJson(options.fetch, sharedBase()("placement"), {
      method: "POST",
      headers: { Authorization: `Bearer ${sharedCredential}`, "Content-Type": "application/json" },
      body: JSON.stringify(query),
    }, abort.signal, MAX_RECEIPT_BYTES, requestTimeoutMs);
    if (!response.response.ok) throw new Error(`placement decision failed (${response.response.status})`);
    return parsePlacementDecisionResult(response.value, query);
  };
  let terrainReadPending = false;
  const terrainChunks = async (raw: TerrainChunkRequest): Promise<TerrainChunkReply> => {
    if (disposed) throw new Error("runtime connection disposed");
    if (!shared) throw new Error("terrain chunks require a shared Colony world");
    if (terrainReadPending) throw new Error("terrain chunk request already in flight");
    const request = terrainChunkRequestSchema.parse(raw);
    terrainReadPending = true;
    try {
      await prepareShared();
      const response = await requestJson(options.fetch, sharedBase()("terrain"), {
        method: "POST", headers: { Authorization: `Bearer ${sharedCredential}`, "Content-Type": "application/json" }, body: JSON.stringify(request),
      }, abort.signal, MAX_TERRAIN_CHUNK_REPLY_BYTES, requestTimeoutMs);
      if (!response.response.ok) throw new Error(`terrain chunk read failed (${response.response.status})`);
      return parseTerrainChunkReply(response.value, request);
    } finally { terrainReadPending = false; }
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
  return { send, placementDecisions, terrainChunks, subscribe, dispose, recovery: { retry: retryRecovery } };
}
