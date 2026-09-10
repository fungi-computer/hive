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
    // The end can be between cell centers; it remains an actual world pose.
    if result
        .back()
        .is_none_or(|p| distance(p.clone(), end.clone()) > 1e-9)
    {
        result.push_back(end);
    }
    Ok(result)
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
