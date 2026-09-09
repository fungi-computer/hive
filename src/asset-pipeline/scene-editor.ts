import { z } from "zod/v4";
import { SCENE_LIMITS, localTransformSchema, materialSchema, sceneNodeSchema, parseSceneDocument } from "./scene-document.ts";
import type { SceneDocument } from "./scene-document.ts";
const target = sceneNodeSchema.shape.id;
export const sceneBatchSchema = z.strictObject({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  operations: z.array(z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("add"), node: sceneNodeSchema }),
    z.strictObject({ type: z.literal("transform"), id: target, transform: localTransformSchema }),
    z.strictObject({ type: z.literal("material"), id: target, material: materialSchema.nullable() }),
    z.strictObject({ type: z.literal("remove"), id: target }),
  ])).min(1).max(SCENE_LIMITS.operations),
});
export type SceneBatch = z.infer<typeof sceneBatchSchema>;
// This pure owner returns a candidate; persistence must compare-and-commit revision atomically.
// Ordered operations see earlier operations. Every intermediate state must be valid.
export function applySceneBatch(document: unknown, input: unknown): SceneDocument {
  let candidate = parseSceneDocument(document);
  const batch = sceneBatchSchema.parse(input);
  if (candidate.revision !== batch.expectedRevision) throw new Error("Scene revision conflict");
  for (const operation of batch.operations) {
    if (operation.type === "add") candidate.nodes.push(operation.node);
    else {
      const node = candidate.nodes.find(node => node.id === operation.id);
      if (!node) throw new Error(`Unknown scene node: ${operation.id}`);
      switch (operation.type) {
        case "transform": node.transform = operation.transform; break;
        case "material": node.material = operation.material; break;
        case "remove": {
          const removed = new Set([node.id]);
          // Parent order in a saved document is unconstrained.
          for (let pass = 0; pass < SCENE_LIMITS.depth; pass++)
            for (const child of candidate.nodes)
              if (child.parentId !== null && removed.has(child.parentId)) removed.add(child.id);
          candidate.nodes = candidate.nodes.filter(child => !removed.has(child.id));
          break;
        }
      }
    }
    candidate = parseSceneDocument(candidate);
  }
  candidate.revision++;
  return candidate;
}
