//! Bounded search over physical support cells, including underground routes.
//! The supplied query reads canonical terrain; this module stores no material grid.
use crate::generation::Cell;
use crate::terrain_traversal::{self, MaterialQuery, TraversalConfig};
use crate::structure_geometry::StairEdge;
use pathfinding::prelude::astar;

fn edge_cost(a: Cell, b: Cell, spacing: [f64; 3]) -> Result<u64, String> {
    let dx = (i128::from(b.x) - i128::from(a.x)).unsigned_abs() as f64 * spacing[0];
    let dz = (i128::from(b.z) - i128::from(a.z)).unsigned_abs() as f64 * spacing[2];
    let dy = (i64::from(b.y) - i64::from(a.y)).unsigned_abs() as f64 * spacing[1];
    let cost = ((dx + dz + dy) * 1_000_000.0).round();
    // At most 4096 expanded nodes: this bound keeps path addition below 2^53
    // and identical on 32-bit WASM and native hosts. Never saturate a cost.
    if !cost.is_finite() || cost < 1.0 || cost > (1u64 << 40) as f64 {
        return Err("terrain metric exceeds route cost bounds".into());
    }
    Ok(cost as u64)
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
    search_with_blocked_and_stairs(start, destination, config, query, blocked, &[])
}

pub fn search_with_blocked_and_stairs(
    start: Cell,
    destination: Cell,
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
    stairs: &[StairEdge],
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
                        Ok(Some(next)) if !blocked(next.support) => match edge_cost(cell(*current), next.support, config.spacing) {
                            Ok(cost) => neighbors.push((key(next.support), cost)),
                            Err(error) => { failure = Some(error); return Vec::new(); }
                        },
                        Ok(Some(_)) => {},
                        Ok(None) => {},
                        Err(error) => { failure = Some(error); return Vec::new(); }
                    }
                }
            }
            for stair in stairs {
                let target = if stair.entrance == cell(*current) { stair.landing }
                    else if stair.landing == cell(*current) { stair.entrance }
                    else { continue };
                if blocked(target) { continue; }
                if let Ok(Some(next)) = terrain_traversal::stair_step(from, target, stair, config, query) {
                    match edge_cost(cell(*current), next.support, config.spacing) {
                        Ok(cost) => neighbors.push((key(next.support), cost)),
                        Err(error) => { failure = Some(error); return Vec::new(); }
                    }
                }
            }
            neighbors
        },
        |_| 0u64,
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
    waypoints_with_stairs(path, config, &[])
}

pub fn waypoints_with_stairs(path: &[Cell], config: TraversalConfig, stairs: &[StairEdge]) -> Result<Vec<crate::components::Point>, String> {
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
        let stair_edge = stairs.iter().any(|stair| stair.entrance == a && stair.landing == b || stair.entrance == b && stair.landing == a);
        if (!stair_edge && (dx.abs() + dz.abs() != 1 || !(-1..=1).contains(&dy))) || (stair_edge && (dx.abs() + dz.abs() == 0 || dy == 0)) {
            return Err("invalid terrain route edge".into());
        }
        let from = pose(a)?;
        let to = pose(b)?;
        if stair_edge {
            // A stair is a single authored ramp edge. The movement integrator
            // interpolates between supports; do not synthesize a teleport-like
            // vertical waypoint that cuts through the stair body.
            points.push(to);
            continue;
        }
        if dy > 0 { points.push(Point { y: to.y, ..from }); }
        if dy < 0 { points.push(Point { y: from.y, ..to.clone() }); }
        points.push(to);
    }
    Ok(points)
}

/// Support edge containing the next movement waypoint. Earlier cells are history,
/// not terrain that the actor still needs in order to finish the route.
pub fn active_support_index(path: &[Cell], next_waypoint: usize) -> Result<usize, String> {
    active_support_index_with_stairs(path, next_waypoint, &[])
}

pub fn active_support_index_with_stairs(path: &[Cell], next_waypoint: usize, stairs: &[StairEdge]) -> Result<usize, String> {
    if next_waypoint == 0 { return Err("invalid terrain waypoint progress".into()); }
    let mut end = 0usize;
    for (index, pair) in path.windows(2).enumerate() {
        let stair_edge = stairs.iter().any(|stair| stair.entrance == pair[0] && stair.landing == pair[1] || stair.entrance == pair[1] && stair.landing == pair[0]);
        end += if stair_edge || pair[0].y == pair[1].y { 1 } else { 2 };
        if next_waypoint <= end { return Ok(index); }
    }
    Err("terrain waypoint progress exceeds route".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terrain_traversal::TraversalMaterial;
    use std::collections::BTreeSet;

    #[test]
    fn search_uses_deep_support_and_climbs_one_voxel() {
        let solid: BTreeSet<_> = [(0,-20,0),(1,-19,0),(2,-19,0)].into_iter().collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x,at.y,at.z)), outside: false, sealed_top: false });
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
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: [(0,0,0),(1,2,0)].contains(&(at.x,at.y,at.z)), outside: false, sealed_top: false });
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        assert!(search(Cell{x:0,y:0,z:0},Cell{x:1,y:2,z:0},config,&mut query).is_err());
    }

    #[test]
    fn committed_stair_is_the_only_four_way_four_voxel_route_edge() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let origin = Cell{x:0,y:0,z:0};
        for (index, orientation) in [
            crate::structure_geometry::Cardinal::North,
            crate::structure_geometry::Cardinal::East,
            crate::structure_geometry::Cardinal::South,
            crate::structure_geometry::Cardinal::West,
        ].into_iter().enumerate() {
            let (dx, dz) = orientation.delta();
            let entrance = origin;
            let landing = Cell { x: origin.x + dx * 2, y: 4, z: origin.z + dz * 2 };
            let solid: BTreeSet<_> = [entrance, landing].into_iter().collect();
            let stair = StairEdge { id:format!("stair-{index}"), entrance, landing, orientation, run:2, rise:4 };
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(search(entrance, landing, config, &mut query).is_err());
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            let up = search_with_blocked_and_stairs(entrance, landing, config, &mut query, &|_| false, std::slice::from_ref(&stair)).unwrap();
            assert_eq!(up, vec![entrance, landing]);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(terrain_traversal::path_supported_with_stairs(&up, config, &mut query, std::slice::from_ref(&stair)).unwrap());
            assert_eq!(waypoints_with_stairs(&up, config, std::slice::from_ref(&stair)).unwrap().len(), 2);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            let down = search_with_blocked_and_stairs(landing, entrance, config, &mut query, &|_| false, std::slice::from_ref(&stair)).unwrap();
            assert_eq!(down, vec![landing, entrance]);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(terrain_traversal::path_supported_with_stairs(&down, config, &mut query, std::slice::from_ref(&stair)).unwrap());
            assert_eq!(waypoints_with_stairs(&down, config, std::slice::from_ref(&stair)).unwrap().len(), 2);
            let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&at), outside:false, sealed_top:false });
            assert!(search_with_blocked_and_stairs(entrance, landing, config, &mut query, &|_| false, &[]).is_err());
        }
    }

    #[test]
    fn weighted_cost_charges_rise_and_cross_geometry() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let flat = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:0,z:0}, config.spacing).unwrap();
        let climb = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:1,z:0}, config.spacing).unwrap();
        assert!(climb > flat);
        let stair = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:2,y:4,z:0}, config.spacing).unwrap();
        assert_eq!(stair, 4_160_000);
    }

    #[test]
    fn outside_material_blocks_support_and_ceiling() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0],clearance_cells:1,max_step_cells:1 };
        let mut query = |cell: Cell| Ok(TraversalMaterial { solid: cell.y == 0, outside: cell.x < 0, sealed_top: false });
        assert!(terrain_traversal::node(Cell{x:-1,y:0,z:0}, config, &mut query).unwrap().is_none());
    }
}
