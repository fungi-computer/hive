//! Bounded continuous collision queries for the native projectile owner.
//!
//! This module deliberately contains a query only.  It does not mutate the
//! world, advance time, or decide what an impact means to a game.  The kernel
//! supplies a projectile and an explicitly bounded set of colliders; the
//! caller commits the returned hit together with its own physical state.
//!
//! The geometric work is delegated to Parry.  Keeping this boundary small
//! makes the result usable by the later projectile system without giving the
//! collision library a second simulation or persistence owner.

use parry3d_f64::{
    math::{Pose, Vector},
    query::{cast_shapes, ShapeCastOptions, ShapeCastStatus},
    shape::{Ball, Cuboid},
};

/// The maximum number of colliders a single bounded sweep may inspect.
pub const MAX_CANDIDATE_COLLIDERS: usize = 256;

/// A supported world-space collider shape.
#[derive(Clone, Debug, PartialEq)]
pub enum ColliderShape {
    /// A sphere centered at the collider origin.
    Ball { radius: f64 },
    /// A box whose dimensions are twice these local half-extents.
    Cuboid { half_extents: [f64; 3] },
}

/// A moving collider with a stable external identity.
#[derive(Clone, Debug, PartialEq)]
pub struct Collider {
    pub id: String,
    pub shape: ColliderShape,
    pub origin: [f64; 3],
    pub linear_velocity: [f64; 3],
    /// Rotation around the world Y axis, in radians.
    pub yaw: f64,
}

/// The moving spherical projectile supplied by the authoritative kernel.
#[derive(Clone, Debug, PartialEq)]
pub struct Projectile {
    pub id: String,
    pub radius: f64,
    pub origin: [f64; 3],
    pub linear_velocity: [f64; 3],
}

/// The earliest valid contact in the requested interval.
#[derive(Clone, Debug, PartialEq)]
pub struct SweepHit {
    pub projectile_id: String,
    pub target_id: String,
    /// Seconds after the beginning of the sweep.
    pub time: f64,
    pub point: [f64; 3],
    /// The normal pointing out of the projectile at contact.
    pub normal: [f64; 3],
}

/// A rejected query.  Numerical failures are errors rather than misses.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SweepError {
    InvalidDelta,
    InvalidProjectile,
    TooManyCandidates,
    InvalidCollider(String),
    UnsupportedShape(String),
    NumericalFailure(String),
}

impl std::fmt::Display for SweepError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDelta => formatter.write_str("sweep delta must be finite and between 0 and 1"),
            Self::InvalidProjectile => formatter.write_str("projectile has invalid ID, radius, origin, or velocity"),
            Self::TooManyCandidates => formatter.write_str("sweep candidate count exceeds 256"),
            Self::InvalidCollider(id) => write!(formatter, "collider {id:?} has invalid identity or geometry"),
            Self::UnsupportedShape(id) => write!(formatter, "collider {id:?} uses an unsupported shape"),
            Self::NumericalFailure(id) => write!(formatter, "collision query failed for collider {id:?}"),
        }
    }
}

fn finite_vector(vector: [f64; 3]) -> bool {
    vector.into_iter().all(f64::is_finite)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
}

fn pose(origin: [f64; 3], yaw: f64) -> Pose {
    Pose::new(
        Vector::new(origin[0], origin[1], origin[2]),
        Vector::new(0.0, yaw, 0.0),
    )
}

fn valid_shape(shape: &ColliderShape) -> bool {
    match shape {
        ColliderShape::Ball { radius } => radius.is_finite() && *radius > 0.0,
        ColliderShape::Cuboid { half_extents } => {
            finite_vector(*half_extents) && half_extents.iter().all(|extent| *extent > 0.0)
        }
    }
}

fn shape_cast(
    projectile_shape: &Ball,
    projectile_pose: &Pose,
    projectile_velocity: Vector,
    collider: &Collider,
    options: ShapeCastOptions,
) -> Result<Option<parry3d_f64::query::ShapeCastHit>, SweepError> {
    let collider_pose = pose(collider.origin, collider.yaw);
    let collider_velocity = Vector::new(
        collider.linear_velocity[0],
        collider.linear_velocity[1],
        collider.linear_velocity[2],
    );
    let result = match &collider.shape {
        ColliderShape::Ball { radius } => cast_shapes(
            projectile_pose,
            projectile_velocity,
            projectile_shape,
            &collider_pose,
            collider_velocity,
            &Ball::new(*radius),
            options,
        ),
        ColliderShape::Cuboid { half_extents } => cast_shapes(
            projectile_pose,
            projectile_velocity,
            projectile_shape,
            &collider_pose,
            collider_velocity,
            &Cuboid::new(Vector::new(half_extents[0], half_extents[1], half_extents[2])),
            options,
        ),
    };
    result.map_err(|_| SweepError::NumericalFailure(collider.id.clone()))
}

/// Sweep one moving sphere against at most 256 moving ball/cuboid colliders.
///
/// Candidates are inspected in caller order, but the result is independent of
/// that order: earliest time wins and exact equal-time contacts use the
/// lexicographically smallest stable collider ID.  Parry's non-converged and
/// unsupported outcomes are rejected instead of being treated as a miss.
pub fn sweep_projectile(
    projectile: &Projectile,
    candidates: &[Collider],
    delta: f64,
) -> Result<Option<SweepHit>, SweepError> {
    if !delta.is_finite() || !(0.0..=1.0).contains(&delta) {
        return Err(SweepError::InvalidDelta);
    }
    if candidates.len() > MAX_CANDIDATE_COLLIDERS {
        return Err(SweepError::TooManyCandidates);
    }
    if !valid_id(&projectile.id)
        || !projectile.radius.is_finite()
        || projectile.radius <= 0.0
        || !finite_vector(projectile.origin)
        || !finite_vector(projectile.linear_velocity)
    {
        return Err(SweepError::InvalidProjectile);
    }

    for (index, collider) in candidates.iter().enumerate() {
        if !valid_id(&collider.id)
            || !finite_vector(collider.origin)
            || !finite_vector(collider.linear_velocity)
            || !collider.yaw.is_finite()
            || !valid_shape(&collider.shape)
        {
            return Err(SweepError::InvalidCollider(collider.id.clone()));
        }
        if candidates[..index].iter().any(|prior| prior.id == collider.id) {
            return Err(SweepError::InvalidCollider(collider.id.clone()));
        }
    }

    let projectile_shape = Ball::new(projectile.radius);
    let projectile_pose = pose(projectile.origin, 0.0);
    let projectile_velocity = Vector::new(
        projectile.linear_velocity[0],
        projectile.linear_velocity[1],
        projectile.linear_velocity[2],
    );
    let options = ShapeCastOptions::with_max_time_of_impact(delta);
    let mut best: Option<SweepHit> = None;

    for collider in candidates {
        let Some(hit) = shape_cast(
            &projectile_shape,
            &projectile_pose,
            projectile_velocity,
            collider,
            options,
        )? else {
            continue;
        };
        if !matches!(
            hit.status,
            ShapeCastStatus::Converged | ShapeCastStatus::PenetratingOrWithinTargetDist
        ) {
            return Err(SweepError::NumericalFailure(collider.id.clone()));
        }
        if !hit.time_of_impact.is_finite() || hit.time_of_impact < 0.0 || hit.time_of_impact > delta {
            return Err(SweepError::NumericalFailure(collider.id.clone()));
        }
        let projectile_position = projectile_pose.translation
            + projectile_velocity * hit.time_of_impact;
        let point = projectile_position + hit.witness1;
        let normal = hit.normal1;
        let candidate = SweepHit {
            projectile_id: projectile.id.clone(),
            target_id: collider.id.clone(),
            time: hit.time_of_impact,
            point: [point.x, point.y, point.z],
            normal: [normal.x, normal.y, normal.z],
        };
        if best.as_ref().is_none_or(|current| {
            candidate.time < current.time
                || (candidate.time == current.time && candidate.target_id < current.target_id)
        }) {
            best = Some(candidate);
        }
    }
    Ok(best)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projectile() -> Projectile {
        Projectile {
            id: "shot".into(),
            radius: 0.1,
            origin: [-5.0, 0.0, 0.0],
            linear_velocity: [10.0, 0.0, 0.0],
        }
    }

    fn box_target(id: &str, x: f64) -> Collider {
        Collider {
            id: id.into(),
            shape: ColliderShape::Cuboid {
                half_extents: [0.25, 0.5, 0.5],
            },
            origin: [x, 0.0, 0.0],
            linear_velocity: [0.0, 0.0, 0.0],
            yaw: 0.0,
        }
    }

    #[test]
    fn crosses_between_samples_and_returns_contact() {
        let hit = sweep_projectile(&projectile(), &[box_target("wall", 0.0)], 1.0)
            .expect("valid sweep")
            .expect("crossing hit");
        assert_eq!(hit.target_id, "wall");
        assert!((hit.time - 0.465).abs() < 1e-9);
        assert!(hit.point[0].is_finite());
    }

    #[test]
    fn nearest_hit_wins_independent_of_input_order() {
        let near = box_target("near", 1.0);
        let far = box_target("far", 3.0);
        let first = sweep_projectile(&projectile(), &[far.clone(), near.clone()], 1.0)
            .expect("valid sweep")
            .expect("hit");
        let second = sweep_projectile(&projectile(), &[near, far], 1.0)
            .expect("valid sweep")
            .expect("hit");
        assert_eq!(first, second);
        assert_eq!(first.target_id, "near");
    }

    #[test]
    fn equal_time_tie_uses_stable_id() {
        let left = box_target("a", 0.0);
        let right = box_target("b", 0.0);
        let hit = sweep_projectile(&projectile(), &[right, left], 1.0)
            .expect("valid sweep")
            .expect("hit");
        assert_eq!(hit.target_id, "a");
    }

    #[test]
    fn moving_target_is_swept_relative_to_projectile() {
        let mut target = box_target("runner", 2.0);
        target.linear_velocity = [-2.0, 0.0, 0.0];
        let hit = sweep_projectile(&projectile(), &[target], 1.0)
            .expect("valid sweep")
            .expect("moving target hit");
        assert!(hit.time < 0.7);
    }

    #[test]
    fn miss_and_invalid_inputs_are_distinct() {
        let mut miss = projectile();
        miss.linear_velocity = [0.0, 0.0, 10.0];
        assert!(sweep_projectile(&miss, &[box_target("wall", 0.0)], 1.0)
            .expect("valid sweep")
            .is_none());
        assert_eq!(
            sweep_projectile(&projectile(), &[], 1.1),
            Err(SweepError::InvalidDelta)
        );
        let mut invalid = projectile();
        invalid.radius = 0.0;
        assert_eq!(
            sweep_projectile(&invalid, &[], 1.0),
            Err(SweepError::InvalidProjectile)
        );
        assert!(matches!(
            sweep_projectile(
                &projectile(),
                &[box_target("same", 0.0), box_target("same", 1.0)],
                1.0
            ),
            Err(SweepError::InvalidCollider(id)) if id == "same"
        ));
    }

    #[test]
    fn candidate_bound_rejects_without_truncation() {
        let candidates = (0..=MAX_CANDIDATE_COLLIDERS)
            .map(|index| box_target(&format!("target-{index}"), 100.0 + index as f64))
            .collect::<Vec<_>>();
        assert_eq!(
            sweep_projectile(&projectile(), &candidates, 1.0),
            Err(SweepError::TooManyCandidates)
        );
    }
}
