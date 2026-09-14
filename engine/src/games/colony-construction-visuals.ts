import type { ReadContext } from "../contracts";
import { query } from "../sdk/authoring";
import { ConstructionSite, constructionTarget } from "../sdk/construction";
import { edgeAdjacency, edgeJoinVariant } from "../sdk/edge-connections";
import { colonyEnvironment } from "./colony-environment";
import { colonyPlacement } from "./colony-placement";

type Shape = (typeof colonyEnvironment.structures.catalog)[number]["shape"];

function visualGeometry(shape: Shape, y: number) {
  switch (shape.kind) {
    case "wall": return { top: y + shape.height - 1, surface: y - 0.5 };
    case "fixture": return { top: y, surface: y - 0.5 };
    case "stair": return { top: y + shape.rise, surface: y + 0.5 };
    default: return { top: y, surface: y + 0.5 };
  }
}

/** Original building art follows canonical sites; visual joints grant no support. */
export function colonyConstructionVisuals(context: Pick<ReadContext, "query">) {
  const sites = context.query(query(ConstructionSite)).map(row => {
    const site = row.get(ConstructionSite);
    const definition = colonyEnvironment.structures.catalog.find(item => item.id === site.catalog);
    if (!definition) throw new Error("Missing construction visual definition");
    return { id: row.id, site, target: constructionTarget(site), shape: definition.shape };
  });
  const wallEdges = sites.flatMap(({ id, target, shape }) => (shape.kind === "wall" || shape.kind === "aperture") && target.kind === "edge"
    ? [{ id, edge: { cell: [target.edge.cell.x, target.edge.cell.y, target.edge.cell.z] as const, axis: target.edge.axis } }]
    : []);
  const joins = edgeAdjacency(wallEdges);
  return sites.map(({ id, site, target, shape }) => {
    const stage = site.phase === "finished" ? "finished" : site.seconds > 0 ? "frame" : "stakes";
    if (shape.kind === "wall" || shape.kind === "aperture") {
      if (target.kind !== "edge") throw new Error("Wall visual requires an edge target");
      const { cell, axis } = target.edge;
      const visualRoot = colonyPlacement[site.catalog]?.visual.replace(/\.finished$/, "");
      if (!visualRoot) throw new Error("Missing edge structure placement policy");
      return { id, cutawayTop: cell.y + shape.height - 1, visual: `${visualRoot}.${stage}.${edgeJoinVariant(joins.get(id))}.${axis}`, label: `${site.catalog} · ${site.phase}`, pickable: true,
        pose: { position: { x: cell.x + (axis === "x" ? 0.5 : 0), y: (cell.y - 0.5) * colonyEnvironment.world.verticalMetres, z: cell.z + (axis === "z" ? 0.5 : 0) }, facing: 0 } };
    }
    if (target.kind !== "cell") throw new Error("Cell structure visual requires a cell target");
    const { cell, orientation } = target;
    const facing = colonyPlacement[site.catalog].facing[orientation];
    const geometry = visualGeometry(shape, cell.y);
    const visual = colonyPlacement[site.catalog].visual.replace(".finished", `.${stage}`);
    const placement = shape.kind === "fixture"
      ? { kind: "footprint" as const, footprint: shape.footprint, orientation }
      : shape.kind === "stair"
        ? { kind: "stair" as const, entrance: [0, 0, 0] as const, landing: [0, shape.rise * colonyEnvironment.world.verticalMetres, -shape.run] as const, orientation }
        : undefined;
    return { id, cutawayTop: geometry.top, visual, label: `${site.catalog} · ${site.phase}`, pickable: true, ...(placement ? { placement } : {}),
      pose: { position: { x: cell.x, y: geometry.surface * colonyEnvironment.world.verticalMetres, z: cell.z }, facing } };
  });
}
