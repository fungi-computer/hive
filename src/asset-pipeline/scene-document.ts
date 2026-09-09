import { z } from "zod/v4";

// depth counts nodes on a root-to-leaf path, including both endpoints.
export const SCENE_LIMITS = Object.freeze({ nodes: 24, depth: 8, operations: 100 });
const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const vector = (min: number, max: number) => z.tuple([
  z.number().min(min).max(max), z.number().min(min).max(max), z.number().min(min).max(max),
]);
// Meters, Y up; local XYZ Euler radians, then local scale. No world transforms.
export const localTransformSchema = z.strictObject({
  position: vector(-8, 8), rotation: vector(-Math.PI, Math.PI), scale: vector(0.01, 4),
});
export const materialSchema = z.strictObject({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const empty = z.strictObject({});
export const originalBuilderSchema = z.discriminatedUnion("builder", [
  z.strictObject({ builder: z.literal("kettle"), parameters: empty }),
  z.strictObject({ builder: z.literal("bookcase"), parameters: empty }),
  z.strictObject({ builder: z.literal("bench"), parameters: z.strictObject({
    width: z.number().min(0.6).max(3), depth: z.number().min(0.4).max(1.4), height: z.number().min(0.4).max(1.4),
  }) }),
  z.strictObject({ builder: z.literal("bottle"), parameters: z.strictObject({
    color: z.enum(["#728e79", "#88687e", "#b86842", "#4c626e", "#b78754", "#c0ae7e"]), size: z.number().min(0.5).max(2),
  }) }),
]);
const geometrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("group") }),
  z.strictObject({ kind: z.literal("original"), pack: z.literal("hive-brewhouse-v1"), asset: originalBuilderSchema }),
  z.strictObject({ kind: z.literal("box"), size: vector(0.01, 8) }),
  z.strictObject({ kind: z.literal("cylinder"), radiusTop: z.number().min(0).max(4), radiusBottom: z.number().min(0).max(4), height: z.number().min(0.01).max(8), segments: z.number().int().min(3).max(64) }).refine(g => g.radiusTop + g.radiusBottom > 0, "Cylinder needs a nonzero radius"),
]);
export const sceneNodeSchema = z.strictObject({
  id, parentId: id.nullable(), transform: localTransformSchema,
  geometry: geometrySchema, material: materialSchema.nullable(),
}).refine(node => node.geometry.kind !== "group" || node.material === null, "Group materials do not inherit; edit a geometry node");
export const sceneDocumentSchema = z.strictObject({
  version: z.literal(1), revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  name: z.string().min(1).max(80), nodes: z.array(sceneNodeSchema).max(SCENE_LIMITS.nodes),
}).superRefine(({ nodes }, context) => {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const issue = (message: string) => context.addIssue({ code: "custom", path: ["nodes"], message });
  if (byId.size !== nodes.length) issue("Node IDs must be unique");
  for (const node of nodes) {
    const visited = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) { issue("Hierarchy must be acyclic"); break; }
      visited.add(parentId);
      if (visited.size > SCENE_LIMITS.depth) { issue("Hierarchy depth exceeds limit"); break; }
      const parent = byId.get(parentId);
      if (!parent || parent.geometry.kind !== "group") { issue("Parent must reference an existing group"); break; }
      parentId = parent.parentId;
    }
  }
});
export type SceneDocument = z.infer<typeof sceneDocumentSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export function parseSceneDocument(input: unknown): SceneDocument { return sceneDocumentSchema.parse(input); }
export function createSceneDocument(name: string): SceneDocument {
  return parseSceneDocument({ version: 1, revision: 0, name, nodes: [] });
}
