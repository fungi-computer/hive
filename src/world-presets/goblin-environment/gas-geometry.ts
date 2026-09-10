import type {
  Coordinate,
  compilePhysicalGeometry,
} from "../../engine/world/physical-geometry.ts";
import type { GasGeometrySnapshot } from "../goblin-atmosphere.ts";
import { MATERIAL } from "../height-caves.mjs";
import {
  GOBLIN_ENVIRONMENT_BOUNDS,
  GOBLIN_SPACING_M,
  GOBLIN_WATER_RULES,
} from "./content.ts";
import type { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  type goblinWaterGeometry,
  waterCoverageCeiling,
} from "./water-geometry.ts";

type Terrain = ReturnType<typeof goblinTerrainProjection>;
type Physical = ReturnType<typeof compilePhysicalGeometry>;
type WaterDefinition = ReturnType<typeof goblinWaterGeometry>;
export type GoblinGasWaterFacts = {
  readonly cells: readonly {
    readonly id: string;
    readonly at: Coordinate;
    readonly kind: "void" | "soil";
    readonly massKg: number;
    readonly capacityKg: number;
    readonly liquidVolumeM3: number;
  }[];
};
type Axis = "x" | "y" | "z";

const AXES = ["x", "y", "z"] as const;
const cellId = (at: Coordinate) => `cell:${at.join()}`;
const faceId = (axis: Axis, at: Coordinate) => `${axis}:${at.join()}`;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export const GOBLIN_GAS_BOUNDARY = Object.freeze({
  lateral: "closed-finite-region",
  bottom: "closed-finite-region",
  top: "actual-open-sky-face-only",
} as const);

function positiveAxis(at: Coordinate, axis: number) {
  const next: [number, number, number] = [...at];
  next[axis]++;
  return next;
}

function checkCoverage(
  terrain: Terrain,
  physical: Physical,
  definition: WaterDefinition,
  ceilingY: number,
) {
  const bounds = GOBLIN_ENVIRONMENT_BOUNDS;
  if (!physical.derivedFrom(terrain.terrain))
    throw new Error("gas query belongs to a different terrain checkpoint");
  const minimumCeilingY = waterCoverageCeiling(
    terrain,
    physical,
    bounds.min[1],
    bounds.min[1],
  );
  if (
    !Number.isSafeInteger(ceilingY) ||
    ceilingY < minimumCeilingY ||
    ceilingY > bounds.max[1] ||
    physical.bounds.min.some((value, axis) => value > bounds.min[axis]) ||
    physical.bounds.max.some(
      (value, axis) => value < (axis === 1 ? ceilingY : bounds.max[axis]),
    )
  )
    throw new Error("gas requires the actual monotone environmental coverage");
  if (
    definition.id !== GOBLIN_WATER_RULES.id ||
    !same(definition.spacingM, GOBLIN_SPACING_M)
  )
    throw new Error("gas requires the registered water geometry and metric");
}

function admittedWater(
  terrain: Terrain,
  physical: Physical,
  definition: WaterDefinition,
  facts: GoblinGasWaterFacts,
  ceilingY: number,
) {
  const voxelM3 = GOBLIN_SPACING_M.reduce<number>(
      (product, value) => product * value,
      1,
    ),
    byId = new Map(facts.cells.map((cell) => [cell.id, cell]));
  if (
    facts.cells.length !== definition.cells.length ||
    byId.size !== facts.cells.length
  )
    throw new Error("gas requires one admitted water fact per water cell");
  for (const cell of definition.cells) {
    const fact = byId.get(cellId(cell.at)),
      within = cell.at.every(
        (value, axis) =>
          value >= GOBLIN_ENVIRONMENT_BOUNDS.min[axis] &&
          value < (axis === 1 ? ceilingY : GOBLIN_ENVIRONMENT_BOUNDS.max[axis]),
      ),
      material = within ? terrain.material(cell.at) : null,
      point = within ? physical.point(cell.at) : "unresolved";
    if (
      !fact ||
      !within ||
      fact.kind !== cell.kind ||
      !same(fact.at, cell.at) ||
      (cell.kind === "void" &&
        (material !== MATERIAL.air || point !== "empty")) ||
      (cell.kind === "soil" && material !== MATERIAL.soil) ||
      !Number.isFinite(fact.liquidVolumeM3) ||
      !Number.isFinite(fact.massKg) ||
      !Number.isFinite(fact.capacityKg) ||
      fact.liquidVolumeM3 < 0 ||
      fact.massKg < 0 ||
      fact.massKg > fact.capacityKg ||
      fact.liquidVolumeM3 > voxelM3 ||
      (fact.kind === "void" && fact.capacityKg !== voxelM3 * 1_000) ||
      (fact.kind === "void" && fact.liquidVolumeM3 !== fact.massKg / 1_000)
    )
      throw new Error("water facts disagree with their physical geometry");
  }
  const bounds = GOBLIN_ENVIRONMENT_BOUNDS,
    declared = new Set(definition.cells.map((cell) => cellId(cell.at)));
  for (let x = bounds.min[0]; x < bounds.max[0]; x++)
    for (let z = bounds.min[2]; z < bounds.max[2]; z++)
      for (let y = bounds.min[1]; y < ceilingY; y++) {
        const at: Coordinate = [x, y, z],
          material = terrain.material(at),
          point = physical.point(at);
        if (point === "unresolved")
          throw new Error("unresolved actual gas cell");
        if (
          ((material === MATERIAL.air && point === "empty") ||
            material === MATERIAL.soil) &&
          !declared.has(cellId(at))
        )
          throw new Error("water coverage omits a modeled environmental cell");
      }
  return { byId, voxelM3 };
}

function internalAreaM2(
  axis: number,
  leftLiquidM3: number,
  rightLiquidM3: number,
) {
  const [sx, sy, sz] = GOBLIN_SPACING_M;
  if (axis === 1) return rightLiquidM3 > 0 ? 0 : sx * sz;
  const horizontalM2 = sx * sz,
    leftDryM = sy - leftLiquidM3 / horizontalM2,
    rightDryM = sy - rightLiquidM3 / horizontalM2,
    dryHeightM = Math.min(leftDryM, rightDryM);
  return Math.max(0, dryHeightM) * (axis === 0 ? sz : sx);
}

function freeVolumeM3(
  fact: GoblinGasWaterFacts["cells"][number],
  voxelM3: number,
) {
  return fact.massKg === fact.capacityKg ? 0 : voxelM3 - fact.liquidVolumeM3;
}

/** Update only stock-dependent gas metrics when the admitted water and
 * physical topology are the same. A missing/new cell or a changed opening
 * membership asks the caller for the conservative full rebuild. Facts here
 * come from the already-admitted water owner; the structural checks still
 * reject an accidentally mismatched definition. */
export function updateGoblinGasGeometry(
  previous: GasGeometrySnapshot,
  physical: Physical,
  waterDefinition: WaterDefinition,
  waterFacts: GoblinGasWaterFacts,
  revision: number,
  ceilingY: number,
) {
  if (!Number.isSafeInteger(revision) || revision < waterDefinition.revision)
    return { status: "rebuild" as const };
  void ceilingY;
  const voxelM3 = GOBLIN_SPACING_M.reduce<number>(
      (product, value) => product * value,
      1,
    ),
    byId = new Map(waterFacts.cells.map((cell) => [cell.id, cell]));
  if (
    byId.size !== waterFacts.cells.length ||
    byId.size !== waterDefinition.cells.length
  )
    return { status: "rebuild" as const };

  const cells = new Map<string, GasCellLike>();
  for (const cell of waterDefinition.cells) {
    const id = cellId(cell.at), fact = byId.get(id);
    if (!fact || fact.kind !== cell.kind || cell.kind !== "void") continue;
    const freeVolume = freeVolumeM3(fact, voxelM3);
    if (!Number.isFinite(freeVolume) || freeVolume < 0)
      return { status: "rebuild" as const };
    if (freeVolume > 0) cells.set(id, { at: cell.at, freeVolume });
  }
  if (
    cells.size !== previous.cells.length ||
    previous.cells.some((cell) => !cells.has(cell.id))
  )
    return { status: "rebuild" as const };

  const updatedCells = previous.cells.map((cell) => {
      const next = cells.get(cell.id)!;
      if (next.freeVolume <= 0) return null;
      return Object.freeze({ ...cell, freeVolumeM3: next.freeVolume });
    }),
    previousFaces = new Map(previous.openFaces.map((face) => [face.id, face])),
    updatedFaces: GasGeometrySnapshot["openFaces"][number][] = [],
    emitted = new Set<string>();
  if (updatedCells.some((cell) => cell === null))
    return { status: "rebuild" as const };

  const gasIds = new Set(cells.keys());
  for (const cell of waterDefinition.cells) {
    const id = cellId(cell.at);
    if (!gasIds.has(id)) continue;
    const fact = byId.get(id)!;
    for (let axis = 0; axis < 3; axis++) {
      const nextAt = positiveAxis(cell.at, axis),
        nextId = cellId(nextAt);
      if (!gasIds.has(nextId)) continue;
      const faceIdValue = faceId(AXES[axis], nextAt),
        old = previousFaces.get(faceIdValue);
      const nextFact = byId.get(nextId)!;
      const physicalFace = physical.face(AXES[axis], nextAt);
      if (physicalFace === "unresolved")
        return { status: "rebuild" as const };
      if (physicalFace === "closed") continue;
      const areaM2 = internalAreaM2(
        axis,
        fact.liquidVolumeM3,
        nextFact.liquidVolumeM3,
      );
      if (!(areaM2 > 0)) {
        if (old) return { status: "rebuild" as const };
        continue;
      }
      if (!old || old.a !== id || old.b !== nextId)
        return { status: "rebuild" as const };
      emitted.add(faceIdValue);
      updatedFaces.push(Object.freeze({ ...old, areaM2 }));
    }
  }
  for (const face of previous.openFaces) {
    if (!face.b) {
      emitted.add(face.id);
      updatedFaces.push(face);
    }
  }
  if (
    emitted.size !== previous.openFaces.length ||
    updatedFaces.length !== previous.openFaces.length ||
    previous.openFaces.some((face) => !emitted.has(face.id))
  )
    return { status: "rebuild" as const };
  const changed =
    updatedCells.some((cell, index) => cell!.freeVolumeM3 !== previous.cells[index].freeVolumeM3) ||
    updatedFaces.some(
      (face) => face.areaM2 !== previousFaces.get(face.id)!.areaM2,
    );
  if (!changed) return { status: "reused" as const, snapshot: previous, changed: false };
  return {
    status: "reused" as const,
    changed: true,
    snapshot: Object.freeze({
      identity: previous.identity,
      revision,
      cells: Object.freeze(updatedCells as GasGeometrySnapshot["cells"]),
      openFaces: Object.freeze(updatedFaces),
    }),
  };
}

type GasCellLike = { readonly at: Coordinate; readonly freeVolume: number };

/** Derive gas capacity and openings from the same actual terrain, structure and
 * water facts. This returns no stock, clock, solver or mutable world. */
export function goblinGasGeometry(
  terrain: Terrain,
  physical: Physical,
  waterDefinition: WaterDefinition,
  waterFacts: GoblinGasWaterFacts,
  revision: number,
  ceilingY: number,
): GasGeometrySnapshot {
  checkCoverage(terrain, physical, waterDefinition, ceilingY);
  if (!Number.isSafeInteger(revision) || revision < waterDefinition.revision)
    throw new TypeError("current coupled gas revision required");
  const { byId, voxelM3 } = admittedWater(
      terrain,
      physical,
      waterDefinition,
      waterFacts,
      ceilingY,
    ),
    gas = new Map<
      string,
      { at: Coordinate; liquidVolumeM3: number; freeVolumeM3: number }
    >();
  for (const cell of waterDefinition.cells) {
    if (cell.kind !== "void") continue;
    const fact = byId.get(cellId(cell.at))!,
      liquidVolumeM3 = fact.liquidVolumeM3,
      freeVolumeM3 =
        fact.massKg === fact.capacityKg ? 0 : voxelM3 - liquidVolumeM3;
    if (freeVolumeM3 > 0)
      gas.set(cellId(cell.at), { at: cell.at, liquidVolumeM3, freeVolumeM3 });
  }
  const cells = [...gas].map(([id, cell]) => ({
      id,
      x: (cell.at[0] + 0.5) * GOBLIN_SPACING_M[0],
      y: (cell.at[1] + 0.5) * GOBLIN_SPACING_M[1],
      z: (cell.at[2] + 0.5) * GOBLIN_SPACING_M[2],
      freeVolumeM3: cell.freeVolumeM3,
    })),
    openFaces: GasGeometrySnapshot["openFaces"][number][] = [];
  for (const cell of gas.values()) {
    for (let axis = 0; axis < 3; axis++) {
      const nextAt = positiveAxis(cell.at, axis),
        next = gas.get(cellId(nextAt));
      if (!next) continue;
      const at = nextAt,
        face = physical.face(AXES[axis], at);
      if (face === "unresolved") throw new Error("unresolved actual gas face");
      if (face === "closed") continue;
      const areaM2 = internalAreaM2(
        axis,
        cell.liquidVolumeM3,
        next.liquidVolumeM3,
      );
      if (areaM2 > 0)
        openFaces.push({
          id: faceId(AXES[axis], at),
          a: cellId(cell.at),
          b: cellId(nextAt),
          areaM2,
          distanceM: GOBLIN_SPACING_M[axis],
        });
    }
    // Lateral and bottom boundaries have no emitted face. Only this actual
    // open upper physical face declares an ambient connection.
    if (cell.at[1] !== ceilingY - 1) continue;
    if (physical.exterior(cell.at, "y", 1, ceilingY) !== "outdoor") continue;
    const at = positiveAxis(cell.at, 1);
    openFaces.push({
      id: `${faceId("y", at)}:ambient`,
      a: cellId(cell.at),
      b: null,
      areaM2: GOBLIN_SPACING_M[0] * GOBLIN_SPACING_M[2],
      distanceM: GOBLIN_SPACING_M[1] / 2,
    });
  }
  return Object.freeze({
    identity: JSON.stringify({
      version: "goblin-environment-gas-geometry-v1",
      terrain: terrain.terrain.identity,
      terrainRevision: terrain.terrain.revision,
      bounds: GOBLIN_ENVIRONMENT_BOUNDS,
      spacingM: GOBLIN_SPACING_M,
      coverageCeilingY: ceilingY,
      water: waterDefinition.id,
      waterRevision: waterDefinition.revision,
      boundary: GOBLIN_GAS_BOUNDARY,
    }),
    revision,
    cells: Object.freeze(cells.map((cell) => Object.freeze(cell))),
    openFaces: Object.freeze(openFaces.map((face) => Object.freeze(face))),
  });
}
