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
const commandInput = z
  .object({
    id: z.string().min(1).max(160),
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    command: z.unknown(),
  })
  .strict();
export type PublicCommandInput = z.infer<typeof commandInput>;

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

export async function readCommand(request: Request) {
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
  return commandInput.parse(JSON.parse(text));
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
