import { z } from "zod";
import type { ItemLot, MaterialResult, MaterialsState } from "./types.ts";

const MAX_PORTIONS = 1024;

/** Bounded promises, never another inventory or claim. */
export const materialPortionsSchema = z
  .array(
    z
      .object({
        lot: z.string().min(1),
        quantity: z.number().int().positive(),
      })
      .strict(),
  )
  .min(1)
  .max(MAX_PORTIONS)
  .superRefine((portions, context) => {
    if (
      new Set(portions.map((portion) => portion.lot)).size !== portions.length
    )
      context.addIssue({ code: "custom", message: "duplicate portion lot" });
    if (
      !Number.isSafeInteger(
        portions.reduce((sum, portion) => sum + portion.quantity, 0),
      )
    )
      context.addIssue({ code: "custom", message: "unsafe portion total" });
  });
export type MaterialPortion = z.infer<typeof materialPortionsSchema>[number];
export type Debit<M extends string> = { lot: ItemLot<M>; quantity: number };

/** Preflight shared by physical movement and irreversible sinks. No writes. */
export function planContainerDebit<M extends string>(
  state: MaterialsState<M>,
  input: {
    container: string;
    material: M;
    portions: readonly MaterialPortion[];
    quantity: number;
  },
  availableQuantity: (state: MaterialsState<M>, lot: string) => number,
): MaterialResult<Debit<M>[]> {
  const parsed = materialPortionsSchema.safeParse(input.portions);
  if (
    !parsed.success ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity <= 0 ||
    parsed.data.reduce((sum, portion) => sum + portion.quantity, 0) !==
      input.quantity
  )
    return { ok: false, reason: "invalid-positive-integer" };
  const debits: Debit<M>[] = [];
  for (const portion of parsed.data) {
    const lot = state.lots.find((candidate) => candidate.id === portion.lot);
    if (!lot) return { ok: false, reason: "lot-not-found" };
    if (
      lot.material !== input.material ||
      lot.location.kind !== "container" ||
      lot.location.container !== input.container
    )
      return { ok: false, reason: "source-ineligible" };
    if (availableQuantity(state, lot.id) < portion.quantity)
      return { ok: false, reason: "source-insufficient" };
    debits.push({ lot, quantity: portion.quantity });
  }
  return { ok: true, value: debits };
}

/** Apply only a complete checked plan; every effect after preflight is infallible. */
export function debitContainer<M extends string>(
  state: MaterialsState<M>,
  debits: readonly Debit<M>[],
): void {
  for (const { lot, quantity } of debits) {
    if (lot.quantity === quantity)
      state.lots.splice(state.lots.indexOf(lot), 1);
    else lot.quantity = (lot.quantity - quantity) as ItemLot<M>["quantity"];
  }
}

/** Stable partial selection is advice; mutation always repeats stock/claim checks. */
export function selectContainerPortions<M extends string>(
  state: MaterialsState<M>,
  container: string,
  material: M,
  quantity: number,
  availableQuantity: (state: MaterialsState<M>, lot: string) => number,
): { portions: MaterialPortion[]; quantity: number } {
  const portions: MaterialPortion[] = [];
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    return { portions, quantity: 0 };
  let remaining = quantity;
  const lots = state.lots
    .filter(
      (lot) =>
        lot.material === material &&
        lot.location.kind === "container" &&
        lot.location.container === container,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const lot of lots) {
    if (!remaining || portions.length === MAX_PORTIONS) break;
    const amount = Math.min(remaining, availableQuantity(state, lot.id));
    if (amount > 0) {
      portions.push({ lot: lot.id, quantity: amount });
      remaining -= amount;
    }
  }
  return { portions, quantity: quantity - remaining };
}
