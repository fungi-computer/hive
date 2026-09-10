/** Reject unresolved arithmetic using operand-scale IEEE roundoff only. The
 * whole-state balance tolerance is not permission to lose a small transfer. */
export class UnresolvedQuantityError extends TypeError {
  constructor() {
    super("quantity change lost at current arithmetic resolution");
    this.name = "UnresolvedQuantityError";
  }
}
/** Resolve a candidate without throwing for ordinary sub-resolution deferral.
 * Invalid/non-finite operands still fail; no caller may publish the other side
 * of a transfer when this returns null. */
export function resolveQuantityChange(before, delta) {
  const after = before + delta;
  if (!(
    Number.isFinite(before) &&
    Number.isFinite(delta) &&
    Number.isFinite(after)
  ))
    throw new TypeError("finite representable quantity change");
  if (delta === 0) return before;
  const represented = after - before;
  const error = represented - delta;
  const uncertainty =
    4 *
    Number.EPSILON *
    Math.max(Math.abs(before), Math.abs(after), Math.abs(delta));
  if (!(
    Math.sign(represented) === Math.sign(delta) &&
    uncertainty < Math.abs(delta) &&
    Math.abs(error) <= uncertainty
  ))
    return null;
  return after;
}

export function changeQuantity(before, delta) {
  const after = resolveQuantityChange(before, delta);
  if (after === null) throw new UnresolvedQuantityError();
  return after;
}

/** Sum physical quantities while retaining small terms beside large stocks. */
export function compensatedSum(values) {
  let total = 0,
    correction = 0;
  for (const value of values) {
    const next = total + value;
    correction +=
      Math.abs(total) >= Math.abs(value)
        ? total - next + value
        : value - next + total;
    total = next;
  }
  return total + correction;
}
