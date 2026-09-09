import { z } from "zod/v4";
// Bounded original palette also bounds geometry.js's shared material cache.
export const BOTTLE_COLORS = [
  "#728e79",
  "#88687e",
  "#b86842",
  "#4c626e",
  "#b78754",
  "#c0ae7e",
] as const;
const empty = z.strictObject({});
const benchParameters = z.strictObject({
  width: z.number().min(0.6).max(3).default(1.8),
  depth: z.number().min(0.4).max(1.4).default(0.75),
  height: z.number().min(0.4).max(1.4).default(0.81),
});
const bottleParameters = z.strictObject({
  color: z.enum(BOTTLE_COLORS).default("#728e79"),
  size: z.number().min(0.5).max(2).default(1),
});
export const originalBuilderSchema = z.discriminatedUnion("builder", [
  z.strictObject({
    builder: z.literal("kettle"),
    parameters: empty.prefault({}),
  }),
  z.strictObject({
    builder: z.literal("bench"),
    parameters: benchParameters.prefault({}),
  }),
  z.strictObject({
    builder: z.literal("bottle"),
    parameters: bottleParameters.prefault({}),
  }),
  z.strictObject({
    builder: z.literal("bookcase"),
    parameters: empty.prefault({}),
  }),
]);
export type OriginalAsset = z.infer<typeof originalBuilderSchema>;

type OriginalParameters = {
  [Asset in OriginalAsset as Asset["builder"]]: Asset["parameters"];
};

export const originalDefinitions = {
  kettle: {
    title: "Copper Familiar kettle",
    description:
      "Original hollow copper kettle, masonry hearth and paddle; no simulated contents.",
    source: "src/studies/brewhouse/props.js:kettle",
    parameters: empty,
  },
  bench: {
    title: "Timber bench",
    description:
      "Original four-board bench; dimensions change its actual procedural geometry.",
    source: "src/studies/brewhouse/props.js:bench",
    parameters: benchParameters,
  },
  bottle: {
    title: "Corked potion bottle",
    description:
      "Original labeled bottle with cork and highlight; six house colors and a size control.",
    source: "src/studies/brewhouse/props.js:bottle",
    parameters: bottleParameters,
  },
  bookcase: {
    title: "Bookcase of books and bottles",
    description:
      "Original Copper Familiar shelves with individually modeled books and bottles.",
    source: "src/studies/brewhouse/props.js:bookcase",
    parameters: empty,
  },
} satisfies {
  [Kind in keyof OriginalParameters]: {
    title: string;
    description: string;
    source: string;
    parameters: z.ZodType<OriginalParameters[Kind]>;
  };
};
