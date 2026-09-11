//! Conservative centre-to-centre voxel visibility.
//!
//! This module owns traversal only. A caller supplies the authoritative point
//! and crossed-face queries; unresolved cells are never treated as open.

use crate::generation::Cell;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointState { Open, Solid, Unresolved }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaceAxis { X, Y, Z }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaceState { Open, Closed, Unresolved }

pub trait VisibilityQuery {
    fn point(&mut self, cell: Cell) -> Result<PointState, String>;
    fn face(&mut self, axis: FaceAxis, cell: Cell) -> Result<FaceState, String>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VisibilityLimits {
    pub max_crossings: u64,
    pub max_queries: u64,
}

impl Default for VisibilityLimits {
    fn default() -> Self { Self { max_crossings: 256, max_queries: 4096 } }
}

fn add(cell: Cell, axis: usize, delta: i64) -> Result<Cell, String> {
    let mut next = cell;
    match axis {
        0 => next.x = next.x.checked_add(delta).ok_or("visibility coordinate overflow")?,
        1 => next.y = i32::try_from(i64::from(next.y).checked_add(delta).ok_or("visibility coordinate overflow")?)
            .map_err(|_| "visibility coordinate overflow")?,
        2 => next.z = next.z.checked_add(delta).ok_or("visibility coordinate overflow")?,
        _ => return Err("invalid visibility axis".into()),
    }
    Ok(next)
}

fn face_cell(cell: Cell, axis: usize, step: i64) -> Result<Cell, String> {
    if step < 0 { add(cell, axis, 1) } else { Ok(cell) }
}

fn axis(index: usize) -> FaceAxis {
    match index { 0 => FaceAxis::X, 1 => FaceAxis::Y, 2 => FaceAxis::Z, _ => unreachable!() }
}

fn point<Q: VisibilityQuery>(query: &mut Q, calls: &mut u64, limits: VisibilityLimits, cell: Cell) -> Result<PointState, String> {
    *calls = calls.checked_add(1).ok_or("visibility query count overflow")?;
    if *calls > limits.max_queries { return Err("visibility query budget exhausted".into()); }
    query.point(cell)
}

fn face<Q: VisibilityQuery>(query: &mut Q, calls: &mut u64, limits: VisibilityLimits, direction: FaceAxis, cell: Cell) -> Result<FaceState, String> {
    *calls = calls.checked_add(1).ok_or("visibility query count overflow")?;
    if *calls > limits.max_queries { return Err("visibility query budget exhausted".into()); }
    query.face(direction, cell)
}

fn cross_factor(value: u64) -> Result<u64, String> {
    value.checked_mul(2).and_then(|value| value.checked_add(1)).ok_or("visibility comparison overflow".into())
}

/// Determine visibility using the retained conservative tied-crossing law.
/// Every tied edge/corner subset is checked, so a diagonal cannot see through
/// a closed face. Query exhaustion is an error and never means visible.
pub fn visible<Q: VisibilityQuery>(
    query: &mut Q,
    from: Cell,
    target: Cell,
    limits: VisibilityLimits,
) -> Result<bool, String> {
    if limits.max_crossings == 0 || limits.max_queries == 0 {
        return Err("visibility query budget is empty".into());
    }
    let delta = [
        target.x.checked_sub(from.x).ok_or("visibility coordinate difference overflow")?,
        i64::from(target.y).checked_sub(i64::from(from.y)).ok_or("visibility coordinate difference overflow")?,
        target.z.checked_sub(from.z).ok_or("visibility coordinate difference overflow")?,
    ];
    let distance = delta.map(i64::unsigned_abs);
    let crossings = distance.into_iter().try_fold(0u64, |sum, value| sum.checked_add(value))
        .ok_or("visibility crossing count overflow")?;
    if crossings > limits.max_crossings { return Err("visibility query budget exhausted".into()); }
    let step = delta.map(|value| value.signum());
    let mut at = from;
    let mut crossed = [0u64; 3];
    let mut calls = 0u64;
    for _ in 0..=crossings {
        if at == target { return Ok(!matches!(point(query, &mut calls, limits, at)?, PointState::Unresolved)); }
        let moving: Vec<usize> = (0..3).filter(|&index| distance[index] > 0).collect();
        let first = *moving.first().ok_or("visibility traversal made no progress")?;
        let mut best = first;
        for &index in &moving {
            let left = cross_factor(crossed[index])?.checked_mul(distance[best]).ok_or("visibility comparison overflow")?;
            let right = cross_factor(crossed[best])?.checked_mul(distance[index]).ok_or("visibility comparison overflow")?;
            if left < right { best = index; }
        }
        let mut tied = Vec::new();
        for index in moving {
            let time = cross_factor(crossed[index])?.checked_mul(distance[best]).ok_or("visibility comparison overflow")?;
            let other = cross_factor(crossed[best])?.checked_mul(distance[index]).ok_or("visibility comparison overflow")?;
            if time == other { tied.push(index); }
        }
        for mask in 1usize..(1usize << tied.len()) {
            let mut candidate = at;
            for (bit, &index) in tied.iter().enumerate() {
                if mask & (1 << bit) != 0 { candidate = add(candidate, index, step[index])?; }
            }
            for (bit, &index) in tied.iter().enumerate() {
                if mask & (1 << bit) == 0 { continue; }
                if !matches!(face(query, &mut calls, limits, axis(index), face_cell(candidate, index, step[index])?)?, FaceState::Open) { return Ok(false); }
            }
            match point(query, &mut calls, limits, candidate)? {
                PointState::Unresolved => return Ok(false),
                PointState::Solid if candidate != target => return Ok(false),
                _ => {}
            }
        }
        for &index in &tied {
            at = add(at, index, step[index])?;
            crossed[index] = crossed[index].checked_add(1).ok_or("visibility crossing count overflow")?;
        }
    }
    Err("visibility traversal exhausted".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    struct Grid { solid: BTreeSet<Cell>, closed: BTreeSet<(FaceAxis, Cell)> }
    impl VisibilityQuery for Grid {
        fn point(&mut self, cell: Cell) -> Result<PointState, String> { Ok(if self.solid.contains(&cell) { PointState::Solid } else { PointState::Open }) }
        fn face(&mut self, axis: FaceAxis, cell: Cell) -> Result<FaceState, String> { Ok(if self.closed.contains(&(axis, cell)) { FaceState::Closed } else { FaceState::Open }) }
    }
    fn cell(x: i64, y: i32, z: i64) -> Cell { Cell { x, y, z } }

    #[test]
    fn open_wall_and_tied_corner_are_conservative() {
        let mut grid = Grid { solid: BTreeSet::from([cell(1, 0, 0)]), closed: BTreeSet::new() };
        assert!(!visible(&mut grid, cell(0, 0, 0), cell(2, 0, 0), VisibilityLimits::default()).unwrap());
        let mut corner = Grid { solid: BTreeSet::new(), closed: BTreeSet::from([(FaceAxis::X, cell(1, 0, 0)])] };
        assert!(!visible(&mut corner, cell(0, 0, 0), cell(1, 1, 0), VisibilityLimits::default()).unwrap());
    }

    #[test]
    fn unresolved_and_budget_exhaustion_are_distinct() {
        let mut grid = Grid { solid: BTreeSet::new(), closed: BTreeSet::new() };
        assert!(visible(&mut grid, cell(0, 0, 0), cell(2, 0, 0), VisibilityLimits { max_crossings: 1, max_queries: 4 }).is_err());
        assert!(visible(&mut grid, cell(0, 0, 0), cell(1, 0, 0), VisibilityLimits { max_crossings: 8, max_queries: 0 }).is_err());
    }
}
