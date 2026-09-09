import { z } from "zod/v4";
import {
  SCENE_LIMITS,
  localTransformSchema,
  materialSchema,
  sceneNodeSchema,
  parseSceneDocument,
} from "./scene-document.ts";
import type { SceneDocument, SceneNode } from "./scene-document.ts";
const target = sceneNodeSchema.shape.id;
export const sceneBatchSchema = z.strictObject({
  expectedRevision: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
  operations: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("add"), node: sceneNodeSchema }),
        z.strictObject({
          type: z.literal("transform"),
          id: target,
          transform: localTransformSchema,
        }),
        z.strictObject({
          type: z.literal("material"),
          id: target,
          material: materialSchema.nullable(),
        }),
        z.strictObject({ type: z.literal("remove"), id: target }),
      ]),
    )
    .min(1)
    .max(SCENE_LIMITS.operations),
});
export type SceneBatch = z.infer<typeof sceneBatchSchema>;
type SceneOperation = SceneBatch["operations"][number];

// Parent order in a validated saved document is unconstrained. The accepted
// depth bounds how many passes can be needed to close the descendant set.
function removeSubtree(nodes: SceneNode[], rootId: string): SceneNode[] {
  const removed = new Set([rootId]);
  for (let pass = 0; pass < SCENE_LIMITS.depth; pass++)
    for (const child of nodes)
      if (child.parentId !== null && removed.has(child.parentId))
        removed.add(child.id);
  return nodes.filter((child) => !removed.has(child.id));
}

// Mutates only the detached candidate admitted by applySceneBatch. Relation
// validation belongs to that owner after each operation, including additions.
function applySceneOperation(
  candidate: SceneDocument,
  operation: SceneOperation,
): void {
  if (operation.type === "add") {
    candidate.nodes.push(operation.node);
    return;
  }
  const node = candidate.nodes.find((node) => node.id === operation.id);
  if (!node) throw new Error(`Unknown scene node: ${operation.id}`);
  switch (operation.type) {
    case "transform":
      node.transform = operation.transform;
      return;
    case "material":
      node.material = operation.material;
      return;
    case "remove":
      candidate.nodes = removeSubtree(candidate.nodes, node.id);
      return;
    default: {
      const unsupported: never = operation;
      throw new Error(`Unsupported scene operation: ${unsupported}`);
    }
  }
}

// This pure owner returns a candidate; persistence must compare-and-commit revision atomically.
// Ordered operations see earlier operations. Every intermediate state must be valid.
export function applySceneBatch(
  document: unknown,
  input: unknown,
): SceneDocument {
  let candidate = parseSceneDocument(document);
  const batch = sceneBatchSchema.parse(input);
  if (candidate.revision !== batch.expectedRevision)
    throw new Error("Scene revision conflict");
  for (const operation of batch.operations) {
    applySceneOperation(candidate, operation);
    candidate = parseSceneDocument(candidate);
  }
  candidate.revision++;
  return candidate;
}
