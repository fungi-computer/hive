import { assertWorldRecord, assertWorldArray } from "./data-contract.mjs";
import {
  VOXEL_CHECKPOINT_SCHEMA,
  checkedVoxelContract,
  readVoxelCheckpoint,
  cellKey,
  compareCells,
  encodedBytes,
} from "./voxel-contract.mjs";

/** One opaque material-slot owner. The consumer supplies the versioned generated base. */
export function createVoxelStore(definition, options = {}) {
  const contract = checkedVoxelContract(definition, options);
  const {
    side,
    volume,
    ArrayType,
    maxResidentBricks,
    maxChangedCells,
    column,
    checkCell,
    checkMaterial,
    brickKey,
    index,
    originAt,
    checkBrick,
  } = contract;
  const changes = new Map(),
    byBrick = new Map(),
    cache = new Map();
  let revision = 0,
    pointReads = 0,
    generatedPointReads = 0,
    generatedBricks = 0,
    evictions = 0;

  function columnAt(x, z) {
    const sample = column(x, z);
    if (typeof sample !== "function")
      throw new TypeError("column must return a Y sampler");
    return (y) => checkMaterial(sample(y));
  }
  const baseAt = (at) => columnAt(at.x, at.z)(at.y);
  function putChange(entry) {
    const key = cellKey(entry),
      brick = brickKey(entry);
    changes.set(key, entry);
    if (!byBrick.has(brick)) byBrick.set(brick, new Map());
    byBrick.get(brick).set(key, entry);
  }
  function removeChange(at) {
    const key = cellKey(at),
      brick = brickKey(at),
      entries = byBrick.get(brick);
    changes.delete(key);
    entries?.delete(key);
    if (entries?.size === 0) byBrick.delete(brick);
  }
  function decodeOrigin(origin) {
    const key = brickKey(origin),
      hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const material = new ArrayType(volume);
    for (let localZ = 0; localZ < side; localZ++) {
      for (let localX = 0; localX < side; localX++) {
        const x = origin.x + localX,
          z = origin.z + localZ,
          sampleY = columnAt(x, z);
        for (let localY = 0; localY < side; localY++)
          material[(localY * side + localZ) * side + localX] = sampleY(
            origin.y + localY,
          );
      }
    }
    // Generation must succeed before this projection becomes visible to readers.
    for (const entry of byBrick.get(key)?.values() ?? [])
      material[index(entry)] = entry.material;
    generatedBricks++;
    cache.set(key, material);
    while (cache.size > maxResidentBricks) {
      cache.delete(cache.keys().next().value);
      evictions++;
    }
    return material;
  }
  function read(input) {
    const at = checkCell(input);
    return decodeOrigin(originAt(at))[index(at)];
  }
  function readPoint(input) {
    const at = checkCell(input);
    pointReads++;
    const resident = cache.get(brickKey(at));
    if (resident) return resident[index(at)];
    const change = changes.get(cellKey(at));
    if (change) return change.material;
    generatedPointReads++;
    return baseAt(at);
  }
  function save() {
    return {
      schema: VOXEL_CHECKPOINT_SCHEMA,
      identity: structuredClone(contract.identity),
      generatorId: contract.generatorId,
      layout: structuredClone(contract.layout),
      revision,
      changes: [...changes.values()]
        .map((entry) => ({ ...entry }))
        .sort(compareCells),
    };
  }
  function preflight(cells) {
    assertWorldArray(cells, volume, "edit cells");
    if (!Array.isArray(cells) || !cells.length || cells.length > volume)
      throw new Error("bounded nonempty cell batch required");
    const seen = new Set(),
      next = [];
    let nextCount = changes.size;
    for (const input of cells) {
      assertWorldRecord(
        input,
        ["x", "y", "z", "material", "expectedMaterial"],
        "edit cell",
      );
      const at = checkCell(input),
        material = checkMaterial(input.material),
        expectedMaterial = checkMaterial(input.expectedMaterial),
        key = cellKey(at);
      if (seen.has(key)) throw new Error("duplicate edit cell");
      seen.add(key);
      if (readPoint(at) !== expectedMaterial)
        return { ok: false, reason: "cell-changed", revision };
      if (expectedMaterial === material) continue;
      const base = baseAt(at);
      nextCount += Number(material !== base) - Number(changes.has(key));
      next.push({ entry: { ...at, material, revision: revision + 1 }, base });
    }
    if (nextCount > maxChangedCells)
      return { ok: false, reason: "edit-capacity", revision };
    if (next.length && !Number.isSafeInteger(revision + 1))
      throw new RangeError("revision exhausted");
    return { ok: true, next };
  }
  function edit(command) {
    assertWorldRecord(command, ["expectedRevision", "cells"], "edit command");
    const { expectedRevision, cells } = command;
    if (expectedRevision !== revision)
      return { ok: false, reason: "stale-revision", revision };
    const prepared = preflight(cells);
    if (!prepared.ok) return prepared;
    if (!prepared.next.length) return { ok: true, revision, changedBricks: [] };
    for (const { entry, base } of prepared.next) {
      if (entry.material === base) removeChange(entry);
      else putChange(entry);
      const resident = cache.get(brickKey(entry));
      if (resident) resident[index(entry)] = entry.material;
    }
    revision++;
    return {
      ok: true,
      revision,
      changedBricks: [
        ...new Set(prepared.next.map(({ entry }) => brickKey(entry))),
      ].sort(),
    };
  }
  const restored = readVoxelCheckpoint(
    contract,
    options.checkpoint ?? null,
    baseAt,
  );
  for (const entry of restored.entries) putChange(entry);
  revision = restored.revision;
  const residentProjectionCapBytes =
    maxResidentBricks * volume * ArrayType.BYTES_PER_ELEMENT;
  return Object.freeze({
    read,
    readPoint,
    edit,
    save,
    readBrick(brick) {
      const origin = checkBrick(brick),
        material = decodeOrigin(origin);
      return {
        key: brickKey(origin),
        origin,
        side,
        material: material.slice(),
      };
    },
    inspect(input) {
      const cell = checkCell(input),
        change = changes.get(cellKey(cell)),
        generatedMaterial = baseAt(cell);
      return {
        cell,
        revision,
        brick: brickKey(cell),
        material: change?.material ?? generatedMaterial,
        generatedMaterial,
        source: change ? "edit" : "generated",
        changeRevision: change?.revision ?? null,
        resident: cache.has(brickKey(cell)),
      };
    },
    describe() {
      return {
        identity: structuredClone(contract.identity),
        generatorId: contract.generatorId,
        layout: structuredClone(contract.layout),
        revision,
        residentProjectionCapBytes,
        maxChangedCells,
        editBatchCap: volume,
        coldBrickBudget: { cells: volume, columns: side * side },
      };
    },
    evictAll() {
      evictions += cache.size;
      cache.clear();
    },
    stats({ measureSerializedBytes = false } = {}) {
      return {
        revision,
        changedCells: changes.size,
        changedBricks: byBrick.size,
        residentBricks: cache.size,
        residentBytes: cache.size * volume * ArrayType.BYTES_PER_ELEMENT,
        maxResidentBricks,
        maxChangedCells,
        residentProjectionCapBytes,
        generatedBricks,
        pointReads,
        generatedPointReads,
        evictions,
        ...(measureSerializedBytes
          ? {
              sparseOverlayBytes: encodedBytes(
                [...changes.values()].sort(compareCells),
              ),
              checkpointBytes: encodedBytes(save()),
            }
          : {}),
      };
    },
  });
}
