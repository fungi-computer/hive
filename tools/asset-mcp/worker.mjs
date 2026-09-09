import { createMcpHandler } from "@modelcontextprotocol/server";
import { createAssetServer } from "./mcp-server.mjs";

const handler = createMcpHandler(createAssetServer, { maxSubscriptions: 0 });
const MAX_REQUEST_BYTES = 32 * 1024;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, MCP-Method, MCP-Name, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
};

async function boundedRequest(request) {
  if (request.method !== "POST" || !request.body) return request;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return new Response("Request too large", { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // One bounded operation per exchange. Legacy SDK batch support must not
  // multiply the scene-size budget inside one otherwise-small HTTP request.
  try {
    if (Array.isArray(JSON.parse(new TextDecoder().decode(body))))
      return new Response("Send one MCP message per request", { status: 400 });
  } catch {
    /* The SDK owns malformed JSON/protocol error responses. */
  }
  return new Request(request, { body });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const hosts = (
      env.ALLOWED_HOSTS || "mcp.shiit.app,localhost,127.0.0.1"
    ).split(",");
    if (!hosts.includes(url.hostname))
      return new Response("Unknown host", { status: 421 });
    if (url.pathname === "/health")
      return Response.json({
        service: "hive-original-assets",
        version: "0.1.0",
      });
    if (url.pathname !== "/mcp")
      return new Response("Not found", { status: 404 });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    const bounded = await boundedRequest(request);
    const response =
      bounded instanceof Response ? bounded : await handler.fetch(bounded);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  },
};
