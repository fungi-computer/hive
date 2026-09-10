import type { Cell, Clearing } from "./model.ts";
import { placementFooting, type Placement } from "./game-space.ts";
import {
  FIELD_WATER,
  fieldWaterSources,
  fieldWaterCells,
  type FieldWaterReference,
  type FieldWaterState,
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
  state: Clearing,
): readonly FieldInspection[] {
  const sources = fieldWaterSources(state);
  return fieldWaterCells(state).map((node) => {
    return Object.freeze({
      binding: FIELD_WATER.id,
      nodeId: node.id,
      x: node.at[0],
      y: node.at[1],
      z: node.at[2],
      heightCells: 1,
      litres: (node.massKg / FIELD_WATER.kgPerUnit) * FIELD_WATER.litresPerUnit,
      wholeMeasures: Math.floor(node.massKg / FIELD_WATER.kgPerUnit),
      litresPerMeasure: FIELD_WATER.litresPerUnit,
      hasDrawingRim: sources.some((source) => source.nodeId === node.id),
    });
  });
}

export function fieldInspectionAt(
  state: FieldWaterState,
  cell: Cell,
): FieldWaterReference | null {
  if (![cell.x, cell.y, cell.z].every(Number.isSafeInteger)) return null;
  const fact = fieldWaterCells(state).find(
    (fact) =>
      fact.at[0] === cell.x && fact.at[1] === cell.y && fact.at[2] === cell.z,
  );
  return fact ? { binding: FIELD_WATER.id, nodeId: fact.id } : null;
}

/** The existing picker owns the face. Its owner voxel is solid; inspection
 * names the adjacent hollow voxel, not the solid targeted by excavation. */
export function fieldInspectionFromFace(
  state: FieldWaterState,
  face: {
    kind: string;
    cell: Placement;
    ownerVoxel: readonly [number, number, number];
  } | null,
): FieldWaterReference | null {
  if (!face || !["ground", "pit-floor", "cut-wall"].includes(face.kind))
    return null;
  const horizontal = placementFooting(face.cell);
  const reference = fieldInspectionAt(state, {
    x: horizontal.x,
    y: face.ownerVoxel[1] + (face.kind === "cut-wall" ? 0 : 1),
    z: horizontal.z,
  });
  // Empty intact ground retains its ordinary click; drained hollows remain inspectable.
  if (face.kind === "ground" && reference)
    return fieldWaterCells(state).some(
      (cell) => cell.id === reference.nodeId && cell.massKg > 0,
    )
      ? reference
      : null;
  return reference;
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
