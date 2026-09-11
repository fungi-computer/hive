/// The arithmetic owner rejects a transfer when either operand cannot
/// represent its signed change at its own scale. A state-wide tolerance is
/// deliberately not used to authorize one-sided quantity changes.
pub(crate) fn resolve_quantity_change(before: f64, delta: f64) -> Result<Option<f64>, String> {
    let after = before + delta;
    if !before.is_finite() || !delta.is_finite() || !after.is_finite() {
        return Err("quantity change must be finite".into());
    }
    if delta == 0.0 {
        return Ok(Some(before));
    }
    let represented = after - before;
    let error = represented - delta;
    let uncertainty = 4.0 * f64::EPSILON * before.abs().max(after.abs()).max(delta.abs());
    if represented.signum() == delta.signum()
        && uncertainty < delta.abs()
        && error.abs() <= uncertainty
    {
        Ok(Some(after))
    } else {
        Ok(None)
    }
}
