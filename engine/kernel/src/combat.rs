//! Bounded first-shot policy shared by the native world owner.
//!
//! Geometry remains in `collision`; this module owns projectile accounting
//! limits and interval clipping before a sweep is attempted.

pub const MAX_ACTIVE_PROJECTILES: usize = 256;
pub const MAX_IMPACTS_PER_STEP: usize = 256;
pub const MAX_PROJECTILE_SUBSTEPS: usize = 50;
pub const PROJECTILE_SUBSTEP_SECONDS: f64 = 0.02;
pub const MAX_CONTACTS_PER_PROJECTILE_STEP: usize = 32;

/// Integrate one bounded ballistic interval.  Both authoritative simulation
/// and the pure preview use this function so elevation cannot drift between
/// the two paths.
pub fn ballistic_interval(
    origin: [f64; 3],
    velocity: [f64; 3],
    gravity: f64,
    delta: f64,
) -> ([f64; 3], [f64; 3]) {
    let end = [
        origin[0] + velocity[0] * delta,
        origin[1] + velocity[1] * delta + 0.5 * gravity * delta * delta,
        origin[2] + velocity[2] * delta,
    ];
    let average = [
        velocity[0],
        velocity[1] + 0.5 * gravity * delta,
        velocity[2],
    ];
    (end, average)
}

pub fn ballistic_velocity(velocity: [f64; 3], gravity: f64, delta: f64) -> [f64; 3] {
    [velocity[0], velocity[1] + gravity * delta, velocity[2]]
}

#[derive(Clone, Debug)]
pub struct ImpactProfile {
    pub response: String,
    pub resistance: f64,
    pub restitution: f64,
    pub friction: f64,
    pub embed_speed: f64,
}

#[derive(Clone, Debug)]
pub struct ProjectileMotion {
    pub velocity: [f64; 3],
    pub penetration: f64,
    pub state: String,
    pub embed_depth: f64,
    pub normal: [f64; 3],
    pub friction: f64,
}

/// Apply one contact response for both the authoritative world and the pure
/// preview.  Returning whether the ball became quiet keeps lifecycle counting
/// with the caller while all material/roll/embed decisions remain one owner.
pub fn resolve_contact(
    motion: &mut ProjectileMotion,
    normal_input: [f64; 3],
    material: &ImpactProfile,
    radius: f64,
) -> bool {
    let normal_len = (normal_input[0] * normal_input[0] + normal_input[1] * normal_input[1] + normal_input[2] * normal_input[2]).sqrt().max(1e-9);
    // Parry's normal1 points out of the moving projectile.  Physical surface
    // response needs the opposite direction: away from the contacted surface
    // and back into the projectile's free space.
    let normal = [-normal_input[0] / normal_len, -normal_input[1] / normal_len, -normal_input[2] / normal_len];
    motion.normal = normal;
    let dot = motion.velocity[0] * normal[0] + motion.velocity[1] * normal[1] + motion.velocity[2] * normal[2];
    let normal_speed = dot.abs();
    let tangent = [motion.velocity[0] - normal[0] * dot, motion.velocity[1] - normal[1] * dot, motion.velocity[2] - normal[2] * dot];
    let tangent_speed = (tangent[0] * tangent[0] + tangent[1] * tangent[1] + tangent[2] * tangent[2]).sqrt();
    motion.friction = material.friction;
    if material.response == "pierce" && motion.penetration > material.resistance && material.resistance.is_finite() {
        let old = motion.penetration.max(1e-9);
        motion.penetration -= material.resistance;
        let scale = (1.0 - material.resistance / old).clamp(0.1, 0.98);
        motion.velocity = [motion.velocity[0] * scale, motion.velocity[1] * scale, motion.velocity[2] * scale];
        return false;
    }
    if material.response == "ground" && normal_speed < material.embed_speed {
        if tangent_speed > 0.05 {
            motion.state = "rolling".into();
            motion.velocity = [tangent[0] * (1.0 - material.friction), tangent[1] * (1.0 - material.friction), tangent[2] * (1.0 - material.friction)];
            return false;
        }
        motion.state = "resting".into();
        motion.velocity = [0.0; 3];
        return true;
    }
    if material.response == "ground" && material.restitution > 0.05 && material.resistance < 0.75 {
        motion.state = "flying".into();
        motion.velocity = [tangent[0] * (1.0 - material.friction) + normal[0] * normal_speed * material.restitution, tangent[1] * (1.0 - material.friction) + normal[1] * normal_speed * material.restitution, tangent[2] * (1.0 - material.friction) + normal[2] * normal_speed * material.restitution];
        return false;
    }
    if material.response == "ground" {
        motion.state = "embedded".into();
        motion.embed_depth = ((normal_speed - material.embed_speed).max(0.0) * 0.01 + radius * 0.5).min(radius * 1.5);
    } else {
        motion.state = "resting".into();
    }
    motion.velocity = [0.0; 3];
    true
}

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
    use super::{resolve_contact, sweep_interval, ImpactProfile, ProjectileMotion};

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

    #[test]
    fn bounded_ballistic_interval_is_shared_and_conservative() {
        let (position, average) = super::ballistic_interval([0.0, 2.0, 0.0], [10.0, 4.0, 0.0], -10.0, 0.2);
        assert!((position[0] - 2.0).abs() < 1e-12);
        assert!((position[1] - 1.8).abs() < 1e-12);
        assert!((average[1] - 3.0).abs() < 1e-12);
    }

    #[test]
    fn pierce_contact_spends_energy_without_duplicate_transition() {
        let mut motion = ProjectileMotion { velocity: [10.0, 0.0, 0.0], penetration: 2.0, state: "flying".into(), embed_depth: 0.0, normal: [0.0, 1.0, 0.0], friction: 0.0 };
        let material = ImpactProfile { response: "pierce".into(), resistance: 0.5, restitution: 0.0, friction: 0.0, embed_speed: 0.0 };
        assert!(!resolve_contact(&mut motion, [-1.0, 0.0, 0.0], &material, 0.1));
        assert!((motion.penetration - 1.5).abs() < 1e-12);
        assert!(motion.velocity[0] > 0.0 && motion.state == "flying");
    }

    #[test]
    fn ground_contact_selects_roll_or_embed_and_preserves_identity_state() {
        let rolling = ImpactProfile { response: "ground".into(), resistance: 0.2, restitution: 0.0, friction: 0.1, embed_speed: 5.0 };
        let mut motion = ProjectileMotion { velocity: [5.0, -1.0, 0.0], penetration: 0.0, state: "flying".into(), embed_depth: 0.0, normal: [0.0, 1.0, 0.0], friction: 0.0 };
        assert!(!resolve_contact(&mut motion, [0.0, 1.0, 0.0], &rolling, 0.1));
        assert_eq!(motion.state, "rolling");
        let soft = ImpactProfile { response: "ground".into(), resistance: 0.9, restitution: 0.0, friction: 1.0, embed_speed: 0.2 };
        motion.velocity = [0.0, -4.0, 0.0];
        assert!(resolve_contact(&mut motion, [0.0, 1.0, 0.0], &soft, 0.1));
        assert_eq!(motion.state, "embedded");
        assert!(motion.embed_depth > 0.0);
    }
}
