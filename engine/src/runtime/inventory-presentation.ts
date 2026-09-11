import type { ReadContext, RenderFact } from "../contracts";
import { query } from "../sdk/authoring";
import { MaterialLot } from "../sdk/common";

const MAX_ITEMS_PER_ENTITY = 8;
const MAX_TEXT = 128;

function checkedText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT)
    throw new Error("invalid material lot kind");
  return value;
}

/** Decorates visible entities with their canonical material custody. */
export function decorateInventoryFacts(
  facts: readonly RenderFact[],
  context: Pick<ReadContext, "query">,
): readonly RenderFact[] {
  const visible = new Set(facts.map((fact) => fact.id));
  const inventory = new Map<string, Map<string, number>>();
  for (const row of context.query(query(MaterialLot))) {
    const lot = row.get(MaterialLot);
    if (!Number.isSafeInteger(lot.quantity) || lot.quantity < 0)
      throw new Error("invalid material lot quantity");
    if (lot.quantity === 0 || !visible.has(lot.container)) continue;
    const kind = checkedText(lot.kind);
    const byKind = inventory.get(lot.container) ?? new Map<string, number>();
    const quantity = (byKind.get(kind) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw new Error("material lot quantity overflow");
    byKind.set(kind, quantity);
    inventory.set(lot.container, byKind);
  }
  return facts.map((fact) => {
    const byKind = inventory.get(fact.id);
    if (!byKind) return fact;
    const entries = [...byKind.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return {
      ...fact,
      inventory: {
        items: entries.slice(0, MAX_ITEMS_PER_ENTITY).map(([kind, quantity]) => ({
          kind,
          quantity,
        })),
        ...(entries.length > MAX_ITEMS_PER_ENTITY ? { overflow: true } : {}),
      },
    };
  });
}
