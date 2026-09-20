import type { ReadContext } from "../contracts";
import { query } from "../sdk/authoring";
import { ConstructionSite, constructionTarget } from "../sdk/construction";
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
    const stage = site.phase === "finished" ? "finished" as const : site.seconds > 0 ? "frame" as const : "stakes" as const;
    return { id: row.id, site, target: constructionTarget(site), shape: definition.shape, stage };
  });
  return sites.map(({ id, site, target, shape, stage }) => {
    if (shape.kind === "wall" || shape.kind === "aperture") {
      if (target.kind !== "edge") throw new Error("Wall visual requires an edge target");
      const { cell, axis } = target.edge;
      const visualRoot = colonyPlacement[site.catalog]?.visual.replace(/\.finished$/, "");
      if (!visualRoot) throw new Error("Missing edge structure placement policy");
      return { id, cutawayTop: cell.y + shape.height - 1, visual: `${visualRoot}.segment.${stage}.${axis}`, label: `${site.catalog} · ${site.phase}`, pickable: true,
        placement: { kind: "edge" as const, edge: { cell: [cell.x, cell.y, cell.z] as const, axis } },
        pose: { position: { x: cell.x + (axis === "x" ? 0.5 : 0), y: (cell.y - 0.5) * colonyEnvironment.world.verticalMetres, z: cell.z + (axis === "z" ? 0.5 : 0) }, facing: 0 } };
    }
    if (target.kind !== "cell") throw new Error("Cell structure visual requires a cell target");
    const { cell, orientation } = target;
    const facing = colonyPlacement[site.catalog].facing[orientation];
    const geometry = visualGeometry(shape, cell.y);
    const visual = colonyPlacement[site.catalog].visual.replace(".finished", `.${stage}`);
    const datum = colonyPlacement[site.catalog].datum;
    const placement = datum ? { ...datum, orientation } : undefined;
    return { id, cutawayTop: geometry.top, visual, label: `${site.catalog} · ${site.phase}`, pickable: true, ...(placement ? { placement } : {}),
      pose: { position: { x: cell.x, y: geometry.surface * colonyEnvironment.world.verticalMetres, z: cell.z }, facing } };
  });
}
