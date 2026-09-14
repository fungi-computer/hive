import type { EdgeTarget, EntityId } from "../contracts";

export interface EdgeEndpointAdjacency {
  readonly tangent: boolean;
  readonly perpendicular: number;
}

export interface EdgeAdjacency {
  readonly negative: EdgeEndpointAdjacency;
  readonly positive: EdgeEndpointAdjacency;
}

type EdgeRow = { readonly id: EntityId; readonly edge: EdgeTarget };

function endpoints(edge: EdgeTarget): readonly [string, string] {
  const [x, y, z] = edge.cell;
  return edge.axis === "x"
    ? [`${2 * x + 1}:${y}:${2 * z - 1}`, `${2 * x + 1}:${y}:${2 * z + 1}`]
    : [`${2 * x - 1}:${y}:${2 * z + 1}`, `${2 * x + 1}:${y}:${2 * z + 1}`];
}

/** Index edge endpoints once; art, preview, and picking can share the result. */
export function edgeAdjacency(rows: readonly EdgeRow[]): ReadonlyMap<EntityId, EdgeAdjacency> {
  const incident = new Map<string, EdgeRow[]>();
  for (const row of rows) for (const endpoint of endpoints(row.edge)) {
    const at = incident.get(endpoint) ?? [];
    at.push(row);
    incident.set(endpoint, at);
  }
  return new Map(rows.map(row => {
    const atEndpoint = (endpoint: string): EdgeEndpointAdjacency => {
      const others = (incident.get(endpoint) ?? []).filter(other => other.id !== row.id);
      return Object.freeze({
        tangent: others.some(other => other.edge.axis === row.edge.axis),
        perpendicular: others.filter(other => other.edge.axis !== row.edge.axis).length,
      });
    };
    const [negative, positive] = endpoints(row.edge);
    return [row.id, Object.freeze({ negative: atEndpoint(negative), positive: atEndpoint(positive) })] as const;
  }));
}

export function edgeJoinVariant(adjacency: EdgeAdjacency | undefined): "end" | "straight" | "corner" | "t" | "cross" {
  if (!adjacency) return "end";
  const degrees = [adjacency.negative, adjacency.positive].map(endpoint => 1 + Number(endpoint.tangent) + endpoint.perpendicular);
  if (degrees.some(degree => degree >= 4)) return "cross";
  if (degrees.some(degree => degree === 3)) return "t";
  if ([adjacency.negative, adjacency.positive].some(endpoint => endpoint.perpendicular > 0)) return "corner";
  if ([adjacency.negative, adjacency.positive].some(endpoint => endpoint.tangent)) return "straight";
  return "end";
}
