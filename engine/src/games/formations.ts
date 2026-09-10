import { component, query, system } from "../sdk/authoring";
import { Destination, Position, Selected, encodeDefinition, groupOrder } from "../sdk/common";
import type { EntityId, GamePack } from "../contracts";

export const FormationMember = component<{ group: EntityId; slot: number }>("formations.member", { version: 1, fields: { group: "entity", slot: "number" } });
export const Morale = component<{ value: number; retreatBelow: number }>("formations.morale", { version: 1, fields: { value: "number", retreatBelow: "number" } });
export const FormationOrder = component<{ group: EntityId; destination: { x: number; y: number }; facing: number }>("formations.order", { version: 1, fields: { group: "entity", destination: "json", facing: "number" } });
export const formations = system({ id: "formations.retreat", version: 1, reads: [FormationMember, Morale, FormationOrder], writes: [Destination], run(ctx) {
  for (const unit of ctx.query(query<{ group: EntityId; slot: number; value: number; retreatBelow: number }>(FormationMember, Morale, FormationOrder))) {
    if (unit.value.value < unit.value.retreatBelow) ctx.action(groupOrder(unit.value.group, { x: -4, y: -4 }, 0));
  }
});
export const formationsPack: GamePack = { id: "formations", version: 1, components: [Position, Destination, Selected, FormationMember, Morale, FormationOrder], systems: [formations], definition: encodeDefinition("formations", [Position, Destination, Selected, FormationMember, Morale, FormationOrder]) };
