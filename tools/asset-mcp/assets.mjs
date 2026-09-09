// Compatibility boundary; document, pack and export ownership live in asset-pipeline.
import { z } from "zod/v4";
import {
  originalDefinitions,
  BOTTLE_COLORS,
} from "../../src/asset-pipeline/original-pack.ts";
import {
  sceneInputSchema,
  documentFromRecipe,
} from "../../src/asset-pipeline/legacy-recipe.js";
import { exportSceneDocument } from "../../src/asset-pipeline/scene-geometry.js";
export { sceneInputSchema };

export function assetCatalog() {
  return {
    version: 1,
    coordinates:
      "Y up; meters; origin at each prop's ground anchor; rotationY in degrees",
    builders: Object.entries(originalDefinitions).map(([kind, definition]) => ({
      kind,
      title: definition.title,
      description: definition.description,
      source: definition.source,
      parameters: z.toJSONSchema(definition.parameters, { io: "input" }),
      defaults: definition.parameters.parse({}),
    })),
    inputSchema: z.toJSONSchema(sceneInputSchema, { io: "input" }),
    limits: { assets: 24, coordinates: [-8, 8], bottleColors: BOTTLE_COLORS },
    export:
      "Three Object JSON. Load with THREE.ObjectLoader; recipe is returned separately for further edits.",
  };
}

export async function buildAssetScene(input) {
  const recipe = sceneInputSchema.parse(input);
  const { scene, metadata } = await exportSceneDocument(
    documentFromRecipe(recipe),
  );
  return { recipe, scene, metadata };
}
