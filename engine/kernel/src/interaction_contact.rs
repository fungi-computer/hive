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

/// Deterministic terrain-cell offsets whose cell centers can be within transfer
/// reach of another cell center. The caller still validates each resulting
/// navigation node and the exact container-to-point distance.
pub fn standing_offsets(spacing: [f64; 3]) -> Result<Vec<[i64; 3]>, &'static str> {
    if spacing.iter().any(|value| !value.is_finite() || *value <= 0.0) {
        return Err("invalid interaction cell spacing");
    }
    let bounds = spacing.map(|value| (TRANSFER_REACH_METRES / value).ceil() as i64);
    let mut offsets = Vec::new();
    for dy in -bounds[1]..=bounds[1] {
        for dx in -bounds[0]..=bounds[0] {
            for dz in -bounds[2]..=bounds[2] {
                let point = [dx as f64 * spacing[0], dy as f64 * spacing[1], dz as f64 * spacing[2]];
                if within_transfer_reach([0.0; 3], point) { offsets.push([dx, dy, dz]); }
            }
        }
    }
    Ok(offsets)
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


    #[test]
    fn standing_offsets_include_diagonal_and_vertical_cells_without_far_cells() {
        let offsets = standing_offsets([1.0, 0.54, 1.0]).unwrap();
        assert!(offsets.contains(&[1, 0, 1]));
        assert!(offsets.contains(&[0, 2, 0]));
        assert!(!offsets.contains(&[2, 0, 0]));
        assert_eq!(offsets[0], [-1, -2, 0]);
        assert_eq!(offsets, standing_offsets([1.0, 0.54, 1.0]).unwrap());
    }
}
