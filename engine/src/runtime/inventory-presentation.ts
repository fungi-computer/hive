import type { EntityId, ReadContext, RenderFact } from "../contracts";
import { query } from "../sdk/authoring";
import { Container, MaterialLot } from "../sdk/common";

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
  const lots = context.query(query(MaterialLot)).map((row) => ({ id: row.id, lot: row.get(MaterialLot) }))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const containers = new Map<string, number>();
  for (const row of context.query(query(Container))) {
    let container: { capacity: number };
    try { container = row.get(Container); } catch { continue; }
    if (!Number.isSafeInteger(container.capacity) || container.capacity < 0)
      throw new Error("invalid container capacity");
    containers.set(row.id, container.capacity);
  }
  const direct = new Map<string, Map<string, number>>();
  const portable = new Map<string, { kind: string; quantity: number; id: EntityId }[]>();
  const containerParents = new Map<string, string>();
  for (const { id, lot } of lots) {
    if (!Number.isSafeInteger(lot.quantity) || lot.quantity < 0)
      throw new Error("invalid material lot quantity");
    if (lot.quantity === 0) continue;
    const kind = checkedText(lot.kind);
    if (containers.has(id)) {
      containerParents.set(id, lot.container);
      const entries = portable.get(lot.container) ?? [];
      entries.push({ kind, quantity: lot.quantity, id });
      portable.set(lot.container, entries);
      continue;
    }
    if (!visible.has(lot.container)) continue;
    const byKind = direct.get(lot.container) ?? new Map<string, number>();
    const quantity = (byKind.get(kind) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw new Error("material lot quantity overflow");
    byKind.set(kind, quantity);
    direct.set(lot.container, byKind);
  }
  for (const id of containerParents.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && containers.has(current)) {
      if (!seen.add(current)) throw new Error("cyclic portable container custody");
      current = containerParents.get(current);
    }
  }
  return facts.map((fact) => {
    const byKind = direct.get(fact.id);
    const ordinary = [...(byKind?.entries() ?? [])].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    const items = [
      ...ordinary.map(([kind, quantity]) => ({ kind, quantity })),
      ...(portable.get(fact.id) ?? []).map(({ kind, quantity, id }) => ({
        kind,
        quantity,
        id,
        container: nestedContainer(id, lots, containers),
      })),
    ];
    if (!items.length) return fact;
    return {
      ...fact,
      inventory: {
        items: items.slice(0, MAX_ITEMS_PER_ENTITY),
        ...(items.length > MAX_ITEMS_PER_ENTITY ? { overflow: true } : {}),
      },
    };
  });
}

function nestedContainer(
  id: EntityId,
  lots: readonly { id: string; lot: { quantity: number; kind: string; container: string } }[],
  containers: ReadonlyMap<string, number>,
) {
  const capacity = containers.get(id);
  if (capacity === undefined) throw new Error("portable container is missing capacity");
  const contents = new Map<string, number>();
  for (const entry of lots) {
    if (entry.lot.container !== id || entry.lot.quantity === 0) continue;
    if (containers.has(entry.id)) throw new Error("nested portable container depth exceeds one");
    const kind = checkedText(entry.lot.kind);
    const quantity = (contents.get(kind) ?? 0) + entry.lot.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("material lot quantity overflow");
    contents.set(kind, quantity);
  }
  const entries = [...contents.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return {
    capacity,
    contents: {
      items: entries.slice(0, MAX_ITEMS_PER_ENTITY).map(([kind, quantity]) => ({ kind, quantity })),
      ...(entries.length > MAX_ITEMS_PER_ENTITY ? { overflow: true } : {}),
    },
  };
}
