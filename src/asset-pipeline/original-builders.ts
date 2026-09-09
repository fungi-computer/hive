import type { OriginalAsset } from "./original-pack.ts";
import { bench, bottle, kettle, bookcase } from "../studies/brewhouse/props.js";
export function buildOriginal(
  parent: Parameters<typeof bench>[0],
  asset: OriginalAsset,
) {
  switch (asset.builder) {
    case "bench":
      bench(parent, asset.parameters);
      break;
    case "bottle":
      bottle(parent, asset.parameters.color, asset.parameters.size);
      break;
    case "kettle":
      kettle(parent);
      break;
    case "bookcase":
      bookcase(parent);
      break;
    default:
      const unsupported: never = asset;
      throw new Error(`Unsupported original builder: ${unsupported}`);
  }
}
