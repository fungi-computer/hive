import type { EntityId, ReadContext, RenderFact } from "../contracts";
import { query } from "../sdk/authoring";
import { MaterialLot } from "../sdk/common";
import { DeliveryTask } from "../sdk/delivery";

const MAX_ITEMS_PER_ENTITY = 8;
const MAX_TEXT = 128;

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT
    ? value
    : fallback;
}

/** Decorates render facts from canonical lot custody and shared delivery state. */
export function decorateDeliveryFacts(
  facts: readonly RenderFact[],
  context: Pick<ReadContext, "query">,
): readonly RenderFact[] {
  const visible = new Set(facts.map((fact) => fact.id));
  const tasks = [...context.query(query(DeliveryTask))].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const actors = new Set<EntityId>(
    tasks
      .map((row) => row.get(DeliveryTask).actor)
      .filter((actor): actor is EntityId => actor !== null && visible.has(actor)),
  );
  const inventory = new Map<string, Map<string, number>>();
  const lotRows = context.query(query(MaterialLot));
  for (const row of lotRows) {
    const lot = row.get(MaterialLot);
    if (!actors.has(lot.container) || !Number.isFinite(lot.quantity)) continue;
    const byKind = inventory.get(lot.container) ?? new Map<string, number>();
    byKind.set(lot.kind, (byKind.get(lot.kind) ?? 0) + lot.quantity);
    inventory.set(lot.container, byKind);
  }
  const activity = new Map<string, RenderFact["activity"]>();
  for (const row of tasks) {
    const task = row.get(DeliveryTask);
    if (task.actor === null || !visible.has(task.actor) || activity.has(task.actor)) continue;
    const lot = lotRows.find((candidate) => candidate.id === task.sourceLot)?.get(MaterialLot);
    activity.set(task.actor, {
      kind: "delivery",
      phase: text(task.phase, "unknown"),
      material: text(lot?.kind, text(task.material, "unknown")),
      quantity: Number.isFinite(task.quantity) ? task.quantity : 0,
    });
  }
  return facts.map((fact) => {
    const byKind = inventory.get(fact.id);
    const entries = byKind
      ? [...byKind.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      : [];
    const items = entries.slice(0, MAX_ITEMS_PER_ENTITY).map(([kind, quantity]) => ({
      kind: text(kind, "unknown"),
      quantity,
    }));
    const carried = activity.get(fact.id);
    return byKind || carried
      ? {
          ...fact,
          ...(byKind
            ? {
                inventory: {
                  items,
                  ...(entries.length > MAX_ITEMS_PER_ENTITY ? { overflow: true } : {}),
                },
              }
            : {}),
          ...(carried ? { activity: carried } : {}),
        }
      : fact;
  });
}
