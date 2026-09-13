import type { ReadContext } from "../contracts";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { gridConnectionMasks } from "../sdk/grid-connections";
import { colonyEnvironment } from "./colony-environment";
import { colonyPlacement } from "./colony-placement";

type Shape = (typeof colonyEnvironment.structures.catalog)[number]["shape"];

function visualGeometry(shape: Shape, y: number) {
  switch (shape.kind) {
    case "wall": return { top: y + shape.height - 1, surface: y - 0.5 };
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
    return { id: row.id, site, shape: definition.shape };
  });
  const masks = gridConnectionMasks(sites.filter(({ shape }) => shape.kind === "wall")
    .map(({ id, site }) => ({ id, cell: [site.x, site.y, site.z] })));
  return sites.map(({ id, site, shape }) => {
    const stage = site.phase === "finished" ? "finished" : site.seconds > 0 ? "frame" : "stakes";
    const facing = colonyPlacement[site.catalog].facing[site.orientation];
    const geometry = visualGeometry(shape, site.y);
    const mask = masks.get(id) || (site.orientation === "east" || site.orientation === "west" ? 5 : 10);
    const visual = shape.kind === "wall" ? `colony.wall.${stage}.joint-${mask}` : colonyPlacement[site.catalog].visual.replace(".finished", `.${stage}`);
    return { id, cutawayTop: geometry.top, visual, label: `${site.catalog} · ${site.phase}`,
      pose: { position: { x: site.x, y: geometry.surface * colonyEnvironment.world.verticalMetres, z: site.z }, facing } };
  });
}
