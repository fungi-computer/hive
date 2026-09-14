import type { EdgeTarget, EntityId } from "../contracts";

type EdgeRow = { readonly id: EntityId; readonly edge: EdgeTarget };

export interface EdgeJunction {
  readonly id: string;
  readonly point: readonly [number, number, number];
  /** +x, +z, -x, -z incident segment bits. */
  readonly mask: number;
  readonly incident: readonly EntityId[];
}

type Endpoint = {
  readonly key: string;
  readonly point: readonly [number, number, number];
  readonly direction: 1 | 2 | 4 | 8;
};

function endpoints(edge: EdgeTarget): readonly [Endpoint, Endpoint] {
  const [x, y, z] = edge.cell;
  return edge.axis === "x"
    ? [
        { key: `${2 * x + 1}:${y}:${2 * z - 1}`, point: [x + 0.5, y, z - 0.5], direction: 2 },
        { key: `${2 * x + 1}:${y}:${2 * z + 1}`, point: [x + 0.5, y, z + 0.5], direction: 8 },
      ]
    : [
        { key: `${2 * x - 1}:${y}:${2 * z + 1}`, point: [x - 0.5, y, z + 0.5], direction: 1 },
        { key: `${2 * x + 1}:${y}:${2 * z + 1}`, point: [x + 0.5, y, z + 0.5], direction: 4 },
      ];
}

/**
 * Derive exactly one presentation junction at every occupied grid vertex.
 * The four-bit mask retains the real incident directions; it never becomes a
 * second physical wall, support fact, seal, or mutation owner.
 */
export function edgeJunctions(rows: readonly EdgeRow[]): readonly EdgeJunction[] {
  const vertices = new Map<string, { point: readonly [number, number, number]; mask: number; incident: Set<EntityId> }>();
  for (const row of rows) for (const endpoint of endpoints(row.edge)) {
    const vertex = vertices.get(endpoint.key) ?? { point: endpoint.point, mask: 0, incident: new Set<EntityId>() };
    vertex.mask |= endpoint.direction;
    vertex.incident.add(row.id);
    vertices.set(endpoint.key, vertex);
  }
  return [...vertices.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, vertex]) => Object.freeze({
      id: `presentation.wall-junction:${key}`,
      point: vertex.point,
      mask: vertex.mask,
      incident: Object.freeze([...vertex.incident].sort()),
    }));
}
