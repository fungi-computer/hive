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
  /** Initial finite-stock observations; transport wakes across the full world. */
  readonly cells: readonly WaterCell[];
  readonly fallMPerS: number;
  readonly spreadMPerS: number;
}

/** Structural policy shared by terrain placement and support admission. */
export interface EnvironmentStructures {
  readonly maxSpanSteps: number;
  readonly catalog: readonly EnvironmentStructureDefinition[];
}

export type EnvironmentStructureShape =
  | { readonly kind: "floor" }
  | { readonly kind: "wall"; readonly height: number }
  | { readonly kind: "aperture"; readonly height: number; readonly openingBottom: number; readonly openingHeight: number }
  | { readonly kind: "stair"; readonly run: number; readonly rise: number };

export interface EnvironmentStructureMaterial {
  readonly kind: string;
  readonly quantity: number;
}

export interface EnvironmentStructureDefinition {
  readonly id: string;
  readonly shape: EnvironmentStructureShape;
  readonly materials: readonly EnvironmentStructureMaterial[];
  readonly workSeconds: number;
}

export interface InitialSurfacePlacement {
  readonly entity: string;
  readonly column: readonly [number, number];
}

/** Sparse smoke/heat with local physical contacts; no ordinary-air pressure simulation. */
export interface EnvironmentAtmosphere {
  readonly regionId: string;
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
  readonly exterior: "Closed" | "WorldTop";
  readonly ambientTemperatureC: number;
  readonly spreadPerSecond: number;
  readonly riseBias: number;
  readonly wind: readonly [number, number, number];
  readonly outdoorLossPerSecond: number;
  readonly heatCapacityJPerM3K: number;
}

/** A finite, material-paid release; native admission owns quantities/progress. */
export interface EnvironmentEmission {
  readonly id: string;
  readonly materialKind: string;
  readonly quantity: number;
  readonly durationS: number;
  readonly smokeKg: number;
  readonly heatJ: number;
}

export interface EnvironmentDefinition {
  readonly world: EnvironmentWorld;
  readonly atmosphere?: EnvironmentAtmosphere;
  readonly emissions?: readonly EnvironmentEmission[];
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
  const catalog = definition?.structures?.catalog;
  if (!Array.isArray(catalog) || catalog.length > 64) {
    throw new Error("structures.catalog must contain at most 64 entries");
  }
  const ids = new Set<string>();
  for (const entry of catalog) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(entry.id) || ids.has(entry.id)
      || !Number.isFinite(entry.workSeconds) || entry.workSeconds <= 0 || entry.workSeconds > 86_400
      || !Array.isArray(entry.materials) || entry.materials.length < 1 || entry.materials.length > 16) {
      throw new Error("invalid structure catalog entry");
    }
    ids.add(entry.id);
    const shape = entry.shape;
    if (!shape || (shape.kind !== "floor" && shape.kind !== "wall" && shape.kind !== "stair")
      || shape.kind === "wall" && (!Number.isSafeInteger(shape.height) || shape.height < 1 || shape.height > 64)
      || shape.kind === "stair" && (!Number.isSafeInteger(shape.run) || !Number.isSafeInteger(shape.rise)
        || shape.run < 1 || shape.run > 64 || shape.rise < 1 || shape.rise > shape.run)) {
      throw new Error("invalid structure catalog shape");
    }
    const kinds = new Set<string>();
    let totalQuantity = 0;
    for (const material of entry.materials) {
      if (!material || typeof material.kind !== "string" || material.kind.length === 0 || material.kind.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(material.kind)
        || kinds.has(material.kind) || !Number.isSafeInteger(material.quantity) || material.quantity <= 0 || material.quantity > 0xffff_ffff) {
        throw new Error("invalid structure required material");
      }
      kinds.add(material.kind);
      totalQuantity += material.quantity;
      if (!Number.isSafeInteger(totalQuantity) || totalQuantity > 0xffff_ffff) {
        throw new Error("structure material quantity exceeds capacity");
      }
    }
  }
}

/** Encode the exact JSON payload consumed by Kernel::load_environment. */
export function encodeEnvironmentDefinition(
  definition: EnvironmentDefinition,
): Uint8Array {
  validateEnvironmentDefinition(definition);
  return new TextEncoder().encode(JSON.stringify(definition));
}
