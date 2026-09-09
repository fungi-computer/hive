/** Reject unresolved arithmetic using operand-scale IEEE roundoff only. The
 * whole-state balance tolerance is not permission to lose a small transfer. */
export function changeQuantity(before, delta) {
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
    throw new TypeError(
      "quantity change lost at current arithmetic resolution",
    );
  return after;
}
