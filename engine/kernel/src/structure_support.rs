//! Bounded rooted support over canonical static structure instances.
//!
//! This module indexes support facts only. Terrain remains an external
//! support query and no material or geometry is mutated here.

use crate::generation::Cell;
use crate::structure_geometry::{Cardinal, StaticGeometry, StaticInstance};
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
}

fn instance_id(instance: &StaticInstance) -> &str {
    match instance {
        StaticInstance::Floor { id, .. }
        | StaticInstance::Wall { id, .. }
        | StaticInstance::Stair { id, .. } => id,
    }
}

fn cardinal_delta(direction: Cardinal) -> (i64, i64) {
    match direction {
        Cardinal::North => (0, -1),
        Cardinal::East => (1, 0),
        Cardinal::South => (0, 1),
        Cardinal::West => (-1, 0),
    }
}

fn wall_top(base: Cell, height: u8) -> Result<Cell, String> {
    Ok(Cell { y: base.y.checked_add(i32::from(height)).ok_or("structure support coordinate overflow")?, ..base })
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
/// `terrain_support(cell)` answers whether a structure base at `cell` has a
/// real terrain support immediately below it.
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
        work = work.checked_add(1).ok_or("structure support work overflow")?;
        if work > policy.max_work {
            return Err("structure support work budget exceeded".into());
        }
        let supported = terrain_support(cell)?;
        terrain_cache.insert(cell, supported);
        Ok(supported)
    };

    let mut terrain_anchors = BTreeSet::new();
    for instance in instances {
        let base = match instance {
            StaticInstance::Floor { support, .. } => *support,
            StaticInstance::Wall { base, .. } => *base,
            StaticInstance::Stair { origin, .. } => *origin,
        };
        if support_at(base)? {
            terrain_anchors.insert(base);
        }
    }

    let floor_by_cell: BTreeMap<Cell, &StaticInstance> = instances.iter().filter_map(|instance| {
        if let StaticInstance::Floor { support, .. } = instance { Some((*support, instance)) } else { None }
    }).collect();
    if floor_by_cell.len() != instances.iter().filter(|instance| matches!(instance, StaticInstance::Floor { .. })).count() {
        return Err("duplicate structure floor support cell".into());
    }

    let mut rooted = BTreeSet::<String>::new();
    let mut rooted_walls = BTreeSet::<String>::new();
    let mut rooted_stairs = BTreeSet::<String>::new();
    let mut rooted_floors = BTreeSet::<String>::new();
    let mut column_tops = BTreeSet::new();
    let mut stair_landings = BTreeSet::new();
    let mut floor_surfaces = BTreeSet::new();

    for _ in 0..=instances.len() {
        let mut anchors = terrain_anchors.clone();
        anchors.extend(column_tops.iter().copied());
        anchors.extend(stair_landings.iter().copied());
        anchors.extend(floor_surfaces.iter().copied());

        let mut changed = false;
        for instance in instances {
            match instance {
                StaticInstance::Wall { id, base, height } if !rooted_walls.contains(id) && anchors.contains(base) => {
                    rooted_walls.insert(id.clone());
                    rooted.insert(id.clone());
                    column_tops.insert(wall_top(*base, *height)?);
                    changed = true;
                }
                StaticInstance::Stair { id, origin, orientation, run, rise } if !rooted_stairs.contains(id) && anchors.contains(origin) => {
                    rooted_stairs.insert(id.clone());
                    rooted.insert(id.clone());
                    stair_landings.insert(stair_landing(*origin, *orientation, *run, *rise)?);
                    changed = true;
                }
                _ => {}
            }
        }

        let mut distances = BTreeMap::<Cell, u32>::new();
        let mut queue = VecDeque::new();
        for (cell, instance) in &floor_by_cell {
            if anchors.contains(cell) {
                distances.insert(*cell, 0);
                queue.push_back(*cell);
                if rooted_floors.insert(instance_id(instance).to_string()) {
                    rooted.insert(instance_id(instance).to_string());
                    changed = true;
                }
                floor_surfaces.insert(*cell);
            }
        }
        while let Some(cell) = queue.pop_front() {
            let distance = distances[&cell];
            if distance >= policy.max_span_steps {
                continue;
            }
            for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let next = cardinal_neighbor(cell, dx, dz)?;
                if !floor_by_cell.contains_key(&next) || distances.contains_key(&next) {
                    continue;
                }
                distances.insert(next, distance + 1);
                queue.push_back(next);
                let instance = floor_by_cell[&next];
                if rooted_floors.insert(instance_id(instance).to_string()) {
                    rooted.insert(instance_id(instance).to_string());
                    floor_surfaces.insert(next);
                    changed = true;
                }
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
    Ok(SupportResult { supported: rooted, unsupported, column_tops, stair_landings, floor_surfaces })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::Bounds;

    fn bounds() -> Bounds {
        Bounds { min_x: -32, max_x: 32, min_y: -32, max_y: 32, min_z: -32, max_z: 32 }
    }
    fn policy(max_span_steps: u32) -> SupportPolicy {
        SupportPolicy { max_span_steps, max_instances: 32, max_work: 64 }
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
    fn rooted_column_stack_produces_signed_tops() {
        let geometry = StaticGeometry::new(bounds(), vec![
            StaticInstance::Wall { id: "lower".into(), base: Cell { x: 0, y: -4, z: 0 }, height: 2 },
            StaticInstance::Wall { id: "upper".into(), base: Cell { x: 0, y: -2, z: 0 }, height: 1 },
        ]).unwrap();
        let mut query = terrain(&[Cell { x: 0, y: -4, z: 0 }]);
        let result = resolve(&geometry, policy(1), &mut query).unwrap();
        assert!(result.unsupported.is_empty());
        assert!(result.column_tops.contains(&Cell { x: 0, y: -2, z: 0 }));
        assert!(result.column_tops.contains(&Cell { x: 0, y: -1, z: 0 }));
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
