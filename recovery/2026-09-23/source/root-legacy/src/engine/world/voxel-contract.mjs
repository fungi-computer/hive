import {
  copyWorldData,
  sameWorldData,
  assertWorldRecord,
  assertWorldArray,
  safeInteger,
} from "./data-contract.mjs";
// Structural storage laws only. Material meaning and generation belong to the consumer.
export const VOXEL_CHECKPOINT_SCHEMA = 1;
const MAX_BRICK_SIDE = 32;
const MAX_RESIDENT_BYTES = 64 * 1024 * 1024;
const MAX_CHANGED_CELLS = 1024 * 1024;
export const cellKey = ({ x, y, z }) => `${x},${y},${z}`;
export const compareCells = (a, b) => a.x - b.x || a.z - b.z || a.y - b.y;
export const encodedBytes = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

function checkedBounds(input, side) {
  const bounds = {};
  assertWorldRecord(
    input,
    ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"],
    "bounds",
  );
  for (const axis of ["X", "Y", "Z"]) {
    const low = `min${axis}`,
      high = `max${axis}`;
    bounds[low] = safeInteger(input?.[low], low);
    bounds[high] = safeInteger(input?.[high], high);
    if (
      bounds[low] >= bounds[high] ||
      bounds[low] % side ||
      bounds[high] % side
    )
      throw new RangeError("bounds must enclose whole bricks");
  }
  return bounds;
}

function checkedPalette(materialIds) {
  assertWorldArray(materialIds, 65536, "material palette");
  if (
    !Array.isArray(materialIds) ||
    !materialIds.length ||
    materialIds.length > 65536
  )
    throw new TypeError("nonempty bounded material ID palette required");
  const ids = new Set();
  for (const id of materialIds) {
    safeInteger(id, "material ID");
    if (id < 0 || id > 65535 || ids.has(id))
      throw new TypeError("unique uint16 material IDs required");
    ids.add(id);
  }
  const palette = [...ids].sort((a, b) => a - b);
  const ArrayType = palette.at(-1) < 256 ? Uint8Array : Uint16Array;
  return { ids, palette, ArrayType };
}

function checkedBudgets(options, volume, ArrayType, bounds) {
  const maxResidentBricks = safeInteger(
    options.maxResidentBricks ?? 8,
    "resident cap",
  );
  if (
    maxResidentBricks < 1 ||
    maxResidentBricks * volume * ArrayType.BYTES_PER_ELEMENT >
      MAX_RESIDENT_BYTES
  )
    throw new RangeError("resident projection budget exceeds 64 MiB");
  const maxChangedCells = safeInteger(
    options.maxChangedCells ?? 65536,
    "changed-cell cap",
  );
  if (maxChangedCells < 1 || maxChangedCells > MAX_CHANGED_CELLS)
    throw new RangeError("changed-cell cap must be 1-1048576");
  const worldCells = ["X", "Y", "Z"].reduce(
    (total, axis) =>
      total * (BigInt(bounds[`max${axis}`]) - BigInt(bounds[`min${axis}`])),
    1n,
  );
  return {
    maxResidentBricks,
    maxChangedCells: Number(
      worldCells < BigInt(maxChangedCells)
        ? worldCells
        : BigInt(maxChangedCells),
    ),
  };
}

function createAddresses(bounds, side, ids) {
  function checkCell(input) {
    const cell = {};
    for (const axis of ["x", "y", "z"]) {
      const value = safeInteger(input?.[axis], axis),
        suffix = axis.toUpperCase();
      if (value < bounds[`min${suffix}`] || value >= bounds[`max${suffix}`])
        throw new RangeError("cell outside world bounds");
      cell[axis] = value;
    }
    return cell;
  }
  function checkMaterial(id) {
    if (!ids.has(id))
      throw new TypeError("material ID absent from world palette");
    return id;
  }
  const coordinate = (value) => Math.floor(value / side);
  const modulo = (value) => ((value % side) + side) % side;
  const brickKey = ({ x, y, z }) =>
    `${coordinate(x)},${coordinate(y)},${coordinate(z)}`;
  const index = ({ x, y, z }) =>
    (modulo(y) * side + modulo(z)) * side + modulo(x);
  const originAt = ({ x, y, z }) => ({
    x: coordinate(x) * side,
    y: coordinate(y) * side,
    z: coordinate(z) * side,
  });
  function checkBrick(input) {
    for (const axis of ["x", "y", "z"])
      safeInteger(input?.[axis], `brick ${axis}`);
    const origin = checkCell({
      x: input.x * side,
      y: input.y * side,
      z: input.z * side,
    });
    checkCell({
      x: origin.x + side - 1,
      y: origin.y + side - 1,
      z: origin.z + side - 1,
    });
    return origin;
  }
  return { checkCell, checkMaterial, brickKey, index, originAt, checkBrick };
}

export function checkedVoxelContract(definition, options) {
  assertWorldRecord(
    definition,
    ["identity", "bounds", "brickSide", "materialIds", "generator"],
    "world definition",
  );
  assertWorldRecord(options, [], "world options", [
    "checkpoint",
    "maxResidentBricks",
    "maxChangedCells",
  ]);
  assertWorldRecord(definition.generator, ["id", "column"], "world generator");
  const side = safeInteger(definition.brickSide, "brick side");
  if (side < 1 || side > MAX_BRICK_SIDE)
    throw new RangeError("brick side must be 1-32");
  const bounds = checkedBounds(definition.bounds, side);
  const { ids, palette, ArrayType } = checkedPalette(definition.materialIds);
  const volume = side ** 3;
  if (typeof definition.generator?.column !== "function")
    throw new TypeError("deterministic column sampler required");
  const generatorId = definition.generator.id;
  if (
    typeof generatorId !== "string" ||
    !generatorId ||
    generatorId.length > 256
  )
    throw new TypeError("versioned generator ID required");
  return {
    identity: copyWorldData(definition.identity),
    generatorId,
    layout: { bounds, brickSide: side, materialIds: palette },
    side,
    volume,
    ArrayType,
    ...checkedBudgets(options, volume, ArrayType, bounds),
    ...createAddresses(bounds, side, ids),
    column: definition.generator.column,
  };
}

export function readVoxelCheckpoint(contract, checkpoint, baseAt) {
  if (checkpoint === null) return { revision: 0, entries: [] };
  assertWorldRecord(
    checkpoint,
    ["schema", "identity", "generatorId", "layout", "revision", "changes"],
    "checkpoint",
  );
  if (
    !checkpoint ||
    checkpoint.schema !== VOXEL_CHECKPOINT_SCHEMA ||
    checkpoint.generatorId !== contract.generatorId ||
    !sameWorldData(checkpoint.identity, contract.identity) ||
    !matchesLayout(checkpoint.layout, contract.layout)
  )
    throw new Error("checkpoint world/generator/layout mismatch");
  safeInteger(checkpoint.revision, "checkpoint revision");
  if (checkpoint.revision < 0 || !Array.isArray(checkpoint.changes))
    throw new Error("invalid checkpoint");
  if (checkpoint.changes.length > contract.maxChangedCells)
    throw new RangeError("checkpoint exceeds changed-cell budget");
  assertWorldArray(
    checkpoint.changes,
    contract.maxChangedCells,
    "checkpoint changes",
  );
  const entries = [],
    seen = new Set();
  for (const input of checkpoint.changes) {
    assertWorldRecord(input, ["x", "y", "z", "material", "revision"], "change");
    const at = contract.checkCell(input),
      material = contract.checkMaterial(input.material);
    safeInteger(input.revision, "change revision");
    if (
      input.revision < 1 ||
      input.revision > checkpoint.revision ||
      seen.has(cellKey(at))
    )
      throw new Error("duplicate or invalid change revision");
    if (material === baseAt(at))
      throw new Error("redundant base-equal override");
    entries.push({ ...at, material, revision: input.revision });
    seen.add(cellKey(at));
  }
  return { revision: checkpoint.revision, entries };
}

function matchesLayout(input, expected) {
  assertWorldRecord(
    input,
    ["bounds", "brickSide", "materialIds"],
    "checkpoint layout",
  );
  if (
    safeInteger(input.brickSide, "checkpoint brick side") !== expected.brickSide
  )
    return false;
  const bounds = checkedBounds(input.bounds, expected.brickSide);
  const { palette } = checkedPalette(input.materialIds);
  return (
    Object.keys(bounds).every((key) => bounds[key] === expected.bounds[key]) &&
    palette.length === expected.materialIds.length &&
    palette.every((id, i) => id === expected.materialIds[i])
  );
}
