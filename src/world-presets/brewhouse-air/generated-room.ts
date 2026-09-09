import { structureEnvironment } from "../../structure-environment.ts";
import { SIZE, TREE_CELLS } from "../../world.js";
import {
  parseTerrain,
  terrainCell,
  terrainGeometry,
  TERRAIN_FRAME,
  TERRAIN_VOXEL_METRIC,
  type GeneratedTerrain,
} from "../goblin-terrain.ts";
import { BREWHOUSE_AIR_MODEL, BREWHOUSE_ROOM } from "./room.ts";

type Coordinate = readonly [number, number, number];
type Opening = { readonly open: boolean; readonly revision: number };
const cellId = (at: Coordinate): `cell:${number},${number},${number}` =>
  `cell:${at[0]},${at[1]},${at[2]}`;

function worldCoordinate(local: Coordinate): [number, number, number] {
  return [
    local[0] + TERRAIN_FRAME.x,
    local[1] + TERRAIN_FRAME.y,
    local[2] + TERRAIN_FRAME.z,
  ];
}

function worldBounds() {
  return {
    min: worldCoordinate(BREWHOUSE_ROOM.bounds.min),
    max: worldCoordinate(BREWHOUSE_ROOM.bounds.max),
  };
}

function checkedTerrain(input: GeneratedTerrain) {
  const terrain = parseTerrain(input),
    geometry = terrainGeometry(terrain);
  if (
    geometry.frame.x !== TERRAIN_FRAME.x ||
    geometry.frame.y !== TERRAIN_FRAME.y ||
    geometry.frame.z !== TERRAIN_FRAME.z ||
    geometry.frame.storeyVoxels !== TERRAIN_FRAME.storeyVoxels ||
    geometry.spacingM[0] !== TERRAIN_VOXEL_METRIC.horizontalM ||
    geometry.spacingM[1] !== TERRAIN_VOXEL_METRIC.verticalM ||
    geometry.spacingM[2] !== TERRAIN_VOXEL_METRIC.horizontalM
  )
    throw new Error("brewhouse terrain frame or metric changed");
  for (
    let x = BREWHOUSE_ROOM.bounds.min[0];
    x < BREWHOUSE_ROOM.bounds.max[0];
    x++
  )
    for (
      let z = BREWHOUSE_ROOM.bounds.min[2];
      z < BREWHOUSE_ROOM.bounds.max[2];
      z++
    )
      if (!terrainCell(terrain, x, z).support)
        throw new Error(`brewhouse support changed at ${x},${z}`);
  return { terrain, geometry };
}

function checkedOpening(opening: Opening) {
  if (
    typeof opening.open !== "boolean" ||
    !Number.isSafeInteger(opening.revision) ||
    opening.revision < 0
  )
    throw new TypeError("invalid brewhouse opening state");
  return opening;
}

function shutterFaces(definition: {
  origin: readonly number[];
  size: readonly number[];
}) {
  const shutter = BREWHOUSE_ROOM.shutter,
    x = shutter.x + TERRAIN_FRAME.x,
    z = shutter.z + TERRAIN_FRAME.z;
  if (
    shutter.axis !== "z" ||
    !BREWHOUSE_ROOM.sites.some(
      (site) =>
        site.type === "door" &&
        site.level === 1 &&
        site.x === shutter.x &&
        site.z === shutter.z,
    ) ||
    x < definition.origin[0] ||
    x >= definition.origin[0] + definition.size[0] ||
    z < definition.origin[2] ||
    z > definition.origin[2] + definition.size[2] ||
    shutter.minY + TERRAIN_FRAME.y < definition.origin[1] ||
    shutter.maxY + TERRAIN_FRAME.y > definition.origin[1] + definition.size[1]
  )
    throw new Error("brewhouse shutter faces leave the air domain");
  return Object.freeze(
    Array.from(
      { length: shutter.maxY - shutter.minY },
      (_, offset) =>
        `${shutter.axis}:${x},${shutter.minY + offset + TERRAIN_FRAME.y},${z}`,
    ),
  );
}

function airLocations(definition: {
  origin: readonly number[];
  size: readonly number[];
  solidCells: readonly string[];
}) {
  const coordinates = {
      sourceCell: worldCoordinate(BREWHOUSE_ROOM.source),
      upstairsBreathingCell: worldCoordinate(BREWHOUSE_ROOM.upstairsBreathing),
      downstairsBreathingCell: worldCoordinate(
        BREWHOUSE_ROOM.downstairsBreathing,
      ),
    },
    solid = new Set(definition.solidCells);
  for (const [label, at] of Object.entries(coordinates)) {
    const inside = at.every(
        (value, axis) =>
          value >= definition.origin[axis] &&
          value < definition.origin[axis] + definition.size[axis],
      ),
      id = cellId(at);
    if (!inside || solid.has(id))
      throw new Error(`brewhouse ${label} is not an air cell`);
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(coordinates).map(([name, at]) => [name, cellId(at)]),
    ) as {
      sourceCell: `cell:${number},${number},${number}`;
      upstairsBreathingCell: `cell:${number},${number},${number}`;
      downstairsBreathingCell: `cell:${number},${number},${number}`;
    },
  );
}

function emptyAir(definition: {
  origin: readonly number[];
  size: readonly number[];
  solidCells: readonly string[];
}) {
  const solid = new Set(definition.solidCells),
    cells = [];
  for (let z = 0; z < definition.size[2]; z++)
    for (let y = 0; y < definition.size[1]; y++)
      for (let x = 0; x < definition.size[0]; x++) {
        const at: Coordinate = [
            definition.origin[0] + x,
            definition.origin[1] + y,
            definition.origin[2] + z,
          ],
          id = cellId(at);
        if (!solid.has(id)) cells.push({ cellId: id, smokeKg: 0, heatJ: 0 });
      }
  return Object.freeze({ cells: Object.freeze(cells) });
}

function visibleTrees(terrain: GeneratedTerrain) {
  return Object.freeze(
    TREE_CELLS.filter(
      ([x, z]) =>
        x >= BREWHOUSE_ROOM.bounds.min[0] &&
        x < BREWHOUSE_ROOM.bounds.max[0] &&
        z >= BREWHOUSE_ROOM.bounds.min[2] &&
        z < BREWHOUSE_ROOM.bounds.max[2],
    ).map(([x, z]) =>
      Object.freeze({ x, z, height: terrainCell(terrain, x, z).height }),
    ),
  );
}

/** The one generated-room producer. It joins the registered starting sites to
 * the current terrain capability, checks every floor/collar column, then emits
 * both the physical field definition and its renderer coordinates. No terrain,
 * structure or field state is retained here.
 */
export function generatedBrewhouseRoom(
  terrainInput: GeneratedTerrain,
  openingInput: Opening,
) {
  const opening = checkedOpening(openingInput),
    { terrain, geometry } = checkedTerrain(terrainInput),
    environment = structureEnvironment(
      { terrain: geometry, sites: BREWHOUSE_ROOM.sites },
      worldBounds(),
    ),
    baseDefinition = {
      version: "voxel-air-definition-v1" as const,
      regionId: BREWHOUSE_ROOM.id,
      revision: opening.revision,
      origin: [...environment.bounds.min],
      size: environment.bounds.max.map(
        (value, axis) => value - environment.bounds.min[axis],
      ),
      spacingM: [...environment.spacingM],
      solidCells: [...environment.solidCellIds],
      openSides: ["x-", "x+", "z-", "z+", "y+"] as const,
      model: { ...BREWHOUSE_AIR_MODEL },
    },
    shutter = shutterFaces(baseDefinition),
    definition = {
      ...baseDefinition,
      closedFaces: [
        ...environment.closedFaceIds,
        ...(opening.open ? [] : shutter),
      ],
    };
  return Object.freeze({
    definition,
    initialAir: emptyAir(definition),
    frame: Object.freeze({ ...TERRAIN_FRAME }),
    terrainBounds: Object.freeze({
      min: Object.freeze([0, 0] as const),
      max: Object.freeze([SIZE, SIZE] as const),
    }),
    terrainSize: SIZE,
    localBounds: BREWHOUSE_ROOM.bounds,
    sites: BREWHOUSE_ROOM.sites,
    ...airLocations(definition),
    shutterFaces: shutter,
    trees: visibleTrees(terrain),
    outsideExcavation: Object.freeze(
      worldCoordinate(BREWHOUSE_ROOM.outsideExcavationLocal),
    ),
  });
}
