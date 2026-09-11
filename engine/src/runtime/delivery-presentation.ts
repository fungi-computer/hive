import type { PresentationFact } from "../presentation";
import type { ReadContext } from "../contracts";
import { query } from "../sdk/authoring";
import { DeliveryTask } from "../sdk/delivery";
import { MaterialLot } from "../sdk/common";

const MAX_TASKS = 8;
const MAX_TEXT = 128;

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT
    ? value
    : fallback;
}

/**
 * Projects the shared delivery owner's committed state for display.
 * Material custody comes from MaterialLot.container; task phase is activity
 * intent. This function never infers a transfer from position or animation.
 */
export function deliveryPresentationFacts(
  context: Pick<ReadContext, "query">,
): readonly PresentationFact[] {
  const tasks = [...context.query(query(DeliveryTask))].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  if (tasks.length > MAX_TASKS)
    throw new Error("delivery presentation task limit exceeded");
  const lots = new Map(
    context
      .query(query(MaterialLot))
      .map((row) => [row.id, row.get(MaterialLot)]),
  );
  const facts: PresentationFact[] = [];
  tasks.forEach((row, index) => {
    const task = row.get(DeliveryTask);
    const lot = lots.get(task.sourceLot);
    const prefix = `delivery-${index + 1}`;
    facts.push(
      {
        id: `${prefix}-phase`,
        label: `Delivery ${index + 1} activity`,
        value: text(task.phase, "unknown"),
      },
      {
        id: `${prefix}-material`,
        label: `Delivery ${index + 1} material`,
        value: text(lot?.kind, text(task.material, "unknown")),
      },
      {
        id: `${prefix}-quantity`,
        label: `Delivery ${index + 1} carried quantity`,
        value: lot?.quantity ?? 0,
      },
      {
        id: `${prefix}-custody`,
        label: `Delivery ${index + 1} custody`,
        value: lot?.container ?? "missing",
      },
    );
  });
  return facts;
}
