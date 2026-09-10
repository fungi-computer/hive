import { z } from "zod";
import { component, entity, query, system } from "../sdk/authoring";
import { Destination, Position, encodeDefinition, move } from "../sdk/common";
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
  components: [Position, Destination, FormationMember, Morale],
  systems: [formations],
  commands: {
    march(context, raw) {
      const order = z
        .object({
          entities: z.array(z.string()).min(1).max(128),
          destination: z
            .object({
              x: z.number().finite(),
              y: z.number().finite(),
              z: z.number().finite(),
            })
            .strict(),
        })
        .strict()
        .parse(raw);
      const requested = new Set(order.entities);
      const members = context
        .query(query(FormationMember))
        .filter((row) => requested.has(row.id))
        .sort(
          (a, b) =>
            a.get(FormationMember).slot - b.get(FormationMember).slot ||
            a.id.localeCompare(b.id),
        );
      if (members.length !== requested.size)
        throw new Error("Select formation members to march");
      const columns = Math.min(3, members.length);
      return members.map((member, index) =>
        move(member.id, {
          x: order.destination.x + (index % columns) - Math.floor(columns / 2),
          y: order.destination.y,
          z: order.destination.z + Math.floor(index / columns),
        }),
      );
    },
  },
  definition: encodeDefinition(
    "formations",
    [Position, Destination, FormationMember, Morale],
    formationInitial,
  ),
};
