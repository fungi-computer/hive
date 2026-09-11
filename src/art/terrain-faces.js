export function terrainColumnKey(cellOrSurface) {
  const cell = cellOrSurface?.cell ?? cellOrSurface;
  return `${cell[0]},${cell[2]}`;
}

/** The projection's content identity, excluding object identity and revision. */
export function terrainColumnContent(surface) {
  return surface === null || surface === undefined
    ? null
    : `${surface.cell[1]}:${surface.material}`;
}

export function terrainColumnMap(surfaces) {
  if (surfaces instanceof Map) return surfaces;
  const columns = new Map();
  for (const surface of surfaces) {
    const key = terrainColumnKey(surface);
    if (columns.has(key)) throw new Error("duplicate terrain art column");
    columns.set(key, surface);
  }
  return columns;
}

/** Compare complete column content, including removals and newly exposed columns. */
export function changedTerrainColumns(previous = [], current = []) {
  const before = terrainColumnMap(previous),
    after = terrainColumnMap(current);
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys]
    .filter(
      (key) =>
        terrainColumnContent(before.get(key)) !==
        terrainColumnContent(after.get(key)),
    )
    .map((key) => {
      const [x, z] = key.split(",").map(Number);
      return { x, z };
    })
    .sort((left, right) => left.x - right.x || left.z - right.z);
}

/** A changed height affects its own faces and every adjacent column wall. */
export function affectedTerrainColumns(changed) {
  const keys = new Set();
  for (const { x, z } of changed)
    for (const [dx, dz] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      keys.add(`${x + dx},${z + dz}`);
  return [...keys]
    .map((key) => {
      const [x, z] = key.split(",").map(Number);
      return { x, z };
    })
    .sort((left, right) => left.x - right.x || left.z - right.z);
}

export function terrainChunkKey(x, z, chunkSize = 8) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0)
    throw new Error("invalid terrain chunk size");
  return `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;
}

export function terrainChunkKeys(columns, chunkSize = 8) {
  return [
    ...new Set(columns.map(({ x, z }) => terrainChunkKey(x, z, chunkSize))),
  ].sort((a, b) => {
    const [ax, az] = a.split(",").map(Number),
      [bx, bz] = b.split(",").map(Number);
    return ax - bx || az - bz;
  });
}

/** Project the old and new affected faces into one conservative dirty rectangle. */
export function terrainFaceBounds(surfaces, affected, verticalMetres, project) {
  const wanted = new Set(affected.map(({ x, z }) => `${x},${z}`));
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const face of terrainFaces(surfaces, verticalMetres)) {
    if (!wanted.has(terrainColumnKey(face.surface))) continue;
    for (const [x, y, z] of face.vertices) {
      const point = project(x, y, z);
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  }
  return left === Infinity ? null : { left, top, right, bottom };
}

/** Shared visible exterior faces for the terrain bake and pointer picking. */
export function* terrainFaces(
  surfaces,
  verticalMetres,
  columnIndex = undefined,
) {
  const columns = columnIndex ?? terrainColumnMap(surfaces);
  for (const surface of surfaces) {
    const {
      cell: [x, y, z],
    } = surface;
    const top = (y + 0.5) * verticalMetres;
    const left = x - 0.5,
      right = x + 0.5,
      back = z - 0.5,
      front = z + 0.5;
    yield {
      surface,
      top: true,
      vertices: [
        [left, top, back],
        [left, top, front],
        [right, top, front],
        [right, top, back],
      ],
    };
    for (const [dx, dz, edge] of [
      [
        -1,
        0,
        [
          [left, back],
          [left, front],
        ],
      ],
      [
        1,
        0,
        [
          [right, front],
          [right, back],
        ],
      ],
      [
        0,
        -1,
        [
          [right, back],
          [left, back],
        ],
      ],
      [
        0,
        1,
        [
          [left, front],
          [right, front],
        ],
      ],
    ]) {
      const neighbor = columns.get(`${x + dx},${z + dz}`);
      // The outer skirt is visual framing, not a claim about unseen geology.
      const bottom = neighbor
        ? (neighbor.cell[1] + 0.5) * verticalMetres
        : top - verticalMetres;
      if (bottom >= top) continue;
      yield {
        surface,
        top: false,
        vertices: [
          [edge[0][0], top, edge[0][1]],
          [edge[0][0], bottom, edge[0][1]],
          [edge[1][0], bottom, edge[1][1]],
          [edge[1][0], top, edge[1][1]],
        ],
      };
    }
  }
}
