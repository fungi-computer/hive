//! Bounded rooted support over canonical static structure instances.
//!
//! This module indexes support facts only. Terrain remains an external
//! support query and no material or geometry is mutated here.

use crate::generation::Cell;
use crate::structure_geometry::{fixture_cells, Cardinal, StaticGeometry, StaticInstance};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub type TerrainSupportQuery<'a> = dyn FnMut(Cell) -> Result<bool, String> + 'a;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SupportPolicy {
    pub max_span_steps: u32,
    pub max_instances: usize,
    pub max_work: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SupportResult {
    pub supported: BTreeSet<String>,
    pub unsupported: Vec<String>,
    pub column_tops: BTreeSet<Cell>,
    pub stair_landings: BTreeSet<Cell>,
    pub floor_surfaces: BTreeSet<Cell>,
    /// Cells that can directly receive a load from a new structure. This is a
    /// derived query fact, never canonical geometry.
    pub load_contacts: BTreeSet<Cell>,
    pub structural_anchors: BTreeSet<Cell>,
    pub floor_distances: BTreeMap<Cell, u32>,
    pub cover_distances: BTreeMap<Cell, u32>,
}

fn instance_id(instance: &StaticInstance) -> &str {
    match instance {
        StaticInstance::Floor { id, .. }
        | StaticInstance::Cover { id, .. }
        | StaticInstance::Fixture { id, .. }
        | StaticInstance::Wall { id, .. }
        | StaticInstance::ApertureWall { id, .. }
        | StaticInstance::Stair { id, .. } => id,
    }
}
pub(crate) fn structure_id(instance: &StaticInstance) -> &str { instance_id(instance) }

fn cardinal_delta(direction: Cardinal) -> (i64, i64) {
    match direction {
        Cardinal::North => (0, -1),
        Cardinal::East => (1, 0),
        Cardinal::South => (0, 1),
        Cardinal::West => (-1, 0),
    }
}
fn wall_top(base: Cell, height: u8) -> Result<Cell, String> {
    Ok(Cell { y: base.y.checked_add(i32::from(height).checked_sub(1).ok_or("invalid wall height")?).ok_or("structure support coordinate overflow")?, ..base })
}

fn wall_support(base: Cell) -> Result<Cell, String> {
    Ok(Cell { y: base.y.checked_sub(1).ok_or("structure support coordinate overflow")?, ..base })
}

/// The load-bearing face immediately above a wall's highest occupied cell.
/// `column_tops` intentionally retains the occupied-cell datum for column
/// stacking; floors and spans consume this face as their support coordinate.
fn wall_load_contact(base: Cell, height: u8) -> Result<Cell, String> {
    Ok(Cell { y: base.y.checked_add(i32::from(height)).ok_or("structure support coordinate overflow")?, ..base })
}

fn charge(work: &mut usize, policy: SupportPolicy) -> Result<(), String> {
    *work = work.checked_add(1).ok_or("structure support work overflow")?;
    if *work > policy.max_work {
        return Err("structure support work budget exceeded".into());
    }
    Ok(())
}

fn span_distances(
    cells: &BTreeSet<Cell>,
    anchors: &BTreeSet<Cell>,
    policy: SupportPolicy,
    work: &mut usize,
) -> Result<BTreeMap<Cell, u32>, String> {
    if cells.is_empty() {
        return Ok(BTreeMap::new());
    }
    let mut distances = BTreeMap::<Cell, u32>::new();
    let mut queue = VecDeque::new();
    for anchor in anchors {
        charge(work, policy)?;
        if cells.contains(anchor) {
            distances.insert(*anchor, 0);
            queue.push_back(*anchor);
        }
        for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            charge(work, policy)?;
            let next = cardinal_neighbor(*anchor, dx, dz)?;
            if cells.contains(&next)
                && distances.get(&next).is_none_or(|distance| *distance > 1)
            {
                distances.insert(next, 1);
                queue.push_back(next);
            }
        }
    }
    while let Some(cell) = queue.pop_front() {
        charge(work, policy)?;
        let distance = distances[&cell];
        for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            charge(work, policy)?;
            let next = cardinal_neighbor(cell, dx, dz)?;
            if !cells.contains(&next) {
                continue;
            }
            let next_distance = distance
                .checked_add(1)
                .ok_or("structure support distance overflow")?;
            if next_distance > policy.max_span_steps
                || distances
                    .get(&next)
                    .is_some_and(|prior| *prior <= next_distance)
            {
                continue;
            }
            distances.insert(next, next_distance);
            queue.push_back(next);
        }
    }
    Ok(distances)
}

fn stair_landing(origin: Cell, direction: Cardinal, run: u8, rise: u8) -> Result<Cell, String> {
    let (dx, dz) = cardinal_delta(direction);
    Ok(Cell {
        x: origin.x.checked_add(dx.checked_mul(i64::from(run)).ok_or("structure support coordinate overflow")?).ok_or("structure support coordinate overflow")?,
        y: origin.y.checked_add(i32::from(rise)).ok_or("structure support coordinate overflow")?,
        z: origin.z.checked_add(dz.checked_mul(i64::from(run)).ok_or("structure support coordinate overflow")?).ok_or("structure support coordinate overflow")?,
    })
}

fn cardinal_neighbor(cell: Cell, dx: i64, dz: i64) -> Result<Cell, String> {
    Ok(Cell {
        x: cell.x.checked_add(dx).ok_or("structure support coordinate overflow")?,
        y: cell.y,
        z: cell.z.checked_add(dz).ok_or("structure support coordinate overflow")?,
    })
}

/// Resolve rooted structure support without scanning the generated world.
/// `terrain_support(cell)` answers whether the supplied support coordinate is
/// a real terrain top/support cell. Wall bases query their cell below the
/// first occupied wall cell; floors and stair origins query their own support
/// cell.
pub fn resolve(
    geometry: &StaticGeometry,
    policy: SupportPolicy,
    terrain_support: &mut TerrainSupportQuery<'_>,
) -> Result<SupportResult, String> {
    if policy.max_span_steps == 0 || policy.max_instances == 0 || policy.max_work == 0 {
        return Err("invalid structure support policy".into());
    }
    let instances = geometry.instances();
    if instances.len() > policy.max_instances {
        return Err("structure support instance budget exceeded".into());
    }
    let mut ids = BTreeSet::new();
    for instance in instances {
        if !ids.insert(instance_id(instance).to_string()) {
            return Err("duplicate structure support identity".into());
        }
    }

    let mut terrain_cache = BTreeMap::<Cell, bool>::new();
    let mut work = 0usize;
    let mut support_at = |cell: Cell| -> Result<bool, String> {
        if let Some(supported) = terrain_cache.get(&cell) {
            return Ok(*supported);
        }
        charge(&mut work, policy)?;
        let supported = terrain_support(cell)?;
        terrain_cache.insert(cell, supported);
        Ok(supported)
    };

    let mut terrain_anchors = BTreeSet::new();
    for instance in instances {
        let base = match instance {
            StaticInstance::Floor { support, .. } | StaticInstance::Cover { support, .. } => *support,
            StaticInstance::Fixture { origin, .. } => Cell { y: origin.y.checked_sub(1).ok_or("structure support coordinate overflow")?, ..*origin },
            StaticInstance::Wall { base, .. } | StaticInstance::ApertureWall { base, .. } => wall_support(*base)?,
            StaticInstance::Stair { origin, .. } => *origin,
        };
        if support_at(base)? {
            terrain_anchors.insert(base);
        }
        // Fixtures are body occupancy only. Their support is checked below at
        // admission; they never become structural anchors for later objects.
        if let StaticInstance::Floor { support, .. } | StaticInstance::Cover { support, .. } = instance {
            for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let neighbor = cardinal_neighbor(*support, dx, dz)?;
                if support_at(neighbor)? {
                    terrain_anchors.insert(neighbor);
                }
            }
        }
    }

    let mut floor_by_cell = BTreeMap::<Cell, Vec<&StaticInstance>>::new();
    let mut cover_by_cell = BTreeMap::<Cell, Vec<&StaticInstance>>::new();
    for instance in instances {
        charge(&mut work, policy)?;
        match instance {
            StaticInstance::Floor { support, .. } => floor_by_cell.entry(*support).or_default().push(instance),
            StaticInstance::Cover { support, .. } => cover_by_cell.entry(*support).or_default().push(instance),
            _ => {}
        }
    }

    let mut rooted = BTreeSet::<String>::new();
    let mut rooted_walls = BTreeSet::<String>::new();
    let mut rooted_stairs = BTreeSet::<String>::new();
    let mut rooted_floors = BTreeSet::<String>::new();
    let mut column_tops = BTreeSet::new();
    let mut wall_load_contacts = BTreeSet::new();
    let mut stair_landings = BTreeSet::new();
    let mut floor_surfaces = BTreeSet::new();

    let mut final_floor_distances = BTreeMap::new();
    let mut final_cover_distances = BTreeMap::new();
    for _ in 0..=instances.len() {
        // Span anchors are terrain and previously rooted load-bearing tops.
        // Supported floors are surfaces for later structures, never new span
        // distance-zero anchors.
        let mut span_anchors = terrain_anchors.clone();
        span_anchors.extend(column_tops.iter().copied());
        span_anchors.extend(wall_load_contacts.iter().copied());
        span_anchors.extend(stair_landings.iter().copied());
        let mut changed = false;
        let floor_cells = floor_by_cell.keys().copied().collect();
        let cover_cells = cover_by_cell.keys().copied().collect();
        let distances = span_distances(&floor_cells, &span_anchors, policy, &mut work)?;
        let cover_distances = span_distances(&cover_cells, &span_anchors, policy, &mut work)?;
        final_floor_distances = distances.clone();
        final_cover_distances = cover_distances.clone();
        let mut load_contacts = span_anchors.clone();
        for (cell, floor_instances) in &floor_by_cell {
            if !distances.contains_key(cell) {
                continue;
            }
            floor_surfaces.insert(*cell);
            for instance in floor_instances {
                if rooted_floors.insert(instance_id(instance).to_string()) {
                    rooted.insert(instance_id(instance).to_string());
                    changed = true;
                }
            }
            load_contacts.insert(*cell);
        }
        for (cell, cover_instances) in &cover_by_cell {
            if !cover_distances.contains_key(cell) {
                continue;
            }
            for instance in cover_instances {
                if rooted.insert(instance_id(instance).to_string()) {
                    changed = true;
                }
            }
        }
        for instance in instances {
            charge(&mut work, policy)?;
            match instance {
                StaticInstance::Wall { id, base, height } | StaticInstance::ApertureWall { id, base, height, .. } if !rooted_walls.contains(id) && load_contacts.contains(&wall_support(*base)?) => {
                    rooted_walls.insert(id.clone());
                    rooted.insert(id.clone());
                    column_tops.insert(wall_top(*base, *height)?);
                    wall_load_contacts.insert(wall_load_contact(*base, *height)?);
                    changed = true;
                }
                StaticInstance::Stair { id, origin, orientation, run, rise } if !rooted_stairs.contains(id) && load_contacts.contains(origin) => {
                    rooted_stairs.insert(id.clone());
                    rooted.insert(id.clone());
                    stair_landings.insert(stair_landing(*origin, *orientation, *run, *rise)?);
                    changed = true;
                }
                StaticInstance::Fixture { id, origin, orientation, footprint } if !rooted.contains(id) => {
                    let cells = fixture_cells(*origin, *orientation, footprint)?;
                    let mut supported = true;
                    for cell in &cells {
                        let below = Cell { y: cell.y.checked_sub(1).ok_or("structure support coordinate overflow")?, ..*cell };
                        if !load_contacts.contains(&below) && !terrain_support(below)? { supported = false; break; }
                    }
                    if supported { rooted.insert(id.clone()); changed = true; }
                }
                _ => {}
            }
        }
        if !changed {
            break;
        }
    }

    let unsupported = instances.iter().filter_map(|instance| {
        let id = instance_id(instance);
        (!rooted.contains(id)).then_some(id.to_string())
    }).collect();
    let mut structural_anchors = terrain_anchors;
    let mut load_contacts = structural_anchors.clone();
    load_contacts.extend(wall_load_contacts.iter().copied());
    load_contacts.extend(column_tops.iter().copied());
    load_contacts.extend(stair_landings.iter().copied());
    load_contacts.extend(floor_surfaces.iter().copied());
    structural_anchors.extend(column_tops.iter().copied());
    structural_anchors.extend(wall_load_contacts.iter().copied());
    structural_anchors.extend(stair_landings.iter().copied());
    Ok(SupportResult { supported: rooted, unsupported, column_tops, stair_landings, floor_surfaces, load_contacts, structural_anchors, floor_distances: final_floor_distances, cover_distances: final_cover_distances })
}

/// Assess one new instance against an already-resolved committed geometry.
/// Pending instances are deliberately excluded, so a cycle of blueprints
/// cannot manufacture support. The terrain callback is only used for the
/// candidate's own support cells; all broader facts come from `base`.
pub fn candidate_supported(
    base: &SupportResult,
    instance: &StaticInstance,
    max_span_steps: u32,
    terrain_support: &mut TerrainSupportQuery<'_>,
) -> Result<bool, String> {
    if max_span_steps == 0 { return Err("invalid structure support policy".into()); }
    let support = match instance {
        StaticInstance::Floor { support, .. } | StaticInstance::Cover { support, .. } => *support,
        StaticInstance::Fixture { origin, .. } => Cell { y: origin.y.checked_sub(1).ok_or("structure support coordinate overflow")?, ..*origin },
        StaticInstance::Wall { base, .. } | StaticInstance::ApertureWall { base, .. } => wall_support(*base)?,
        StaticInstance::Stair { origin, .. } => *origin,
    };
    if let StaticInstance::Fixture { origin, orientation, footprint, .. } = instance {
        for cell in fixture_cells(*origin, *orientation, footprint)? {
            let below = Cell { y: cell.y.checked_sub(1).ok_or("structure support coordinate overflow")?, ..cell };
            if !base.load_contacts.contains(&below) && !terrain_support(below)? {
                return Ok(false);
            }
        }
        return Ok(true);
    }
    if terrain_support(support)? { return Ok(true); }
    if matches!(instance, StaticInstance::Floor { .. } | StaticInstance::Cover { .. }) && base.structural_anchors.contains(&support) { return Ok(true); }
    if matches!(instance, StaticInstance::Floor { .. } | StaticInstance::Cover { .. }) {
        for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            if terrain_support(cardinal_neighbor(support, dx, dz)?)? { return Ok(true); }
        }
        for (dx, dz) in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)] {
            let neighbor = cardinal_neighbor(support, dx, dz)?;
            if base.structural_anchors.contains(&neighbor) { return Ok(true); }
        }
        let distances = match instance {
            StaticInstance::Floor { .. } => &base.floor_distances,
            StaticInstance::Cover { .. } => &base.cover_distances,
            _ => unreachable!(),
        };
        for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let neighbor = cardinal_neighbor(support, dx, dz)?;
            if distances.get(&neighbor).is_some_and(|distance| distance.checked_add(1).is_some_and(|next| next <= max_span_steps)) { return Ok(true); }
        }
    } else if base.load_contacts.contains(&support) {
        return Ok(true);
    }
    Ok(false)
}

pub(crate) fn candidate_floor_distance(base: &SupportResult, support: Cell, max_span_steps: u32, terrain_support: &mut TerrainSupportQuery<'_>) -> Result<Option<u32>, String> {
    if terrain_support(support)? || base.structural_anchors.contains(&support) { return Ok(Some(0)); }
    let mut best = None;
    for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let neighbor = cardinal_neighbor(support, dx, dz)?;
        if terrain_support(neighbor)? { best = Some(best.map_or(1, |v: u32| v.min(1))); }
        if let Some(distance) = base.floor_distances.get(&neighbor) { best = Some(best.map_or(distance.saturating_add(1), |v: u32| v.min(distance.saturating_add(1)))); }
    }
    Ok(best.filter(|distance| *distance <= max_span_steps))
}

/// Extend a read-only support projection after a pending candidate has been
/// accepted in deterministic order. This never mutates committed geometry.
pub(crate) fn add_prospective_support(base: &mut SupportResult, instance: &StaticInstance, max_span_steps: u32, floor_distance: Option<u32>) -> Result<(), String> {
    match instance {
        StaticInstance::Floor { support, .. } => {
            let mut distance = floor_distance.unwrap_or(1.min(max_span_steps));
            if base.load_contacts.contains(support) { distance = 0; }
            for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let neighbor = cardinal_neighbor(*support, dx, dz)?;
                if let Some(prior) = base.floor_distances.get(&neighbor) { distance = distance.min(prior.saturating_add(1)); }
            }
            base.floor_distances.insert(*support, distance.min(max_span_steps));
            base.floor_surfaces.insert(*support);
            base.load_contacts.insert(*support);
        }
        StaticInstance::Wall { base: support, height, .. } | StaticInstance::ApertureWall { base: support, height, .. } => {
            let top = wall_top(*support, *height)?;
            let load = wall_load_contact(*support, *height)?;
            base.column_tops.insert(top);
            base.load_contacts.insert(top);
            base.load_contacts.insert(load);
            base.structural_anchors.insert(top);
            base.structural_anchors.insert(load);
        }
        StaticInstance::Stair { origin, orientation, run, rise, .. } => {
            let landing = stair_landing(*origin, *orientation, *run, *rise)?;
            base.stair_landings.insert(landing);
            base.load_contacts.insert(landing);
            base.structural_anchors.insert(landing);
        }
        StaticInstance::Cover { .. } | StaticInstance::Fixture { .. } => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::Bounds;

    fn bounds() -> Bounds {
        Bounds { min_x: -32, max_x: 32, min_y: -32, max_y: 32, min_z: -32, max_z: 32 }
    }
    fn policy(max_span_steps: u32) -> SupportPolicy {
        SupportPolicy { max_span_steps, max_instances: 32, max_work: 512 }
    }
    fn terrain(anchors: &[Cell]) -> impl FnMut(Cell) -> Result<bool, String> + '_ {
        let anchors = anchors.iter().copied().collect::<BTreeSet<_>>();
        move |cell| Ok(anchors.contains(&cell))
    }

    #[test]
    fn rooted_span_limit_carries_distance_without_resetting() {
        let instances = (0..=3).map(|x| StaticInstance::Floor { id: format!("floor-{x}"), support: Cell { x, y: 0, z: 0 } }).collect();
        let geometry = StaticGeometry::new(bounds(), instances).unwrap();
        let mut query = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let result = resolve(&geometry, policy(2), &mut query).unwrap();
        assert_eq!(result.unsupported, vec!["floor-3"]);
    }

    #[test]
    fn floating_island_is_rejected() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Floor { id: "floating".into(), support: Cell { x: 4, y: 5, z: 4 } }]).unwrap();
        let mut query = terrain(&[]);
        let result = resolve(&geometry, policy(4), &mut query).unwrap();
        assert_eq!(result.unsupported, vec!["floating"]);
    }

    #[test]
    fn nearby_terrain_anchor_roots_floor_without_anchor_structure() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Floor {
            id: "nearby".into(),
            support: Cell { x: 1, y: 0, z: 0 },
        }]).unwrap();
        let mut query = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let result = resolve(&geometry, policy(1), &mut query).unwrap();
        assert!(result.unsupported.is_empty());
    }

    #[test]
    fn multi_anchor_bfs_uses_shortest_distance() {
        let geometry = StaticGeometry::new(bounds(), vec![
            StaticInstance::Floor { id: "left".into(), support: Cell { x: 1, y: 0, z: 0 } },
            StaticInstance::Floor { id: "middle".into(), support: Cell { x: 2, y: 0, z: 0 } },
            StaticInstance::Floor { id: "right".into(), support: Cell { x: 3, y: 0, z: 0 } },
        ]).unwrap();
        let mut query = terrain(&[Cell { x: 0, y: 0, z: 0 }, Cell { x: 4, y: 0, z: 0 }]);
        let result = resolve(&geometry, policy(1), &mut query).unwrap();
        assert_eq!(result.unsupported, vec!["middle"]);
        assert!(result.supported.contains("left"));
        assert!(result.supported.contains("right"));
    }

    #[test]
    fn tiny_support_budget_rejects_before_unbounded_work() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Floor {
            id: "budget".into(),
            support: Cell { x: 1, y: 0, z: 0 },
        }]).unwrap();
        let mut query = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let policy = SupportPolicy { max_span_steps: 1, max_instances: 8, max_work: 2 };
        assert!(resolve(&geometry, policy, &mut query).is_err());
    }

    #[test]
    fn candidate_support_uses_committed_contacts_only() {
        let base = SupportResult {
            supported: BTreeSet::new(), unsupported: Vec::new(), column_tops: BTreeSet::new(),
            stair_landings: BTreeSet::new(), floor_surfaces: BTreeSet::new(), load_contacts: BTreeSet::new(),
            structural_anchors: BTreeSet::new(), floor_distances: BTreeMap::new(),
            cover_distances: BTreeMap::new(),
        };
        let pending = StaticInstance::Floor { id: "pending".into(), support: Cell { x: 2, y: 0, z: 0 } };
        let mut no_terrain = terrain(&[]);
        assert!(!candidate_supported(&base, &pending, 4, &mut no_terrain).unwrap());
    }

    #[test]
    fn prospective_pending_wall_supports_floor_in_stable_id_order() {
        let mut terrain_query = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let base = resolve(&StaticGeometry::new(bounds(), Vec::new()).unwrap(), policy(6), &mut terrain_query).unwrap();
        let wall = StaticInstance::Wall { id: "a-wall".into(), base: Cell { x: 0, y: 1, z: 0 }, height: 4 };
        let floor = StaticInstance::Floor { id: "z-floor".into(), support: Cell { x: 0, y: 5, z: 0 } };
        let mut projected = base.clone();
        assert!(candidate_supported(&projected, &wall, 6, &mut terrain(&[Cell { x: 0, y: 0, z: 0 }])).unwrap());
        add_prospective_support(&mut projected, &wall, 6, None).unwrap();
        assert!(projected.load_contacts.contains(&Cell { x: 0, y: 5, z: 0 }));
        let reverse = base;
        assert!(!candidate_supported(&reverse, &floor, 6, &mut terrain(&[])).unwrap());
        assert!(!candidate_supported(&reverse, &wall, 6, &mut terrain(&[])).unwrap());
    }

    #[test]
    fn prospective_floor_requires_cardinal_chain_and_respects_span() {
        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let mut projected = resolve(&StaticGeometry::new(bounds(), Vec::new()).unwrap(), policy(2), &mut ground).unwrap();
        let first = StaticInstance::Floor { id: "first".into(), support: Cell { x: 1, y: 0, z: 0 } };
        assert!(candidate_supported(&projected, &first, 2, &mut terrain(&[Cell { x: 0, y: 0, z: 0 }])).unwrap());
        add_prospective_support(&mut projected, &first, 2, Some(1)).unwrap();
        let gap = StaticInstance::Floor { id: "gap".into(), support: Cell { x: 3, y: 0, z: 0 } };
        assert!(!candidate_supported(&projected, &gap, 2, &mut terrain(&[])).unwrap());
        let second = StaticInstance::Floor { id: "second".into(), support: Cell { x: 2, y: 0, z: 0 } };
        assert!(candidate_supported(&projected, &second, 2, &mut terrain(&[])).unwrap());
        add_prospective_support(&mut projected, &second, 2, Some(2)).unwrap();
    }

    #[test]
    fn candidate_floor_cannot_jump_a_gap_or_reset_span() {
        let mut base = SupportResult {
            supported: BTreeSet::new(), unsupported: Vec::new(), column_tops: BTreeSet::new(),
            stair_landings: BTreeSet::new(), floor_surfaces: BTreeSet::new(), load_contacts: BTreeSet::new(),
            structural_anchors: BTreeSet::new(), floor_distances: BTreeMap::new(),
            cover_distances: BTreeMap::new(),
        };
        base.floor_distances.insert(Cell { x: 0, y: 0, z: 0 }, 3);
        let adjacent = StaticInstance::Floor { id: "adjacent".into(), support: Cell { x: 1, y: 0, z: 0 } };
        let gap = StaticInstance::Floor { id: "gap".into(), support: Cell { x: 2, y: 0, z: 0 } };
        let mut no_terrain = terrain(&[]);
        assert!(candidate_supported(&base, &adjacent, 4, &mut no_terrain).unwrap());
        assert!(!candidate_supported(&base, &gap, 4, &mut no_terrain).unwrap());
    }

    #[test]
    fn candidate_span_comes_from_resolved_floor_distance() {
        let committed = (0..=1).map(|x| StaticInstance::Floor {
            id: format!("floor-{x}"), support: Cell { x, y: 0, z: 0 },
        }).collect();
        let geometry = StaticGeometry::new(bounds(), committed).unwrap();
        let mut terrain_query = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let base = resolve(&geometry, policy(2), &mut terrain_query).unwrap();
        let allowed = StaticInstance::Floor { id: "allowed".into(), support: Cell { x: 2, y: 0, z: 0 } };
        let rejected = StaticInstance::Floor { id: "rejected".into(), support: Cell { x: 3, y: 0, z: 0 } };
        let mut no_terrain = terrain(&[]);
        assert!(candidate_supported(&base, &allowed, 2, &mut no_terrain).unwrap());
        assert!(!candidate_supported(&base, &rejected, 2, &mut no_terrain).unwrap());
    }

    #[test]
    fn fixture_requires_every_completed_load_contact_and_provides_none() {
        let floors = vec![
            StaticInstance::Floor { id: "floor-0".into(), support: Cell { x: 0, y: 0, z: 0 } },
            StaticInstance::Floor { id: "floor-1".into(), support: Cell { x: 1, y: 0, z: 0 } },
        ];
        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let base = resolve(&StaticGeometry::new(bounds(), floors.clone()).unwrap(), policy(2), &mut ground).unwrap();
        let fixture = StaticInstance::Fixture {
            id: "bed".into(), origin: Cell { x: 0, y: 1, z: 0 },
            orientation: Cardinal::North, footprint: vec![[0, 0], [1, 0]],
        };
        let mut no_terrain = terrain(&[]);
        assert!(candidate_supported(&base, &fixture, 2, &mut no_terrain).unwrap());

        let mut partial_ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let partial = resolve(&StaticGeometry::new(bounds(), vec![floors[0].clone()]).unwrap(), policy(2), &mut partial_ground).unwrap();
        let mut no_terrain = terrain(&[]);
        assert!(!candidate_supported(&partial, &fixture, 2, &mut no_terrain).unwrap());

        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let resolved = resolve(&StaticGeometry::new(bounds(), vec![floors[0].clone(), floors[1].clone(), fixture]).unwrap(), policy(2), &mut ground).unwrap();
        assert!(resolved.supported.contains("bed"));
        assert!(!resolved.load_contacts.contains(&Cell { x: 0, y: 1, z: 0 }));
        assert!(!resolved.structural_anchors.contains(&Cell { x: 0, y: 1, z: 0 }));
    }

    #[test]
    fn cover_span_carries_distance_without_becoming_load_support() {
        let covers = (1..=3).map(|x| StaticInstance::Cover {
            id: format!("roof-{x}"), support: Cell { x, y: 0, z: 0 },
        }).collect();
        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let result = resolve(&StaticGeometry::new(bounds(), covers).unwrap(), policy(2), &mut ground).unwrap();
        assert!(result.supported.contains("roof-1"));
        assert!(result.supported.contains("roof-2"));
        assert_eq!(result.unsupported, vec!["roof-3"]);
        assert_eq!(result.cover_distances.get(&Cell { x: 2, y: 0, z: 0 }), Some(&2));
        assert!(!result.load_contacts.contains(&Cell { x: 1, y: 0, z: 0 }));
        assert!(!result.structural_anchors.contains(&Cell { x: 1, y: 0, z: 0 }));

        let candidate = StaticInstance::Cover { id: "roof-next".into(), support: Cell { x: 3, y: 0, z: 0 } };
        let mut no_terrain = terrain(&[]);
        assert!(!candidate_supported(&result, &candidate, 2, &mut no_terrain).unwrap());
    }

    #[test]
    fn rooted_column_stack_produces_signed_tops() {
        let geometry = StaticGeometry::new(bounds(), vec![
            StaticInstance::Wall { id: "lower".into(), base: Cell { x: 0, y: -4, z: 0 }, height: 2 },
            StaticInstance::Wall { id: "upper".into(), base: Cell { x: 0, y: -2, z: 0 }, height: 1 },
        ]).unwrap();
        let mut query = terrain(&[Cell { x: 0, y: -5, z: 0 }]);
        let result = resolve(&geometry, policy(1), &mut query).unwrap();
        assert!(result.unsupported.is_empty());
        assert!(result.column_tops.contains(&Cell { x: 0, y: -3, z: 0 }));
        assert!(result.column_tops.contains(&Cell { x: 0, y: -2, z: 0 }));
    }

    #[test]
    fn completed_wall_makes_its_top_a_floor_anchor() {
        let wall = StaticInstance::Wall {
            id: "wall".into(),
            base: Cell { x: 0, y: 1, z: 0 },
            height: 4,
        };
        let floor = StaticInstance::Floor {
            id: "upper-floor".into(),
            support: Cell { x: 0, y: 4, z: 0 },
        };
        let geometry = StaticGeometry::new(bounds(), vec![wall.clone(), floor.clone()]).unwrap();
        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        assert!(resolve(&geometry, policy(6), &mut ground).unwrap().unsupported.is_empty());

        let empty = StaticGeometry::new(bounds(), Vec::new()).unwrap();
        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let before_wall = resolve(&empty, policy(6), &mut ground).unwrap();
        let mut no_terrain = terrain(&[]);
        assert!(!candidate_supported(&before_wall, &floor, 6, &mut no_terrain).unwrap());

        let wall_geometry = StaticGeometry::new(bounds(), vec![wall]).unwrap();
        let mut ground = terrain(&[Cell { x: 0, y: 0, z: 0 }]);
        let after_wall = resolve(&wall_geometry, policy(6), &mut ground).unwrap();
        let mut no_terrain = terrain(&[]);
        assert!(candidate_supported(&after_wall, &floor, 6, &mut no_terrain).unwrap());
    }

    #[test]
    fn floor_is_supported_by_the_face_above_a_wall() {
        let wall = StaticInstance::Wall {
            id: "wall".into(),
            base: Cell { x: 2, y: 4, z: -1 },
            height: 3,
        };
        let floor = StaticInstance::Floor {
            id: "floor".into(),
            support: Cell { x: 2, y: 7, z: -1 },
        };
        let geometry = StaticGeometry::new(bounds(), vec![wall, floor]).unwrap();
        let mut ground = terrain(&[Cell { x: 2, y: 3, z: -1 }]);
        let result = resolve(&geometry, policy(1), &mut ground).unwrap();
        assert!(result.unsupported.is_empty());
        assert!(result.load_contacts.contains(&Cell { x: 2, y: 7, z: -1 }));
    }

    #[test]
    fn wall_then_floor_resolution_is_order_independent() {
        let wall = StaticInstance::Wall {
            id: "wall".into(),
            base: Cell { x: 2, y: 4, z: -1 },
            height: 3,
        };
        let floor = StaticInstance::Floor {
            id: "floor".into(),
            support: Cell { x: 2, y: 7, z: -1 },
        };
        let mut first = terrain(&[Cell { x: 2, y: 3, z: -1 }]);
        let forward = resolve(
            &StaticGeometry::new(bounds(), vec![wall.clone(), floor.clone()]).unwrap(),
            policy(1),
            &mut first,
        ).unwrap();
        let mut second = terrain(&[Cell { x: 2, y: 3, z: -1 }]);
        let reverse = resolve(
            &StaticGeometry::new(bounds(), vec![floor, wall]).unwrap(),
            policy(1),
            &mut second,
        ).unwrap();
        assert_eq!(forward.unsupported, reverse.unsupported);
        assert_eq!(forward.supported, reverse.supported);
        assert_eq!(forward.load_contacts, reverse.load_contacts);
    }

    #[test]
    fn signed_stair_height_roots_and_yields_upper_landing() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
            id: "stair".into(), origin: Cell { x: -2, y: -8, z: 3 }, orientation: Cardinal::West, run: 2, rise: 1,
        }]).unwrap();
        let mut query = terrain(&[Cell { x: -2, y: -8, z: 3 }]);
        let result = resolve(&geometry, policy(1), &mut query).unwrap();
        assert!(result.unsupported.is_empty());
        assert!(result.stair_landings.contains(&Cell { x: -4, y: -7, z: 3 }));
    }
}
