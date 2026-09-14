//! Shared geometric predicates for physical interactions.

/// Native transfer reach in world metres. Queries and final admission must
/// use this same bound; callers cannot widen it through authored input.
pub const TRANSFER_REACH_METRES: f64 = 1.5;

#[inline]
pub fn within_transfer_reach(a: [f64; 3], b: [f64; 3]) -> bool {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx.mul_add(dx, dy.mul_add(dy, dz * dz)) <= TRANSFER_REACH_METRES * TRANSFER_REACH_METRES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_reach_is_inclusive_and_three_dimensional() {
        assert!(within_transfer_reach([0.0, 0.0, 0.0], [1.5, 0.0, 0.0]));
        assert!(!within_transfer_reach([0.0, 0.0, 0.0], [1.500001, 0.0, 0.0]));
        assert!(!within_transfer_reach([0.0, 0.0, 0.0], [1.0, 1.0, 1.0]));
    }
}
