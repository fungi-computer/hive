//! Physical terrain-to-water composition. No independent material grid is kept.
//! Initial coordinates seed observation; finite local transport covers the world.
mod field;
#[cfg(test)]
mod field_tests;
mod local_air;
pub(crate) use local_air::LocalAir;
use crate::generation::Cell;
use crate::structure_geometry::{StaticGeometry, StaticInstance, GeometryProjection};
use crate::terrain::{AppliedChange, BlockReason, PrepareResult, SurfaceCell, TerrainOwner};
use crate::water::{SoilRule, WaterLimits, WaterRebindBlock,
    WaterStock, WaterFacts, WaterWork};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

const CHANGE_HISTORY_LIMIT: usize = 64;
const CHANGED_COLUMN_LIMIT: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TerrainResetReason {
    History,
    Restored,
    Stale,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum TerrainChangeSet {
    FullReset { revision: u64, reason: TerrainResetReason },
    ChangedColumns { revision: u64, columns: Vec<[i64; 2]> },
}

/// A disposable index of successful physical edits. It is deliberately not
/// part of environment records: a restored owner cannot claim knowledge of
/// changes that were only present in the old process.
#[derive(Clone, Debug)]
struct TerrainChangeIndex {
    changes: BTreeMap<u64, BTreeSet<(i64, i64)>>,
    history_floor: u64,
    restored_at: Option<u64>,
}

impl TerrainChangeIndex {
    fn fresh() -> Self {
        Self { changes: BTreeMap::new(), history_floor: 0, restored_at: None }
    }

    fn restored(revision: u64) -> Self {
        Self { changes: BTreeMap::new(), history_floor: revision, restored_at: Some(revision) }
    }

    fn record(&mut self, revision: u64, columns: BTreeSet<(i64, i64)>) {
        if columns.len() > CHANGED_COLUMN_LIMIT {
            self.changes.clear();
            self.history_floor = self.history_floor.max(revision);
            return;
        }
        self.changes.insert(revision, columns);
        while self.changes.len() > CHANGE_HISTORY_LIMIT {
            let Some((revision, _)) = self.changes.pop_first() else { break; };
            self.history_floor = self.history_floor.max(revision);
        }
    }

    fn since(&self, since: u64, current: u64) -> TerrainChangeSet {
        if since > current {
            return TerrainChangeSet::FullReset { revision: current, reason: TerrainResetReason::Stale };
        }
        if since < self.history_floor {
            let reason = self.restored_at.filter(|revision| since < *revision)
                .map_or(TerrainResetReason::History, |_| TerrainResetReason::Restored);
            return TerrainChangeSet::FullReset { revision: current, reason };
        }
        let mut columns = BTreeSet::new();
        for changed in self.changes.range((std::ops::Bound::Excluded(since), std::ops::Bound::Included(current))).map(|(_, columns)| columns) {
            for column in changed {
                if !columns.contains(column) && columns.len() == CHANGED_COLUMN_LIMIT {
                    return TerrainChangeSet::FullReset { revision: current, reason: TerrainResetReason::History };
                }
                columns.insert(*column);
            }
        }
        TerrainChangeSet::ChangedColumns {
            revision: current,
            columns: columns.into_iter().map(|(x, z)| [x, z]).collect(),
        }
    }
}

mod air_geometry;
pub use air_geometry::{AirGeometryBounds, AirGeometryCell, AirGeometryFace, AirGeometryFaceKind, AirGeometryFrontier, AirGeometrySnapshot, AirWaterCoverage};
pub(crate) use air_geometry::{AirGeometryEdit, AirGeometryChanges};
mod air_exterior;
pub use air_exterior::{AirExteriorBlocker, AirExteriorResult, AirExteriorStatus};

#[derive(Clone, Debug, serde::Serialize)]
pub enum MaterialWater {
    Closed,
    Open,
    Porous(SoilRule),
}

/// Content selects material behavior; the current terrain owner selects location.
#[derive(Clone)]
pub struct TerrainWaterGeometry {
    id: String,
    cells: BTreeSet<Cell>,
    materials: BTreeMap<u16, MaterialWater>,
    spacing: [f64; 3],
    fall: f64,
    spread: f64,
    limits: WaterLimits,
    max_span_steps: u32,
    generated_groundwater: bool,
}

pub enum ExcavationResult {
    Prepared(PreparedExcavation),
    TerrainBlocked(BlockReason),
    WaterBlocked(WaterRebindBlock),
    StructuresBlocked(Vec<String>),
}

/// A short-lived native completion candidate, never a saved job. The Kernel
/// must admit the matching lot credit before consuming this value.
#[derive(Debug)]
pub(crate) enum StructureChangeBlock { Water(WaterRebindBlock), Unsupported(Vec<String>) }

pub(crate) struct PreparedStructureChange {
    structures: StaticGeometry,
    projection: GeometryProjection,
    field: field::Field,
    owner: Arc<()>,
    epoch: u64,
}

/// Detached field advancement for compound water/air admission.
pub(crate) struct PreparedWaterAdvance {
    field: field::Field,
    work: WaterWork,
    owner: Arc<()>,
    epoch: u64,
}

pub struct PreparedExcavation {
    terrain: crate::terrain::PreparedChange,
    field: field::Field,
    water_kg: f64,
    removed: u16,
    volume_m3: f64,
    owner: Arc<()>,
    epoch: u64,
}
impl PreparedExcavation {
    pub fn water_kg(&self) -> f64 { self.water_kg }
    pub fn removed(&self) -> u16 { self.removed }
    pub fn volume_m3(&self) -> f64 { self.volume_m3 }
}

impl TerrainWaterGeometry {
    pub fn new(id: String, cells: Vec<Cell>, materials: BTreeMap<u16, MaterialWater>,
        spacing: [f64; 3], fall: f64, spread: f64, limits: WaterLimits, max_span_steps: u32)
        -> Result<Self, String> {
        if !(1..=64).contains(&max_span_steps) { return Err("invalid structure span policy".into()); }
        if id.is_empty() || id.len() > 160 || id.contains('\0')
            || spacing.iter().any(|value| !value.is_finite() || *value <= 0.0)
            || !fall.is_finite() || fall < 0.0 || !spread.is_finite() || spread < 0.0 {
            return Err("invalid terrain water identity, metric or rates".into());
        }
        if cells.is_empty() || cells.len() > limits.cells || cells.len() > 2048 {
            return Err("terrain water admission exceeds cell budget".into());
        }
        let count = cells.len();
        let cells: BTreeSet<_> = cells.into_iter().collect();
        if cells.len() != count || materials.is_empty() || materials.len() > 64 {
            return Err("invalid terrain water definition".into());
        }
        for cell in &cells { coordinates(*cell)?; }
        for behavior in materials.values() {
            if let MaterialWater::Porous(rule) = behavior {
                if rule.id.is_empty() || !rule.porosity.is_finite() || rule.porosity <= 0.0 || rule.porosity > 1.0
                    || !rule.retention.is_finite() || rule.retention < 0.0 || rule.retention > rule.porosity
                    || !rule.absorb_m_per_s.is_finite() || rule.absorb_m_per_s < 0.0
                    || !rule.seep_m_per_s.is_finite() || rule.seep_m_per_s < 0.0 { return Err("invalid soil water rule".into()); }
            }
        }
        Ok(Self { id, cells, materials, spacing, fall, spread, limits, max_span_steps, generated_groundwater: false })
    }

    /// Rebuild only after geometry changes, using a single proposed cell override.
    /// Missing material definitions are errors, never silently open boundaries.
    fn identity(&self) -> Result<Vec<u8>, String> {
        let cells = self.cells.iter().map(|cell| coordinates(*cell)).collect::<Result<Vec<_>, _>>()?;
        let bytes = postcard::to_allocvec(&(self.id.as_str(), cells, &self.materials,
            self.spacing, self.fall, self.spread, self.max_span_steps, self.generated_groundwater)).map_err(|_| "water geometry identity encoding failed")?;
        if bytes.len() > 65536 { return Err("water geometry identity exceeds record budget".into()); }
        Ok(bytes)
    }

    pub(crate) fn with_generated_groundwater(mut self) -> Self {
        self.generated_groundwater = true;
        self
    }

 }

/// Physical geometry and finite stocks cannot be independently swapped by a caller.
/// Its owned TerrainOwner remains the single material authority. The Kernel
/// uses material queries and compound edits rather than mutating terrain beside water.
/// Three logical records. The Region transaction stores them at one revision.
/// Environment data is not embedded into the entity snapshot.
pub struct TerrainWaterRecords {
    pub header: Vec<u8>,
    pub terrain: Vec<u8>,
    pub water: Vec<u8>,
    pub structures: Vec<u8>,
}

pub struct TerrainWater {
    terrain: TerrainOwner,
    structures: StaticGeometry,
    structure_projection: GeometryProjection,
    physical_revision: u64,
    geometry: TerrainWaterGeometry,
    identity: Vec<u8>,
    field: field::Field,
    owner: Arc<()>,
    epoch: u64,
    change_index: TerrainChangeIndex,
}
impl TerrainWater {
    pub fn fresh(geometry: TerrainWaterGeometry, mut terrain: TerrainOwner,
        stocks: &[WaterStock]) -> Result<Self, String> {
        if geometry.spacing != terrain.cell_spacing_m() { return Err("terrain and water metric differ".into()); }
        let structures = StaticGeometry::new(terrain.bounds(), Vec::new())?;
        let structure_projection = structures.projection()?;
        let field = field::Field::fresh(&mut field::View { terrain: &mut terrain,
            structures: &structure_projection, geometry: &geometry, replacement: None }, stocks)?;
        let identity = geometry.identity()?;
        Ok(Self { terrain, structures, structure_projection, physical_revision: 0, geometry, identity, field, owner: Arc::new(()), epoch: 0, change_index: TerrainChangeIndex::fresh() })
    }
    pub fn save_records(&self) -> Result<TerrainWaterRecords, String> {
        let header = postcard::to_allocvec(&(3u16, self.identity.as_slice(),
            self.terrain.revision(), self.physical_revision))
            .map_err(|_| "environment header encoding failed")?;
        let terrain = self.terrain.export()?;
        let water = self.field.encode()?;
        if terrain.len() > 256 * 1024 || water.len() > 256 * 1024 {
            return Err("environment record exceeds Region record budget".into());
        }
        let structures = self.structures.encode()?;
        Ok(TerrainWaterRecords { header, terrain, water, structures })
    }

    /// Hydrate a disposable candidate. This never calls fresh/initial: zero
    /// remaining water is a saved fact, not permission to reseed a source.
    pub fn restore_records(geometry: TerrainWaterGeometry, mut terrain: TerrainOwner,
        records: &TerrainWaterRecords) -> Result<Self, String> {
        if records.header.len() > 65568 || records.terrain.len() > 256 * 1024
            || records.water.len() > 256 * 1024 { return Err("environment record budget".into()); }
        let ((version, saved_identity, terrain_revision, physical_revision), remainder):
            ((u16, &[u8], u64, u64), _) = postcard::take_from_bytes(&records.header)
            .map_err(|_| "invalid environment header")?;
        let identity = geometry.identity()?;
        if version != 3 || physical_revision < terrain_revision || !remainder.is_empty() || saved_identity != identity.as_slice()
            || geometry.spacing != terrain.cell_spacing_m() {
            return Err("environment record binding mismatch".into());
        }
        terrain.restore(&records.terrain)?;
        if terrain.revision() != terrain_revision { return Err("environment terrain frontier mismatch".into()); }
        let structures = StaticGeometry::decode(terrain.bounds(), &records.structures)?;
        if !unsupported_structures(&mut terrain, &structures, geometry.max_span_steps, None)?.is_empty() { return Err("saved structures lack support".into()); }
        let structure_projection = structures.projection()?;
        for cell in structure_projection.solid_cells() {
            let material = terrain.query(*cell)?;
            if !terrain.is_open_material(material) { return Err("saved structure overlaps terrain".into()); }
        }
        let field = field::Field::decode(&records.water, &mut field::View { terrain: &mut terrain,
            structures: &structure_projection, geometry: &geometry, replacement: None })?;
        Ok(Self { terrain, structures, structure_projection, physical_revision, geometry, identity, field, owner: Arc::new(()), epoch: 0, change_index: TerrainChangeIndex::restored(physical_revision) })
    }

    pub fn is_open_material(&self, slot: u16) -> bool { self.terrain.is_open_material(slot) }
    pub fn bounds(&self) -> crate::generation::Bounds { self.terrain.bounds() }
    pub fn cell_spacing_m(&self) -> [f64; 3] { self.terrain.cell_spacing_m() }
    pub fn material(&mut self, at: Cell) -> Result<u16, String> { Ok(self.terrain.query(at)?) }
    /// Shared physical contact query for placement, route admission and retained
    /// route validation. These callers must not reconstruct geometry separately.
    pub fn traversal_material(&mut self, at: Cell) -> Result<crate::terrain_traversal::TraversalMaterial, String> {
        use crate::terrain_traversal::TraversalMaterial;
        match self.terrain.query(at) {
            Ok(material) => Ok(TraversalMaterial {
                solid: !self.terrain.is_open_material(material) || self.structure_projection.is_bulk_solid(at),
                outside: false, sealed_top: self.structure_projection.supports(at),
            }),
            Err("cell outside world bounds") => Ok(TraversalMaterial {
                solid: false, outside: true, sealed_top: false,
            }),
            Err(error) => Err(error.into()),
        }
    }
    pub(crate) fn prepared_traversal_material(&mut self, prepared: &PreparedStructureChange, at: Cell) -> Result<crate::terrain_traversal::TraversalMaterial, String> {
        use crate::terrain_traversal::TraversalMaterial;
        if !Arc::ptr_eq(&self.owner, &prepared.owner) || self.epoch != prepared.epoch {
            return Err("prepared structure change is stale or foreign".into());
        }
        match self.terrain.query(at) {
            Ok(material) => Ok(TraversalMaterial {
                solid: !self.terrain.is_open_material(material) || prepared.projection.is_bulk_solid(at),
                outside: false,
                sealed_top: prepared.projection.supports(at),
            }),
            Err("cell outside world bounds") => Ok(TraversalMaterial { solid: false, outside: true, sealed_top: false }),
            Err(error) => Err(error.into()),
        }
    }
    pub(crate) fn structure_instances(&self) -> Vec<StaticInstance> {
        self.structures.instances().to_vec()
    }
    pub fn structure_surfaces(&mut self, columns: &[(i64, i64)]) -> Result<Vec<Vec<Cell>>, String> {
        if columns.is_empty() || columns.len() > 64 { return Err("structure surface query exceeds column budget".into()); }
        let bounds = self.terrain.bounds();
        let mut requested = BTreeSet::new();
        for &(x, z) in columns {
            if x < bounds.min_x || x >= bounds.max_x || z < bounds.min_z || z >= bounds.max_z {
                return Err("structure surface column is outside generated bounds".into());
            }
            requested.insert((x, z));
        }
        let indexed = self.structure_projection.horizontal_surfaces(&requested);
        let mut results = Vec::with_capacity(columns.len());
        for column in columns {
            let surfaces = indexed.get(column).cloned().unwrap_or_default();
            let mut exposed = Vec::with_capacity(surfaces.len());
            for cell in surfaces {
                let Some(above_y) = cell.y.checked_add(1) else { exposed.push(cell); continue; };
                let above = Cell { y: above_y, ..cell };
                if above.x < bounds.min_x || above.x >= bounds.max_x || above.y < bounds.min_y || above.y >= bounds.max_y || above.z < bounds.min_z || above.z >= bounds.max_z {
                    exposed.push(cell);
                    continue;
                }
                let material = self.terrain.query(above).map_err(|error| error.to_string())?;
                if self.terrain.is_open_material(material) { exposed.push(cell); }
            }
            results.push(exposed);
        }
        Ok(results)
    }

    /// Query current terrain material through the composed owner, preserving
    /// input order and rejecting the complete batch before sampling.
    pub fn materials(&mut self, cells: &[Cell]) -> Result<Vec<u16>, String> {
        Ok(self.terrain.query_cells(cells)?)
    }
    pub fn surface_cells(&mut self, columns: &[(i64, i64)]) -> Result<Vec<Option<SurfaceCell>>, String> {
        Ok(self.terrain.surface_cells(columns)?)
    }
    pub(crate) fn smoke_outdoors(&mut self,cell:Cell,ceiling:i32)->Result<bool,String> {
        local_air::outdoors(self,cell,ceiling)
    }
    pub(crate) fn local_air(&mut self, cell: Cell) -> Result<LocalAir, String> {
        local_air::query(self, cell)
    }
    pub fn air_geometry(&mut self, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
        air_geometry::query(self, bounds)
    }
    pub(crate) fn air_geometry_changes(&self, edit: AirGeometryEdit<'_>) -> Result<AirGeometryChanges, String> {
        air_geometry::changes(self, edit)
    }
    pub(crate) fn changed_air_geometry(&mut self, edit: AirGeometryEdit<'_>, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
        air_geometry::query_edit(self, edit, bounds)
    }
    pub(crate) fn prepared_structure_air_geometry(&mut self, prepared: &PreparedStructureChange, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
        air_geometry::query_structure(self, prepared, bounds)
    }
    /// Bounded physical upward clearance. This reports world/query reachability
    /// only; it does not admit ambient gas or inspect water stocks.
    pub fn air_exterior(&mut self, starts: &[Cell], ceiling_y: i32) -> Result<Vec<AirExteriorResult>, String> {
        air_exterior::query(self, starts, ceiling_y)
    }
    pub(crate) fn prepared_excavation_air_geometry(&mut self, prepared: &PreparedExcavation, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
        air_geometry::query_excavation(self, prepared, bounds)
    }
    pub(crate) fn prepared_excavation_replacement(&self, prepared: &PreparedExcavation) -> (Cell, u16) {
        (self.terrain.prepared_cell(&prepared.terrain), self.terrain.prepared_replacement(&prepared.terrain))
    }
    pub fn terrain_revision(&self) -> u64 { self.physical_revision }
    pub fn terrain_changes(&self, since: u64) -> TerrainChangeSet {
        self.change_index.since(since, self.physical_revision)
    }
    pub fn facts(&self) -> Result<WaterFacts, String> { self.field.facts() }
    pub fn advance(&mut self, seconds: f64) -> Result<WaterWork, String> {
        let prepared = self.prepare_water_advance(seconds)?;
        self.apply_water_advance(prepared)
    }
    pub(crate) fn prepare_water_advance(&mut self, seconds: f64) -> Result<PreparedWaterAdvance, String> {
        self.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
        let (field, work) = self.field.advance(seconds, &mut field::View { terrain: &mut self.terrain,
            structures: &self.structure_projection, geometry: &self.geometry, replacement: None })?;
        Ok(PreparedWaterAdvance { field, work,
            owner: self.owner.clone(), epoch: self.epoch })
    }
    pub(crate) fn prepared_water_air_geometry(&mut self, prepared: &PreparedWaterAdvance, bounds: AirGeometryBounds) -> Result<AirGeometrySnapshot, String> {
        air_geometry::query_water(self, prepared, bounds)
    }
    pub(crate) fn apply_water_advance(&mut self, prepared: PreparedWaterAdvance) -> Result<WaterWork, String> {
        if !Arc::ptr_eq(&self.owner, &prepared.owner) || self.epoch != prepared.epoch {
            return Err("prepared water advance is stale or foreign".into());
        }
        let epoch = self.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
        self.field = prepared.field;
        self.epoch = epoch;
        Ok(prepared.work)
    }

    /// Preparation has no physical effect. The credit amount is the exact
    /// pore-water debit, not a newly created material quantity.
    pub fn prepare_excavation(&mut self,
        at: Cell, expected: u16, replacement: u16) -> Result<ExcavationResult, String> {
        let prepared = match self.terrain.prepare_excavation(at, expected, replacement)? {
            PrepareResult::Blocked { reason, .. } => return Ok(ExcavationResult::TerrainBlocked(reason)),
            PrepareResult::Prepared(change) => change,
        };
        let unsupported = unsupported_structures(&mut self.terrain, &self.structures, self.geometry.max_span_steps, Some((at, replacement)))?;
        if !unsupported.is_empty() { return Ok(ExcavationResult::StructuresBlocked(unsupported)); }
        let removed = self.terrain.prepared_removed(&prepared);
        let volume_m3 = self.terrain.prepared_volume_m3(&prepared);
        if let Some(reason) = self.field.admission_block(at) {
            return Ok(ExcavationResult::WaterBlocked(reason));
        }
        let (mut field, water_kg) = self.field.excavate(at, &mut field::View { terrain: &mut self.terrain,
            structures: &self.structure_projection, geometry: &self.geometry, replacement: None })?;
        if let Some(reason) = field.rebind(&mut field::View { terrain: &mut self.terrain,
            structures: &self.structure_projection, geometry: &self.geometry, replacement: Some((at, replacement)) })? {
            return Ok(ExcavationResult::WaterBlocked(reason));
        }
        Ok(ExcavationResult::Prepared(PreparedExcavation {
            terrain: prepared, field, water_kg, removed, volume_m3,
            owner: self.owner.clone(), epoch: self.epoch,
        }))
    }

    /// Geometry preparation does not pay construction costs or authorize a
    /// placement. The Kernel completion owner must admit those before publication.
    pub(crate) fn prepare_structures(&mut self, instances: Vec<StaticInstance>) -> Result<Result<PreparedStructureChange, StructureChangeBlock>, String> {
        let structures = StaticGeometry::new(self.terrain.bounds(), instances)?;
        structures.encode()?; // Bound the future durable record before mutation.
        let unsupported = unsupported_structures(&mut self.terrain, &structures, self.geometry.max_span_steps, None)?;
        if !unsupported.is_empty() { return Ok(Err(StructureChangeBlock::Unsupported(unsupported))); }
        let projection = structures.projection()?;
        for cell in projection.solid_cells() {
            let material = self.terrain.query(*cell)?;
            if !self.terrain.is_open_material(material) { return Err("structure overlaps solid terrain".into()); }
        }
        self.physical_revision.checked_add(1).ok_or("physical geometry revision exhausted")?;
        let mut field = self.field.clone();
        if let Some(reason) = field.rebind(&mut field::View { terrain: &mut self.terrain,
            structures: &projection, geometry: &self.geometry, replacement: None })? {
            return Ok(Err(StructureChangeBlock::Water(reason)));
        }
        for cell in self.structure_projection.changed_air_cells(&projection)? {
            field.wake_neighborhood(cell, self.terrain.bounds());
        }
        Ok(Ok(PreparedStructureChange { structures, projection, field,
            owner: self.owner.clone(), epoch: self.epoch }))
    }

    pub(crate) fn apply_structures(&mut self, prepared: PreparedStructureChange) -> Result<(), String> {
        if !Arc::ptr_eq(&self.owner, &prepared.owner) || self.epoch != prepared.epoch {
            return Err("prepared structure change is stale or foreign".into());
        }
        let epoch = self.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
        let revision = self.physical_revision.checked_add(1).ok_or("physical geometry revision exhausted")?;
        let changed_columns = self.structure_projection.changed_air_cells(&prepared.projection)?.into_iter()
            .filter(|cell| {
                let bounds = self.terrain.bounds();
                cell.x >= bounds.min_x && cell.x < bounds.max_x && cell.z >= bounds.min_z && cell.z < bounds.max_z
            })
            .map(|cell| (cell.x, cell.z)).collect();
        self.structures = prepared.structures;
        self.structure_projection = prepared.projection;
        self.field = prepared.field;
        self.physical_revision = revision;
        self.change_index.record(revision, changed_columns);
        self.epoch = epoch;
        Ok(())
    }

    /// Called only by the compound native completion after admitting its
    /// material credit. A water advance or another edit invalidates the token.
    pub(crate) fn apply_excavation(&mut self, prepared: PreparedExcavation) -> Result<AppliedChange, String> {
        if !Arc::ptr_eq(&self.owner, &prepared.owner) || self.epoch != prepared.epoch {
            return Err("prepared environment change is stale or foreign".into());
        }
        let epoch = self.epoch.checked_add(1).ok_or("environment epoch exhausted")?;
        let revision = self.physical_revision.checked_add(1).ok_or("physical geometry revision exhausted")?;
        let changed_column = (self.terrain.prepared_cell(&prepared.terrain).x,
            self.terrain.prepared_cell(&prepared.terrain).z);
        let applied = self.terrain.apply(prepared.terrain)?;
        self.physical_revision = revision;
        self.field = prepared.field;
        self.change_index.record(revision, [changed_column].into_iter().collect());
        self.epoch = epoch;
        Ok(applied)
    }

}

fn unsupported_structures(terrain: &mut TerrainOwner, structures: &StaticGeometry,
    max_span_steps: u32, replacement: Option<(Cell, u16)>) -> Result<Vec<String>, String> {
    if structures.instances().is_empty() { return Ok(Vec::new()); }
    let mut query = |cell: Cell| {
        let material = if let Some((_, slot)) = replacement.filter(|(at, _)| *at == cell) {
            slot
        } else {
            match terrain.query(cell) {
                Ok(slot) => slot,
                Err("cell outside world bounds") => return Ok(false),
                Err(error) => return Err(error.into()),
            }
        };
        Ok(!terrain.is_open_material(material))
    };
    let policy = crate::structure_support::SupportPolicy {
        max_span_steps, max_instances: 4096, max_work: 1_000_000,
    };
    Ok(crate::structure_support::resolve(structures, policy, &mut query)?.unsupported)
}

fn coordinates(cell: Cell) -> Result<[i32; 3], String> {
    Ok([i32::try_from(cell.x).map_err(|_| "water x out of range")?, cell.y,
        i32::try_from(cell.z).map_err(|_| "water z out of range")?])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::water::WaterCellKind;
    use crate::structure_geometry::Face;
    use crate::generation::{Bounds, MaterialSlots, WorldSpec};
    use crate::terrain::MaterialProperty;

    #[test]
    fn terrain_change_index_is_bounded_and_marks_restore_and_stale() {
        let mut index = TerrainChangeIndex::fresh();
        index.record(1, BTreeSet::from([(2, 3)]));
        assert_eq!(index.since(0, 1), TerrainChangeSet::ChangedColumns {
            revision: 1, columns: vec![[2, 3]],
        });
        assert_eq!(index.since(1, 1), TerrainChangeSet::ChangedColumns {
            revision: 1, columns: Vec::new(),
        });
        assert_eq!(index.since(2, 1), TerrainChangeSet::FullReset {
            revision: 1, reason: TerrainResetReason::Stale,
        });

        let restored = TerrainChangeIndex::restored(4);
        assert_eq!(restored.since(3, 4), TerrainChangeSet::FullReset {
            revision: 4, reason: TerrainResetReason::Restored,
        });

        for revision in 2..=(CHANGE_HISTORY_LIMIT as u64 + 1) {
            index.record(revision, BTreeSet::from([(revision as i64, 0)]));
        }
        assert_eq!(index.since(0, CHANGE_HISTORY_LIMIT as u64 + 1), TerrainChangeSet::FullReset {
            revision: CHANGE_HISTORY_LIMIT as u64 + 1, reason: TerrainResetReason::History,
        });
        assert!(matches!(index.since(CHANGE_HISTORY_LIMIT as u64, CHANGE_HISTORY_LIMIT as u64 + 1),
            TerrainChangeSet::ChangedColumns { .. }));

        let mut wide = TerrainChangeIndex::fresh();
        wide.record(1, (0..2048).map(|x| (x, 0)).collect());
        wide.record(2, (2048..4097).map(|x| (x, 0)).collect());
        assert_eq!(wide.since(0, 2), TerrainChangeSet::FullReset {
            revision: 2, reason: TerrainResetReason::History,
        });
    }

    #[test]
    fn structure_floor_seals_water_and_restores_without_reseeding() {
        let terrain = || {
            let generator = WorldSpec { seed: "building-water", identity: "structures",
                bounds: Bounds { min_x: -4, max_x: 4, min_y: -32, max_y: 40, min_z: -4, max_z: 4 },
                slots: MaterialSlots { air: 0, soil: 1, stone: 2 }, sea_level: 12,
                vertical_metres: 1.0, max_samples: 4096 }.compile().unwrap();
            TerrainOwner::new(generator, [
                MaterialProperty { slot: 0, solid: false, diggable: false },
                MaterialProperty { slot: 1, solid: true, diggable: true },
                MaterialProperty { slot: 2, solid: true, diggable: true },
            ], 4, 128, 32768).unwrap()
        };
        let low = Cell { x: 0, y: 30, z: 0 };
        let high = Cell { y: 31, ..low };
        let geometry = TerrainWaterGeometry::new("floor-water".into(), vec![low, high],
            BTreeMap::from([(0, MaterialWater::Open), (1, MaterialWater::Closed), (2, MaterialWater::Closed)]),
            [1.0; 3], 1.0, 0.1, WaterLimits::default(), 6).unwrap();
        let mut world = TerrainWater::fresh(geometry.clone(), terrain(), &[
            WaterStock { id: "cell:0,30,0".into(), mass_kg: 0.0 },
            WaterStock { id: "cell:0,31,0".into(), mass_kg: 100.0 },
        ]).unwrap();
        let anchor = world.terrain.surface_cells(&[(1, 0)]).unwrap()[0].unwrap().cell;
        let floor = || vec![
            StaticInstance::Wall { id: "column".into(), base: Cell { y: anchor.y + 1, ..anchor }, height: u8::try_from(low.y - anchor.y).unwrap() },
            StaticInstance::Floor { id: "floor".into(), support: low },
        ];
        let before = world.facts().unwrap();
        assert!(matches!(world.prepare_structures(vec![StaticInstance::Floor {
            id: "unsupported".into(), support: low,
        }]).unwrap(), Err(StructureChangeBlock::Unsupported(_))));
        let air_bounds = AirGeometryBounds { min: low, max: Cell { x: 1, y: 32, z: 1 } };
        let original_air = world.air_geometry(air_bounds).unwrap();
        let token = world.prepare_structures(floor()).unwrap().unwrap();
        let proposed_air = world.prepared_structure_air_geometry(&token, air_bounds).unwrap();
        assert_eq!(world.air_geometry(air_bounds).unwrap(), original_air);
        assert!(proposed_air.faces.iter().any(|face| face.face == Face::upward(low)
            && matches!(face.kind, AirGeometryFaceKind::Internal { sealed: true, .. })));
        assert_eq!(world.facts().unwrap(), before);
        world.advance(0.0).unwrap();
        assert!(world.prepared_structure_air_geometry(&token, air_bounds).is_err());
        assert!(world.apply_structures(token).is_err());
        let token = world.prepare_structures(floor()).unwrap().unwrap();
        let proposed_air = world.prepared_structure_air_geometry(&token, air_bounds).unwrap();
        world.apply_structures(token).unwrap();
        let TerrainChangeSet::ChangedColumns { revision, columns } = world.terrain_changes(0) else { panic!("fresh structure change must be indexed"); };
        assert_eq!(revision, 1);
        assert!(columns.contains(&[low.x, low.z]));
        assert!(columns.contains(&[anchor.x, anchor.z]));
        assert_eq!(world.air_geometry(air_bounds).unwrap(), proposed_air);
        let expected = world.material(anchor).unwrap();
        assert!(matches!(world.prepare_excavation(anchor, expected, 0).unwrap(), ExcavationResult::StructuresBlocked(_)));
        assert_eq!(world.material(anchor).unwrap(), expected);
        // In the first local step the floor blocks direct downward flow.
        // Later water can legitimately go around this single-tile floor.
        world.advance(0.25).unwrap();
        let facts = world.facts().unwrap();
        assert!((facts.total_kg - 100.0).abs() < 1e-10);
        assert_eq!(facts.cells.iter().find(|cell| cell.at == [0,30,0]).unwrap().mass_kg, 0.0);
        assert!(world.traversal_material(low).unwrap().sealed_top);
        assert!(!world.traversal_material(low).unwrap().solid);
        let records = world.save_records().unwrap();
        let mut restored = TerrainWater::restore_records(geometry, terrain(), &records).unwrap();
        assert_eq!(restored.facts().unwrap(), facts);
        assert_eq!(restored.terrain_revision(), world.terrain_revision());
        assert!(matches!(restored.terrain_changes(0), TerrainChangeSet::FullReset { reason: TerrainResetReason::Restored, .. }));
        assert!(restored.traversal_material(low).unwrap().sealed_top);
        let token = restored.prepare_structures(Vec::new()).unwrap().unwrap();
        restored.apply_structures(token).unwrap();
        let before_flow = restored.air_geometry(air_bounds).unwrap();
        let stale = restored.prepare_water_advance(1.0).unwrap();
        let flowing = restored.prepare_water_advance(1.0).unwrap();
        assert!(!restored.air_geometry_changes(AirGeometryEdit::Water(&flowing)).unwrap().cells.is_empty());
        // The replacement field can flow beyond the original authored coordinates.
        let proposed_flow = restored.prepared_water_air_geometry(&flowing, air_bounds).unwrap();
        assert_eq!(restored.air_geometry(air_bounds).unwrap(), before_flow);
        assert_ne!(proposed_flow.cells, before_flow.cells);
        restored.apply_water_advance(flowing).unwrap();
        assert_eq!(restored.air_geometry(air_bounds).unwrap(), proposed_flow);
        assert!(restored.prepared_water_air_geometry(&stale, air_bounds).is_err());
        assert!(restored.air_geometry_changes(AirGeometryEdit::Water(&stale)).is_err());
        assert!(restored.apply_water_advance(stale).is_err());
        let facts = restored.facts().unwrap();
        assert!((facts.total_kg - 100.0).abs() < 1e-10);
        assert!(facts.cells.iter().any(|cell| cell.at[1] <= 30 && cell.mass_kg > 0.0), "finite water falls below the opened floor");
    }

    #[test]
    fn structure_surface_query_validates_late_column_before_sampling() {
        let bounds = Bounds { min_x: -2, max_x: 2, min_y: -2, max_y: 40, min_z: -2, max_z: 2 };
        let generator = WorldSpec { seed: "surface-query", identity: "surface-query",
            bounds, slots: MaterialSlots { air: 0, soil: 1, stone: 2 }, sea_level: 1,
            vertical_metres: 1.0, max_samples: 256 }.compile().unwrap();
        let terrain = TerrainOwner::new(generator, [
            MaterialProperty { slot: 0, solid: false, diggable: false },
            MaterialProperty { slot: 1, solid: true, diggable: true },
            MaterialProperty { slot: 2, solid: true, diggable: true },
        ], 4, 16, 256).unwrap();
        let geometry = TerrainWaterGeometry::new("surface-query".into(), vec![Cell { x: 0, y: 35, z: 0 }],
            BTreeMap::from([(0, MaterialWater::Open), (1, MaterialWater::Closed), (2, MaterialWater::Closed)]),
            [1.0; 3], 1.0, 0.1, WaterLimits::default(), 6).unwrap();
        let mut world = TerrainWater::fresh(geometry, terrain, &[WaterStock { id: "cell:0,35,0".into(), mass_kg: 0.0 }]).unwrap();
        assert_eq!(world.structure_surfaces(&[(bounds.min_x, bounds.min_z)]).unwrap(), vec![Vec::new()]);
        assert!(world.structure_surfaces(&[(bounds.min_x, bounds.min_z), (bounds.max_x, bounds.min_z)]).is_err());
    }

    #[test]
    fn actual_generated_excavation_preserves_water_and_allows_dry_world_edits() {
        let terrain_factory = || {
        let generator = WorldSpec { seed: "wet-excavation", identity: "colony",
            bounds: Bounds { min_x: -32, max_x: 32, min_y: -32, max_y: 40, min_z: -32, max_z: 32 },
            slots: MaterialSlots { air: 0, soil: 1, stone: 2 }, sea_level: 12,
            vertical_metres: 1.0, max_samples: 4096 }.compile().unwrap();
        TerrainOwner::new(generator, [
            MaterialProperty { slot: 0, solid: false, diggable: false },
            MaterialProperty { slot: 1, solid: true, diggable: true },
            MaterialProperty { slot: 2, solid: true, diggable: true },
        ], 4, 128, 32768).unwrap()
        };
        let mut terrain = terrain_factory();
        let at = (-20..0).map(|y| Cell { x: 0, y, z: 0 })
            .find(|at| terrain.query(*at).unwrap() != 0).unwrap();
        let expected = terrain.query(at).unwrap();
        let below = Cell { y: at.y - 1, ..at };
        let rule = SoilRule { id: "pores".into(), porosity: 0.4, retention: 0.1,
            absorb_m_per_s: 0.1, seep_m_per_s: 0.02 };
        let geometry = TerrainWaterGeometry::new("colony-water".into(), vec![at, below],
            BTreeMap::from([(0, MaterialWater::Open), (1, MaterialWater::Porous(rule.clone())),
                (2, MaterialWater::Porous(rule))]), [1.0; 3], 1.0, 0.1, WaterLimits::default(), 6).unwrap();
        let mut water = TerrainWater::fresh(geometry.clone(), terrain,
            &[WaterStock { id: format!("cell:0,{},0", at.y), mass_kg: 200.0 },
              WaterStock { id: format!("cell:0,{},0", below.y), mass_kg: 0.0 }]).unwrap();
        let pore_step = water.prepare_water_advance(0.2).unwrap();
        assert_eq!(pore_step.field.facts().unwrap(), water.field.facts().unwrap(), "porous-to-porous background flow is intentionally asleep");
        assert!(water.air_geometry_changes(AirGeometryEdit::Water(&pore_step)).unwrap().cells.is_empty());
        // Discard the detached probe, preserving the excavation's original stock.
        let before = water.facts().unwrap();
        let ExcavationResult::Prepared(stale) = water.prepare_excavation(at, expected, 0).unwrap() else { panic!("prepare"); };
        assert_eq!(water.facts().unwrap(), before);
        assert_eq!(water.material(at).unwrap(), expected);
        water.advance(0.0).unwrap();
        let stale_bounds = AirGeometryBounds {
            min: at,
            max: Cell { x: at.x + 1, y: at.y + 1, z: at.z + 1 },
        };
        assert!(water.prepared_excavation_air_geometry(&stale, stale_bounds).is_err());
        assert!(water.apply_excavation(stale).is_err());
        assert_eq!(water.material(at).unwrap(), expected);
        let ExcavationResult::Prepared(prepared) = water.prepare_excavation(at, expected, 0).unwrap() else { panic!("prepare"); };
        let credited_water_kg = prepared.water_kg();
        assert_eq!(credited_water_kg, 200.0);
        assert_eq!(prepared.removed(), expected);
        assert_eq!(prepared.volume_m3(), 1.0);
        let mut foreign = TerrainWater::fresh(geometry.clone(), terrain_factory(),
            &[WaterStock { id: format!("cell:0,{},0", at.y), mass_kg: 200.0 },
              WaterStock { id: format!("cell:0,{},0", below.y), mass_kg: 0.0 }]).unwrap();
        let foreign_expected = foreign.material(at).unwrap();
        let ExcavationResult::Prepared(foreign_prepared) = foreign.prepare_excavation(at, foreign_expected, 0).unwrap() else { panic!("foreign prepare"); };
        assert!(water.prepared_excavation_air_geometry(&foreign_prepared, AirGeometryBounds {
            min: at, max: Cell { x: at.x + 1, y: at.y + 1, z: at.z + 1 },
        }).is_err());
        let air_bounds = AirGeometryBounds {
            min: at,
            max: Cell { x: at.x + 1, y: at.y + 1, z: at.z + 1 },
        };
        let before_air = water.air_geometry(air_bounds).unwrap();
        let proposed_air = water.prepared_excavation_air_geometry(&prepared, air_bounds).unwrap();
        assert!(before_air.cells.iter().all(|cell| cell.at != at));
        assert!(proposed_air.cells.iter().any(|cell| cell.at == at));
        assert_eq!(water.air_geometry(air_bounds).unwrap(), before_air);
        // Failed admission changes no canonical state, so it need not invalidate
        // an otherwise current completion candidate.
        assert!(water.advance(-1.0).is_err());
        assert_eq!(water.facts().unwrap(), before);
        water.apply_excavation(prepared).unwrap();
        assert_eq!(water.material(at).unwrap(), 0);
        assert_eq!(water.terrain_changes(0), TerrainChangeSet::ChangedColumns {
            revision: 1, columns: vec![[at.x, at.z]],
        });
        assert_eq!(water.air_geometry(air_bounds).unwrap(), proposed_air);
        let facts = water.facts().unwrap();
        assert_eq!(facts.total_kg + credited_water_kg, 200.0);
        assert_eq!(facts.total_kg, 0.0);
        let opened = facts.cells.iter().find(|fact| fact.at == [0, at.y, 0]).unwrap();
        assert_eq!(opened.kind, WaterCellKind::Void);
        assert_eq!(opened.capacity_kg, 1000.0);
        assert!(matches!(water.prepare_excavation(at, expected, 0).unwrap(), ExcavationResult::TerrainBlocked(_)));
        assert_eq!(water.facts().unwrap(), facts);
        let dry = (-20..0).map(|y| Cell { x: 20, y, z: 0 })
            .find(|at| water.material(*at).unwrap() != 0).unwrap();
        let expected = water.material(dry).unwrap();
        let ExcavationResult::Prepared(prepared) = water.prepare_excavation(dry, expected, 0).unwrap() else { panic!("prepare dry"); };
        assert_eq!(prepared.water_kg(), 0.0);
        water.apply_excavation(prepared).unwrap();
        assert_eq!(water.terrain_changes(1), TerrainChangeSet::ChangedColumns {
            revision: 2, columns: vec![[dry.x, dry.z]],
        });
        assert_eq!(water.facts().unwrap().total_kg, facts.total_kg);
        assert!(water.facts().unwrap().cells.iter().any(|c| c.at == [20, dry.y, 0] && c.mass_kg == 0.0));
        let physical_before_water_tick = water.terrain_changes(0);
        water.advance(0.2).unwrap();
        assert_eq!(water.terrain_changes(0), physical_before_water_tick);
        let moved = water.facts().unwrap();
        assert!((moved.total_kg + credited_water_kg - 200.0).abs() < 1e-9);
        let records = water.save_records().unwrap();
        let mut restored = TerrainWater::restore_records(geometry.clone(), terrain_factory(), &records).unwrap();
        assert_eq!(restored.facts().unwrap(), moved);
        assert_eq!(restored.material(at).unwrap(), 0);
        assert_eq!(restored.material(dry).unwrap(), 0);
        restored.advance(0.2).unwrap();
        water.advance(0.2).unwrap();
        assert_eq!(restored.facts().unwrap(), water.facts().unwrap());
        let mut changed_rules = geometry;
        changed_rules.spread += 0.1;
        assert!(TerrainWater::restore_records(changed_rules, terrain_factory(), &records).is_err());

    }
}
