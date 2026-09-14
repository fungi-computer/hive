import { z } from "zod";

export const PACKS = ["survival", "pirates", "colony", "formations"] as const;
export type PublicPack = (typeof PACKS)[number];
export const BODY_BYTES = 8192;
export const LEASE_MS = 15_000;
export const STEP_MS = 100;

/** Ordered private time is protected by the Region occurrence frontier, not a player revision. */
export function clockRequest(sequence: number) {
  return { id: `clock-${sequence}`, command: { kind: "step" as const, delta: STEP_MS / 1000 } };
}

const tokenPattern = /^[a-f0-9]{64}$/;
const worldPattern = /^[a-f0-9]{64}$/;
const socketHandlePattern = /^[A-Za-z0-9._:-]{1,256}$/;
const commandInput = z
  .object({
    id: z.string().min(1).max(160),
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    command: z.unknown(),
  })
  .strict();
export type PublicCommandInput = z.infer<typeof commandInput>;

const joinInput = z.object({ invite: z.string().regex(tokenPattern) }).strict();
export type ColonyJoinInput = z.infer<typeof joinInput>;
export type ColonyJoinResult = Readonly<{ player: string; party: string; people: readonly string[] }>;
export type ColonyWorldOperation = "join" | "observe" | "command" | "connect" | "socket";
export type ColonyWorldRoute = {
  readonly world: string;
  readonly operation: ColonyWorldOperation;
  readonly socketHandle?: string;
};

/** Parse the shared-world Colony protocol without deriving authority from the URL. */
export function colonyWorldRoute(pathname: string): ColonyWorldRoute | null {
  const match = /^\/v2\/colony\/worlds\/([^/]+)\/(join|observe|command|connect|socket)(?:\/([^/]+))?$/.exec(pathname);
  if (!match || !worldPattern.test(match[1])) return null;
  const operation = match[2] as ColonyWorldOperation;
  const handle = match[3];
  if ((operation === "socket") !== (handle !== undefined)) return null;
  if (handle !== undefined && !socketHandlePattern.test(handle)) return null;
  return Object.freeze({ world: match[1], operation, ...(handle === undefined ? {} : { socketHandle: handle }) });
}

export function packFromPath(pathname: string): PublicPack | null {
  const match = /^\/v1\/([^/]+)\/(observe|command|connect|socket(?:\/[A-Za-z0-9._:-]{1,256})?)$/.exec(pathname);
  if (!match || !PACKS.includes(match[1] as PublicPack)) return null;
  return match[1] as PublicPack;
}

export function socketHandleFromPath(pathname: string): string | null {
  const match = /^\/v1\/[^/]+\/socket\/([A-Za-z0-9._:-]{1,256})$/.exec(pathname);
  return match?.[1] ?? null;
}

export type SocketClientMessage = { readonly type: "authenticate"; readonly token: string };

export function readSocketMessage(value: string | ArrayBuffer): SocketClientMessage {
  if (typeof value !== "string") throw new Error("public-socket-message-invalid");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("public-socket-message-invalid"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("public-socket-message-invalid");
  const message = parsed as Record<string, unknown>;
  if (message.type !== "authenticate" || typeof message.token !== "string" ||
      !tokenPattern.test(message.token) || Object.keys(message).some((key) => !["type", "token"].includes(key)))
    throw new Error("public-socket-message-invalid");
  return { type: "authenticate", token: message.token };
}

export function tokenFromRequest(request: Request): string {
  const value = request.headers.get("Authorization");
  const token = value?.startsWith("Bearer ") ? value.slice(7) : "";
  if (!tokenPattern.test(token)) throw new Error("public-unauthorized");
  return token;
}

/** Opaque host identity helpers. Credential material never appears in IDs. */
export function participantPrincipal(tokenHash: string): string {
  if (!tokenPattern.test(tokenHash)) throw new Error("public-unauthorized");
  return `participant:${tokenHash}`;
}

export async function colonyBindingId(world: string, tokenHash: string): Promise<string> {
  if (!worldPattern.test(world) || !tokenPattern.test(tokenHash)) throw new Error("public-unauthorized");
  return sha256Hex(`hive:colony-party-binding-v1\0${world}\0${tokenHash}`);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("Content-Length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > BODY_BYTES)
  )
    throw new Error("public-body-too-large");
  if (!request.body) throw new Error("public-body-invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > BODY_BYTES) throw new Error("public-body-too-large");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

export async function readCommand(request: Request) {
  return commandInput.parse(await readBoundedJson(request));
}

export async function readColonyJoin(request: Request): Promise<ColonyJoinInput> {
  return joinInput.parse(await readBoundedJson(request));
}

export function corsHeaders(origin: string): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });
  return headers;
}

export function withCors(response: Response, origin: string): Response {
  const headers = corsHeaders(origin);
  response.headers.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}
