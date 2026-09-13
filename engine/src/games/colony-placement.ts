import type { CardinalOrientation } from "../contracts";
import type { PlacementAlignment } from "../sdk/placement";

const facing = Object.freeze({ south: 0, east: 1, north: 2, west: 3 });

/** Goblin's local art and placement policy, consumed by command and preview. */
export const colonyPlacement: Readonly<Record<string, {
  readonly visual: string;
  readonly alignment: PlacementAlignment;
  readonly facing: Readonly<Record<CardinalOrientation, number>>;
}>> = {
  "timber-floor": { visual: "colony.floor.finished", alignment: "fixed", facing },
  "timber-wall": { visual: "colony.wall.finished", alignment: "stroke", facing },
  "timber-stair": { visual: "colony.stair.finished", alignment: "fixed", facing },
};
