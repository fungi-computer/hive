// Private 3D voxel topology. This is the retained metric/stencil construction
// restricted to the supported nonperiodic voxel consumer, without public scratch.
const AXES = ["x", "y", "z"];
const key = (p) => p.join(",");
const product = (p) => p.reduce((n, x) => n * x, 1);
const flat = (p, size) => p.reduceRight((n, x, d) => n * size[d] + x, 0);
function coordinates(i, size) {
  return size.map((n) => {
    const p = i % n;
    i = Math.floor(i / n);
    return p;
  });
}

function cellsOf(size, origin, spacing, solid) {
  const fluid = Int8Array.from(
    { length: product(size) },
    (_, i) => !solid.has(i),
  );
  const cells = Array.from(fluid, (value, i) => {
    const at = coordinates(i, size),
      world = at.map((v, d) => v + origin[d]);
    return {
      i,
      at,
      world,
      id: `cell:${key(world)}`,
      center: world.map((v, d) => (v + 0.5) * spacing[d]),
      fluid: !!value,
    };
  });
  return { fluid, cells };
}

function faceAt(index, axis, size, origin, spacing, area) {
  const extents = size.map((n, d) => n + (d === axis ? 1 : 0));
  const at = coordinates(index, extents),
    left = [...at];
  left[axis]--;
  const i = left[axis] < 0 ? -1 : flat(left, size),
    j = at[axis] >= size[axis] ? -1 : flat(at, size);
  const boundary = i < 0 ? AXES[axis] + "-" : j < 0 ? AXES[axis] + "+" : null;
  const world = at.map((v, d) => v + origin[d]);
  return {
    id: `${AXES[axis]}:${key(world)}`,
    axis,
    at,
    world,
    i,
    j,
    area: area[axis],
    distance: spacing[axis] / (boundary ? 2 : 1),
    boundary,
    center: world.map((v, d) => (v + (axis === d ? 0 : 0.5)) * spacing[d]),
  };
}

function flowAllowed(face, fluid, openings, walls, seenWalls) {
  if (walls.has(face.id)) {
    seenWalls.add(face.id);
    return false;
  }
  return !(
    (face.i >= 0 && !fluid[face.i]) ||
    (face.j >= 0 && !fluid[face.j]) ||
    (face.boundary && !openings.has(face.boundary))
  );
}

function facesOf(size, origin, spacing, area, fluid, openings, walls) {
  const faces = [],
    lookup = Array.from({ length: 3 }, () => new Map()),
    seenWalls = new Set();
  for (let axis = 0; axis < 3; axis++) {
    const count = product(size.map((n, d) => n + (d === axis ? 1 : 0)));
    for (let index = 0; index < count; index++) {
      const face = faceAt(index, axis, size, origin, spacing, area);
      if (!flowAllowed(face, fluid, openings, walls, seenWalls)) continue;
      face.k = faces.length;
      faces.push(face);
      lookup[axis].set(key(face.at), face.k);
    }
  }
  if ([...walls].some((id) => !seenWalls.has(id)))
    throw new TypeError("wall names a canonical grid face");
  return { faces, lookup };
}

function stencilsOf(size, faces, lookup) {
  const insideFace = (axis, at) =>
    at.every((v, d) => v >= 0 && v <= size[d] - (d === axis ? 0 : 1));
  function faceIndex(axis, at) {
    return insideFace(axis, at) ? (lookup[axis].get(key(at)) ?? -1) : -1;
  }
  function exteriorGhost(f, d, sign) {
    // A normal component exists here only for an admitted open boundary face.
    if (d === f.axis) return 1;
    const patch = [...f.at];
    patch[d] = sign < 0 ? 0 : size[d];
    let count = 0,
      open = 0;
    // The tangential component's dual support covers these equal-area patches.
    // At its own domain edge only one patch belongs to the represented volume.
    for (const offset of [-1, 0]) {
      patch[f.axis] = f.at[f.axis] + offset;
      if (!insideFace(d, patch)) continue;
      count++;
      if (faceIndex(d, patch) >= 0) open++;
    }
    if (count === 0)
      throw new Error("boundary component has no physical support");
    return (2 * open) / count - 1;
  }
  function neighbor(f, d, sign) {
    const at = [...f.at];
    at[d] += sign;
    const index = faceIndex(f.axis, at);
    if (index < 0) {
      const outside = at[d] < 0 || at[d] > size[d] - (d === f.axis ? 0 : 1);
      return {
        index: -1,
        other: 0,
        center: outside ? exteriorGhost(f, d, sign) : d === f.axis ? 0 : -1,
      };
    }
    if (d === f.axis) return { index, other: 1, center: 0 };
    const a = [...f.at];
    a[d] += sign > 0 ? 1 : 0;
    const b = [...a];
    a[f.axis]--;
    const fraction =
      ((faceIndex(d, a) >= 0 ? 1 : 0) + (faceIndex(d, b) >= 0 ? 1 : 0)) / 2;
    return { index, other: fraction, center: -(1 - fraction) };
  }
  return {
    stencil: faces.map((f) =>
      Array.from({ length: 3 }, (_, d) => [
        neighbor(f, d, -1),
        neighbor(f, d, 1),
      ]),
    ),
    cross: faces.map((f) =>
      Array.from({ length: 3 }, (_, d) => {
        if (d === f.axis) return [f.k];
        const indices = [];
        for (const alongOwn of [-1, 0])
          for (const alongOther of [0, 1]) {
            const at = [...f.at];
            at[f.axis] += alongOwn;
            at[d] += alongOther;
            indices.push(faceIndex(d, at));
          }
        return indices;
      }),
    ),
  };
}

function connectivity(fluid, faces) {
  const adjacency = Array.from(fluid, () => []),
    exterior = new Set();
  for (const face of faces) {
    if (face.i >= 0 && face.j >= 0) {
      adjacency[face.i].push(face.j);
      adjacency[face.j].push(face.i);
    } else exterior.add(Math.max(face.i, face.j));
  }
  return { adjacency, exterior };
}

function traceComponent(seed, adjacency, exterior, seen) {
  const pending = [seed],
    cells = [];
  let open = false;
  while (pending.length) {
    const at = pending.pop();
    if (seen.has(at)) continue;
    seen.add(at);
    cells.push(at);
    open ||= exterior.has(at);
    pending.push(...adjacency[at]);
  }
  return { cells, open };
}

function pressureComponents(fluid, faces) {
  const { adjacency, exterior } = connectivity(fluid, faces);
  const seen = new Set(),
    components = [],
    fixed = Int8Array.from(fluid, (value) => !value);
  for (let i = 0; i < fluid.length; i++) {
    if (!fluid[i] || seen.has(i)) continue;
    const component = traceComponent(i, adjacency, exterior, seen);
    if (!component.open) fixed[Math.min(...component.cells)] = 1;
    components.push(component);
  }
  return { components, fixed };
}

export function compileGeometry({
  size,
  origin,
  spacing,
  open,
  solid,
  walls,
  viscosity,
  thermalDiffusivity,
  tracerDiffusivity,
  buoyancy,
}) {
  const volume = product(spacing),
    area = spacing.map((h) => volume / h),
    openings = new Set(open);
  const { fluid, cells } = cellsOf(size, origin, spacing, new Set(solid));
  const { faces, lookup } = facesOf(
    size,
    origin,
    spacing,
    area,
    fluid,
    openings,
    new Set(walls),
  );
  return {
    dimensions: 3,
    n: fluid.length,
    size,
    origin,
    volume,
    metric: { spacing, volume, area },
    verticalAxis: 1,
    fluid,
    cells,
    faces,
    viscosity,
    thermalDiffusivity,
    tracerDiffusivity,
    buoyancy,
    ...stencilsOf(size, faces, lookup),
    ...pressureComponents(fluid, faces),
  };
}
