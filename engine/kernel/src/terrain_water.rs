//! Physical terrain-to-water composition. No independent material grid is kept.
//! The admitted coordinates bound transport work, not the generated world size.
use crate::generation::Cell;
use crate::terrain::{AppliedChange, BlockReason, PrepareResult, TerrainOwner};
use crate::water::{CellDefinition, CompiledWater, FaceDefinition, SoilRule,
    WaterCellKind, WaterDefinition, WaterLimits, WaterRebind, WaterRebindBlock,
    WaterState, WaterStock, WaterWorkspace, WaterFacts, WaterWork};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug)]
pub enum MaterialWater {
    Closed,
    Open,
    Porous(SoilRule),
}

/// Content selects material behavior; the current terrain owner selects location.
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
    pub fn compile(&self, terrain: &mut TerrainOwner, revision: u64,
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
/// Terrain remains the single material owner, composed by the enclosing Kernel.
pub struct TerrainWater {
    geometry: TerrainWaterGeometry,
    graph: CompiledWater,
    state: WaterState,
    scratch: WaterWorkspace,
}
impl TerrainWater {
    pub fn fresh(geometry: TerrainWaterGeometry, terrain: &mut TerrainOwner,
        stocks: &[WaterStock]) -> Result<Self, String> {
        let graph = geometry.compile(terrain, 0, None)?;
        let state = graph.initial(stocks)?;
        let scratch = graph.workspace();
        Ok(Self { geometry, graph, state, scratch })
    }
    pub fn facts(&self) -> Result<WaterFacts, String> { self.graph.facts(&self.state) }
    pub fn advance(&mut self, seconds: f64) -> Result<WaterWork, String> {
        let next = self.graph.advance(&self.state, seconds, &mut self.scratch)?;
        self.state = next.state;
        Ok(next.work)
    }

    /// All fallible water work precedes terrain publication. The enclosing
    /// Kernel must also admit finite yield custody before invoking this step.
    pub fn excavate(&mut self, terrain: &mut TerrainOwner,
        at: Cell, expected: u16, replacement: u16) -> Result<ExcavationResult, String> {
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
