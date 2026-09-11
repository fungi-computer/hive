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

export interface EnvironmentDefinition {
  readonly world: EnvironmentWorld;
  readonly materials: readonly EnvironmentMaterial[];
  readonly water: EnvironmentWater;
}

/** Encode the exact JSON payload consumed by Kernel::load_environment. */
export function encodeEnvironmentDefinition(
  definition: EnvironmentDefinition,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(definition));
}
