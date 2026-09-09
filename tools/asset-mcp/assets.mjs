// Transport-independent authoring operations over Hive's original builders.
// This is an art recipe, not a world save, simulation entity, or script runner.
import * as THREE from "three";
import { z } from "zod/v4";
import { scene, group } from "../../src/art/geometry.js";
import {
  bench,
  bottle,
  kettle,
  bookcase,
} from "../../src/studies/brewhouse/props.js";

// Bounded original palette also bounds geometry.js's shared material cache.
const BOTTLE_COLORS = [
  "#728e79",
  "#88687e",
  "#b86842",
  "#4c626e",
  "#b78754",
  "#c0ae7e",
];
const empty = z.strictObject({});
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
const definitions = {
  kettle: {
    title: "Copper Familiar kettle",
    description:
      "Original hollow copper kettle, masonry hearth and paddle; no simulated contents.",
    source: "src/studies/brewhouse/props.js:kettle",
    parameters: empty,
    build: (parent) => kettle(parent),
  },
  bench: {
    title: "Timber bench",
    description:
      "Original four-board bench; dimensions change its actual procedural geometry.",
    source: "src/studies/brewhouse/props.js:bench",
    parameters: z.strictObject({
      width: z.number().min(0.6).max(3).default(1.8),
      depth: z.number().min(0.4).max(1.4).default(0.75),
      height: z.number().min(0.4).max(1.4).default(0.81),
    }),
    build: (parent, parameters) => bench(parent, parameters),
  },
  bottle: {
    title: "Corked potion bottle",
    description:
      "Original labeled bottle with cork and highlight; six house colors and a size control.",
    source: "src/studies/brewhouse/props.js:bottle",
    parameters: z.strictObject({
      color: z.enum(BOTTLE_COLORS).default("#728e79"),
      size: z.number().min(0.5).max(2).default(1),
    }),
    build: (parent, { color, size }) => bottle(parent, color, size),
  },
  bookcase: {
    title: "Bookcase of books and bottles",
    description:
      "Original Copper Familiar shelves with individually modeled books and bottles.",
    source: "src/studies/brewhouse/props.js:bookcase",
    parameters: empty,
    build: (parent) => bookcase(parent),
  },
};

const assetSchema = z.discriminatedUnion(
  "kind",
  Object.entries(definitions).map(([kind, definition]) =>
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

export function assetCatalog() {
  return {
    version: 1,
    coordinates:
      "Y up; meters; origin at each prop's ground anchor; rotationY in degrees",
    builders: Object.entries(definitions).map(([kind, definition]) => ({
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

function inspect(root) {
  const box = new THREE.Box3().setFromObject(root);
  const geometries = new Set();
  const materials = new Set();
  let nodes = 0,
    meshes = 0,
    triangles = 0;
  root.traverse((node) => {
    nodes++;
    if (!node.isMesh) return;
    meshes++;
    geometries.add(node.geometry);
    const faces =
      node.geometry.index?.count ?? node.geometry.attributes.position.count;
    triangles += faces / 3;
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  return {
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
    stats: {
      nodes,
      meshes,
      triangles,
      geometries: geometries.size,
      materials: materials.size,
    },
  };
}

export async function buildAssetScene(input) {
  const recipe = sceneInputSchema.parse(input);
  const root = scene();
  root.name = recipe.name;
  try {
    for (const asset of recipe.assets) {
      const subject = group(root, ...asset.position);
      subject.name = asset.id;
      subject.rotation.y = THREE.MathUtils.degToRad(asset.rotationY);
      // The caller sees the resolved recipe; it does not mutate builder internals.
      definitions[asset.kind].build(subject, asset.parameters);
    }
    root.updateMatrixWorld(true);
    const exported = root.toJSON();
    const bytes = JSON.stringify(exported);
    const encoded = new TextEncoder().encode(bytes);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return {
      recipe,
      scene: exported,
      metadata: {
        format: "three-object-json",
        threeRevision: THREE.REVISION,
        sha256: [...new Uint8Array(hash)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join(""),
        bytes: encoded.byteLength,
        ...inspect(root),
        builders: [
          ...new Set(recipe.assets.map(({ kind }) => definitions[kind].source)),
        ],
      },
    };
  } finally {
    // Geometry is per operation. Materials belong to the existing shared cache;
    // never dispose or recolor them on behalf of a single request.
    const geometries = new Set();
    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
  }
}
