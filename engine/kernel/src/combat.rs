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
        assert!((position[1] - 2.6).abs() < 1e-12);
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

use crate::{collision, components::{Position, Projectile}};
use std::collections::BTreeSet;

#[derive(Clone)]
pub struct ContactCollider {
    pub geometry: collision::Collider,
    pub material: ImpactProfile,
}
pub struct MotionContact {
    pub hit: collision::SweepHit,
    pub elapsed: f64,
    pub velocity: [f64; 3],
    pub response: String,
}
pub struct MotionStep {
    pub contacts: Vec<MotionContact>,
    pub samples: Vec<(f64, [f64; 3], [f64; 3])>,
    pub expired: bool,
}
fn length(v: [f64; 3]) -> f64 { (v[0]*v[0]+v[1]*v[1]+v[2]*v[2]).sqrt() }

/// One physical interval owner for both authority and aiming. The caller only
/// supplies collider poses at the requested time and publishes returned facts.
pub fn advance_motion(
    id: &str,
    shot: &mut Projectile,
    position: &mut Position,
    victims: &mut BTreeSet<String>,
    delta: f64,
    mut candidates: impl FnMut(f64, f64, [f64;3], [f64;3]) -> Result<Vec<ContactCollider>, String>,
) -> Result<MotionStep, String> {
    let mut output = MotionStep { contacts: Vec::new(), samples: Vec::new(), expired: false };
    let mut elapsed = 0.0;
    let mut iterations = 0;
    while elapsed + 1e-9 < delta && matches!(shot.state.as_str(), "flying" | "rolling") {
        iterations += 1;
        if iterations > MAX_PROJECTILE_SUBSTEPS + MAX_CONTACTS_PER_PROJECTILE_STEP + 2 {
            return Err("projectile substep budget exceeded".into());
        }
        let origin = [position.x, position.y, position.z];
        let mut velocity = [shot.velocity_x, shot.velocity_y, shot.velocity_z];
        let speed = length(velocity);
        let step = sweep_interval((delta-elapsed).min(PROJECTILE_SUBSTEP_SECONDS), shot.age, shot.distance, speed, shot.max_lifetime, shot.max_range)?;
        if step <= 1e-9 { output.expired = true; break; }
        let available = candidates(elapsed, step, origin, velocity)?;
        if available.len() > collision::MAX_CANDIDATE_COLLIDERS { return Err("projectile candidate budget exceeded".into()); }
        let mut support = None;
        if shot.state == "rolling" {
            // Check the next foot position against real horizontal ground.
            // No remembered infinite plane: leaving its edge restores gravity.
            let probe = collision::Projectile { id: id.into(), radius: shot.radius,
                origin: [origin[0]+velocity[0]*step, origin[1]+0.002, origin[2]+velocity[2]*step],
                linear_velocity: [0.0,-1.0,0.0] };
            let ground: Vec<_> = available.iter().filter(|c| c.material.response == "ground").map(|c| c.geometry.clone()).collect();
            if let Some(hit) = collision::sweep_projectile(&probe, &ground, 0.006).map_err(|e|e.to_string())? {
                if hit.normal[1] < -0.99 {
                    let material = &available.iter().find(|c|c.geometry.id==hit.target_id).ok_or("ground contact disappeared")?.material;
                    shot.roll_friction = material.friction;
                    support = Some(hit.target_id);
                    let horizontal = velocity[0].hypot(velocity[2]);
                    let next = (horizontal - material.friction * shot.gravity.abs().max(1.0) * step).max(0.0);
                    let scale = if horizontal > 0.0 { next/horizontal } else { 0.0 };
                    velocity = [velocity[0]*scale, 0.0, velocity[2]*scale];
                    if next < 0.05 {
                        shot.state = "resting".into();
                        shot.velocity_x=0.0; shot.velocity_y=0.0; shot.velocity_z=0.0;
                        break;
                    }
                }
            }
            if support.is_none() { shot.state="flying".into(); }
        }
        let gravity = if support.is_some() { 0.0 } else { shot.gravity };
        let (end, average) = ballistic_interval(origin, velocity, gravity, step);
        let geometry: Vec<_> = available.iter().filter(|candidate|
            !victims.contains(&candidate.geometry.id) && support.as_ref()!=Some(&candidate.geometry.id)
        ).map(|c|c.geometry.clone()).collect();
        let hit = collision::sweep_projectile(&collision::Projectile {id:id.into(),radius:shot.radius,origin,linear_velocity:average}, &geometry, step).map_err(|e|e.to_string())?;
        let used;
        if let Some(hit) = hit {
            if output.contacts.len() >= MAX_CONTACTS_PER_PROJECTILE_STEP { return Err("projectile contact budget exceeded".into()); }
            let material=&available.iter().find(|c|c.geometry.id==hit.target_id).ok_or("contact material disappeared")?.material;
            used=hit.time.max(1e-6).min(step);
            let center=[origin[0]+average[0]*hit.time, origin[1]+average[1]*hit.time, origin[2]+average[2]*hit.time];
            velocity=ballistic_velocity(velocity,gravity,hit.time);
            output.contacts.push(MotionContact {hit:hit.clone(),elapsed:elapsed+hit.time,velocity,response:material.response.clone()});
            let mut motion=ProjectileMotion {velocity,penetration:shot.penetration,state:shot.state.clone(),embed_depth:shot.embed_depth,normal:[0.0;3],friction:shot.roll_friction};
            resolve_contact(&mut motion,hit.normal,material,shot.radius);
            if material.response!="ground" {
                if victims.len()>=128 { return Err("projectile victim limit exceeded".into()); }
                victims.insert(hit.target_id);
            }
            shot.penetration=motion.penetration; shot.state=motion.state; shot.embed_depth=motion.embed_depth;
            shot.roll_normal_x=motion.normal[0];shot.roll_normal_y=motion.normal[1];shot.roll_normal_z=motion.normal[2];shot.roll_friction=motion.friction;
            velocity=motion.velocity;
            position.x=center[0];position.y=center[1];position.z=center[2];
            if material.response=="ground" {
                position.x+=motion.normal[0]*1e-5;position.y+=motion.normal[1]*1e-5;position.z+=motion.normal[2]*1e-5;
            }
        } else {
            used=step;
            position.x=end[0];position.y=end[1];position.z=end[2];
            velocity=ballistic_velocity(velocity,gravity,step);
        }
        shot.velocity_x=velocity[0];shot.velocity_y=velocity[1];shot.velocity_z=velocity[2];
        shot.age+=used;
        shot.distance+=length([position.x-origin[0],position.y-origin[1],position.z-origin[2]]);
        elapsed+=used;
        output.samples.push((elapsed,[position.x,position.y,position.z],velocity));
    }
    if matches!(shot.state.as_str(),"flying"|"rolling") && (shot.age+1e-9>=shot.max_lifetime || shot.distance+1e-9>=shot.max_range) { output.expired=true; }
    Ok(output)
}

/// Local barrel placement for both the shot and its aiming preview.
pub fn muzzle_origin(base: [f64;3], muzzle: [f64;3], velocity: [f64;3]) -> [f64;3] {
    let yaw=velocity[2].atan2(velocity[0]);
    let (sin,cos)=yaw.sin_cos();
    [base[0]+cos*muzzle[0]-sin*muzzle[2],base[1]+muzzle[1],base[2]+sin*muzzle[0]+cos*muzzle[2]]
}
