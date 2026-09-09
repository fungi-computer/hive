import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { assetCatalog, buildAssetScene, sceneInputSchema } from "./assets.mjs";

const sceneOutputSchema = z.object({
  recipe: sceneInputSchema,
  scene: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
});

function result(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

// Both transports register exactly these operations over the same asset owner.
export function createAssetServer() {
  const server = new McpServer(
    { name: "hive-original-assets", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "hive_asset_catalog",
    {
      title: "Original Hive asset catalog",
      description:
        "List the original asset builders, supported parameters, and scene limits.",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    () => result(assetCatalog()),
  );

  server.registerTool(
    "hive_build_scene",
    {
      title: "Build an original Hive asset scene",
      description:
        "Compose configured original Hive assets and return portable Three.js Object JSON with recipe and export metadata. This creates no game entities and writes no server files.",
      inputSchema: sceneInputSchema,
      outputSchema: sceneOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => result(await buildAssetScene(input)),
  );

  return server;
}
