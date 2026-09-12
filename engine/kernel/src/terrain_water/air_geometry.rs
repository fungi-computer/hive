use super::TerrainWater;
use crate::generation::{Bounds, Cell};
use crate::structure_geometry::{Face, FaceAxis};
use std::collections::BTreeMap;

const MAX_CELLS: usize = 40_000;
// Bound intermediate geometry as well as the downstream atmosphere graph.
const MAX_FACES: usize = 56_000;

#[derive(Clone, Copy)]
pub(crate) enum AirGeometryEdit<'a> {
    Water(&'a super::PreparedWaterAdvance),
    Excavation(&'a super::PreparedExcavation),
    Structures(&'a super::PreparedStructureChange),
}

pub(crate) struct AirGeometryChanges {
    pub(crate) cells: Vec<Cell>,
    pub(crate) physical_revision: u64,
    pub(crate) epoch: u64,
}

pub(super) fn changes(world: &TerrainWater, edit: AirGeometryEdit<'_>) -> Result<AirGeometryChanges, String> {
    let (owner, epoch, physical_edit) = match edit {
        AirGeometryEdit::Water(p) => (&p.owner, p.epoch, false),
        AirGeometryEdit::Excavation(p) => (&p.owner, p.epoch, true),
        AirGeometryEdit::Structures(p) => (&p.owner, p.epoch, true),
    };
    if !std::sync::Arc::ptr_eq(&world.owner, owner) || world.epoch != epoch {
        return Err("prepared air geometry edit is stale or foreign".into());
    }
    let cells = match edit {
        AirGeometryEdit::Water(p) => world.field.changed_liquid(&p.field),
        AirGeometryEdit::Excavation(p) => vec![world.prepared_excavation_replacement(p).0],
        AirGeometryEdit::Structures(p) => world.structure_projection.changed_air_cells(&p.projection)?.into_iter().collect(),
    };
    Ok(AirGeometryChanges {
        cells, epoch: epoch.checked_add(1).ok_or("air query epoch exhausted")?,
        physical_revision: world.physical_revision.checked_add(u64::from(physical_edit)).ok_or("physical revision exhausted")?,
    })
}

pub(super) fn query_edit(world: &mut TerrainWater, edit: AirGeometryEdit<'_>, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
    match edit {
        AirGeometryEdit::Water(p) => query_water(world, p, bounds),
        AirGeometryEdit::Excavation(p) => query_excavation(world, p, bounds),
        AirGeometryEdit::Structures(p) => query_structure(world, p, bounds),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AirGeometryBounds {
    /// Minimum inclusive coordinate.
    pub min: Cell,
    /// Maximum exclusive coordinate.
    pub max: Cell,
}

#[derive(Clone, Debug, PartialEq)]
pub enum AirWaterCoverage {
    /// This coordinate is admitted by the current water owner.
    Admitted { liquid_volume_m3: f64 },
    /// No water fact is admitted for this coordinate. This is not a claim that
    /// a future water definition could never admit it.
    Unmodeled,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AirGeometryCell {
    pub at: Cell,
    pub voxel_volume_m3: f64,
    pub water: AirWaterCoverage,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AirGeometryFrontier {
    InBoxSolid,
    OutsideQuery,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AirGeometryFaceKind {
    Internal { a: Cell, b: Cell, sealed: bool },
    Frontier { neighbor: AirGeometryFrontier, sealed: bool },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AirGeometryFace {
    pub face: Face,
    pub kind: AirGeometryFaceKind,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AirGeometrySnapshot {
    pub physical_revision: u64,
    pub epoch: u64,
    pub bounds: AirGeometryBounds,
    pub cells: Vec<AirGeometryCell>,
    pub faces: Vec<AirGeometryFace>,
}

pub(super) fn query(world: &mut TerrainWater, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
    query_view(AirQueryView {
        terrain: &mut world.terrain,
        structures: &world.structure_projection,
        field: &world.field,
        replacement: None,
        physical_revision: world.physical_revision,
        epoch: world.epoch,
    }, bounds)
}

// Borrow the proposed physical owners. Inspection does not publish geometry,
// spend materials, clone the world, or introduce another material grid.
struct AirQueryView<'a> {
    terrain: &'a mut crate::terrain::TerrainOwner,
    structures: &'a crate::structure_geometry::GeometryProjection,
    field: &'a super::field::Field,
    replacement: Option<(Cell, u16)>,
    physical_revision: u64,
    epoch: u64,
}

pub(super) fn query_structure(
    world: &mut TerrainWater,
    prepared: &super::PreparedStructureChange,
    bounds: AirGeometryBounds,
) -> Result<AirGeometrySnapshot, String> {
    if !std::sync::Arc::ptr_eq(&world.owner, &prepared.owner) || world.epoch != prepared.epoch {
        return Err("prepared structure change is stale or foreign".into());
    }
    let physical_revision = world.physical_revision.checked_add(1).ok_or("physical geometry revision exhausted")?;
    let epoch = world.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
    query_view(AirQueryView {
        terrain: &mut world.terrain,
        structures: &prepared.projection,
        field: &prepared.field,
        replacement: None,
        physical_revision,
        epoch,
    }, bounds)
}

pub(super) fn query_excavation(
    world: &mut TerrainWater,
    prepared: &super::PreparedExcavation,
    bounds: AirGeometryBounds,
) -> Result<AirGeometrySnapshot, String> {
    if !std::sync::Arc::ptr_eq(&world.owner, &prepared.owner) || world.epoch != prepared.epoch {
        return Err("prepared excavation is stale or foreign".into());
    }
    let physical_revision = world.physical_revision.checked_add(1).ok_or("physical geometry revision exhausted")?;
    let epoch = world.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
    let replacement = Some(world.prepared_excavation_replacement(prepared));
    query_view(AirQueryView {
        terrain: &mut world.terrain,
        structures: &world.structure_projection,
        field: &prepared.field,
        replacement,
        physical_revision,
        epoch,
    }, bounds)
}

pub(super) fn query_water(
    world: &mut TerrainWater,
    prepared: &super::PreparedWaterAdvance,
    bounds: AirGeometryBounds,
) -> Result<AirGeometrySnapshot, String> {
    if !std::sync::Arc::ptr_eq(&world.owner, &prepared.owner) || world.epoch != prepared.epoch {
        return Err("prepared water advance is stale or foreign".into());
    }
    let epoch = world.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
    query_view(AirQueryView {
        terrain: &mut world.terrain,
        structures: &world.structure_projection,
        field: &prepared.field,
        replacement: None,
        physical_revision: world.physical_revision,
        epoch,
    }, bounds)
}

fn query_view(view: AirQueryView<'_>, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
    validate_bounds(bounds, view.terrain.bounds())?;
    let spacing = view.terrain.cell_spacing_m();
    if spacing.iter().any(|value| !value.is_finite() || *value <= 0.0) {
        return Err("air geometry spacing is invalid".into());
    }
    let voxel_volume_m3 = spacing.iter().product::<f64>();
    if !voxel_volume_m3.is_finite() || voxel_volume_m3 <= 0.0 {
        return Err("air geometry voxel volume is invalid".into());
    }

    let mut cells = Vec::new();
    let mut index = BTreeMap::new();
    for x in bounds.min.x..bounds.max.x {
        for y in bounds.min.y..bounds.max.y {
            for z in bounds.min.z..bounds.max.z {
                let at = Cell { x, y, z };
                let material = match view.replacement {
                    Some((replacement_cell, replacement)) if replacement_cell == at => replacement,
                    _ => view.terrain.query(at)?,
                };
                if !view.terrain.is_open_material(material) || view.structures.is_bulk_solid(at) {
                    continue;
                }
                let coverage = match (i32::try_from(x), i32::try_from(y), i32::try_from(z)) {
                    (Ok(x), Ok(y), Ok(z)) => view.field.liquid_volume(Cell { x: i64::from(x), y, z: i64::from(z) })
                        .map_or(AirWaterCoverage::Unmodeled, |liquid_volume_m3| AirWaterCoverage::Admitted { liquid_volume_m3 }),
                    _ => AirWaterCoverage::Unmodeled,
                };
                index.insert(at, cells.len());
                cells.push(AirGeometryCell { at, voxel_volume_m3, water: coverage });
            }
        }
    }

    let mut faces = BTreeMap::<Face, AirGeometryFaceKind>::new();
    const DIRECTIONS: &[(FaceAxis, i64, i32, i64)] = &[
        (FaceAxis::X, 1, 0, 0), (FaceAxis::X, -1, 0, 0),
        (FaceAxis::Y, 0, 1, 0), (FaceAxis::Y, 0, -1, 0),
        (FaceAxis::Z, 0, 0, 1), (FaceAxis::Z, 0, 0, -1),
    ];
    for cell in &cells {
        for &(axis, dx, dy, dz) in DIRECTIONS {
            let neighbor = Cell {
                x: cell.at.x.checked_add(dx).ok_or("air geometry x coordinate overflow")?,
                y: cell.at.y.checked_add(dy).ok_or("air geometry y coordinate overflow")?,
                z: cell.at.z.checked_add(dz).ok_or("air geometry z coordinate overflow")?,
            };
            let (face_cell, a, b) = match axis {
                FaceAxis::X if dx > 0 => (cell.at, cell.at, neighbor),
                FaceAxis::X => (neighbor, neighbor, cell.at),
                FaceAxis::Y if dy > 0 => (cell.at, cell.at, neighbor),
                FaceAxis::Y => (neighbor, neighbor, cell.at),
                FaceAxis::Z if dz > 0 => (cell.at, cell.at, neighbor),
                FaceAxis::Z => (neighbor, neighbor, cell.at),
            };
            let face = Face { cell: face_cell, axis };
            if faces.contains_key(&face) { continue; }
            let sealed = view.structures.is_face_sealed(face);
            let kind = if index.contains_key(&neighbor) {
                AirGeometryFaceKind::Internal { a, b, sealed }
            } else {
                let frontier = if contains(bounds, neighbor) {
                    AirGeometryFrontier::InBoxSolid
                } else {
                    AirGeometryFrontier::OutsideQuery
                };
                AirGeometryFaceKind::Frontier { neighbor: frontier, sealed }
            };
            if faces.len() >= MAX_FACES {
                return Err("air geometry face budget exceeded".into());
            }
            faces.insert(face, kind);
        }
    }

    Ok(AirGeometrySnapshot {
        physical_revision: view.physical_revision,
        epoch: view.epoch,
        bounds,
        cells,
        faces: faces.into_iter().map(|(face, kind)| AirGeometryFace { face, kind }).collect(),
    })
}

fn contains(bounds: AirGeometryBounds, cell: Cell) -> bool {
    cell.x >= bounds.min.x && cell.x < bounds.max.x
        && cell.y >= bounds.min.y && cell.y < bounds.max.y
        && cell.z >= bounds.min.z && cell.z < bounds.max.z
}

fn validate_bounds(request: AirGeometryBounds, world: Bounds) -> Result<(), String> {
    if request.min.x >= request.max.x || request.min.y >= request.max.y || request.min.z >= request.max.z {
        return Err("air geometry bounds must be nonempty".into());
    }
    if request.min.x < world.min_x || request.max.x > world.max_x
        || request.min.y < world.min_y || request.max.y > world.max_y
        || request.min.z < world.min_z || request.max.z > world.max_z {
        return Err("air geometry bounds outside generated world".into());
    }
    let x = u128::try_from(i128::from(request.max.x) - i128::from(request.min.x)).map_err(|_| "air geometry x extent overflow")?;
    let y = u128::try_from(i128::from(request.max.y) - i128::from(request.min.y)).map_err(|_| "air geometry y extent overflow")?;
    let z = u128::try_from(i128::from(request.max.z) - i128::from(request.min.z)).map_err(|_| "air geometry z extent overflow")?;
    let count = x.checked_mul(y).and_then(|value| value.checked_mul(z)).ok_or("air geometry cell budget overflow")?;
    if count == 0 || count > MAX_CELLS as u128 { return Err("air geometry cell budget exceeded".into()); }
    if request.min.x == i64::MIN || request.min.z == i64::MIN || request.min.y == i32::MIN {
        return Err("air geometry bounds leave no checked neighbor collar".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::{MaterialSlots, WorldSpec};
    use crate::structure_geometry::{StaticGeometry, StaticInstance};
    use crate::terrain::MaterialProperty;
    use crate::terrain_water::{MaterialWater, TerrainWaterGeometry};
    use crate::water::{WaterLimits, WaterStock};
    use std::collections::BTreeMap;

    fn world() -> (TerrainWater, Cell) {
        let bounds = Bounds { min_x: -32, max_x: 32, min_y: -32, max_y: 64, min_z: -32, max_z: 32 };
        let generator = WorldSpec {
            seed: "air-geometry",
            identity: "air-geometry",
            bounds,
            slots: MaterialSlots { air: 0, soil: 1, stone: 2 },
            sea_level: 1,
            vertical_metres: 1.0,
            max_samples: 4096,
        }.compile().unwrap();
        let mut terrain = crate::terrain::TerrainOwner::new(generator, [
            MaterialProperty { slot: 0, solid: false, diggable: false },
            MaterialProperty { slot: 1, solid: true, diggable: true },
            MaterialProperty { slot: 2, solid: true, diggable: true },
        ], 4, 128, 32_768).unwrap();
        let mut pair = None;
        'search: for x in bounds.min_x..bounds.max_x {
            for z in bounds.min_z..bounds.max_z {
                for y in bounds.min_y..bounds.max_y - 1 {
                    let lower = Cell { x, y, z };
                    let upper = Cell { y: y + 1, ..lower };
                    let lower_material = terrain.query(lower).unwrap();
                    let upper_material = terrain.query(upper).unwrap();
                    if terrain.is_open_material(lower_material)
                        && terrain.is_open_material(upper_material) {
                        pair = Some(lower);
                        break 'search;
                    }
                }
            }
        }
        let wet = pair.expect("generated fixture has an open vertical pair");
        let geometry = TerrainWaterGeometry::new(
            "air-geometry-water".into(),
            vec![wet],
            BTreeMap::from([(0, MaterialWater::Open), (1, MaterialWater::Closed), (2, MaterialWater::Closed)]),
            [1.0; 3], 1.0, 0.1, WaterLimits::default(), 6,
        ).unwrap();
        let stock = WaterStock { id: format!("cell:{},{},{}", wet.x, wet.y, wet.z), mass_kg: 0.0 };
        (TerrainWater::fresh(geometry, terrain, &[stock]).unwrap(), wet)
    }

    #[test]
    fn dry_air_geometry_includes_open_building_space_outside_sparse_water() {
        let (mut world, wet) = world();
        let snapshot = world.air_geometry(AirGeometryBounds {
            min: wet,
            max: Cell { x: wet.x + 5, y: wet.y + 2, z: wet.z + 5 },
        }).unwrap();
        assert!(snapshot.cells.iter().any(|cell| cell.at != wet && matches!(cell.water, AirWaterCoverage::Unmodeled)));
        assert!(snapshot.cells.iter().any(|cell| cell.at == wet && matches!(cell.water, AirWaterCoverage::Admitted { liquid_volume_m3: 0.0 })));
    }

    #[test]
    fn floor_projection_seals_an_air_face_without_removing_air_cells() {
        let (mut world, support) = world();
        let bounds = AirGeometryBounds {
            min: support,
            max: Cell { x: support.x + 1, y: support.y + 2, z: support.z + 1 },
        };
        let before = world.air_geometry(bounds).unwrap();
        let geometry = StaticGeometry::new(world.bounds(), vec![StaticInstance::Floor { id: "air-floor".into(), support }]).unwrap();
        world.structures = geometry.clone();
        world.structure_projection = geometry.projection().unwrap();
        let after = world.air_geometry(bounds).unwrap();
        assert_eq!(before.cells.len(), after.cells.len());
        assert!(after.faces.iter().any(|face| face.face == Face::upward(support)
            && matches!(face.kind, AirGeometryFaceKind::Internal { sealed: true, .. })));
    }

    #[test]
    fn bounds_are_rejected_before_terrain_sampling() {
        let (mut world, _) = world();
        let before = world.terrain.cache_len();
        assert!(world.air_geometry(AirGeometryBounds {
            min: Cell { x: -32, y: -32, z: -32 },
            max: Cell { x: 32, y: 64, z: 32 },
        }).is_err());
        assert_eq!(world.terrain.cache_len(), before);
        assert!(world.air_geometry(AirGeometryBounds {
            min: Cell { x: -33, y: -1, z: -1 },
            max: Cell { x: 1, y: 1, z: 1 },
        }).is_err());
        assert_eq!(world.terrain.cache_len(), before);
        assert!(validate_bounds(AirGeometryBounds {
            min: Cell { x: i64::MIN, y: i32::MIN, z: i64::MIN },
            max: Cell { x: i64::MAX, y: i32::MAX, z: i64::MAX },
        }, Bounds { min_x: i64::MIN, max_x: i64::MAX, min_y: i32::MIN, max_y: i32::MAX, min_z: i64::MIN, max_z: i64::MAX }).is_err());
    }
}
