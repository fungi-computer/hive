//! Validated static structure geometry.
//!
//! Structure instances are canonical authored facts. `GeometryProjection` is
//! rebuilt indexing, deliberately separate from those facts. Terrain and
//! environment owners supply their own material queries when consuming the
//! projection; this module does not maintain a second material grid.

use crate::generation::{Bounds, Cell};
use std::collections::BTreeSet;

const MAX_INSTANCES: usize = 4096;
const MAX_DERIVED_CELLS: usize = 16384;
const MAX_WALL_HEIGHT: u8 = 64;
const MAX_STAIR_RUN: u8 = 64;
const MAX_STAIR_RISE: u8 = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Cardinal {
    North,
    East,
    South,
    West,
}

impl Cardinal {
    fn delta(self) -> (i64, i64) {
        match self {
            Self::North => (0, -1),
            Self::East => (1, 0),
            Self::South => (0, 1),
            Self::West => (-1, 0),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum FaceAxis {
    X,
    Y,
    Z,
}

/// Canonical undirected face between this cell and its positive-axis neighbor.
/// A floor's top face is `Face::upward(floor.support)`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Face {
    pub cell: Cell,
    pub axis: FaceAxis,
}

impl Face {
    pub const fn upward(cell: Cell) -> Self {
        Self { cell, axis: FaceAxis::Y }
    }

    pub fn metric_height(self, spacing_y: f64) -> Result<f64, String> {
        if !spacing_y.is_finite() || spacing_y <= 0.0 {
            return Err("invalid structure vertical spacing".into());
        }
        let height = (f64::from(self.cell.y) + 0.5) * spacing_y;
        height.is_finite().then_some(height).ok_or("structure face metric position is not finite".into())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StaticInstance {
    Floor { id: u64, support: Cell },
    Wall { id: u64, base: Cell, height: u8 },
    Stair {
        id: u64,
        origin: Cell,
        orientation: Cardinal,
        run: u8,
        rise: u8,
    },
}

impl StaticInstance {
    fn id(&self) -> u64 {
        match self {
            Self::Floor { id, .. } | Self::Wall { id, .. } | Self::Stair { id, .. } => *id,
        }
    }

    fn bound(&self, bounds: Bounds) -> Result<usize, String> {
        match self {
            Self::Floor { id, support } => {
                if *id == 0 || !contains(bounds, *support) {
                    return Err("structure floor is outside generated bounds".into());
                }
                Ok(1)
            }
            Self::Wall { id, base, height } => {
                if *id == 0 || *height == 0 || *height > MAX_WALL_HEIGHT {
                    return Err("invalid bounded structure wall".into());
                }
                for offset in 0..u32::from(*height) {
                    let y = base.y.checked_add(i32::try_from(offset).map_err(|_| "structure wall coordinate overflow")?)
                        .ok_or("structure wall coordinate overflow")?;
                    if !contains(bounds, Cell { y, ..*base }) {
                        return Err("structure wall is outside generated bounds".into());
                    }
                }
                Ok(usize::from(*height))
            }
            Self::Stair { id, origin, orientation, run, rise } => {
                let _ = orientation.delta();
                if *id == 0 || *run == 0 || *run > MAX_STAIR_RUN || *rise == 0 || *rise > MAX_STAIR_RISE || *rise > *run {
                    return Err("invalid bounded structure stair".into());
                }
                for index in 0..=u32::from(*run) {
                    let (dx, dz) = orientation.delta();
                    let horizontal = i64::from(index);
                    let x = origin.x.checked_add(dx.checked_mul(horizontal).ok_or("structure stair coordinate overflow")?)
                        .ok_or("structure stair coordinate overflow")?;
                    let z = origin.z.checked_add(dz.checked_mul(horizontal).ok_or("structure stair coordinate overflow")?)
                        .ok_or("structure stair coordinate overflow")?;
                    let product = horizontal.checked_mul(i64::from(*rise)).ok_or("structure stair coordinate overflow")?;
                    let y_offset = product / i64::from(*run);
                    let y = origin.y.checked_add(i32::try_from(y_offset).map_err(|_| "structure stair coordinate overflow")?)
                        .ok_or("structure stair coordinate overflow")?;
                    if !contains(bounds, Cell { x, y, z }) {
                        return Err("structure stair is outside generated bounds".into());
                    }
                }
                usize::from(*run) + 1
            }
        }
    }

    fn derive(&self, solids: &mut BTreeSet<Cell>, faces: &mut BTreeSet<Face>) -> Result<(), String> {
        match self {
            Self::Floor { support, .. } => {
                faces.insert(Face::upward(*support));
            }
            Self::Wall { base, height, .. } => {
                for offset in 0..u32::from(*height) {
                    let y = base.y.checked_add(i32::try_from(offset).map_err(|_| "structure wall coordinate overflow")?)
                        .ok_or("structure wall coordinate overflow")?;
                    if !solids.insert(Cell { y, ..*base }) {
                        return Err("duplicate structure bulk occupied cell".into());
                    }
                }
            }
            Self::Stair { origin, orientation, run, rise, .. } => {
                let (dx, dz) = orientation.delta();
                for index in 0..=u32::from(*run) {
                    let horizontal = i64::from(index);
                    let x = origin.x.checked_add(dx.checked_mul(horizontal).ok_or("structure stair coordinate overflow")?)
                        .ok_or("structure stair coordinate overflow")?;
                    let z = origin.z.checked_add(dz.checked_mul(horizontal).ok_or("structure stair coordinate overflow")?)
                        .ok_or("structure stair coordinate overflow")?;
                    let product = horizontal.checked_mul(i64::from(*rise)).ok_or("structure stair coordinate overflow")?;
                    let y_offset = product / i64::from(*run);
                    let y = origin.y.checked_add(i32::try_from(y_offset).map_err(|_| "structure stair coordinate overflow")?)
                        .ok_or("structure stair coordinate overflow")?;
                    if !solids.insert(Cell { x, y, z }) {
                        return Err("duplicate structure bulk occupied cell".into());
                    }
                    faces.insert(Face::upward(Cell { x, y, z }));
                }
            }
        }
        Ok(())
    }
}

/// Canonical structure instances. Derived indexes are rebuilt on demand.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StaticGeometry {
    bounds: Bounds,
    instances: Vec<StaticInstance>,
}

impl StaticGeometry {
    pub fn new(bounds: Bounds, instances: Vec<StaticInstance>) -> Result<Self, String> {
        if instances.len() > MAX_INSTANCES {
            return Err("structure instance budget exceeded".into());
        }
        let mut ids = BTreeSet::new();
        let mut derived = 0usize;
        for instance in &instances {
            if !ids.insert(instance.id()) {
                return Err("duplicate structure instance identity".into());
            }
            derived = derived.checked_add(instance.bound(bounds)?).ok_or("structure geometry budget overflow")?;
            if derived > MAX_DERIVED_CELLS {
                return Err("structure derived geometry budget exceeded".into());
            }
        }
        Ok(Self { bounds, instances })
    }

    pub fn bounds(&self) -> Bounds { self.bounds }
    pub fn instances(&self) -> &[StaticInstance] { &self.instances }

    pub fn projection(&self) -> Result<GeometryProjection, String> {
        let mut solids = BTreeSet::new();
        let mut faces = BTreeSet::new();
        for instance in &self.instances {
            instance.bound(self.bounds)?;
            instance.derive(&mut solids, &mut faces)?;
        }
        Ok(GeometryProjection { solids, sealed_faces: faces })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeometryProjection {
    solids: BTreeSet<Cell>,
    sealed_faces: BTreeSet<Face>,
}

impl GeometryProjection {
    pub fn is_bulk_solid(&self, cell: Cell) -> bool { self.solids.contains(&cell) }
    pub fn is_face_sealed(&self, face: Face) -> bool { self.sealed_faces.contains(&face) }
    pub fn supports(&self, cell: Cell) -> bool { self.is_face_sealed(Face::upward(cell)) }
    pub fn solid_cells(&self) -> impl Iterator<Item = &Cell> { self.solids.iter() }
    pub fn sealed_faces(&self) -> impl Iterator<Item = &Face> { self.sealed_faces.iter() }
}

fn contains(bounds: Bounds, cell: Cell) -> bool {
    cell.x >= bounds.min_x && cell.x < bounds.max_x
        && cell.y >= bounds.min_y && cell.y < bounds.max_y
        && cell.z >= bounds.min_z && cell.z < bounds.max_z
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bounds() -> Bounds {
        Bounds { min_x: -32, max_x: 32, min_y: -32, max_y: 32, min_z: -32, max_z: 32 }
    }

    #[test]
    fn floor_seals_and_supports_without_bulk_volume() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Floor {
            id: 1,
            support: Cell { x: -4, y: -7, z: 3 },
        }]).unwrap();
        let projection = geometry.projection().unwrap();
        let support = Cell { x: -4, y: -7, z: 3 };
        assert!(!projection.is_bulk_solid(support));
        assert!(projection.is_face_sealed(Face::upward(support)));
        assert!(projection.supports(support));
        assert_eq!(Face::upward(support).metric_height(0.54).unwrap(), (-6.5) * 0.54);
    }

    #[test]
    fn stair_orientations_derive_expected_cardinal_cells() {
        for (id, orientation, expected) in [
            (1, Cardinal::North, Cell { x: 0, y: 1, z: -2 }),
            (2, Cardinal::East, Cell { x: 2, y: 1, z: 0 }),
            (3, Cardinal::South, Cell { x: 0, y: 1, z: 2 }),
            (4, Cardinal::West, Cell { x: -2, y: 1, z: 0 }),
        ] {
            let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
                id,
                origin: Cell { x: 0, y: 0, z: 0 },
                orientation,
                run: 2,
                rise: 1,
            }]).unwrap();
            assert!(geometry.projection().unwrap().is_bulk_solid(expected));
        }
    }

    #[test]
    fn negative_deep_coordinates_are_valid_and_outside_is_rejected() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: 1,
            base: Cell { x: -31, y: -31, z: -31 },
            height: 2,
        }]).unwrap();
        assert!(geometry.projection().unwrap().is_bulk_solid(Cell { x: -31, y: -30, z: -31 }));
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Floor {
            id: 2,
            support: Cell { x: 32, y: 0, z: 0 },
        }]).is_err());
    }

    #[test]
    fn shared_sealing_faces_deduplicate_but_bulk_conflicts_reject() {
        let floor = |id| StaticInstance::Floor { id, support: Cell { x: 0, y: 0, z: 0 } };
        let geometry = StaticGeometry::new(bounds(), vec![floor(1), floor(2)]).unwrap();
        assert_eq!(geometry.projection().unwrap().sealed_faces().count(), 1);
        assert!(StaticGeometry::new(bounds(), vec![
            StaticInstance::Wall { id: 3, base: Cell { x: 0, y: 0, z: 0 }, height: 1 },
            StaticInstance::Wall { id: 4, base: Cell { x: 0, y: 0, z: 0 }, height: 1 },
        ]).is_err());
    }

    #[test]
    fn invalid_limits_and_coordinate_overflow_reject_before_expansion() {
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
            id: 1, origin: Cell { x: i64::MAX, y: 0, z: 0 }, orientation: Cardinal::East, run: 2, rise: 1,
        }]).is_err());
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
            id: 1, origin: Cell { x: 0, y: 0, z: 0 }, orientation: Cardinal::East, run: 2, rise: 3,
        }]).is_err());
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: 0, base: Cell { x: 0, y: 0, z: 0 }, height: 1,
        }]).is_err());
    }
}
