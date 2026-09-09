import { z } from "zod";

export type Coordinate = readonly [number, number, number];
export type Bounds = { readonly min: Coordinate; readonly max: Coordinate };
export type Axis = "x" | "y" | "z";
export type SolidGeometry = {
  readonly bounds: Bounds;
  solidAt(x: number, y: number, z: number): boolean;
};
const integer = z.number().int().min(-1_000_000).max(1_000_000);
const coordinate = z.tuple([integer, integer, integer]);
const rectangle = z.tuple([integer, integer]);
const bounds = z
  .strictObject({ min: coordinate, max: coordinate })
  .refine((b) => b.max.every((v, i) => v > b.min[i]), "empty geometry bounds");
const regionBoundsSchema = bounds.refine(
  (b) => b.max.reduce((n, v, i) => n * (v - b.min[i]), 1) <= 1024,
  "region must contain 1..1024 voxels",
);
const primitiveSchema = z.discriminatedUnion("kind", [
  bounds.safeExtend({ kind: z.literal("solid") }),
  z
    .strictObject({
      kind: z.literal("face"),
      axis: z.enum(["x", "y", "z"]),
      at: integer,
      min: rectangle,
      max: rectangle,
    })
    .refine((p) => p.max.every((v, i) => v > p.min[i]), "empty physical face"),
]);
export type PhysicalPrimitive = z.input<typeof primitiveSchema>;
const axes = ["x", "y", "z"] as const;
const cellId = (at: Coordinate) => `cell:${at.join()}`;
const faceId = (axis: Axis, at: Coordinate) => `${axis}:${at.join()}`;
const inside = (at: Coordinate, b: Bounds) =>
  at.every((v, i) => v >= b.min[i] && v < b.max[i]);
const contains = (outer: Bounds, inner: Bounds) =>
  inner.min.every((v, i) => v >= outer.min[i] && inner.max[i] <= outer.max[i]);
function frozenBounds(b: Bounds): Bounds {
  return Object.freeze({
    min: Object.freeze([...b.min]) as Coordinate,
    max: Object.freeze([...b.max]) as Coordinate,
  });
}
function eachCell(b: Bounds, visit: (at: [number, number, number]) => void) {
  for (let x = b.min[0]; x < b.max[0]; x++)
    for (let y = b.min[1]; y < b.max[1]; y++)
      for (let z = b.min[2]; z < b.max[2]; z++) visit([x, y, z]);
}
function clipped(a: Bounds, b: Bounds): Bounds {
  return {
    min: a.min.map((v, i) => Math.max(v, b.min[i])) as unknown as Coordinate,
    max: a.max.map((v, i) => Math.min(v, b.max[i])) as unknown as Coordinate,
  };
}

function registeredPrimitive(p: PhysicalPrimitive, terrain: Bounds): void {
  if (p.kind === "solid") {
    if (!contains(terrain, p))
      throw new Error("physical primitive exceeds registered terrain geometry");
    return;
  }
  const normal = axes.indexOf(p.axis),
    tangent = [0, 1, 2].filter((i) => i !== normal);
  if (
    p.at < terrain.min[normal] ||
    p.at > terrain.max[normal] ||
    p.min.some(
      (v, i) =>
        v < terrain.min[tangent[i]] || p.max[i] > terrain.max[tangent[i]],
    )
  )
    throw new Error("physical primitive exceeds registered terrain geometry");
}

type SolidColumns = Map<string, { min: number; max: number }[]>;
type FacePlanes = Map<Axis, Map<string, Set<number>>>;
function indexSolid(
  columns: SolidColumns,
  p: Extract<PhysicalPrimitive, { kind: "solid" }>,
  domain: Bounds,
  budget: () => void,
) {
  const b = clipped(p, domain);
  if (b.min[1] >= b.max[1]) return;
  for (let x = b.min[0]; x < b.max[0]; x++)
    for (let z = b.min[2]; z < b.max[2]; z++) {
      budget();
      const key = `${x},${z}`,
        intervals = columns.get(key) ?? [];
      intervals.push({ min: b.min[1], max: b.max[1] });
      columns.set(key, intervals);
    }
}
function indexFace(
  closed: FacePlanes,
  p: Extract<PhysicalPrimitive, { kind: "face" }>,
  domain: Bounds,
  budget: () => void,
) {
  const normal = axes.indexOf(p.axis),
    tangent = [0, 1, 2].filter((i) => i !== normal);
  if (p.at < domain.min[normal] || p.at > domain.max[normal]) return;
  for (
    let u = Math.max(p.min[0], domain.min[tangent[0]]);
    u < Math.min(p.max[0], domain.max[tangent[0]]);
    u++
  )
    for (
      let v = Math.max(p.min[1], domain.min[tangent[1]]);
      v < Math.min(p.max[1], domain.max[tangent[1]]);
      v++
    ) {
      budget();
      const key = `${u},${v}`,
        index = closed.get(p.axis)!,
        planes = index.get(key) ?? new Set<number>();
      planes.add(p.at);
      index.set(key, planes);
    }
}

/** Index primitive footprint/face entries independently of vertical world volume. */
function compilePrimitives(
  input: readonly PhysicalPrimitive[],
  domain: Bounds,
  terrainBounds: Bounds,
) {
  const primitives = z.array(primitiveSchema).max(8192).parse(input);
  const columns = new Map<string, { min: number; max: number }[]>();
  const closed = new Map<Axis, Map<string, Set<number>>>(
    axes.map((axis) => [axis, new Map()]),
  );
  let visits = 0;
  const budget = () => {
    if (++visits > 65536)
      throw new Error("physical primitive compilation budget exceeded");
  };
  for (const p of primitives) {
    registeredPrimitive(p, terrainBounds);
    if (p.kind === "solid") indexSolid(columns, p, domain, budget);
    else indexFace(closed, p, domain, budget);
  }
  return { columns, closed };
}

/** Compile a finite read projection. Terrain remains its registered query capability; caller-owned
 * primitives are parsed/copied. No callback or mutable index is exposed/saved. */
export function compilePhysicalGeometry(
  terrain: SolidGeometry,
  requested: Bounds,
  input: readonly PhysicalPrimitive[],
) {
  const domain = bounds.parse(requested),
    terrainBounds = bounds.parse(terrain.bounds);
  if (!contains(terrainBounds, domain))
    throw new Error("region exceeds registered terrain geometry");
  const { columns, closed } = compilePrimitives(input, domain, terrainBounds);
  const terrainSolidAt = terrain.solidAt.bind(terrain);
  const solidAt = (at: Coordinate) =>
    terrainSolidAt(...at) ||
    (columns.get(`${at[0]},${at[2]}`) ?? []).some(
      (interval) => at[1] >= interval.min && at[1] < interval.max,
    );
  const faceClosed = (axis: Axis, at: Coordinate) => {
    const normal = axes.indexOf(axis),
      tangent = [0, 1, 2].filter((i) => i !== normal);
    return (
      closed
        .get(axis)!
        .get(`${at[tangent[0]]},${at[tangent[1]]}`)
        ?.has(at[normal]) ?? false
    );
  };
  function point(input: Coordinate) {
    const at = coordinate.parse(input);
    return inside(at, domain)
      ? solidAt(at)
        ? "solid"
        : "empty"
      : "unresolved";
  }
  function face(axis: Axis, input: Coordinate) {
    const at = coordinate.parse(input),
      normal = axes.indexOf(axis);
    if (normal < 0) throw new Error("invalid physical face axis");
    const known = at.every(
      (v, i) =>
        v >= domain.min[i] &&
        (i === normal ? v <= domain.max[i] : v < domain.max[i]),
    );
    return known ? (faceClosed(axis, at) ? "closed" : "open") : "unresolved";
  }
  function verticalClearance(
    input: Coordinate,
    ambientPlaneY: number,
  ): "clear" | "blocked" | "unresolved" {
    const at = coordinate.parse(input),
      plane = integer.parse(ambientPlaneY);
    if (
      plane < at[1] ||
      plane > domain.max[1] ||
      plane - at[1] > 4096 ||
      !inside(at, domain)
    )
      return "unresolved";
    for (let y = at[1]; y <= plane; y++) {
      if (y < domain.max[1] && solidAt([at[0], y, at[2]])) return "blocked";
      if (y > at[1] && faceClosed("y", [at[0], y, at[2]])) return "blocked";
    }
    return "clear";
  }
  function exterior(
    input: Coordinate,
    axis: Axis,
    direction: -1 | 1,
    ambientPlaneY: number,
  ): "closed" | "outdoor" | "needs-neighbor" {
    const at = coordinate.parse(input),
      normal = axes.indexOf(axis);
    if (normal < 0 || (direction !== -1 && direction !== 1))
      throw new Error("invalid exterior direction");
    if (point(at) === "unresolved") return "needs-neighbor";
    if (point(at) === "solid") return "closed";
    const boundary: [number, number, number] = [...at],
      neighbor: [number, number, number] = [...at];
    if (direction === 1) boundary[normal]++;
    neighbor[normal] += direction;
    if (face(axis, boundary) === "closed" || point(neighbor) === "solid")
      return "closed";
    // The registered upper face itself can be the explicitly declared plane.
    if (
      axis === "y" &&
      direction === 1 &&
      neighbor[1] === ambientPlaneY &&
      ambientPlaneY === domain.max[1]
    )
      return "outdoor";
    // An overhead obstruction is not a wall between these two empty cells.
    return verticalClearance(neighbor, ambientPlaneY) === "clear"
      ? "outdoor"
      : "needs-neighbor";
  }
  function region(requested: Bounds) {
    const b = regionBoundsSchema.parse(requested);
    if (!contains(domain, b))
      throw new Error("region exceeds compiled physical geometry");
    const cells: string[] = [],
      faces: string[] = [];
    eachCell(b, (at) => {
      if (solidAt(at)) cells.push(cellId(at));
    });
    for (const axis of axes) {
      const normal = axes.indexOf(axis),
        tangent = [0, 1, 2].filter((i) => i !== normal);
      for (const [key, planes] of closed.get(axis)!) {
        const values = key.split(",").map(Number);
        if (
          !values.every(
            (v, i) => v >= b.min[tangent[i]] && v < b.max[tangent[i]],
          )
        )
          continue;
        for (const plane of planes)
          if (plane >= b.min[normal] && plane <= b.max[normal]) {
            const at: [number, number, number] = [0, 0, 0];
            at[normal] = plane;
            at[tangent[0]] = values[0];
            at[tangent[1]] = values[1];
            faces.push(faceId(axis, at));
          }
      }
    }
    return Object.freeze({
      bounds: frozenBounds(b),
      solidCellIds: Object.freeze(cells.sort()),
      closedFaceIds: Object.freeze(faces.sort()),
    });
  }
  function boundary(requested: Bounds, ambientPlaneY: number) {
    const b = regionBoundsSchema.parse(requested),
      plane = integer.parse(ambientPlaneY);
    if (!contains(domain, b))
      throw new Error("region exceeds compiled physical geometry");
    const span = b.max.map((v, i) => v - b.min[i]);
    const faceCount =
      2 * (span[0] * span[1] + span[0] * span[2] + span[1] * span[2]);
    if (faceCount * Math.max(1, plane - b.min[1] + 2) > 65536)
      throw new Error("physical boundary query budget exceeded");
    const result: {
      readonly faceId: string;
      readonly side: `${Axis}${"-" | "+"}`;
      readonly state: "closed" | "outdoor" | "needs-neighbor";
    }[] = [];
    eachCell(b, (at) => {
      for (const [normal, axis] of axes.entries())
        for (const direction of [-1, 1] as const) {
          if (
            at[normal] !==
            (direction === -1 ? b.min[normal] : b.max[normal] - 1)
          )
            continue;
          const faceAt: [number, number, number] = [...at];
          if (direction === 1) faceAt[normal]++;
          result.push(
            Object.freeze({
              faceId: faceId(axis, faceAt),
              side: `${axis}${direction === -1 ? "-" : "+"}` as const,
              state: exterior(at, axis, direction, plane),
            }),
          );
        }
    });
    return Object.freeze(result);
  }
  return Object.freeze({
    bounds: frozenBounds(domain),
    point,
    face,
    verticalClearance,
    exterior,
    region,
    boundary,
  });
}
