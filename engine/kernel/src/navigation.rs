use crate::components::{Point, Position, Result};
use glam::DVec3;
use pathfinding::prelude::bfs;
use std::collections::{BTreeSet, VecDeque};

pub type Cell = (i32, i32, i32);
#[derive(Clone, Copy)]
pub struct Bounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
}
pub const DIRECT_STEP_SECONDS: f64 = 0.020;
pub const MAX_DIRECT_INPUTS: usize = 50;

/// Advance one fixed direct-control sample. This is deliberately independent
/// of the ECS so the WASM prediction entrypoint and the authoritative owner
/// execute the same bounded movement and wall-slide rule.
pub fn direct_step(
    mut position: Position,
    x: f64,
    z: f64,
    speed: f64,
    blocked: &BTreeSet<Cell>,
    bounds: Option<Bounds>,
) -> Result<Position> {
    if [position.x, position.y, position.z, position.facing, x, z, speed]
        .iter().any(|value| !value.is_finite()) || speed < 0.0 || x.abs() > 1.0 || z.abs() > 1.0 {
        return Err("invalid direct motion".into());
    }
    if let Some(bounds) = bounds {
        if ![bounds.min_x, bounds.max_x, bounds.min_z, bounds.max_z].iter().all(|value| value.is_finite())
            || bounds.min_x > bounds.max_x || bounds.min_z > bounds.max_z {
            return Err("invalid direct motion bounds".into());
        }
    }
    let length = (x * x + z * z).sqrt();
    if length <= f64::EPSILON {
        return Ok(position);
    }
    let scale = speed * DIRECT_STEP_SECONDS / length;
    let dx = x * scale;
    let dz = z * scale;
    let attempt = |ax: f64, az: f64| -> bool {
        let end = Point { x: position.x + ax, y: position.y, z: position.z + az, frame: None };
        bounds.is_none_or(|b| end.x >= b.min_x && end.x <= b.max_x && end.z >= b.min_z && end.z <= b.max_z)
            && !blocked.iter().any(|cell| segment_intersects_cell(&point(position), &end, *cell))
    };
    let (move_x, move_z) = if attempt(dx, dz) { (dx, dz) }
        else if attempt(dx, 0.0) { (dx, 0.0) }
        else if attempt(0.0, dz) { (0.0, dz) }
        else { (0.0, 0.0) };
    position.x += move_x;
    position.z += move_z;
    if move_x.abs() > f64::EPSILON || move_z.abs() > f64::EPSILON {
        position.facing = (move_x.atan2(-move_z) / std::f64::consts::FRAC_PI_2 + 4.0) % 4.0;
    }
    Ok(position)
}

fn segment_intersects_cell(start: &Point, end: &Point, cell: Cell) -> bool {
    let bounds = [(cell.0 as f64 - 0.5, cell.0 as f64 + 0.5), (cell.2 as f64 - 0.5, cell.2 as f64 + 0.5)];
    let coordinates = [(start.x, end.x), (start.z, end.z)];
    let mut minimum: f64 = 0.0;
    let mut maximum: f64 = 1.0;
    for (axis, (from, to)) in coordinates.into_iter().enumerate() {
        let delta = to - from;
        if delta.abs() <= f64::EPSILON {
            if from < bounds[axis].0 || from > bounds[axis].1 { return false; }
            continue;
        }
        let mut entry = (bounds[axis].0 - from) / delta;
        let mut exit = (bounds[axis].1 - from) / delta;
        if entry > exit { std::mem::swap(&mut entry, &mut exit); }
        minimum = minimum.max(entry);
        maximum = maximum.min(exit);
        if minimum > maximum { return false; }
    }
    true
}
pub fn cell(p: Point) -> Cell {
    (p.x.round() as i32, p.y.round() as i32, p.z.round() as i32)
}
pub fn point(p: Position) -> Point {
    Point {
        x: p.x,
        y: p.y,
        z: p.z,
        frame: None,
    }
}
pub fn distance(a: Point, b: Point) -> f64 {
    DVec3::new(a.x, a.y, a.z).distance(DVec3::new(b.x, b.y, b.z))
}

/// Search is delegated to the maintained library. This owner supplies current
/// traversability, stable neighbor ordering and the local region work bound.
pub fn route(
    start: Point,
    end: Point,
    blocked: &BTreeSet<Cell>,
    bounds: Option<Bounds>,
) -> Result<VecDeque<Point>> {
    if [start.x, start.y, start.z, end.x, end.y, end.z]
        .iter()
        .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
    {
        return Err("invalid position".into());
    }
    if start.y != end.y {
        return Err("no vertical transition configured in this scene".into());
    }
    if let Some(bounds) = bounds {
        let in_bounds = |point: &Point| {
            point.x >= bounds.min_x
                && point.x <= bounds.max_x
                && point.z >= bounds.min_z
                && point.z <= bounds.max_z
        };
        if !in_bounds(&start) || !in_bounds(&end) {
            return Err("point is outside support surface".into());
        }
    }
    let from = cell(start.clone());
    let goal = cell(end.clone());
    if blocked.contains(&goal) {
        return Err("destination is occupied".into());
    }
    let mut expanded = 0;
    let cells = bfs(
        &from,
        |&(x, y, z)| {
            expanded += 1;
            if expanded > 4096 {
                return Vec::new();
            }
            [(x + 1, y, z), (x, y, z + 1), (x - 1, y, z), (x, y, z - 1)]
                .into_iter()
                .filter(|c| {
                    !blocked.contains(c)
                        && bounds.is_none_or(|bounds| {
                            let x = c.0 as f64;
                            let z = c.2 as f64;
                            x >= bounds.min_x
                                && x <= bounds.max_x
                                && z >= bounds.min_z
                                && z <= bounds.max_z
                        })
                })
                .collect::<Vec<_>>()
        },
        |p| *p == goal,
    )
    .ok_or("no route within local search budget")?;
    let mut result = cells
        .into_iter()
        .skip(1)
        .map(|(x, _, z)| Point {
            x: x as f64,
            y: end.y,
            z: z as f64,
            frame: end.frame.clone(),
        })
        .collect::<VecDeque<_>>();
    let start_center = Point {
        x: from.0 as f64,
        y: start.y,
        z: from.2 as f64,
        frame: end.frame.clone(),
    };
    if from != goal && distance(start.clone(), start_center.clone()) > 1e-9 {
        result.push_front(start_center);
    }
    // The end can be between cell centers; it remains an actual world pose.
    if result
        .back()
        .is_none_or(|p| distance(p.clone(), end.clone()) > 1e-9)
    {
        result.push_back(end);
    }
    Ok(result)
}

pub fn validate_saved_path(
    start: Point,
    path: &[Point],
    end: Point,
    blocked: &BTreeSet<Cell>,
    bounds: Option<Bounds>,
) -> Result<()> {
    let within = |point: &Point| {
        bounds.is_none_or(|bounds| {
            point.x >= bounds.min_x
                && point.x <= bounds.max_x
                && point.z >= bounds.min_z
                && point.z <= bounds.max_z
        })
    };
    let mut previous = start.clone();
    for (index, point) in path.iter().enumerate() {
        if [point.x, point.y, point.z]
            .iter()
            .any(|value| !value.is_finite() || value.abs() > 1_000_000.0)
            || point.frame.as_deref() != end.frame.as_deref()
            || !within(point)
            || blocked.contains(&cell(point.clone()))
            || (point.y - previous.y).abs() > 1e-9
        {
            return Err("invalid saved route point".into());
        }
        let dx = (point.x - previous.x).abs();
        let dz = (point.z - previous.z).abs();
        let same_cell = cell(point.clone()) == cell(previous.clone());
        let final_point = index + 1 == path.len();
        let legal = if index == 0 && same_cell {
            // A fractional actor may begin inside the rounded start cell. The
            // route records its center before cardinal cell-to-cell segments;
            // this short diagonal remains entirely inside that already
            // occupied start cell.
            dx <= 1.0 + 1e-9 && dz <= 1.0 + 1e-9
        } else if final_point && same_cell {
            dx <= 1.0 + 1e-9 && dz <= 1.0 + 1e-9
        } else {
            (dx <= 1e-9 && dz <= 1.0 + 1e-9)
                || (dz <= 1e-9 && dx <= 1.0 + 1e-9)
        };
        if !legal {
            return Err("saved route cuts across a cell or obstacle".into());
        }
        previous = point.clone();
    }
    if path.is_empty() {
        if distance(start, end) > 1e-9 {
            return Err("empty saved route is not at destination".into());
        }
    } else if distance(previous.clone(), end.clone()) > 1e-9 {
        return Err("saved route does not reach destination".into());
    }
    Ok(())
}

pub fn advance(position: &mut Position, path: &mut VecDeque<Point>, mut budget: f64) {
    while let Some(target) = path.front().cloned() {
        let current = DVec3::new(position.x, position.y, position.z);
        let toward = DVec3::new(target.x, target.y, target.z) - current;
        let length = toward.length();
        if length <= budget + 1e-9 {
            position.x = target.x;
            position.y = target.y;
            position.z = target.z;
            budget = (budget - length).max(0.0);
            path.pop_front();
        } else {
            let moved = current + toward * (budget / length);
            position.x = moved.x;
            position.y = moved.y;
            position.z = moved.z;
            break;
        }
    }
}

#[cfg(test)]
mod direct_tests {
    use super::*;
    use std::collections::BTreeSet;

    fn start() -> Position { Position { x: 0.0, y: 0.0, z: 0.0, facing: 0.0 } }

    #[test]
    fn direct_diagonal_is_fixed_clock_and_normalized() {
        let moved = direct_step(start(), 1.0, 1.0, 2.0, &BTreeSet::new(), None).unwrap();
        assert!((moved.x * moved.x + moved.z * moved.z).sqrt() <= 0.040000001);
        assert!((moved.x - moved.z).abs() < 1e-12);
    }

    #[test]
    fn direct_swept_wall_slides_deterministically() {
        let mut blocked = BTreeSet::new();
        blocked.insert((1, 0, 0));
        let moved = direct_step(Position { x: 0.49, ..start() }, 1.0, 1.0, 2.0, &blocked, None).unwrap();
        assert!((moved.x - 0.49).abs() < 1e-12);
        assert!(moved.z > 0.0);
    }

    #[test]
    fn direct_idle_keeps_facing_and_zero_delta_is_not_advanced() {
        let position = Position { facing: 3.0, ..start() };
        let moved = direct_step(position, 0.0, 0.0, 2.0, &BTreeSet::new(), None).unwrap();
        assert_eq!(moved.x, position.x);
        assert_eq!(moved.facing, 3.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fractional_partial_route_roundtrips_through_saved_validator() {
        let start = Point {
            x: 0.4,
            y: 0.0,
            z: 0.4,
            frame: None,
        };
        let end = Point {
            x: 3.2,
            y: 0.0,
            z: 0.4,
            frame: None,
        };
        let path = route(start.clone(), end.clone(), &BTreeSet::new(), None)
            .expect("fractional route");
        validate_saved_path(start, &path.clone().into_iter().collect::<Vec<_>>(), end, &BTreeSet::new(), None)
            .expect("generated route must validate after a save");
        assert_eq!(path.front().map(|point| (point.x, point.z)), Some((0.0, 0.0)));
    }

    #[test]
    fn saved_route_still_rejects_an_obstacle_cut() {
        let start = Point {
            x: 0.2,
            y: 0.0,
            z: 0.2,
            frame: None,
        };
        let end = Point {
            x: 2.0,
            y: 0.0,
            z: 0.2,
            frame: None,
        };
        let mut blocked = BTreeSet::new();
        blocked.insert((1, 0, 0));
        let forged = vec![Point {
            x: 1.0,
            y: 0.0,
            z: 0.0,
            frame: None,
        }];
        assert!(validate_saved_path(start, &forged, end, &blocked, None).is_err());
    }
}
