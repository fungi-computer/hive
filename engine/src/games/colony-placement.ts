import type { PlacementAlignment } from "../sdk/placement";

/** Goblin's local art and placement policy, consumed by command and preview. */
export const colonyPlacement: Readonly<Record<string, {
  readonly visual: string;
  readonly alignment: PlacementAlignment;
}>> = {
  "timber-floor": { visual: "colony.floor.finished", alignment: "fixed" },
  "timber-wall": { visual: "colony.wall.finished", alignment: "stroke" },
  "timber-stair": { visual: "colony.stair.finished", alignment: "fixed" },
};
