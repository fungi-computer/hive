import { z } from "zod/v4";
import { originalDefinitions } from "./original-pack.ts";
import { parseSceneDocument } from "./scene-document.ts";
const coordinate = z.number().min(-8).max(8);
const transform = {
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  position: z.tuple([coordinate, coordinate, coordinate]).default([0, 0, 0]),
  rotationY: z
    .number()
    .min(-180)
    .max(180)
    .default(0)
    .describe("Yaw in degrees"),
};
const assetSchema = z.discriminatedUnion(
  "kind",
  Object.entries(originalDefinitions).map(([kind, definition]) =>
    z.strictObject({
      ...transform,
      kind: z.literal(kind),
      parameters: definition.parameters.prefault({}),
    }),
  ),
);

export const sceneInputSchema = z
  .strictObject({
    name: z.string().min(1).max(80).default("Copper Familiar workbench"),
    assets: z.array(assetSchema).min(1).max(24),
  })
  .superRefine(({ assets }, context) => {
    const ids = new Set();
    assets.forEach((asset, index) => {
      if (ids.has(asset.id))
        context.addIssue({
          code: "custom",
          path: ["assets", index, "id"],
          message: "Asset IDs must be unique within a scene",
        });
      ids.add(asset.id);
    });
  });

export function documentFromRecipe(recipe) {
  return parseSceneDocument({
    version: 1,
    revision: 0,
    name: recipe.name,
    nodes: recipe.assets.map((asset) => ({
      id: asset.id,
      parentId: null,
      transform: {
        position: asset.position,
        rotation: [0, (asset.rotationY * Math.PI) / 180, 0],
        scale: [1, 1, 1],
      },
      geometry: {
        kind: "original",
        pack: "hive-brewhouse-v1",
        asset: { builder: asset.kind, parameters: asset.parameters },
      },
      material: null,
    })),
  });
}
