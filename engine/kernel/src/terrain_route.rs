//! Bounded search over physical support cells, including underground routes.
//! The supplied query reads canonical terrain; this module stores no material grid.
use crate::generation::Cell;
use crate::terrain_traversal::{self, MaterialQuery, TraversalConfig};
use crate::structure_geometry::StairEdge;
use pathfinding::prelude::astar;
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, BinaryHeap};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AdmittedEdge {
    Flat { from: Cell, to: Cell },
    Hop { from: Cell, to: Cell },
    Stair { from: Cell, to: Cell, run: u8, rise: u8 },
}

impl AdmittedEdge {
    fn endpoints(self) -> (Cell, Cell) {
        match self {
            Self::Flat { from, to } | Self::Hop { from, to } | Self::Stair { from, to, .. } => (from, to),
        }
    }

    pub fn waypoint_count(self) -> usize {
        match self { Self::Flat { .. } | Self::Stair { .. } => 1, Self::Hop { .. } => 2 }
    }

    /// Points traversed by the integrator, including both support endpoints.
    pub fn segments(self, spacing: [f64; 3]) -> Result<Vec<crate::components::Point>, String> {
        let (from, to) = self.endpoints();
        let pose = |cell: Cell| crate::components::Point {
            x: cell.x as f64 * spacing[0], y: (f64::from(cell.y) + 0.5) * spacing[1],
            z: cell.z as f64 * spacing[2], frame: None,
        };
        let a = pose(from);
        let b = pose(to);
        let points = match self {
            Self::Flat { .. } | Self::Stair { .. } => vec![a, b],
            Self::Hop { .. } if to.y > from.y => vec![a.clone(), crate::components::Point { y: b.y, ..a }, b],
            Self::Hop { .. } => vec![a.clone(), crate::components::Point { y: a.y, ..b.clone() }, b],
        };
        if points.iter().flat_map(|p| [p.x, p.y, p.z]).all(|v| v.is_finite()) {
            Ok(points)
        } else {
            Err("terrain route metric position is not finite".into())
        }
    }

    /// Geometric length of the segments the movement integrator follows,
    /// rounded upward once to deterministic integer micrometres.
    pub fn planning_cost(self, spacing: [f64; 3]) -> Result<u64, String> {
        waypoint_cost_micrometres(self.segments(spacing)?)
    }
}

pub fn admitted_edge(a: Cell, b: Cell, stairs: &[StairEdge]) -> Result<AdmittedEdge, String> {
    if let Some(stair) = stairs.iter().find(|stair| (stair.entrance == a && stair.landing == b) || (stair.entrance == b && stair.landing == a)) {
        return Ok(AdmittedEdge::Stair { from: a, to: b, run: stair.run, rise: stair.rise });
    }
    let dx = (i128::from(b.x) - i128::from(a.x)).abs();
    let dz = (i128::from(b.z) - i128::from(a.z)).abs();
    let dy = (i64::from(b.y) - i64::from(a.y)).abs();
    if dx + dz != 1 || dy > 1 { return Err("invalid terrain route edge".into()); }
    Ok(if dy == 0 { AdmittedEdge::Flat { from: a, to: b } } else { AdmittedEdge::Hop { from: a, to: b } })
}

pub fn edge_cost(a: Cell, b: Cell, spacing: [f64; 3], stairs: &[StairEdge]) -> Result<u64, String> {
    admitted_edge(a, b, stairs)?.planning_cost(spacing)
}

pub fn path_waypoint_count(path: &[Cell], stairs: &[StairEdge]) -> Result<usize, String> {
    if path.is_empty() { return Err("invalid terrain route geometry".into()); }
    let mut count = 1usize;
    for pair in path.windows(2) { count = count.checked_add(admitted_edge(pair[0], pair[1], stairs)?.waypoint_count()).ok_or("terrain route progress overflow")?; }
    Ok(count)
}

/// Price the exact segments followed by movement. Search edges and external
/// route-cost queries both use this integer metric, so assignment cannot rank
/// a route differently from the movement owner because of a second formula.
pub fn waypoint_cost_micrometres(points: impl IntoIterator<Item = crate::components::Point>) -> Result<u64, String> {
    let mut previous = None;
    let mut total = 0_u64;
    for point in points {
        if let Some(from) = previous.take() {
            let length = crate::navigation::distance(from, point.clone());
            if !length.is_finite() { return Err("route metric cost is not finite".into()); }
            let cost = (length * 1_000_000.0).ceil();
            // At most 4096 movement segments: this per-segment bound keeps
            // path addition deterministic on native and 32-bit WASM hosts.
            if !cost.is_finite() || cost < 0.0 || cost > (1_u64 << 40) as f64 {
                return Err("terrain metric exceeds route cost bounds".into());
            }
            total = total.checked_add(cost as u64).ok_or("route metric cost exceeds bound")?;
        }
        previous = Some(point);
    }
    Ok(total)
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
                        Ok(Some(next)) if !blocked(next.support) => match edge_cost(cell(*current), next.support, config.spacing, stairs) {
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
                    match edge_cost(cell(*current), next.support, config.spacing, stairs) {
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

/// Search one terrain frontier until every requested destination is reached.
/// The frontier and predecessor map are shared across destinations; this is
/// the same movement graph and edge metric as `search_with_blocked_and_stairs`.
pub fn search_many_with_blocked_and_stairs(
    start: Cell,
    destinations: &[Cell],
    config: TraversalConfig,
    query: &mut MaterialQuery<'_>,
    blocked: &dyn Fn(Cell) -> bool,
    stairs: &[StairEdge],
) -> Result<Vec<Result<Vec<Cell>, String>>, String> {
    if destinations.is_empty() { return Ok(Vec::new()); }
    if terrain_traversal::node(start, config, query)?.is_none() {
        return Err("route endpoint lacks support or clearance".into());
    }
    let key = |cell: Cell| (cell.x, cell.y, cell.z);
    let cell = |(x, y, z): (i64, i32, i64)| Cell { x, y, z };
    let targets: BTreeSet<_> = destinations.iter().copied().map(key).collect();
    for destination in destinations {
        if terrain_traversal::node(*destination, config, query)?.is_none() {
            // Preserve per-request endpoint errors while allowing other
            // destinations to be priced by the shared search.
        }
    }
    let mut frontier = BinaryHeap::new();
    frontier.push(Reverse((0_u64, key(start))));
    let mut distance = BTreeMap::new();
    let mut predecessor = BTreeMap::new();
    distance.insert(key(start), 0_u64);
    let mut reached = BTreeSet::new();
    let mut expanded = 0usize;
    let mut failure = None;
    while let Some(Reverse((cost, current))) = frontier.pop() {
        if distance.get(&current).copied() != Some(cost) { continue; }
        if !reached.contains(&current) && targets.contains(&current) { reached.insert(current); }
        if reached.len() == targets.len() { break; }
        expanded += 1;
        if expanded > 4096 {
            failure = Some("terrain route exceeds local search budget".to_string());
            break;
        }
        let from_cell = cell(current);
        let from = match terrain_traversal::node(from_cell, config, query) {
            Ok(Some(node)) => node,
            Ok(None) => continue,
            Err(error) => { failure = Some(error); break; }
        };
        let mut neighbors = Vec::with_capacity(12 + stairs.len());
        for (dx, dz) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
            for dy in [0, 1, -1] {
                match terrain_traversal::step(from, dx, dy, dz, config, query) {
                    Ok(Some(next)) if !blocked(next.support) => match edge_cost(from_cell, next.support, config.spacing, stairs) {
                        Ok(edge) => neighbors.push((next.support, edge)),
                        Err(error) => { failure = Some(error); break; }
                    },
                    Ok(Some(_)) | Ok(None) => {},
                    Err(error) => { failure = Some(error); break; }
                }
            }
            if failure.is_some() { break; }
        }
        if failure.is_none() {
            for stair in stairs {
                let target = if stair.entrance == from_cell { stair.landing }
                    else if stair.landing == from_cell { stair.entrance }
                    else { continue };
                if blocked(target) { continue; }
                if let Ok(Some(next)) = terrain_traversal::stair_step(from, target, stair, config, query) {
                    match edge_cost(from_cell, next.support, config.spacing, stairs) {
                        Ok(edge) => neighbors.push((next.support, edge)),
                        Err(error) => { failure = Some(error); break; }
                    }
                }
            }
        }
        if failure.is_some() { break; }
        for (next, edge) in neighbors {
            let next_key = key(next);
            let next_cost = cost.checked_add(edge).ok_or("terrain route cost exceeds bound")?;
            if distance.get(&next_key).is_none_or(|prior| next_cost < *prior) {
                distance.insert(next_key, next_cost);
                predecessor.insert(next_key, current);
                frontier.push(Reverse((next_cost, next_key)));
            }
        }
    }
    let mut results = Vec::with_capacity(destinations.len());
    for destination in destinations {
        let destination = key(*destination);
        if let Some(error) = failure.clone() {
            if !distance.contains_key(&destination) { results.push(Err(error)); continue; }
        }
        if !distance.contains_key(&destination) {
            results.push(Err("no supported terrain route".into()));
            continue;
        }
        let mut path = vec![destination];
        let mut cursor = destination;
        while cursor != key(start) {
            cursor = *predecessor.get(&cursor).ok_or("invalid terrain route predecessor")?;
            path.push(cursor);
        }
        path.reverse();
        results.push(Ok(path.into_iter().map(cell).collect()));
    }
    Ok(results)
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
        let edge = admitted_edge(a, b, stairs)?;
        let emitted = edge.segments(config.spacing)?;
        // The first point is already present as the preceding edge endpoint.
        points.extend(emitted.into_iter().skip(1));
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
        let edge = admitted_edge(pair[0], pair[1], stairs)?;
        end += edge.waypoint_count();
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
        let flat = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:0,z:0}, config.spacing, &[]).unwrap();
        let climb = edge_cost(Cell{x:0,y:0,z:0}, Cell{x:1,y:1,z:0}, config.spacing, &[]).unwrap();
        assert!(climb > flat);
        let stair = StairEdge { id: "metric".into(), entrance: Cell{x:0,y:0,z:0}, landing: Cell{x:2,y:4,z:0}, orientation: crate::structure_geometry::Cardinal::East, run: 2, rise: 4 };
        let stair_cost = edge_cost(stair.entrance, stair.landing, config.spacing, std::slice::from_ref(&stair)).unwrap();
        assert_eq!(stair_cost, (2.0f64.hypot(4.0 * 0.54) * 1_000_000.0).ceil() as u64);
    }

    #[test]
    fn admitted_edge_cost_and_emitted_geometry_are_the_same_rule() {
        let config = TraversalConfig { spacing:[1.0,0.54,1.0],clearance_cells:1,max_step_cells:1 };
        let edges = [
            AdmittedEdge::Flat { from: Cell{x:0,y:0,z:0}, to: Cell{x:1,y:0,z:0} },
            AdmittedEdge::Hop { from: Cell{x:0,y:0,z:0}, to: Cell{x:1,y:1,z:0} },
            AdmittedEdge::Hop { from: Cell{x:1,y:1,z:0}, to: Cell{x:0,y:0,z:0} },
            AdmittedEdge::Stair { from: Cell{x:0,y:0,z:0}, to: Cell{x:2,y:4,z:0}, run:2, rise:4 },
        ];
        for edge in edges {
            let points = edge.segments(config.spacing).unwrap();
            let expected: u64 = points.windows(2).map(|pair| {
                (crate::navigation::distance(pair[0].clone(), pair[1].clone()) * 1_000_000.0).ceil() as u64
            }).sum();
            assert_eq!(edge.planning_cost(config.spacing).unwrap(), expected);
        }
        assert_eq!(path_waypoint_count(&[edges[0].endpoints().0, edges[0].endpoints().1], &[]).unwrap(), 2);
    }

    #[test]
    fn outside_material_blocks_support_and_ceiling() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0],clearance_cells:1,max_step_cells:1 };
        let mut query = |cell: Cell| Ok(TraversalMaterial { solid: cell.y == 0, outside: cell.x < 0, sealed_top: false });
        assert!(terrain_traversal::node(Cell{x:-1,y:0,z:0}, config, &mut query).unwrap().is_none());
    }

    #[test]
    fn shared_search_returns_ordered_paths_for_multiple_destinations() {
        let config = TraversalConfig { spacing:[1.0,1.0,1.0], clearance_cells:1, max_step_cells:1 };
        let solid: BTreeSet<_> = (0..=3).map(|x| (x, 0, 0)).collect();
        let mut query = |at: Cell| Ok(TraversalMaterial { solid: solid.contains(&(at.x as i32, at.y, at.z as i32)), outside:false, sealed_top:false });
        let start = Cell { x:0, y:0, z:0 };
        let destinations = [Cell { x:3, y:0, z:0 }, Cell { x:1, y:0, z:0 }];
        let paths = search_many_with_blocked_and_stairs(start, &destinations, config, &mut query, &|_| false, &[]).unwrap();
        assert_eq!(paths[0].as_ref().unwrap().last(), Some(&destinations[0]));
        assert_eq!(paths[1].as_ref().unwrap().last(), Some(&destinations[1]));
        assert_eq!(paths[0].as_ref().unwrap().first(), Some(&start));
    }
}
