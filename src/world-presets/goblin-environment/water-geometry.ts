import type {
  Coordinate,
  compilePhysicalGeometry,
} from "../../engine/world/physical-geometry.ts";
import { MATERIAL } from "../height-caves.mjs";
import {
  GOBLIN_ENVIRONMENT_BOUNDS,
  GOBLIN_INITIAL_WATER_TABLE_M,
  GOBLIN_LOAM,
  GOBLIN_SPACING_M,
  GOBLIN_WATER_RULES,
} from "./content.ts";
import type { goblinTerrainProjection } from "./terrain-projection.ts";

type Terrain = ReturnType<typeof goblinTerrainProjection>;
type Physical = ReturnType<typeof compilePhysicalGeometry>;
type WaterCell =
  | { at: Coordinate; kind: "void" }
  | { at: Coordinate; kind: "soil"; soilId: string };
const id = (at: Coordinate) => `cell:${at.join()}`;
const axes = ["x", "y", "z"] as const;

/** A monotone environmental coverage ceiling is retained by the composed host.
 * An actual empty neighbor must exist above the highest possible liquid/source
 * cell, including full free surfaces used by the water pressure operation. */
export function waterCoverageCeiling(
  terrain: Terrain,
  previousCeilingY: number,
  highestSourceVoxelY: number,
) {
  if (![previousCeilingY, highestSourceVoxelY].every(Number.isSafeInteger))
    throw new TypeError("integer environmental coverage inputs required");
  const ceiling = Math.max(
    terrain.surfaceCeilingY,
    previousCeilingY,
    highestSourceVoxelY + 2,
  );
  if (ceiling > GOBLIN_ENVIRONMENT_BOUNDS.max[1])
    throw new Error(
      "liquid source needs its real upper neighbor inside the registered world",
    );
  return ceiling;
}

function collectCells(terrain: Terrain, physical: Physical, ceilingY: number) {
  const cells: WaterCell[] = [],
    bounds = GOBLIN_ENVIRONMENT_BOUNDS;
  for (let x = bounds.min[0]; x < bounds.max[0]; x++) {
    for (let z = bounds.min[2]; z < bounds.max[2]; z++) {
      for (let y = bounds.min[1]; y < ceilingY; y++) {
        const at: Coordinate = [x, y, z],
          material = terrain.material(at);
        if (material === MATERIAL.soil) {
          cells.push({ at, kind: "soil", soilId: GOBLIN_LOAM.id });
        } else if (material === MATERIAL.air) {
          const point = physical.point(at);
          if (point === "unresolved")
            throw new Error("unresolved actual water geometry");
          if (point === "empty") cells.push({ at, kind: "void" });
        } else if (material !== MATERIAL.stone) {
          throw new Error("unregistered Goblin terrain material");
        }
      }
    }
  }
  return cells;
}

function collectFaces(cells: readonly WaterCell[], physical: Physical) {
  const known = new Set(cells.map((cell) => id(cell.at)));
  const faces: { a: Coordinate; b: Coordinate; openFraction: number }[] = [];
  for (const { at } of cells) {
    for (let axis = 0; axis < 3; axis++) {
      const neighbor: [number, number, number] = [...at];
      neighbor[axis]++;
      if (!known.has(id(neighbor))) continue;
      const face = physical.face(axes[axis], neighbor);
      if (face === "unresolved")
        throw new Error("unresolved actual water face");
      if (face === "open") faces.push({ a: at, b: neighbor, openFraction: 1 });
    }
  }
  return faces;
}

/** Game producer over the existing common geometry query. This has no room
 * fixture, independent terrain edit, numerical solver or placement whitelist. */
export function goblinWaterGeometry(
  terrain: Terrain,
  physical: Physical,
  revision: number,
  ceilingY: number,
) {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Number.isSafeInteger(ceilingY) ||
    ceilingY < terrain.surfaceCeilingY ||
    ceilingY > GOBLIN_ENVIRONMENT_BOUNDS.max[1]
  )
    throw new TypeError("current bounded field revision and coverage required");
  const bounds = GOBLIN_ENVIRONMENT_BOUNDS;
  if (
    physical.bounds.min.some((v, i) => v > bounds.min[i]) ||
    physical.bounds.max.some((v, i) => v < (i === 1 ? ceilingY : bounds.max[i]))
  )
    throw new Error("water requires the actual environmental collar query");
  const cells = collectCells(terrain, physical, ceilingY);
  return {
    ...GOBLIN_WATER_RULES,
    revision,
    spacingM: [...GOBLIN_SPACING_M],
    soils: [{ ...GOBLIN_LOAM }],
    cells,
    faces: collectFaces(cells, physical),
  };
}

/** Only world creation supplies this stock. Newly excavated voids enter through
 * the existing water rebind; they never call this function or reset F0. */
export function initialGoblinWaterStocks(
  terrain: Terrain,
  definition: ReturnType<typeof goblinWaterGeometry>,
) {
  if (terrain.checkpoint.revision !== 0 || definition.revision !== 0)
    throw new Error(
      "initial water stock is only defined for the original world",
    );
  const original = new Set(terrain.originalSoil.map(id));
  const volume = GOBLIN_SPACING_M.reduce<number>(
    (product, n) => product * n,
    1,
  );
  const stocks = definition.cells.map((cell) => {
    if (cell.kind === "void") return { id: id(cell.at), massKg: 0 };
    if (!original.delete(id(cell.at)))
      throw new Error("unexpected original porous cell");
    const saturated = Math.max(
      0,
      Math.min(
        1,
        (GOBLIN_INITIAL_WATER_TABLE_M - cell.at[1] * GOBLIN_SPACING_M[1]) /
          GOBLIN_SPACING_M[1],
      ),
    );
    const moisture =
      GOBLIN_LOAM.retention +
      saturated * (GOBLIN_LOAM.porosity - GOBLIN_LOAM.retention);
    return { id: id(cell.at), massKg: 1000 * volume * moisture };
  });
  if (original.size)
    throw new Error("original porous region lacks water custody");
  return { stocks };
}
