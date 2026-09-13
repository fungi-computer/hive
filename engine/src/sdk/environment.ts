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
  | { readonly kind: "cover" }
  | { readonly kind: "fixture"; readonly footprint: readonly (readonly [number, number])[] }
  | { readonly kind: "wall"; readonly height: number }
  | { readonly kind: "aperture"; readonly height: number; readonly openingBottom: number; readonly openingHeight: number }
  | { readonly kind: "stair"; readonly run: number; readonly rise: number };

export interface EnvironmentStructureMaterial {
  readonly kind: string;
  readonly quantity: number;
}
export interface EnvironmentCompletionComponent {
  readonly name: string;
  readonly value: Readonly<Record<string, unknown>>;
}
export interface EnvironmentCompletionPort {
  readonly key: string;
  readonly components: readonly EnvironmentCompletionComponent[];
  readonly at?: "site-contact";
}
export interface EnvironmentStructureCompletion {
  readonly components?: readonly EnvironmentCompletionComponent[];
  readonly ports?: readonly EnvironmentCompletionPort[];
}
export interface EnvironmentStructureRemoval {
  /** This checkpoint permits exactly one finite salvage lot. */
  readonly salvage?: readonly EnvironmentStructureMaterial[];
  /** Ports named here must be empty before the low level native teardown. */
  readonly emptyPorts?: readonly string[];
}

export interface EnvironmentStructureDefinition {
  readonly id: string;
  readonly shape: EnvironmentStructureShape;
  readonly materials: readonly EnvironmentStructureMaterial[];
  readonly workSeconds: number;
  readonly workReachBelowCells: number;
  readonly onComplete?: EnvironmentStructureCompletion;
  readonly onRemove?: EnvironmentStructureRemoval;
}

export interface InitialSurfacePlacement {
  readonly entity: string;
  readonly column: readonly [number, number];
}
export interface EnvironmentResourceStage { readonly delaySeconds: number; readonly waterPortions: number; }
export interface EnvironmentResourceDefinition {
  readonly id: string; readonly outputKind: string; readonly outputQuantity: number;
  readonly sowSeconds: number; readonly tendSeconds: number; readonly harvestSeconds: number;
  readonly stages: readonly EnvironmentResourceStage[];
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
export type ProcessInputPolicy = "portion" | "whole-lot";
export type ProcessInputDisposition = "consume" | "retain" | "emission-source";
export interface EnvironmentProcessInput { readonly role: string; readonly port: string; readonly material: string; readonly quantity: number; readonly policy: ProcessInputPolicy; readonly disposition: ProcessInputDisposition; }
export interface EnvironmentProcessEmission { readonly role: string; readonly catalog: string; }
export type EnvironmentProcessOutputDestination = { readonly kind: "station-port"; readonly port: string } | { readonly kind: "retained-container"; readonly role: string };
export interface EnvironmentProcessOutput { readonly role: string; readonly material: string; readonly quantity: number; readonly destination: EnvironmentProcessOutputDestination; }
export interface EnvironmentProcessTransition { readonly consumeRoles?: readonly string[]; readonly emission?: EnvironmentProcessEmission | null; readonly outputs?: readonly EnvironmentProcessOutput[]; }
export interface EnvironmentProcessStage { readonly id: string; readonly mode: "attended" | "elapsed"; readonly durationSeconds: number; readonly transition: EnvironmentProcessTransition; }
export interface EnvironmentProcessDefinition { readonly id: string; readonly version: number; readonly stationCatalog: string; readonly inputs: readonly EnvironmentProcessInput[]; readonly stages: readonly EnvironmentProcessStage[]; }

export interface EnvironmentDefinition {
  readonly world: EnvironmentWorld;
  readonly atmosphere?: EnvironmentAtmosphere;
  readonly emissions?: readonly EnvironmentEmission[];
  readonly processes?: readonly EnvironmentProcessDefinition[];
  readonly materials: readonly EnvironmentMaterial[];
  readonly water: EnvironmentWater;
  readonly resourceSites?: readonly EnvironmentResourceDefinition[];
  readonly structures: EnvironmentStructures;
  /** Optional fresh-world placement; native restore never reapplies it. */
  readonly initialPlacements?: readonly InitialSurfacePlacement[];
}

export function validateEnvironmentDefinition(
  definition: EnvironmentDefinition,
): void {
  const maxStairGrade = 1.5;
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
  for (const entry of catalog as readonly EnvironmentStructureDefinition[]) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(entry.id) || ids.has(entry.id)
      || !Number.isFinite(entry.workSeconds) || entry.workSeconds <= 0 || entry.workSeconds > 86_400
      || !Number.isSafeInteger(entry.workReachBelowCells) || entry.workReachBelowCells < 0
      || !Array.isArray(entry.materials) || entry.materials.length < 1 || entry.materials.length > 16) {
      throw new Error("invalid structure catalog entry");
    }
    ids.add(entry.id);
    const shape = entry.shape;
    if (!shape || (shape.kind !== "floor" && shape.kind !== "cover" && shape.kind !== "fixture" && shape.kind !== "wall" && shape.kind !== "aperture" && shape.kind !== "stair")
      || shape.kind === "fixture" && (!Array.isArray(shape.footprint) || shape.footprint.length < 1 || shape.footprint.length > 16 || shape.footprint.some(cell => !Array.isArray(cell) || cell.length !== 2 || !Number.isSafeInteger(cell[0]) || !Number.isSafeInteger(cell[1]) || Math.abs(cell[0]) > 8 || Math.abs(cell[1]) > 8))
      || shape.kind === "wall" && (!Number.isSafeInteger(shape.height) || shape.height < 1 || shape.height > 64)
      || shape.kind === "aperture" && (!Number.isSafeInteger(shape.height) || shape.height < 1 || shape.height > 64 || !Number.isSafeInteger(shape.openingBottom) || !Number.isSafeInteger(shape.openingHeight) || shape.openingHeight < 1 || shape.openingBottom < 0 || shape.openingBottom + shape.openingHeight >= shape.height)
      || shape.kind === "stair" && (!Number.isSafeInteger(shape.run) || !Number.isSafeInteger(shape.rise)
        || shape.run < 1 || shape.run > 64 || shape.rise < 1 || shape.rise > 64
        || !Number.isFinite(definition.world.verticalMetres)
        || shape.rise * definition.world.verticalMetres / shape.run > maxStairGrade)) {
      throw new Error("invalid structure catalog shape");
    }
    if (shape.kind === "fixture" && new Set(shape.footprint.map(([x, z]) => `${x},${z}`)).size !== shape.footprint.length)
      throw new Error("invalid structure fixture footprint");
    const completion = entry.onComplete;
    if (completion !== undefined) {
      if (!completion || (completion.components !== undefined && (!Array.isArray(completion.components) || completion.components.length > 32)) || (completion.ports !== undefined && (!Array.isArray(completion.ports) || completion.ports.length > 16)))
        throw new Error("invalid structure completion recipe");
      const validateComponents = (components: readonly EnvironmentCompletionComponent[]) => {
        const names = new Set<string>();
        for (const component of components) {
          if (!component || typeof component.name !== "string" || !/^[A-Za-z0-9._:-]+$/.test(component.name) || names.has(component.name) || !component.value || typeof component.value !== "object" || Array.isArray(component.value)) throw new Error("invalid completion component");
          names.add(component.name);
        }
      };
      validateComponents(completion.components ?? []);
      const keys = new Set<string>();
      for (const port of completion.ports ?? []) {
        if (!port || typeof port.key !== "string" || !/^[A-Za-z0-9._:-]+$/.test(port.key) || keys.has(port.key) || !Array.isArray(port.components) || port.components.length > 32 || port.at !== undefined && port.at !== "site-contact") throw new Error("invalid completion port");
        keys.add(port.key); validateComponents(port.components);
      }
    }
    const removal = entry.onRemove;
    if (removal !== undefined) {
      if ((removal.salvage !== undefined && (!Array.isArray(removal.salvage) || removal.salvage.length > 1)) || (removal.emptyPorts !== undefined && (!Array.isArray(removal.emptyPorts) || removal.emptyPorts.length > 16))) throw new Error("invalid structure removal recipe");
      const inputKinds = new Map(entry.materials.map(material => [material.kind, material.quantity]));
      const seenSalvage = new Set<string>();
      for (const salvage of removal.salvage ?? []) {
        if (!salvage || typeof salvage.kind !== "string" || !/^[A-Za-z0-9._:-]+$/.test(salvage.kind) || seenSalvage.has(salvage.kind) || !Number.isSafeInteger(salvage.quantity) || salvage.quantity <= 0 || salvage.quantity > (inputKinds.get(salvage.kind) ?? 0)) throw new Error("invalid structure removal salvage");
        seenSalvage.add(salvage.kind);
      }
      const portKeys = new Set((completion?.ports ?? []).map(port => port.key));
      const emptyPorts = new Set<string>();
      for (const key of removal.emptyPorts ?? []) {
        if (typeof key !== "string" || !/^[A-Za-z0-9._:-]+$/.test(key) || emptyPorts.has(key) || !portKeys.has(key)) throw new Error("invalid structure removal empty port");
        emptyPorts.add(key);
      }
    }
    const endpointCount = shape.kind === "stair" ? 2 : 1;
    if (endpointCount * (4 + entry.workReachBelowCells * 5) > 32) {
      throw new Error("structure catalog entry exceeds 32 construction access contacts");
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
  const resources = definition?.resourceSites ?? [];
  if (!Array.isArray(resources) || resources.length > 64) throw new Error("resource catalog exceeds 64 entries");
  const resourceIds = new Set<string>();
  for (const resource of resources) {
    if (!resource || typeof resource.id !== "string" || !/^[A-Za-z0-9._:-]+$/.test(resource.id) || resourceIds.has(resource.id)
      || typeof resource.outputKind !== "string" || !/^[A-Za-z0-9._:-]+$/.test(resource.outputKind) || !Number.isSafeInteger(resource.outputQuantity) || resource.outputQuantity < 1
      || ![resource.sowSeconds, resource.tendSeconds, resource.harvestSeconds].every(value => Number.isFinite(value) && value > 0)
      || !Array.isArray(resource.stages) || resource.stages.length < 1 || resource.stages.length > 64
      || resource.stages.some((stage: EnvironmentResourceStage) => !stage || !Number.isFinite(stage.delaySeconds) || stage.delaySeconds <= 0 || !Number.isSafeInteger(stage.waterPortions) || stage.waterPortions < 1 || stage.waterPortions > 7)) {
      throw new Error("invalid resource definition");
    }
    resourceIds.add(resource.id);
  }
}

/** Encode the exact JSON payload consumed by Kernel::load_environment. */
export function encodeEnvironmentDefinition(
  definition: EnvironmentDefinition,
): Uint8Array {
  validateEnvironmentDefinition(definition);
  return new TextEncoder().encode(JSON.stringify(definition));
}
