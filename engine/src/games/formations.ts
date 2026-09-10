import { z } from "zod";
import { command, component, entity, query, system } from "../sdk/authoring";
import { Destination, Position, MaterialLot, encodeDefinition, move } from "../sdk/common";
import { Collider, Launcher, launch, displace } from "../sdk/combat";
import type { EntityId, GamePack } from "../contracts";

export const FormationMember = component<{ group: EntityId; slot: number }>(
  "formations.member",
  { version: 1, fields: { group: "entity", slot: "number" } },
);
export const Morale = component<{ value: number }>("formations.morale", {
  version: 1,
  fields: { value: "number" },
});
export const Health = component<{ value: number }>("formations.health", {
  version: 1, fields: { value: "number" },
});
const cannonId = entity("formations.cannon");
const ammunitionId = entity("formations.ammunition");
export const cannonDamage = system({
  id: "formations.cannon-damage", version: 1, consumesImpacts: true,
  reads: [Health, Morale], writes: [Health, Morale],
  run(ctx) {
    const victims = new Map(ctx.query(query(Health, Morale)).map(row => [row.id, {
      health: row.get(Health).value, morale: row.get(Morale).value,
    }]));
    const changed = new Set<EntityId>();
    for (const impact of ctx.impacts) {
      const victim = victims.get(impact.targetId);
      if (!victim) continue;
      victim.health = Math.max(0, victim.health - 20);
      victim.morale = Math.max(0, victim.morale - 30);
      changed.add(impact.targetId);
      const speed = Math.hypot(impact.velocity.x, impact.velocity.z);
      if (speed > 0) ctx.action(displace(impact.targetId, {
        x: impact.velocity.x / speed * 0.75, y: 0, z: impact.velocity.z / speed * 0.75,
      }));
    }
    for (const id of changed) {
      const victim = victims.get(id)!;
      ctx.write(Health, id, { value: victim.health });
      ctx.write(Morale, id, { value: victim.morale });
    }
  },
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
  { id: cannonId, components: {
    "hive.position": { x: -3, y: 0, z: 0, facing: 0 },
    "hive.container": { capacity: 6 },
    "hive.visual": { sprite: "formation.cannon", label: "Timber cannon" },
    "hive.launcher": { ammoKind: "iron-round", muzzleX: 0.9, muzzleY: 0.45, muzzleZ: 0,
      maxSpeed: 12, projectileRadius: 0.22, maxRange: 20, maxLifetime: 4,
      projectileSprite: "formation.cannonball", projectileLabel: "Iron round" },
  } },
  { id: ammunitionId, components: {
    "hive.lot": { kind: "iron-round", quantity: 6, container: cannonId },
  } },
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
      "formations.health": { value: 100 },
      "hive.collider": { shape: "ball", radius: 0.5, halfX: 0, halfY: 0, halfZ: 0, yaw: 0 },
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
    FormationSettings, Health, Collider, Launcher, MaterialLot,
  ],
  systems: [cannonDamage, formations],
  commands: {
    fire: command({ reads: [Launcher, MaterialLot], writes: [], run(context, raw) {
      z.object({}).strict().parse(raw);
      const cannon = context.query(query(Launcher)).find(row => row.id === cannonId);
      const stock = context.query(query(MaterialLot)).find(row => row.id === ammunitionId)?.get(MaterialLot);
      if (!cannon || !stock || stock.quantity < 1) throw new Error("No cannon rounds remain");
      return { actions: [launch(cannonId, ammunitionId, { x: 8, y: 0, z: 0 })], writes: [] };
    } }),
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
    [Position, Destination, FormationMember, Morale, FormationSettings, Health, Collider, Launcher, MaterialLot],
    formationInitial,
  ),
  presentation: {
    controls: [
      { id: "fire-cannon", label: "Fire cannon", command: "fire", input: {} },
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
        { id: "cannon-rounds", label: "Cannon rounds", value: context.query(query(MaterialLot)).find(row => row.id === ammunitionId)?.get(MaterialLot).quantity ?? 0 },
        { id: "lowest-health", label: "Lowest health", value: Math.min(...context.query(query(Health)).map(row => row.get(Health).value)) },
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
