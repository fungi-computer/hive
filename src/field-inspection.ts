import type { Cell, Clearing } from "./model.ts";
import { placementFooting, type Placement } from "./game-space.ts";
import { terrainFacts } from "./terrain.ts";
import {
  FIELD_WATER,
  fieldWaterReferenceSchema,
  fieldWaterSources,
  type FieldWaterReference,
} from "./field-water-source.ts";

export type FieldInspection = Readonly<
  FieldWaterReference &
    Cell & {
      heightCells: number;
      litres: number;
      wholeMeasures: number;
      litresPerMeasure: number;
      hasDrawingRim: boolean;
    }
>;

/** Disposable display facts. Stock is never a worker permission or reservation. */
export function fieldInspectionFacts(
  state: Pick<Clearing, "terrain">,
): readonly FieldInspection[] {
  const sources = fieldWaterSources(state);
  return terrainFacts(state.terrain)
    .soil.nodes.filter((node: { kind: string }) => node.kind === "pit")
    .map(
      (node: {
        nodeId: string;
        at: readonly number[];
        heightCells: number;
        massKg: number;
      }) => {
        const reference = fieldWaterReferenceSchema.parse({
          binding: FIELD_WATER.id,
          nodeId: node.nodeId,
        });
        return Object.freeze({
          ...reference,
          x: node.at[0],
          y: node.at[1],
          z: node.at[2],
          heightCells: node.heightCells,
          litres:
            (node.massKg / FIELD_WATER.kgPerUnit) * FIELD_WATER.litresPerUnit,
          wholeMeasures: Math.floor(node.massKg / FIELD_WATER.kgPerUnit),
          litresPerMeasure: FIELD_WATER.litresPerUnit,
          hasDrawingRim: sources.some(
            (source) => source.nodeId === node.nodeId,
          ),
        });
      },
    );
}

export function fieldInspectionAt(
  state: Pick<Clearing, "terrain">,
  cell: Cell,
): FieldWaterReference | null {
  if (![cell.x, cell.y, cell.z].every(Number.isSafeInteger)) return null;
  const fact = fieldInspectionFacts(state).find(
    (fact) =>
      fact.x === cell.x &&
      fact.z === cell.z &&
      cell.y >= fact.y &&
      cell.y < fact.y + fact.heightCells,
  );
  return fact ? { binding: fact.binding, nodeId: fact.nodeId } : null;
}

/** The existing picker owns the face. Its owner voxel is solid; inspection
 * names the adjacent hollow voxel, not the solid targeted by excavation. */
export function fieldInspectionFromFace(
  state: Pick<Clearing, "terrain">,
  face: {
    kind: string;
    cell: Placement;
    ownerVoxel: readonly [number, number, number];
  } | null,
): FieldWaterReference | null {
  if (!face || (face.kind !== "pit-floor" && face.kind !== "cut-wall"))
    return null;
  const horizontal = placementFooting(face.cell);
  return fieldInspectionAt(state, {
    x: horizontal.x,
    y: face.ownerVoxel[1] + (face.kind === "pit-floor" ? 1 : 0),
    z: horizontal.z,
  });
}

export function resolveFieldInspection(
  facts: readonly FieldInspection[],
  reference: FieldWaterReference,
) {
  return (
    facts.find(
      (fact) =>
        fact.binding === reference.binding && fact.nodeId === reference.nodeId,
    ) ?? null
  );
}

export function fieldInspectionText(fact: FieldInspection) {
  const litres =
    fact.litres === 0
      ? "0"
      : fact.litres < 0.001
        ? "less than 0.001"
        : fact.litres.toLocaleString("en", { maximumFractionDigits: 3 });
  return {
    stock: `${fact.litres >= 0.001 && !Number.isInteger(fact.litres) ? "About " : ""}${litres} L standing water`,
    measures: `${fact.wholeMeasures} whole ${fact.litresPerMeasure} L measures`,
    access:
      fact.wholeMeasures === 0
        ? "Water collects here. A full measure is needed before filling a pail."
        : fact.hasDrawingRim
          ? "A drawing rim is available. A home member still needs a clear route and a pail."
          : "Water is present, but there is no supported drawing rim at this depth.",
  };
}
