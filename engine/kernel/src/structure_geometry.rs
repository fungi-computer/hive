//! Validated static structure geometry.
//!
//! Structure instances are canonical authored facts. `GeometryProjection` is
//! rebuilt indexing, deliberately separate from those facts. Terrain and
//! environment owners supply their own material queries when consuming the
//! projection; this module does not maintain a second material grid.

use crate::generation::{Bounds, Cell};
use std::collections::{BTreeMap, BTreeSet};
use serde::{Deserialize, Serialize};

const MAX_INSTANCES: usize = 4096;
const MAX_DERIVED_CELLS: usize = 16384;
const MAX_WALL_HEIGHT: u8 = 64;
const MAX_STAIR_RUN: u8 = 64;
const MAX_STAIR_RISE: u8 = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Cardinal {
    North,
    East,
    South,
    West,
}

impl Cardinal {
    pub(crate) fn delta(self) -> (i64, i64) {
        match self {
            Self::North => (0, -1),
            Self::East => (1, 0),
            Self::South => (0, 1),
            Self::West => (-1, 0),
        }
    }
}

pub(crate) fn fixture_cells(
    origin: Cell,
    orientation: Cardinal,
    footprint: &[[i8; 2]],
) -> Result<Vec<Cell>, String> {
    footprint
        .iter()
        .map(|[x, z]| {
            let (dx, dz) = match orientation {
                Cardinal::North => (i64::from(*x), i64::from(*z)),
                Cardinal::East => (-i64::from(*z), i64::from(*x)),
                Cardinal::South => (-i64::from(*x), -i64::from(*z)),
                Cardinal::West => (i64::from(*z), -i64::from(*x)),
            };
            Ok(Cell {
                x: origin.x.checked_add(dx).ok_or("structure fixture coordinate overflow")?,
                y: origin.y,
                z: origin.z.checked_add(dz).ok_or("structure fixture coordinate overflow")?,
            })
        })
        .collect()
}

/// A traversal connection owned by a committed stair.  This is derived from
/// the canonical instance and is never saved as a second physical fact.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct StairEdge {
    pub id: String,
    pub entrance: Cell,
    pub landing: Cell,
    pub orientation: Cardinal,
    pub run: u8,
    pub rise: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FaceAxis {
    X,
    Y,
    Z,
}

impl FaceAxis {
    pub const fn is_vertical(self) -> bool { matches!(self, Self::X | Self::Z) }
}

/// Canonical undirected face between this cell and its positive-axis neighbor.
/// A floor's top face is `Face::upward(floor.support)`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Face {
    pub cell: Cell,
    pub axis: FaceAxis,
}

impl Face {
    pub(crate) fn neighbor(self) -> Result<Cell, String> {
        let mut cell = self.cell;
        match self.axis {
            FaceAxis::X => cell.x = cell.x.checked_add(1).ok_or("face x overflow")?,
            FaceAxis::Y => cell.y = cell.y.checked_add(1).ok_or("face y overflow")?,
            FaceAxis::Z => cell.z = cell.z.checked_add(1).ok_or("face z overflow")?,
        }
        Ok(cell)
    }
    pub const fn upward(cell: Cell) -> Self {
        Self { cell, axis: FaceAxis::Y }
    }

    pub fn metric_height(self, spacing_y: f64) -> Result<f64, String> {
        if self.axis != FaceAxis::Y {
            return Err("metric height is defined only for horizontal faces".into());
        }
        if !spacing_y.is_finite() || spacing_y <= 0.0 {
            return Err("invalid structure vertical spacing".into());
        }
        let height = (f64::from(self.cell.y) + 0.5) * spacing_y;
        height.is_finite().then_some(height).ok_or("structure face metric position is not finite".into())
    }
}

/// Convert a placement-side orientation into the canonical face whose lower
/// neighbour is the selected support cell.
pub fn edge_for_cell(cell: Cell, side: Cardinal) -> Result<Face, String> {
    match side {
        Cardinal::North => Ok(Face { cell: Cell { z: cell.z.checked_sub(1).ok_or("edge z underflow")?, ..cell }, axis: FaceAxis::Z }),
        Cardinal::South => Ok(Face { cell, axis: FaceAxis::Z }),
        Cardinal::East => Ok(Face { cell, axis: FaceAxis::X }),
        Cardinal::West => Ok(Face { cell: Cell { x: cell.x.checked_sub(1).ok_or("edge x underflow")?, ..cell }, axis: FaceAxis::X }),
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum StaticInstance {
    Floor { id: String, support: Cell },
    Cover { id: String, support: Cell },
    Fixture { id: String, origin: Cell, orientation: Cardinal, footprint: Vec<[i8; 2]> },
    /// A wall occupies the vertical faces of one canonical X/Z edge. `edge.cell`
    /// is the lower-index neighbour; it is never a cell-centred bulk column.
    Wall { id: String, edge: Face, height: u8 },
    ApertureWall {
        id: String,
        edge: Face,
        height: u8,
        #[serde(rename = "openingBottom")]
        opening_bottom: u8,
        #[serde(rename = "openingHeight")]
        opening_height: u8,
        open: bool,
    },
    Stair {
        id: String,
        origin: Cell,
        orientation: Cardinal,
        run: u8,
        rise: u8,
    },
}

impl StaticInstance {
    fn id(&self) -> &str {
        match self {
            Self::Floor { id, .. } | Self::Cover { id, .. } | Self::Fixture { id, .. } | Self::Wall { id, .. } | Self::ApertureWall { id, .. } | Self::Stair { id, .. } => id.as_str(),
        }
    }

    fn bound(&self, bounds: Bounds) -> Result<usize, String> {
        match self {
            Self::Floor { id, support } => {
                if !crate::components::valid_id(id) || !contains(bounds, *support) {
                    return Err("structure floor is outside generated bounds".into());
                }
                Ok(1)
            }
            Self::Cover { id, support } => {
                if !crate::components::valid_id(id) || !contains(bounds, *support) { return Err("structure cover is outside generated bounds".into()); }
                Ok(1)
            }
            Self::Fixture { id, origin, orientation, footprint } => {
                if !crate::components::valid_id(id) || footprint.is_empty() || footprint.len() > 16
                    || footprint.iter().any(|[x, z]| i16::from(*x).abs() > 8 || i16::from(*z).abs() > 8)
                { return Err("invalid bounded structure fixture".into()); }
                let mut cells = BTreeSet::new();
                for cell in fixture_cells(*origin, *orientation, footprint)? { if !contains(bounds, cell) || !cells.insert(cell) { return Err("invalid structure fixture footprint".into()); } }
                Ok(footprint.len())
            }
            Self::Wall { id, edge, height } => {
                if !crate::components::valid_id(id) || *height == 0 || *height > MAX_WALL_HEIGHT {
                    return Err("invalid bounded structure wall".into());
                }
                validate_vertical_edge(*edge, bounds)?;
                let neighbor = edge.neighbor()?;
                for offset in 0..u32::from(*height) {
                    let y = edge.cell.y.checked_add(i32::try_from(offset).map_err(|_| "structure wall coordinate overflow")?)
                        .ok_or("structure wall coordinate overflow")?;
                    if !contains(bounds, Cell { y, ..edge.cell }) || !contains(bounds, Cell { y, ..neighbor }) {
                        return Err("structure wall is outside generated bounds".into());
                    }
                }
                Ok(usize::from(*height))
            }
            Self::ApertureWall { id, edge, height, opening_bottom, opening_height, open } => {
                if !crate::components::valid_id(id) || *height == 0 || *height > MAX_WALL_HEIGHT ||
                    *opening_height == 0 || u16::from(*opening_bottom) + u16::from(*opening_height) > u16::from(*height) {
                    return Err("invalid bounded aperture wall".into());
                }
                if u16::from(*opening_bottom) + u16::from(*opening_height) >= u16::from(*height) { return Err("aperture must retain a lintel".into()); }
                validate_vertical_edge(*edge, bounds)?;
                let neighbor = edge.neighbor()?;
                let occupied = if *open { usize::from(*height - *opening_height) } else { usize::from(*height) };
                for offset in 0..u32::from(*height) {
                    let y = edge.cell.y.checked_add(i32::try_from(offset).map_err(|_| "structure aperture coordinate overflow")?)
                        .ok_or("structure aperture coordinate overflow")?;
                    if !contains(bounds, Cell { y, ..edge.cell }) || !contains(bounds, Cell { y, ..neighbor }) { return Err("structure aperture wall is outside generated bounds".into()); }
                }
                Ok(occupied)
            }
            Self::Stair { id, origin, orientation, run, rise } => {
                let _ = orientation.delta();
                if !crate::components::valid_id(id) || *run == 0 || *run > MAX_STAIR_RUN || *rise == 0 || *rise > MAX_STAIR_RISE {
                    return Err("invalid bounded structure stair".into());
                }
                if !contains(bounds, *origin) {
                    return Err("structure stair origin is outside generated bounds".into());
                }
                for index in 1..=u32::from(*run) {
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
                Ok(usize::from(*run))
            }
        }
    }

    fn derive(&self, solids: &mut BTreeSet<Cell>, faces: &mut BTreeSet<Face>, supports: &mut BTreeSet<Face>) -> Result<(), String> {
        match self {
            Self::Floor { support, .. } => {
                faces.insert(Face::upward(*support));
                supports.insert(Face::upward(*support));
            }
            Self::Cover { support, .. } => { faces.insert(Face::upward(*support)); }
            Self::Fixture { .. } => {}
            Self::Wall { edge, height, .. } => {
                for offset in 0..u32::from(*height) {
                    let y = edge.cell.y.checked_add(i32::try_from(offset).map_err(|_| "structure wall coordinate overflow")?)
                        .ok_or("structure wall coordinate overflow")?;
                    if !faces.insert(Face { cell: Cell { y, ..edge.cell }, axis: edge.axis }) {
                        return Err("duplicate structure boundary face".into());
                    }
                }
            }
            Self::ApertureWall { edge, height, opening_bottom, opening_height, open, .. } => {
                for offset in 0..u32::from(*height) {
                    if *open && offset >= u32::from(*opening_bottom) && offset < u32::from(*opening_bottom + *opening_height) { continue; }
                    let y = edge.cell.y.checked_add(i32::try_from(offset).map_err(|_| "structure aperture coordinate overflow")?)
                        .ok_or("structure aperture coordinate overflow")?;
                    if !faces.insert(Face { cell: Cell { y, ..edge.cell }, axis: edge.axis }) {
                        return Err("duplicate structure boundary face".into());
                    }
                }
            }
            Self::Stair { origin, orientation, run, rise, .. } => {
                let (dx, dz) = orientation.delta();
                for index in 1..=u32::from(*run) {
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
        validate_bounds(bounds)?;
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
        let geometry = Self { bounds, instances };
        geometry.projection()?;
        Ok(geometry)
    }

    /// Save canonical instances only; projection indexes are rebuilt and validated.
    pub fn encode(&self) -> Result<Vec<u8>, String> {
        let bytes = serde_json::to_vec(&(2u16, &self.instances)).map_err(|error| error.to_string())?;
        if bytes.len() > 256 * 1024 { return Err("structure record budget exceeded".into()); }
        Ok(bytes)
    }

    pub fn decode(bounds: Bounds, bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() > 256 * 1024 { return Err("structure record budget exceeded".into()); }
        let (version, instances): (u16, Vec<StaticInstance>) = serde_json::from_slice(bytes)
            .map_err(|_| "invalid structure record")?;
        if version != 2 { return Err("unsupported structure record version".into()); }
        Self::new(bounds, instances)
    }

    pub fn bounds(&self) -> Bounds { self.bounds }
    pub fn instances(&self) -> &[StaticInstance] { &self.instances }

    pub fn projection(&self) -> Result<GeometryProjection, String> {
        let mut solids = BTreeSet::new();
        let mut faces = BTreeSet::new();
        let mut supports = BTreeSet::new();
        for instance in &self.instances {
            instance.bound(self.bounds)?;
            instance.derive(&mut solids, &mut faces, &mut supports)?;
        }
        let mut stair_edges = Vec::new();
        for instance in &self.instances {
            if let StaticInstance::Stair { id, origin, orientation, run, rise } = instance {
                let (dx, dz) = orientation.delta();
                let landing = Cell {
                    x: origin.x.checked_add(dx.checked_mul(i64::from(*run)).ok_or("structure stair coordinate overflow")?).ok_or("structure stair coordinate overflow")?,
                    y: origin.y.checked_add(i32::from(*rise)).ok_or("structure stair coordinate overflow")?,
                    z: origin.z.checked_add(dz.checked_mul(i64::from(*run)).ok_or("structure stair coordinate overflow")?).ok_or("structure stair coordinate overflow")?,
                };
                stair_edges.push(StairEdge { id: id.clone(), entrance: *origin, landing, orientation: *orientation, run: *run, rise: *rise });
            }
        }
        stair_edges.sort();
        let mut fixture_occupied = BTreeSet::new();
        for instance in &self.instances {
            if let StaticInstance::Fixture { origin, orientation, footprint, .. } = instance {
                for cell in fixture_cells(*origin, *orientation, footprint)? {
                    if solids.contains(&cell) || !fixture_occupied.insert(cell) { return Err("duplicate structure fixture occupancy".into()); }
                }
            }
        }
        Ok(GeometryProjection { solids, explicit_faces: faces, support_faces: supports, stair_edges, fixture_cells: fixture_occupied })
    }
}

/// Check compatibility that cannot be inferred from the projection alone.
/// Floors and covers both occupy a canonical support face; projection indexes
/// intentionally deduplicate that face, so ordinary construction intents must
/// reject a second claimant explicitly. A fixture may still share the face's
/// cell, and a stair landing is a support contact rather than a face claimant.
pub(crate) fn validate_construction_intents(instances: &[StaticInstance]) -> Result<(), String> {
    let mut support_faces = BTreeMap::<Cell, (&'static str, String)>::new();
    for instance in instances {
        let (kind, support) = match instance {
            StaticInstance::Floor { support, .. } => ("floor", *support),
            StaticInstance::Cover { support, .. } => ("cover", *support),
            _ => continue,
        };
        if let Some((prior_kind, prior_id)) = support_faces.get(&support) {
            return Err(format!("conflicting construction support face: {prior_kind} {prior_id} and {kind} {}", instance.id()));
        }
        support_faces.insert(support, (kind, instance.id().to_owned()));
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeometryProjection {
    solids: BTreeSet<Cell>,
    explicit_faces: BTreeSet<Face>,
    support_faces: BTreeSet<Face>,
    stair_edges: Vec<StairEdge>,
    fixture_cells: BTreeSet<Cell>,
}

impl GeometryProjection {
    /// Physical cells adjacent to a changed bulk or explicit face. The gas
    /// partition owner chooses its own bounded query tiles from these facts.
    pub(crate) fn changed_air_cells(&self, other: &Self) -> Result<BTreeSet<Cell>, String> {
        let mut cells: BTreeSet<_> = self.solids.symmetric_difference(&other.solids).copied().collect();
        for face in self.explicit_faces.symmetric_difference(&other.explicit_faces) {
            cells.insert(face.cell);
            cells.insert(face.neighbor()?);
        }
        Ok(cells)
    }
    pub fn is_bulk_solid(&self, cell: Cell) -> bool { self.solids.contains(&cell) }
    pub fn is_fixture(&self, cell: Cell) -> bool { self.fixture_cells.contains(&cell) }
    pub fn blocks_traversal(&self, cell: Cell) -> bool { self.is_bulk_solid(cell) || self.is_fixture(cell) }
    pub fn traversal_blockers(&self) -> impl Iterator<Item = &Cell> { self.solids.iter().chain(self.fixture_cells.iter()) }
    pub fn explicit_vertical_faces(&self) -> impl Iterator<Item = &Face> {
        self.explicit_faces.iter().filter(|face| face.axis.is_vertical())
    }
    /// A face is sealed when explicitly authored (floor/stair top) or when it
    /// touches a bulk structure cell. The latter keeps walls and stair bodies
    /// consistent without materializing six faces per solid cell.
    pub fn is_face_sealed(&self, face: Face) -> bool {
        self.explicit_faces.contains(&face)
            || self.solids.contains(&face.cell)
            || face.neighbor().is_ok_and(|neighbor| self.solids.contains(&neighbor))
    }
    /// A horizontal move crosses the canonical face between its two cells.
    /// Closed wall faces are obstacles while an aperture opening is absent
    /// from `explicit_faces` and therefore remains passable.
    pub fn blocks_crossing(&self, from: Cell, to: Cell) -> Result<bool, String> {
        let dx = i128::from(to.x) - i128::from(from.x);
        let dy = i64::from(to.y) - i64::from(from.y);
        let dz = i128::from(to.z) - i128::from(from.z);
        if dy != 0 || (dx.abs() + dz.abs()) != 1 {
            return Err("structure crossing must be one cardinal horizontal step".into());
        }
        let (cell, axis) = if dx > 0 { (from, FaceAxis::X) }
            else if dx < 0 { (to, FaceAxis::X) }
            else if dz > 0 { (from, FaceAxis::Z) }
            else { (to, FaceAxis::Z) };
        Ok(self.is_face_sealed(Face { cell, axis }))
    }
    fn blocks_crossing_except_stair(&self, from: Cell, to: Cell, ignored: &BTreeSet<Cell>) -> Result<bool, String> {
        let dx = i128::from(to.x) - i128::from(from.x);
        let dz = i128::from(to.z) - i128::from(from.z);
        if from.y != to.y || dx.abs() + dz.abs() != 1 { return Err("structure crossing must be one cardinal horizontal step".into()); }
        let (cell, axis) = if dx > 0 { (from, FaceAxis::X) } else if dx < 0 { (to, FaceAxis::X) } else if dz > 0 { (from, FaceAxis::Z) } else { (to, FaceAxis::Z) };
        let face = Face { cell, axis };
        if self.explicit_faces.contains(&face) { return Ok(true); }
        Ok((self.solids.contains(&face.cell) && !ignored.contains(&face.cell))
            || face.neighbor().is_ok_and(|neighbor| self.solids.contains(&neighbor) && !ignored.contains(&neighbor)))
    }
    /// Validate the occupied body layer above one admitted support edge.
    /// Terrain routes store support cells; an edge wall begins in the first
    /// open voxel above that support.
    pub fn blocks_swept_transition(&self, from: Cell, to: Cell, stairs: &[StairEdge]) -> Result<bool, String> {
        if let Some(stair) = stairs.iter().find(|stair| (stair.entrance == from && stair.landing == to) || (stair.entrance == to && stair.landing == from)) {
            let forward = stair.entrance == from;
            let start = if forward { stair.entrance } else { stair.landing };
            let (mut dx, mut dz) = stair.orientation.delta();
            let run = i64::from(stair.run);
            if run == 0 { return Err("stair sweep has zero run".into()); }
            let (sdx, sdz) = stair.orientation.delta();
            let ignored = (1..=run).map(|index| {
                let x = stair.entrance.x.checked_add(sdx.checked_mul(index).ok_or("stair sweep x overflow")?).ok_or("stair sweep x overflow")?;
                let z = stair.entrance.z.checked_add(sdz.checked_mul(index).ok_or("stair sweep z overflow")?).ok_or("stair sweep z overflow")?;
                let y = stair.entrance.y.checked_add(i32::try_from(index.checked_mul(i64::from(stair.rise)).ok_or("stair sweep height overflow")? / run).map_err(|_| "stair sweep height overflow")?).ok_or("stair sweep height overflow")?;
                Ok(Cell { x, y, z })
            }).collect::<Result<BTreeSet<_>, String>>()?;
            let rise = if forward { i64::from(stair.rise) } else { -i64::from(stair.rise) };
            if !forward { dx = -dx; dz = -dz; }
            for step in 0..run {
                let x = start.x.checked_add(dx.checked_mul(step).ok_or("stair sweep x overflow")?).ok_or("stair sweep x overflow")?;
                let z = start.z.checked_add(dz.checked_mul(step).ok_or("stair sweep z overflow")?).ok_or("stair sweep z overflow")?;
                let next = Cell { x: x.checked_add(dx).ok_or("stair sweep x overflow")?, y: start.y, z: z.checked_add(dz).ok_or("stair sweep z overflow")? };
                let y0 = start.y.checked_add(i32::try_from((step * rise) / run).map_err(|_| "stair sweep y overflow")?).ok_or("stair sweep y overflow")?;
                let y1 = start.y.checked_add(i32::try_from(((step + 1) * rise) / run).map_err(|_| "stair sweep y overflow")?).ok_or("stair sweep y overflow")?;
                let low = y0.min(y1);
                let high = y0.max(y1);
                for support_y in low..=high {
                    let y = support_y.checked_add(1).ok_or("structure sweep height overflow")?;
                    if self.blocks_crossing_except_stair(Cell { y, ..Cell { x, y: start.y, z } }, Cell { y, ..next }, &ignored)? { return Ok(true); }
                }
            }
            return Ok(false);
        }
        let dx = i128::from(to.x) - i128::from(from.x);
        let dz = i128::from(to.z) - i128::from(from.z);
        let dy = i64::from(to.y) - i64::from(from.y);
        if dx.abs() + dz.abs() != 1 || dy.abs() > 1 { return Err("invalid swept terrain transition".into()); }
        let low = from.y.min(to.y);
        let high = from.y.max(to.y);
        for support_y in low..=high {
            let y = support_y.checked_add(1).ok_or("structure sweep height overflow")?;
            if self.blocks_crossing(Cell { y, ..from }, Cell { y, ..to })? { return Ok(true); }
        }
        Ok(false)
    }

    /// Check a direct-control segment using both possible cardinal
    /// decompositions. A decomposition is open only when both of its faces
    /// are open; one open decomposition is sufficient for the diagonal.
    pub fn blocks_direct_decomposition(&self, from: Cell, to: Cell) -> Result<bool, String> {
        if from == to { return Ok(false); }
        if from.y != to.y { return Err("direct structure transition changes height".into()); }
        let from = Cell { y: from.y.checked_add(1).ok_or("direct structure height overflow")?, ..from };
        let to = Cell { y: to.y.checked_add(1).ok_or("direct structure height overflow")?, ..to };
        if from.x != to.x && from.z != to.z {
            let via_x = Cell { x: to.x, ..from };
            let via_z = Cell { z: to.z, ..from };
            let x_open = !self.blocks_crossing(from, via_x)? && !self.blocks_crossing(via_x, to)?;
            let z_open = !self.blocks_crossing(from, via_z)? && !self.blocks_crossing(via_z, to)?;
            return Ok(!x_open && !z_open);
        }
        self.blocks_crossing(from, to)
    }
    pub fn supports(&self, cell: Cell) -> bool {
        self.solids.contains(&cell) || self.support_faces.contains(&Face::upward(cell))
    }
    pub fn solid_cells(&self) -> impl Iterator<Item = &Cell> { self.solids.iter() }
    pub fn explicit_faces(&self) -> impl Iterator<Item = &Face> { self.explicit_faces.iter() }
    pub fn stair_edges(&self) -> &[StairEdge] { &self.stair_edges }
    /// Return exposed authored horizontal support faces for requested columns.
    /// The projection is the only derived structure index; callers receive a
    /// bounded rebuilt view and no terrain material is inferred here.
    pub fn horizontal_surfaces(&self, columns: &BTreeSet<(i64, i64)>) -> BTreeMap<(i64, i64), Vec<Cell>> {
        let mut surfaces: BTreeMap<_, BTreeSet<_>> = columns.iter().copied().map(|column| (column, BTreeSet::new())).collect();
        let mut add = |cell: Cell| {
            if let Some(column) = surfaces.get_mut(&(cell.x, cell.z)) {
                let above = cell.y.checked_add(1).map(|y| Cell { y, ..cell });
                if above.is_none_or(|neighbor| !self.solids.contains(&neighbor)) { column.insert(cell); }
            }
        };
        for face in &self.support_faces {
            if face.axis == FaceAxis::Y { add(face.cell); }
        }
        for cell in &self.solids { add(*cell); }
        surfaces.into_iter().map(|(column, cells)| (column, cells.into_iter().collect())).collect()
    }
}

fn validate_bounds(bounds: Bounds) -> Result<(), String> {
    if bounds.min_x >= bounds.max_x || bounds.min_y >= bounds.max_y || bounds.min_z >= bounds.max_z {
        return Err("invalid structure geometry bounds".into());
    }
    Ok(())
}

fn validate_vertical_edge(edge: Face, bounds: Bounds) -> Result<(), String> {
    if !edge.axis.is_vertical() {
        return Err("wall edge must be vertical X/Z face".into());
    }
    let neighbor = edge.neighbor()?;
    if !contains(bounds, edge.cell) || !contains(bounds, neighbor) {
        return Err("wall edge is outside generated bounds".into());
    }
    Ok(())
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
            id: "floor-a".into(),
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
    fn cover_seals_without_bulk_or_standing_support() {
        let support = Cell { x: 2, y: 0, z: 2 };
        let projection = StaticGeometry::new(bounds(), vec![StaticInstance::Cover { id: "roof".into(), support }]).unwrap().projection().unwrap();
        assert!(!projection.is_bulk_solid(support));
        assert!(projection.is_face_sealed(Face::upward(support)));
        assert!(!projection.supports(support));
    }

    #[test]
    fn fixture_rotates_blocks_traversal_and_stays_permeable() {
        let origin = Cell { x: 2, y: 0, z: 2 };
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Fixture { id: "bed".into(), origin, orientation: Cardinal::East, footprint: vec![[0, 0], [0, 1]] }]).unwrap();
        let projection = geometry.projection().unwrap();
        assert!(projection.blocks_traversal(Cell { x: 2, y: 0, z: 2 }));
        assert!(projection.blocks_traversal(Cell { x: 1, y: 0, z: 2 }));
        assert!(!projection.is_bulk_solid(Cell { x: 1, y: 0, z: 2 }));
        assert!(!projection.is_face_sealed(Face::upward(Cell { x: 1, y: 0, z: 2 })));
    }

    #[test]
    fn stair_orientations_derive_expected_cardinal_cells() {
        for (id, orientation, expected) in [
            ("north", Cardinal::North, Cell { x: 0, y: 1, z: -2 }),
            ("east", Cardinal::East, Cell { x: 2, y: 1, z: 0 }),
            ("south", Cardinal::South, Cell { x: 0, y: 1, z: 2 }),
            ("west", Cardinal::West, Cell { x: -2, y: 1, z: 0 }),
        ] {
            let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
                id: id.into(),
                origin: Cell { x: 0, y: 0, z: 0 },
                orientation,
                run: 2,
                rise: 1,
            }]).unwrap();
            assert!(geometry.projection().unwrap().is_bulk_solid(expected));
        }
    }

    #[test]
    fn retained_stair_contract_all_cardinals_reaches_four_voxel_landing() {
        for (orientation, expected) in [
            (Cardinal::North, Cell { x: 0, y: 4, z: -2 }),
            (Cardinal::East, Cell { x: 2, y: 4, z: 0 }),
            (Cardinal::South, Cell { x: 0, y: 4, z: 2 }),
            (Cardinal::West, Cell { x: -2, y: 4, z: 0 }),
        ] {
            let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
                id: format!("stair-{orientation:?}"),
                origin: Cell { x: 0, y: 0, z: 0 },
                orientation,
                run: 2,
                rise: 4,
            }]).unwrap();
            assert!(geometry.projection().unwrap().is_bulk_solid(expected));
        }
    }

    #[test]
    fn projection_derives_one_edge_per_committed_stair_and_removal_removes_it() {
        let stair = StaticInstance::Stair { id:"stair-a".into(), origin:Cell{x:0,y:0,z:0}, orientation:Cardinal::East, run:2, rise:4 };
        let with_stair = StaticGeometry::new(bounds(), vec![stair]).unwrap().projection().unwrap();
        assert_eq!(with_stair.stair_edges().len(), 1);
        assert_eq!(with_stair.stair_edges()[0].entrance, Cell{x:0,y:0,z:0});
        assert_eq!(with_stair.stair_edges()[0].landing, Cell{x:2,y:4,z:0});
        let without_stair = StaticGeometry::new(bounds(), vec![]).unwrap().projection().unwrap();
        assert!(without_stair.stair_edges().is_empty());
    }

    #[test]
    fn horizontal_surfaces_cover_all_stair_orientations() {
        for (orientation, expected) in [
            (Cardinal::North, Cell { x: 0, y: 1, z: -2 }),
            (Cardinal::East, Cell { x: 2, y: 1, z: 0 }),
            (Cardinal::South, Cell { x: 0, y: 1, z: 2 }),
            (Cardinal::West, Cell { x: -2, y: 1, z: 0 }),
        ] {
            let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
                id: "stair-surface".into(), origin: Cell { x: 0, y: 0, z: 0 }, orientation, run: 2, rise: 1,
            }]).unwrap();
            let columns = [(expected.x, expected.z)].into_iter().collect();
            assert_eq!(geometry.projection().unwrap().horizontal_surfaces(&columns)[&(expected.x, expected.z)], vec![expected]);
        }
    }

    #[test]
    fn negative_deep_coordinates_are_valid_and_outside_is_rejected() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "deep-wall".into(),
            edge: Face { cell: Cell { x: -31, y: -31, z: -31 }, axis: FaceAxis::X },
            height: 2,
        }]).unwrap();
        assert!(geometry.projection().unwrap().is_face_sealed(Face { cell: Cell { x: -31, y: -30, z: -31 }, axis: FaceAxis::X }));
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Floor {
            id: "outside-floor".into(),
            support: Cell { x: 32, y: 0, z: 0 },
        }]).is_err());
    }

    #[test]
    fn shared_sealing_faces_deduplicate_but_bulk_conflicts_reject() {
        let floor = |id: &str| StaticInstance::Floor { id: id.into(), support: Cell { x: 0, y: 0, z: 0 } };
        let geometry = StaticGeometry::new(bounds(), vec![floor("floor-a"), floor("floor-b")]).unwrap();
        assert_eq!(geometry.projection().unwrap().explicit_faces().count(), 1);
        assert!(StaticGeometry::new(bounds(), vec![
            StaticInstance::Wall { id: "wall-a".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 1 },
            StaticInstance::Wall { id: "wall-b".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 1 },
        ]).is_err());
    }

    #[test]
    fn horizontal_surfaces_keep_distinct_levels_and_stair_tops() {
        let geometry = StaticGeometry::new(bounds(), vec![
            StaticInstance::Floor { id: "low".into(), support: Cell { x: 0, y: 0, z: 0 } },
            StaticInstance::Wall { id: "middle".into(), edge: Face { cell: Cell { x: 0, y: 1, z: 0 }, axis: FaceAxis::X }, height: 1 },
            StaticInstance::Floor { id: "high".into(), support: Cell { x: 0, y: 2, z: 0 } },
            StaticInstance::Stair { id: "stairs".into(), origin: Cell { x: 2, y: 0, z: 0 }, orientation: Cardinal::East, run: 2, rise: 2 },
        ]).unwrap();
        let projection = geometry.projection().unwrap();
        let columns = [(0, 0), (3, 0)].into_iter().collect();
        let surfaces = projection.horizontal_surfaces(&columns);
        assert_eq!(surfaces[&(0, 0)], vec![Cell { x: 0, y: 0, z: 0 }, Cell { x: 0, y: 2, z: 0 }]);
        assert_eq!(surfaces[&(3, 0)], vec![Cell { x: 3, y: 1, z: 0 }]);
    }

    #[test]
    fn invalid_limits_and_coordinate_overflow_reject_before_expansion() {
        assert!(StaticGeometry::new(Bounds { min_x: 0, max_x: 0, min_y: 0, max_y: 1, min_z: 0, max_z: 1 }, Vec::new()).is_err());
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
            id: "overflow".into(), origin: Cell { x: i64::MAX, y: 0, z: 0 }, orientation: Cardinal::East, run: 2, rise: 1,
        }]).is_err());
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
            id: "zero-run".into(), origin: Cell { x: 0, y: 0, z: 0 }, orientation: Cardinal::East, run: 0, rise: 4,
        }]).is_err());
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 1,
        }]).is_err());
    }

    #[test]
    fn constructed_stairs_and_floor_use_existing_native_route_search() {
        for (orientation, dx, dz) in [
            (Cardinal::North, 0, -1), (Cardinal::East, 1, 0),
            (Cardinal::South, 0, 1), (Cardinal::West, -1, 0),
        ] {
            let origin = Cell { x: 0, y: -7, z: 0 };
            let target = Cell { x: 4 * dx, y: -4, z: 4 * dz };
            let geometry = StaticGeometry::new(bounds(), vec![
                StaticInstance::Stair { id: "stairs".into(), origin, orientation, run: 3, rise: 3 },
                StaticInstance::Floor { id: "landing".into(), support: target },
            ]).unwrap();
            let projection = geometry.projection().unwrap();
            let mut query = |at: Cell| Ok(crate::terrain_traversal::TraversalMaterial {
                solid: at == origin || projection.is_bulk_solid(at),
                sealed_top: projection.supports(at), outside: !contains(bounds(), at),
            });
            let config = crate::terrain_traversal::TraversalConfig {
                spacing: [1.0, 0.54, 1.0], clearance_cells: 1, max_step_cells: 1,
            };
            let path = crate::terrain_route::search(origin, target, config, &mut query).unwrap();
            assert_eq!(path.len(), 5);
            assert_eq!(path.last(), Some(&target));
            assert!(!projection.is_bulk_solid(target));
            assert!(crate::terrain_traversal::path_supported(&path, config, &mut query).unwrap());
            // A removed floor invalidates the same saved support witness.
            let mut removed = |at: Cell| Ok(crate::terrain_traversal::TraversalMaterial {
                solid: at == origin || projection.is_bulk_solid(at),
                sealed_top: at != target && projection.supports(at), outside: !contains(bounds(), at),
            });
            assert!(!crate::terrain_traversal::path_supported(&path, config, &mut removed).unwrap());
        }
    }

    #[test]
    fn canonical_record_rebuilds_geometry_and_rejects_invalid_custody() {
        let geometry = StaticGeometry::new(bounds(), vec![StaticInstance::Floor {
            id: "saved-floor".into(), support: Cell { x: -3, y: -8, z: 2 },
        }]).unwrap();
        let bytes = geometry.encode().unwrap();
        let restored = StaticGeometry::decode(bounds(), &bytes).unwrap();
        assert_eq!(restored, geometry);
        assert_eq!(restored.projection().unwrap(), geometry.projection().unwrap());
        assert!(StaticGeometry::decode(bounds(), br#"[0,[]]"#).is_err());
        let overlapping = vec![
            StaticInstance::Wall { id: "one".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 1 },
            StaticInstance::Wall { id: "two".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 1 },
        ];
        assert!(StaticGeometry::decode(bounds(), &serde_json::to_vec(&(2u16, overlapping)).unwrap()).is_err());
    }

    #[test]
    fn aperture_opening_preserves_rooted_frame_and_omits_only_open_interval() {
        let base = Cell { x: 0, y: -2, z: 0 };
        let closed = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "door".into(), edge: Face { cell: base, axis: FaceAxis::X }, height: 5, opening_bottom: 1, opening_height: 2, open: false,
        }]).unwrap().projection().unwrap();
        let open = StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "door".into(), edge: Face { cell: base, axis: FaceAxis::X }, height: 5, opening_bottom: 1, opening_height: 2, open: true,
        }]).unwrap().projection().unwrap();
        assert!(closed.is_face_sealed(Face { cell: base, axis: FaceAxis::X }));
        assert!(closed.is_face_sealed(Face { cell: Cell { y: 0, ..base }, axis: FaceAxis::X }));
        assert!(open.is_face_sealed(Face { cell: base, axis: FaceAxis::X }));
        assert!(!open.is_face_sealed(Face { cell: Cell { y: -1, ..base }, axis: FaceAxis::X }));
        assert!(!open.is_face_sealed(Face { cell: Cell { y: 0, ..base }, axis: FaceAxis::X }));
        assert!(open.is_face_sealed(Face { cell: Cell { y: 1, ..base }, axis: FaceAxis::X }));
    }

    #[test]
    fn aperture_opening_bounds_are_rejected_before_projection() {
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "bad".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 4, opening_bottom: 3, opening_height: 2, open: true,
        }]).is_err());
        assert!(StaticGeometry::new(bounds(), vec![StaticInstance::ApertureWall {
            id: "bad".into(), edge: Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }, height: 4, opening_bottom: 0, opening_height: 0, open: false,
        }]).is_err());
    }

    #[test]
    fn metric_height_rejects_vertical_faces() {
        assert!(Face { cell: Cell { x: 0, y: 0, z: 0 }, axis: FaceAxis::X }.metric_height(0.54).is_err());
    }

    #[test]
    fn edge_targets_canonicalize_both_sides_to_one_boundary() {
        let east = edge_for_cell(Cell { x: 4, y: 14, z: 2 }, Cardinal::East).unwrap();
        let west = edge_for_cell(Cell { x: 5, y: 14, z: 2 }, Cardinal::West).unwrap();
        assert_eq!(east, west);
        assert_eq!(east.axis, FaceAxis::X);
    }

    #[test]
    fn wall_is_a_vertical_boundary_and_blocks_only_its_crossing() {
        let edge = Face { cell: Cell { x: 0, y: 14, z: 0 }, axis: FaceAxis::X };
        let projection = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "edge-wall".into(), edge, height: 4,
        }]).unwrap().projection().unwrap();
        assert!(!projection.is_bulk_solid(edge.cell));
        assert!(projection.blocks_crossing(Cell { x: 0, y: 14, z: 0 }, Cell { x: 1, y: 14, z: 0 }).unwrap());
        assert!(!projection.blocks_crossing(Cell { x: 0, y: 13, z: 0 }, Cell { x: 1, y: 13, z: 0 }).unwrap());
        assert!(!projection.blocks_crossing(Cell { x: 0, y: 14, z: 1 }, Cell { x: 1, y: 14, z: 1 }).unwrap());
    }

    #[test]
    fn wall_height_four_base_fourteen_meets_floor_support_seventeen() {
        let edge = Face { cell: Cell { x: 0, y: 14, z: 0 }, axis: FaceAxis::X };
        let projection = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "support-wall".into(), edge, height: 4,
        }]).unwrap().projection().unwrap();
        assert!(projection.is_face_sealed(Face { cell: Cell { y: 17, ..edge.cell }, axis: FaceAxis::X }));
        let upper = Cell { x: 0, y: 17, z: 0 };
        assert!(!projection.is_bulk_solid(upper));
    }

    #[test]
    fn swept_hop_checks_upper_ascent_and_lower_descent_faces() {
        let ascent = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "upper".into(), edge: Face { cell: Cell { x: 0, y: 1, z: 0 }, axis: FaceAxis::X }, height: 1,
        }]).unwrap().projection().unwrap();
        assert!(ascent.blocks_swept_transition(Cell { x: 0, y: 0, z: 0 }, Cell { x: 1, y: 1, z: 0 }, &[]).unwrap());
        let lower_ascent = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "lower-ascent".into(), edge: Face { cell: Cell { x: 0, y: 1, z: 0 }, axis: FaceAxis::X }, height: 1,
        }]).unwrap().projection().unwrap();
        assert!(lower_ascent.blocks_swept_transition(Cell { x: 0, y: 0, z: 0 }, Cell { x: 1, y: 1, z: 0 }, &[]).unwrap());
        let descent = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "lower".into(), edge: Face { cell: Cell { x: 0, y: 1, z: 0 }, axis: FaceAxis::X }, height: 1,
        }]).unwrap().projection().unwrap();
        assert!(descent.blocks_swept_transition(Cell { x: 1, y: 1, z: 0 }, Cell { x: 0, y: 0, z: 0 }, &[]).unwrap());
        let upper_descent = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "upper-descent".into(), edge: Face { cell: Cell { x: 0, y: 2, z: 0 }, axis: FaceAxis::X }, height: 1,
        }]).unwrap().projection().unwrap();
        assert!(upper_descent.blocks_swept_transition(Cell { x: 1, y: 1, z: 0 }, Cell { x: 0, y: 0, z: 0 }, &[]).unwrap());
    }

    #[test]
    fn swept_stair_checks_each_rising_horizontal_face() {
        let projection = StaticGeometry::new(bounds(), vec![StaticInstance::Wall {
            id: "stair-wall".into(), edge: Face { cell: Cell { x: 1, y: 2, z: 0 }, axis: FaceAxis::X }, height: 1,
        }]).unwrap().projection().unwrap();
        let stair = StairEdge { id: "stair".into(), entrance: Cell { x: 0, y: 0, z: 0 }, landing: Cell { x: 2, y: 2, z: 0 }, orientation: Cardinal::East, run: 2, rise: 2 };
        assert!(projection.blocks_swept_transition(stair.entrance, stair.landing, &[stair]).unwrap());
    }

    #[test]
    fn swept_stair_allows_its_own_derived_steps() {
        let stair = StairEdge { id: "stair".into(), entrance: Cell { x: 0, y: 0, z: 0 }, landing: Cell { x: 2, y: 2, z: 0 }, orientation: Cardinal::East, run: 2, rise: 2 };
        let projection = StaticGeometry::new(bounds(), vec![StaticInstance::Stair {
            id: "stair".into(), origin: stair.entrance, orientation: stair.orientation, run: stair.run, rise: stair.rise,
        }]).unwrap().projection().unwrap();
        assert!(!projection.blocks_swept_transition(stair.entrance, stair.landing, &[stair]).unwrap());
    }

    #[test]
    fn swept_stair_still_blocks_a_foreign_wall() {
        let stair = StairEdge { id: "stair".into(), entrance: Cell { x: 0, y: 0, z: 0 }, landing: Cell { x: 2, y: 2, z: 0 }, orientation: Cardinal::East, run: 2, rise: 2 };
        let projection = StaticGeometry::new(bounds(), vec![
            StaticInstance::Stair { id: "stair".into(), origin: stair.entrance, orientation: stair.orientation, run: stair.run, rise: stair.rise },
            StaticInstance::Wall { id: "wall".into(), edge: Face { cell: Cell { x: 1, y: 2, z: 0 }, axis: FaceAxis::X }, height: 1 },
        ]).unwrap().projection().unwrap();
        assert!(projection.blocks_swept_transition(stair.entrance, stair.landing, &[stair]).unwrap());
    }

    #[test]
    fn direct_diagonal_requires_one_complete_open_cardinal_decomposition() {
        let projection = StaticGeometry::new(bounds(), vec![
            StaticInstance::Wall { id: "x".into(), edge: Face { cell: Cell { x: 0, y: 1, z: 1 }, axis: FaceAxis::X }, height: 1 },
            StaticInstance::Wall { id: "z".into(), edge: Face { cell: Cell { x: 1, y: 1, z: 0 }, axis: FaceAxis::Z }, height: 1 },
        ]).unwrap().projection().unwrap();
        assert!(projection.blocks_direct_decomposition(Cell { x: 0, y: 0, z: 0 }, Cell { x: 1, y: 0, z: 1 }).unwrap());
    }
}
