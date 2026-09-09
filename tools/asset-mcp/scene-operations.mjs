// Client-owned document operations. No transport-local scene state or IDs.
import { z } from "zod/v4";
import {
  createSceneDocument,
  sceneDocumentSchema,
} from "../../src/asset-pipeline/scene-document.ts";
import {
  applySceneBatch,
  sceneBatchSchema,
} from "../../src/asset-pipeline/scene-editor.ts";
import {
  compileSceneDocument,
  exportSceneDocument,
} from "../../src/asset-pipeline/scene-geometry.js";

const documentInput = z.strictObject({ document: sceneDocumentSchema });
const documentOutput = documentInput;
const vector = z.tuple([z.number(), z.number(), z.number()]);
const bounds = z.strictObject({ min: vector, max: vector }).nullable();
const count = z.number().int().nonnegative();
const stats = z.strictObject({
  nodes: count,
  meshes: count,
  triangles: count,
  geometries: count,
  materials: count,
});

export const exportMetadataSchema = z.strictObject({
  format: z.literal("three-object-json"),
  threeRevision: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: count,
  bounds,
  stats,
  builders: z.array(z.string()),
});

export const sceneOperations = [
  {
    name: "hive_scene_create",
    title: "Create an asset scene document",
    description:
      "Return an empty versioned client-owned scene document at revision zero. No hosted scene or ID is created.",
    inputSchema: z.strictObject({ name: sceneDocumentSchema.shape.name }),
    outputSchema: documentOutput,
    execute: ({ name }) => ({ document: createSceneDocument(name) }),
  },
  {
    name: "hive_scene_edit",
    title: "Edit an asset scene document",
    description:
      "Apply an ordered atomic add/transform/material/remove batch to the supplied document. expectedRevision checks that document only. Returns a new document; retain the previous document if the tool fails. Local transforms use meters, Y up and XYZ Euler radians.",
    inputSchema: z.strictObject({
      document: sceneDocumentSchema,
      ...sceneBatchSchema.shape,
    }),
    outputSchema: documentOutput,
    execute: ({ document, expectedRevision, operations }) => ({
      document: applySceneBatch(document, { expectedRevision, operations }),
    }),
  },
  {
    name: "hive_scene_inspect",
    title: "Inspect an asset scene document",
    description:
      "Compile the supplied original/generic scene document and return actual world bounds and geometry counts. Empty geometry has null bounds. Retains no scene resources.",
    inputSchema: documentInput,
    outputSchema: z.strictObject({
      document: sceneDocumentSchema,
      bounds,
      stats,
    }),
    execute: ({ document }) => {
      const compiled = compileSceneDocument(document);
      try {
        return {
          document: compiled.document,
          bounds: compiled.bounds,
          stats: compiled.stats,
        };
      } finally {
        compiled.dispose();
      }
    },
  },
  {
    name: "hive_scene_export",
    title: "Export an asset scene document",
    description:
      "Compile the supplied document to Three Object JSON with exact-byte SHA256 metadata. The returned document identifies its revision; output is an independent artifact, not a hosted URL.",
    inputSchema: documentInput,
    outputSchema: z.strictObject({
      document: sceneDocumentSchema,
      scene: z.record(z.string(), z.unknown()),
      metadata: exportMetadataSchema,
    }),
    execute: ({ document }) => exportSceneDocument(document),
  },
];
