import { z } from "zod";
import { command, component, entity, query, system } from "../sdk/authoring";
import { Destination, Position, encodeDefinition, move } from "../sdk/common";
import type { EntityId, GamePack } from "../contracts";

export const FormationMember = component<{ group: EntityId; slot: number }>(
  "formations.member",
  { version: 1, fields: { group: "entity", slot: "number" } },
);
export const Morale = component<{ value: number }>("formations.morale", {
  version: 1,
  fields: { value: "number" },
});
export const FormationSettings = component<{
  facing: number;
  retreatBelow: number;
}>("formations.settings", {
  version: 1,
  fields: { facing: "number", retreatBelow: "number" },
});
export const formations = system({
  id: "formations.retreat",
  version: 1,
  reads: [FormationMember, Morale, Position, FormationSettings],
  run(ctx) {
    for (const unit of ctx.query(query(FormationMember, Morale, Position))) {
      const morale = unit.get(Morale);
      const settings = ctx
        .query(query(FormationSettings))[0]
        ?.get(FormationSettings);
      if (settings && morale.value < settings.retreatBelow)
        ctx.action(
          move(unit.id, { x: -4, y: 0, z: -4, frame: null }, settings.facing),
        );
    }
  },
});
const groupId = entity("formations.group.1");
const formationInitial = [
  {
    id: groupId,
    components: {
      "formations.settings": { facing: 0, retreatBelow: 25 },
      "hive.obstacle": { occupied: true },
      "hive.position": { x: 2, y: 0, z: 1, facing: 0 },
      "hive.visual": { sprite: "crate", label: "Obstacle" },
    },
  },
  ...[1, 2, 3].map((slot) => ({
    id: entity(`formations.unit.${slot}`),
    components: {
      "hive.position": { x: slot, y: 0, z: 0, facing: 0 },
      "hive.body": { speed: 1.5 },
      "hive.visual": { sprite: "goblin.soldier", label: `Unit ${slot}` },
      "formations.member": { group: groupId, slot },
      "formations.morale": { value: 80 },
    },
  })),
];
export const formationsPack: GamePack = {
  id: "formations",
  version: 1,
  components: [
    Position,
    Destination,
    FormationMember,
    Morale,
    FormationSettings,
  ],
  systems: [formations],
  commands: {
    march: command({
      reads: [FormationMember, FormationSettings],
      writes: [],
      run(context, raw) {
        const order = z
          .object({
            entities: z.array(z.string()).min(1).max(128),
            destination: z
              .object({
                x: z.number().finite(),
                y: z.number().finite(),
                z: z.number().finite(),
                frame: z.null(),
              })
              .strict(),
            facing: z.number().int().min(0).max(3).optional(),
          })
          .strict()
          .parse(raw);
        const requested = new Set(order.entities);
        const facing =
          order.facing ??
          context.query(query(FormationSettings))[0]?.get(FormationSettings)
            .facing ??
          0;
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
        return {
          actions: members.map((member, index) =>
            (() => {
              const ox = (index % columns) - Math.floor(columns / 2);
              const oz = Math.floor(index / columns);
              const rotated =
                facing === 1
                  ? { x: -oz, z: ox }
                  : facing === 2
                    ? { x: -ox, z: -oz }
                    : facing === 3
                      ? { x: oz, z: -ox }
                      : { x: ox, z: oz };
              return move(
                member.id,
                {
                  x: order.destination.x + rotated.x,
                  y: order.destination.y,
                  z: order.destination.z + rotated.z,
                  frame: order.destination.frame,
                },
                facing,
              );
            })(),
          ),
          writes: [],
        };
      },
    }),
    setFacing: command({
      reads: [FormationSettings],
      writes: [FormationSettings],
      run: (context, input) => {
        const facing = (input as { facing?: unknown } | null)?.facing;
        if (
          typeof facing !== "number" ||
          !Number.isInteger(facing) ||
          facing < 0 ||
          facing > 3
        )
          throw new Error("facing must be 0..3");
        const current = context
          .query(query(FormationSettings))[0]
          ?.get(FormationSettings);
        return {
          actions: [],
          writes: [
            {
              component: FormationSettings.id,
              entity: groupId,
              value: { facing, retreatBelow: current?.retreatBelow ?? 25 },
            },
          ],
        };
      },
    }),
    setRetreatThreshold: command({
      reads: [FormationSettings],
      writes: [FormationSettings],
      run: (context, input) => {
        const retreatBelow = (input as { retreatBelow?: unknown } | null)
          ?.retreatBelow;
        if (
          typeof retreatBelow !== "number" ||
          (retreatBelow !== 25 && retreatBelow !== 90)
        )
          throw new Error("retreat threshold must be 25 or 90");
        const current = context
          .query(query(FormationSettings))[0]
          ?.get(FormationSettings);
        return {
          actions: [],
          writes: [
            {
              component: FormationSettings.id,
              entity: groupId,
              value: { facing: current?.facing ?? 0, retreatBelow },
            },
          ],
        };
      },
    }),
  },
  definition: encodeDefinition(
    "formations",
    [Position, Destination, FormationMember, Morale, FormationSettings],
    formationInitial,
  ),
  presentation: {
    controls: [
      {
        id: "facing-0",
        label: "Face north",
        command: "setFacing",
        input: { facing: 0 },
      },
      {
        id: "facing-1",
        label: "Face east",
        command: "setFacing",
        input: { facing: 1 },
      },
      {
        id: "facing-2",
        label: "Face south",
        command: "setFacing",
        input: { facing: 2 },
      },
      {
        id: "facing-3",
        label: "Face west",
        command: "setFacing",
        input: { facing: 3 },
      },
      {
        id: "retreat-25",
        label: "Retreat at 25",
        command: "setRetreatThreshold",
        input: { retreatBelow: 25 },
      },
      {
        id: "retreat-90",
        label: "Retreat at 90",
        command: "setRetreatThreshold",
        input: { retreatBelow: 90 },
      },
    ],
    inspect: (context) => {
      const settings = context
        .query(query(FormationSettings))[0]
        ?.get(FormationSettings);
      const morale = context
        .query(query(Morale))
        .map((row) => row.get(Morale).value);
      return [
        {
          id: "formation-facing",
          label: "Facing",
          value: settings?.facing ?? 0,
        },
        {
          id: "retreat-threshold",
          label: "Retreat threshold",
          value: settings?.retreatBelow ?? 25,
        },
        {
          id: "lowest-morale",
          label: "Lowest morale",
          value: morale.length ? Math.min(...morale) : 0,
        },
      ];
    },
  },
};
