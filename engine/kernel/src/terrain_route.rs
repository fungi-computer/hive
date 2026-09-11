//! Bounded search over physical support cells, including underground routes.
//! The supplied query reads canonical terrain; this module stores no material grid.
use crate::generation::Cell;
use crate::terrain_traversal::{self, MaterialQuery, TraversalConfig};
use pathfinding::prelude::astar;

fn edge_cost(a: Cell, b: Cell, spacing: [f64; 3]) -> usize {
    let dx = (i128::from(b.x) - i128::from(a.x)).unsigned_abs() as f64 * spacing[0];
    let dz = (i128::from(b.z) - i128::from(a.z)).unsigned_abs() as f64 * spacing[2];
    let dy = (i64::from(b.y) - i64::from(a.y)).unsigned_abs() as f64 * spacing[1];
    ((dx + dz + dy) * 1_000_000.0).round().min(usize::MAX as f64) as usize
}

pub fn search(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
) -> Result<Vec<Cell>, String> {
    search_with_blocked(start, destination, config, query, &|_| false)
}

pub fn search_with_blocked(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
) -> Result<Vec<Cell>, String> {
    if terrain_traversal::node(start, config, query)?.is_none()
        || terrain_traversal::node(destination, config, query)?.is_none()
    {
        return Err("route endpoint lacks support or clearance".into());
    }
    let key = |cell: Cell| (cell.x, cell.y, cell.z);
    let cell = |(x, y, z)| Cell { x, y, z };
    let mut expanded = 0usize;
    let mut failure = None;
    let path = astar(
        &key(start),
        |current| {
            if failure.is_some() { return Vec::new(); }
            expanded += 1;
            if expanded > 4096 {
                failure = Some("terrain route exceeds local search budget".to_string());
                return Vec::new();
            }
            let from = match terrain_traversal::node(cell(*current), config, query) {
                Ok(Some(node)) => node,
                Ok(None) => return Vec::new(),
                Err(error) => { failure = Some(error); return Vec::new(); }
            };
            let mut neighbors = Vec::with_capacity(12);
            for (dx, dz) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
                for dy in [0, 1, -1] {
                    match terrain_traversal::step(from, dx, dy, dz, config, query) {
                        Ok(Some(next)) if !blocked(next.support) => neighbors.push((key(next.support), edge_cost(cell(*current), next.support, config.spacing))),
                        Ok(Some(_)) => {},
                        Ok(None) => {},
                        Err(error) => { failure = Some(error); return Vec::new(); }
                    }
                }
            }
            neighbors
        },
        |_| 0usize,
        |current| *current == key(destination),
    );
    if let Some(error) = failure { return Err(error); }
    path.map(|(path, _cost)| path.into_iter().map(cell).collect())
        .ok_or_else(|| "no supported terrain route".into())
}

/// Convert admitted support edges to movement segments. Rise before crossing a
/// higher voxel; cross before descending. Straight diagonal interpolation would
/// put the actor's feet inside the high voxel's side face.
pub fn waypoints(path: &[Cell], config: TraversalConfig) -> Result<Vec<crate::components::Point>, String> {
    use crate::components::Point;
    let pose = |cell: Cell| -> Result<Point, String> {
        let point = Point {
            x: cell.x as f64 * config.spacing[0],
            y: (f64::from(cell.y) + 0.5) * config.spacing[1],
            z: cell.z as f64 * config.spacing[2],
            frame: None,
        };
        if ![point.x, point.y, point.z].iter().all(|v| v.is_finite()) {
            return Err("terrain route metric position is not finite".into());
        }
        Ok(point)
    };
    if path.is_empty() || path.len() > 4097 || config.spacing.iter().any(|v| !v.is_finite() || *v <= 0.0) {
        return Err("invalid terrain route geometry".into());
    }
    let mut points = vec![pose(path[0])?];
    for pair in path.windows(2) {
        let a = pair[0];
        let b = pair[1];
        let dx = i128::from(b.x) - i128::from(a.x);
        let dz = i128::from(b.z) - i128::from(a.z);
        let dy = i64::from(b.y) - i64::from(a.y);
        if dx.abs() + dz.abs() != 1 || !(-1..=1).contains(&dy) {
            return Err("invalid terrain route edge".into());
        }
        let from = pose(a)?;
        let to = pose(b)?;
        if dy > 0 { points.push(Point { y: to.y, ..from }); }
        if dy < 0 { points.push(Point { y: from.y, ..to.clone() }); }
        points.push(to);
    }
    Ok(points)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terrain_traversal::TraversalMaterial;
    use std::collections::BTreeSet;

    #[test]
    fn search_uses_deep_support_and_climbs_one_voxel() {
        let solid: BTreeSet<_> = [(0,-20,0),(1,-19,0),(2,-19,0)].into_iter().collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x,at.y,at.z)), outside: false });
        let start = Cell { x:0,y:-20,z:0 };
        let end = Cell { x:2,y:-19,z:0 };
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert_eq!(search(start,end,config,&mut query).unwrap(),vec![start,Cell{x:1,y:-19,z:0},end]);
    }

    #[test]
    fn step_segments_do_not_cut_through_high_voxel_faces() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let low = Cell{x:0,y:-3,z:0};
        let high = Cell{x:1,y:-2,z:0};
        let up = waypoints(&[low,high],config).unwrap();
        assert_eq!(up.len(),3);
        assert_eq!(up[0].x,up[1].x);
        assert_eq!(up[1].y,up[2].y);
        let down = waypoints(&[high,low],config).unwrap();
        assert_eq!(down[0].y,down[1].y);
        assert_eq!(down[1].x,down[2].x);
    }

    #[test]
    fn search_rejects_a_two_voxel_cliff() {
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: [(0,0,0),(1,2,0)].contains(&(at.x,at.y,at.z)), outside: false });
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert!(search(Cell{x:0,y:0,z:0},Cell{x:1,y:2,z:0},config,&mut query).is_err());
    }

    #[test]
    fn weighted_cost_charges_rise_and_cross_geometry() {
        let config = TraversalConfig { spacing:[1.0,0.5,1.0],clearance_cells:1,max_step_cells:1 };
        let flat = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:0,z:0}, config.spacing);
        let climb = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:1,z:0}, config.spacing);
        assert!(climb > flat);
    }

    #[test]
    fn outside_material_blocks_support_and_ceiling() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0],clearance_cells:1,max_step_cells:1 };
        let mut query = |cell: Cell| Ok(TraversalMaterial { solid: cell.y == 0, outside: cell.x < 0 });
        assert!(terrain_traversal::node(Cell{x:-1,y:0,z:0}, config, &mut query).unwrap().is_none());
    }
}
