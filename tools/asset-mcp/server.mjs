import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createAssetServer } from "./mcp-server.mjs";

const connection = serveStdio(createAssetServer, {
  onerror: (error) => console.error("MCP transport error:", error.message),
});

process.once("SIGINT", () => connection.close());
process.once("SIGTERM", () => connection.close());
