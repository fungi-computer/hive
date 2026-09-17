import type { CardinalOrientation } from "../contracts";
import type { PlacementAlignment } from "../sdk/placement";
import { compileBuildable } from "../sdk/construction";
import { TimberBedActor, TimberFloorActor, TimberWallActor } from "./colony-actors";

const facing = Object.freeze({ south: 0, east: 1, north: 2, west: 3 });
const axialFacing = Object.freeze({ south: 0, east: 1, north: 0, west: 1 });
const buildablePresentation = (definition: typeof TimberBedActor) => {
  const compiled = compileBuildable(definition);
  if (!compiled?.visual || !compiled.placement.facing)
    throw new Error(`${definition.id} presentation is incomplete`);
  return { visual: compiled.visual.sprite, alignment: compiled.placement.alignment, facing: compiled.placement.facing };
};

/** Goblin's local art and placement policy, consumed by command and preview. */
export const colonyPlacement: Readonly<Record<string, {
  readonly visual: string;
  readonly alignment: PlacementAlignment;
  readonly facing: Readonly<Record<CardinalOrientation, number>>;
}>> = {
  "timber-floor": buildablePresentation(TimberFloorActor),
  "timber-wall": buildablePresentation(TimberWallActor),
  "timber-door": { visual: "colony.door.finished", alignment: "stroke", facing },
  "timber-stair": { visual: "colony.stair.finished", alignment: "fixed", facing },
  "timber-roof": { visual: "colony.roof.finished", alignment: "fixed", facing: axialFacing },
  "timber-bed": buildablePresentation(TimberBedActor),
  "timber-shelf": { visual: "colony.shelf.finished", alignment: "fixed", facing: axialFacing },
  "brew-station": { visual: "colony.brew-station.finished", alignment: "fixed", facing: axialFacing },
};
