import { component, entity, query, system } from "../sdk/authoring";
import {
  Destination,
  Position,
  Selected,
  encodeDefinition,
  move,
} from "../sdk/common";
import type { EntityId, GamePack } from "../contracts";

export const FormationMember = component<{ group: EntityId; slot: number }>(
  "formations.member",
  { version: 1, fields: { group: "entity", slot: "number" } },
);
export const Morale = component<{ value: number; retreatBelow: number }>(
  "formations.morale",
  { version: 1, fields: { value: "number", retreatBelow: "number" } },
);
export const formations = system({
  id: "formations.retreat",
  version: 1,
  reads: [FormationMember, Morale, Position],
  run(ctx) {
    for (const unit of ctx.query(query(FormationMember, Morale, Position))) {
      const morale = unit.get(Morale),
        member = unit.get(FormationMember);
      if (morale.value < morale.retreatBelow)
        ctx.action(move(unit.id, { x: -4, y: 0, z: -4 }, 0));
    }
  },
});
const groupId = entity("formations.group.1");
const formationInitial = [
  { id: groupId, components: {} },
  ...[1, 2, 3].map((slot) => ({
    id: entity(`formations.unit.${slot}`),
    components: {
      "hive.position": { x: slot, y: 0, z: 0, facing: 0 },
      "hive.body": { speed: 1.5 },
      "hive.visual": { sprite: "goblin.soldier", label: `Unit ${slot}` },
      "formations.member": { group: groupId, slot },
      "formations.morale": { value: 80, retreatBelow: 25 },
    },
  })),
];
export const formationsPack: GamePack = {
  id: "formations",
  version: 1,
  components: [Position, Destination, Selected, FormationMember, Morale],
  systems: [formations],
  definition: encodeDefinition(
    "formations",
    [Position, Destination, Selected, FormationMember, Morale],
    formationInitial,
  ),
};
