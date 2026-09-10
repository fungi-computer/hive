//! Bounded first-shot policy shared by the native world owner.
//!
//! Geometry remains in `collision`; this module owns projectile accounting
//! limits and interval clipping before a sweep is attempted.

pub const MAX_ACTIVE_PROJECTILES: usize = 256;
pub const MAX_IMPACTS_PER_STEP: usize = 256;

pub fn sweep_interval(
    delta: f64,
    age: f64,
    distance: f64,
    speed: f64,
    max_lifetime: f64,
    max_range: f64,
) -> Result<f64, &'static str> {
    if !delta.is_finite()
        || !age.is_finite()
        || !distance.is_finite()
        || !speed.is_finite()
        || !max_lifetime.is_finite()
        || !max_range.is_finite()
        || delta < 0.0
        || age < 0.0
        || distance < 0.0
        || speed < 0.0
        || max_lifetime <= 0.0
        || max_range <= 0.0
    {
        return Err("invalid projectile interval");
    }
    let lifetime = (max_lifetime - age).max(0.0);
    let range = if speed > 0.0 {
        ((max_range - distance) / speed).max(0.0)
    } else if distance < max_range {
        f64::INFINITY
    } else {
        0.0
    };
    Ok(delta.min(lifetime).min(range))
}

#[cfg(test)]
mod tests {
    use super::sweep_interval;

    #[test]
    fn clips_to_lifetime_and_range_before_cast() {
        assert!((sweep_interval(1.0, 0.8, 9.0, 10.0, 1.0, 20.0).unwrap() - 0.2).abs() < 1e-12);
        assert!((sweep_interval(1.0, 0.0, 9.5, 10.0, 2.0, 10.0).unwrap() - 0.05).abs() < 1e-12);
    }

    #[test]
    fn rejects_non_finite_or_negative_state() {
        assert_eq!(sweep_interval(f64::NAN, 0.0, 0.0, 1.0, 1.0, 1.0), Err("invalid projectile interval"));
        assert_eq!(sweep_interval(1.0, -1.0, 0.0, 1.0, 1.0, 1.0), Err("invalid projectile interval"));
    }
}
