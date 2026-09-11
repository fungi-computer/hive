//! Physical terrain-to-water composition. No independent material grid is kept.
//! The admitted coordinates bound transport work, not the generated world size.
use crate::generation::Cell;
use crate::terrain::{AppliedChange, BlockReason, PrepareResult, TerrainOwner};
use crate::water::{CellDefinition, CompiledWater, FaceDefinition, SoilRule,
    WaterCellKind, WaterDefinition, WaterLimits, WaterRebind, WaterRebindBlock,
    WaterState, WaterStock, WaterWorkspace, WaterFacts, WaterWork};
use std::collections::{BTreeMap, BTreeSet};

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
}

pub enum ExcavationResult {
    Applied(AppliedChange),
    TerrainBlocked(BlockReason),
    WaterBlocked(WaterRebindBlock),
}

impl TerrainWaterGeometry {
    pub fn new(id: String, cells: Vec<Cell>, materials: BTreeMap<u16, MaterialWater>,
        spacing: [f64; 3], fall: f64, spread: f64, limits: WaterLimits)
        -> Result<Self, String> {
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
        Ok(Self { id, cells, materials, spacing, fall, spread, limits })
    }

    /// Rebuild only after geometry changes, using a single proposed cell override.
    /// Missing material definitions are errors, never silently open boundaries.
    fn identity(&self) -> Result<Vec<u8>, String> {
        let cells = self.cells.iter().map(|cell| coordinates(*cell)).collect::<Result<Vec<_>, _>>()?;
        let bytes = postcard::to_allocvec(&(self.id.as_str(), cells, &self.materials,
            self.spacing, self.fall, self.spread)).map_err(|_| "water geometry identity encoding failed")?;
        if bytes.len() > 65536 { return Err("water geometry identity exceeds record budget".into()); }
        Ok(bytes)
    }

    fn compile(&self, terrain: &mut TerrainOwner, revision: u64,
        replacement: Option<(Cell, u16)>) -> Result<CompiledWater, String> {
        let mut cells = Vec::new();
        let mut soils = BTreeMap::new();
        let mut represented = BTreeSet::new();
        for cell in &self.cells {
            let slot = match replacement {
                Some((at, slot)) if at == *cell => slot,
                _ => terrain.query(*cell)?,
            };
            let behavior = self.materials.get(&slot).ok_or("undefined material water behavior")?;
            let (kind, soil_id) = match behavior {
                MaterialWater::Closed => continue,
                MaterialWater::Open => (WaterCellKind::Void, None),
                MaterialWater::Porous(rule) => {
                    if let Some(previous) = soils.insert(rule.id.clone(), rule.clone()) {
                        if previous != *rule { return Err("conflicting soil definition".into()); }
                    }
                    (WaterCellKind::Soil, Some(rule.id.clone()))
                }
            };
            let at = coordinates(*cell)?;
            represented.insert(at);
            cells.push(CellDefinition { at, kind, soil_id });
        }
        let mut faces = Vec::new();
        for a in &represented {
            for axis in 0..3 {
                let mut b = *a;
                b[axis] = b[axis].checked_add(1).ok_or("water face coordinate overflow")?;
                if represented.contains(&b) {
                    faces.push(FaceDefinition { a: *a, b, open_fraction: 1.0 });
                }
            }
        }
        CompiledWater::compile(WaterDefinition { id: self.id.clone(), revision,
            spacing_m: self.spacing, soils: soils.into_values().collect(), cells, faces,
            fall_m_per_s: self.fall, spread_m_per_s: self.spread }, self.limits)
    }

 }

/// The graph, stocks and scratch cannot be independently swapped by a caller.
/// Its owned TerrainOwner remains the single material authority. The Kernel
/// uses material queries and compound edits rather than mutating terrain beside water.
/// Three logical records. The Region transaction stores them at one revision.
/// Environment data is not embedded into the entity snapshot.
pub struct TerrainWaterRecords {
    pub header: Vec<u8>,
    pub terrain: Vec<u8>,
    pub water: Vec<u8>,
}

pub struct TerrainWater {
    terrain: TerrainOwner,
    geometry: TerrainWaterGeometry,
    identity: Vec<u8>,
    graph: CompiledWater,
    state: WaterState,
    scratch: WaterWorkspace,
}
impl TerrainWater {
    pub fn fresh(geometry: TerrainWaterGeometry, mut terrain: TerrainOwner,
        stocks: &[WaterStock]) -> Result<Self, String> {
        if geometry.spacing != terrain.cell_spacing_m() { return Err("terrain and water metric differ".into()); }
        let graph = geometry.compile(&mut terrain, 0, None)?;
        let state = graph.initial(stocks)?;
        let scratch = graph.workspace();
        let identity = geometry.identity()?;
        Ok(Self { terrain, geometry, identity, graph, state, scratch })
    }
    pub fn save_records(&self) -> Result<TerrainWaterRecords, String> {
        let header = postcard::to_allocvec(&(1u16, self.identity.as_slice(),
            self.terrain.revision(), self.graph.binding().revision()))
            .map_err(|_| "environment header encoding failed")?;
        let terrain = self.terrain.export()?;
        let water = self.graph.encode_state(&self.state)?;
        if terrain.len() > 256 * 1024 || water.len() > 256 * 1024 {
            return Err("environment record exceeds Region record budget".into());
        }
        Ok(TerrainWaterRecords { header, terrain, water })
    }

    /// Hydrate a disposable candidate. This never calls fresh/initial: zero
    /// remaining water is a saved fact, not permission to reseed a source.
    pub fn restore_records(geometry: TerrainWaterGeometry, mut terrain: TerrainOwner,
        records: &TerrainWaterRecords) -> Result<Self, String> {
        if records.header.len() > 65568 || records.terrain.len() > 256 * 1024
            || records.water.len() > 256 * 1024 { return Err("environment record budget".into()); }
        let ((version, saved_identity, terrain_revision, water_revision), remainder):
            ((u16, &[u8], u64, u64), _) = postcard::take_from_bytes(&records.header)
            .map_err(|_| "invalid environment header")?;
        let identity = geometry.identity()?;
        if version != 1 || !remainder.is_empty() || saved_identity != identity.as_slice()
            || geometry.spacing != terrain.cell_spacing_m() {
            return Err("environment record binding mismatch".into());
        }
        terrain.restore(&records.terrain)?;
        if terrain.revision() != terrain_revision { return Err("environment terrain frontier mismatch".into()); }
        let graph = geometry.compile(&mut terrain, water_revision, None)?;
        let state = graph.decode_state(&records.water)?;
        let scratch = graph.workspace();
        Ok(Self { terrain, geometry, identity, graph, state, scratch })
    }

    pub fn material(&mut self, at: Cell) -> Result<u16, String> { Ok(self.terrain.query(at)?) }
    pub fn facts(&self) -> Result<WaterFacts, String> { self.graph.facts(&self.state) }
    pub fn advance(&mut self, seconds: f64) -> Result<WaterWork, String> {
        let next = self.graph.advance(&self.state, seconds, &mut self.scratch)?;
        self.state = next.state;
        Ok(next.work)
    }

    /// All fallible water work precedes terrain publication. The enclosing
    /// Kernel must also admit finite yield custody before invoking this step.
    pub fn excavate(&mut self,
        at: Cell, expected: u16, replacement: u16) -> Result<ExcavationResult, String> {
        let terrain = &mut self.terrain;
        let prepared = match terrain.prepare_excavation(at, expected, replacement)? {
            PrepareResult::Blocked { reason, .. } => return Ok(ExcavationResult::TerrainBlocked(reason)),
            PrepareResult::Prepared(change) => change,
        };
        // Admission bounds limit transport, never excavation elsewhere.
        if !self.geometry.cells.contains(&at) {
            return Ok(ExcavationResult::Applied(terrain.apply(prepared)?));
        }
        let revision = self.graph.binding().revision().checked_add(1).ok_or("water revision overflow")?;
        let next = self.geometry.compile(terrain, revision, Some((at, replacement)))?;
        let next_state = match self.graph.prepare_rebind(&self.state, &next)? {
            WaterRebind::Blocked(reason) => return Ok(ExcavationResult::WaterBlocked(reason)),
            WaterRebind::Ready(state) => state,
        };
        let scratch = next.workspace();
        let applied = terrain.apply(prepared)?;
        self.graph = next;
        self.state = next_state;
        self.scratch = scratch;
        Ok(ExcavationResult::Applied(applied))
    }
}

fn coordinates(cell: Cell) -> Result<[i32; 3], String> {
    Ok([i32::try_from(cell.x).map_err(|_| "water x out of range")?, cell.y,
        i32::try_from(cell.z).map_err(|_| "water z out of range")?])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::{Bounds, MaterialSlots, WorldSpec};
    use crate::terrain::MaterialProperty;

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
                (2, MaterialWater::Porous(rule))]), [1.0; 3], 1.0, 0.1, WaterLimits::default()).unwrap();
        let mut water = TerrainWater::fresh(geometry.clone(), terrain,
            &[WaterStock { id: format!("cell:0,{},0", at.y), mass_kg: 200.0 },
              WaterStock { id: format!("cell:0,{},0", below.y), mass_kg: 0.0 }]).unwrap();
        assert!(matches!(water.excavate(at, expected, 0).unwrap(), ExcavationResult::Applied(_)));
        assert_eq!(water.material(at).unwrap(), 0);
        let facts = water.facts().unwrap();
        assert_eq!(facts.total_kg, 200.0);
        let opened = facts.cells.iter().find(|fact| fact.at == [0, at.y, 0]).unwrap();
        assert_eq!(opened.kind, WaterCellKind::Void);
        assert_eq!(opened.capacity_kg, 1000.0);
        assert!(matches!(water.excavate(at, expected, 0).unwrap(), ExcavationResult::TerrainBlocked(_)));
        assert_eq!(water.facts().unwrap(), facts);
        let dry = (-20..0).map(|y| Cell { x: 20, y, z: 0 })
            .find(|at| water.material(*at).unwrap() != 0).unwrap();
        let expected = water.material(dry).unwrap();
        assert!(matches!(water.excavate(dry, expected, 0).unwrap(), ExcavationResult::Applied(_)));
        assert_eq!(water.facts().unwrap(), facts);
        water.advance(0.2).unwrap();
        let moved = water.facts().unwrap();
        assert!((moved.total_kg - 200.0).abs() < 1e-9);
        assert!(moved.cells.iter().find(|fact| fact.at == [0, below.y, 0]).unwrap().mass_kg > 0.0);
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
