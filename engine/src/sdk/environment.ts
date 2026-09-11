/**
 * Typed authoring boundary for the native terrain/water environment.
 *
 * Field names intentionally follow the kernel's camelCase serde contract in
 * environment_definition.rs. This module describes and encodes content; the
 * kernel remains responsible for admission, generation and water transport.
 */

export interface EnvironmentBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface EnvironmentSlots {
  readonly air: number;
  readonly soil: number;
  readonly stone: number;
}

export interface EnvironmentWorld {
  readonly seed: string;
  readonly identity: string;
  readonly bounds: EnvironmentBounds;
  readonly slots: EnvironmentSlots;
  readonly seaLevel: number;
  readonly verticalMetres: number;
}

export interface SoilRule {
  readonly id: string;
  readonly porosity: number;
  readonly retention: number;
  readonly absorbMPerS: number;
  readonly seepMPerS: number;
}

export type MaterialWater =
  | { readonly kind: "closed" }
  | { readonly kind: "open" }
  | { readonly kind: "porous"; readonly rule: SoilRule };

export interface ExcavationRule {
  readonly workSeconds: number;
  readonly outputKind: string;
  readonly unitsPerCell: number;
}

export interface EnvironmentMaterial {
  readonly slot: number;
  readonly solid: boolean;
  readonly diggable: boolean;
  readonly water: MaterialWater;
  readonly excavation?: ExcavationRule;
}

export type WaterCell = readonly [number, number, number];

export interface EnvironmentWater {
  readonly id: string;
  readonly cells: readonly WaterCell[];
  readonly fallMPerS: number;
  readonly spreadMPerS: number;
}

/** Structural policy shared by terrain placement and support admission. */
export interface EnvironmentStructures {
  readonly maxSpanSteps: number;
}

export interface InitialSurfacePlacement {
  readonly entity: string;
  readonly column: readonly [number, number];
}

export interface EnvironmentDefinition {
  readonly world: EnvironmentWorld;
  readonly materials: readonly EnvironmentMaterial[];
  readonly water: EnvironmentWater;
  readonly structures: EnvironmentStructures;
  /** Optional fresh-world placement; native restore never reapplies it. */
  readonly initialPlacements?: readonly InitialSurfacePlacement[];
}

export function validateEnvironmentDefinition(
  definition: EnvironmentDefinition,
): void {
  const maxSpanSteps = definition?.structures?.maxSpanSteps;
  if (
    !Number.isSafeInteger(maxSpanSteps) ||
    maxSpanSteps < 1 ||
    maxSpanSteps > 64
  ) {
    throw new Error("structures.maxSpanSteps must be an integer from 1 through 64");
  }
}

/** Encode the exact JSON payload consumed by Kernel::load_environment. */
export function encodeEnvironmentDefinition(
  definition: EnvironmentDefinition,
): Uint8Array {
  validateEnvironmentDefinition(definition);
  return new TextEncoder().encode(JSON.stringify(definition));
}
