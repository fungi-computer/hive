//! Finite local water. Generated geology supplies virgin stock once; explicit
//! zeroes survive drainage and reload. Only awake interfaces exchange water.
use super::{coordinates, MaterialWater, TerrainWaterGeometry};
use crate::generation::Cell;
use crate::quantity::resolve_quantity_change;
use crate::structure_geometry::{Face, FaceAxis, GeometryProjection};
use crate::terrain::TerrainOwner;
use crate::water::{WaterCellFact, WaterCellKind, WaterFacts, WaterRebindBlock, WaterStock, WaterWork};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;

const MAX_STOCKS: usize = 8192;
const STEP: f64 = 0.25;
const CELLS_PER_STEP: usize = 128;
const MAX_STEPS: usize = 4;
const MIN_TRANSFER_KG: f64 = 0.0001;

#[derive(Clone, Copy, Debug)]
struct Shape { kind: WaterCellKind, capacity: f64, retained: f64, absorb: f64, seep: f64 }
#[derive(Clone, Copy, Debug)]
struct Stock { mass: f64, shape: Shape }
/// Copy-on-write pages keep detached admission proportional to touched pages,
/// rather than cloning all historical cell records on each simulation step.
#[derive(Clone, Debug, Default)]
pub(super) struct Field {
    pages: BTreeMap<[i64; 3], Arc<BTreeMap<Cell, Stock>>>,
    active: VecDeque<Cell>,
    queued: BTreeSet<Cell>,
    initial: f64,
    boundary: f64,
    elapsed: f64,
    count: usize,
    voxel_kg: f64,
}
#[derive(serde::Serialize, serde::Deserialize)]
struct Saved { version: u16, stocks: Vec<(Cell, f64)>, active: Vec<Cell>, initial: f64, boundary: f64, elapsed: f64 }

pub(super) struct View<'a> {
    pub terrain: &'a mut TerrainOwner,
    pub structures: &'a GeometryProjection,
    pub geometry: &'a TerrainWaterGeometry,
    pub replacement: Option<(Cell, u16)>,
}
impl View<'_> {
    fn contains(&self, c: Cell) -> bool {
        let b = self.terrain.bounds();
        c.x >= b.min_x && c.x < b.max_x && c.y >= b.min_y && c.y < b.max_y && c.z >= b.min_z && c.z < b.max_z
    }
    fn shape(&mut self, c: Cell) -> Result<Option<Shape>, String> {
        if !self.contains(c) || self.structures.is_bulk_solid(c) { return Ok(None); }
        let slot = match self.replacement { Some((at, slot)) if at == c => slot, _ => self.terrain.query(c)? };
        let volume = self.geometry.spacing.iter().product::<f64>();
        Ok(match self.geometry.materials.get(&slot).ok_or("undefined material water behavior")? {
            MaterialWater::Closed => None,
            MaterialWater::Open => Some(Shape { kind: WaterCellKind::Void, capacity: volume * 1000.0, retained: 0.0, absorb: 0.0, seep: 0.0 }),
            MaterialWater::Porous(r) => Some(Shape { kind: WaterCellKind::Soil, capacity: volume * 1000.0 * r.porosity,
                retained: volume * 1000.0 * r.retention, absorb: r.absorb_m_per_s, seep: r.seep_m_per_s }),
        })
    }
    fn baseline(&self, c: Cell, shape: Shape) -> Result<f64, String> {
        if !self.geometry.generated_groundwater { return Ok(0.0); }
        let (original, _, _) = self.terrain.original_water_source(c)?;
        // A removed porous voxel stays empty; it is not a new source of water.
        if shape.kind == WaterCellKind::Void && matches!(self.geometry.materials.get(&original.material), Some(MaterialWater::Porous(_))) { return Ok(0.0); }
        self.original_stock(c)
    }
    fn original_stock(&self, c: Cell) -> Result<f64, String> {
        let (original, head, sea_level) = self.terrain.original_water_source(c)?;
        let volume = self.geometry.spacing.iter().product::<f64>();
        Ok(match self.geometry.materials.get(&original.material).ok_or("undefined original water material")? {
            MaterialWater::Porous(rule) if c.y < head.head_level => volume * 1000.0 * rule.porosity * head.pore_fill,
            MaterialWater::Open if c.y >= original.bed_level && c.y < sea_level => volume * 1000.0,
            _ => 0.0,
        })
    }
    fn connected(&self, a: Cell, b: Cell) -> bool {
        let (cell, axis) = if a.x != b.x { (if a.x < b.x { a } else { b }, FaceAxis::X) }
            else if a.y != b.y { (if a.y < b.y { a } else { b }, FaceAxis::Y) }
            else { (if a.z < b.z { a } else { b }, FaceAxis::Z) };
        !self.structures.is_face_sealed(Face { cell, axis })
    }
}
fn neighbors(c: Cell) -> [Cell; 6] {
    [Cell { y: c.y - 1, ..c }, Cell { x: c.x - 1, ..c }, Cell { x: c.x + 1, ..c },
     Cell { z: c.z - 1, ..c }, Cell { z: c.z + 1, ..c }, Cell { y: c.y + 1, ..c }]
}
fn page(c: Cell) -> [i64; 3] { [c.x.div_euclid(8), i64::from(c.y).div_euclid(8), c.z.div_euclid(8)] }
impl Field {
    fn get(&self, c: Cell) -> Option<Stock> { self.pages.get(&page(c)).and_then(|p| p.get(&c)).copied() }
    fn put(&mut self, c: Cell, stock: Stock) {
        let p = Arc::make_mut(self.pages.entry(page(c)).or_default());
        if p.insert(c, stock).is_none() { self.count += 1; }
    }
    fn entries(&self) -> impl Iterator<Item = (Cell, Stock)> + '_ {
        self.pages.values().flat_map(|p| p.iter().map(|(c, s)| (*c, *s)))
    }
    fn wake(&mut self, c: Cell) {
        // Every queued coordinate has one durable stock record. This bounds the
        // queue by MAX_STOCKS and avoids waking six untracked neighbors per flow.
        if self.get(c).is_some() && self.queued.insert(c) { self.active.push_back(c); }
    }
    pub(super) fn wake_neighborhood(&mut self, c: Cell, bounds: crate::generation::Bounds) {
        for at in std::iter::once(c).chain(neighbors(c)) {
            if at.x >= bounds.min_x && at.x < bounds.max_x && at.y >= bounds.min_y && at.y < bounds.max_y && at.z >= bounds.min_z && at.z < bounds.max_z { self.wake(at); }
        }
    }
    fn realize(&mut self, c: Cell, view: &mut View<'_>) -> Result<Option<Stock>, String> {
        if let Some(stock) = self.get(c) { return Ok(Some(stock)); }
        let Some(shape) = view.shape(c)? else { return Ok(None); };
        if self.count >= MAX_STOCKS { return Err("local water stock record capacity reached".into()); }
        let mass = view.baseline(c, shape)?;
        let stock = Stock { mass, shape };
        self.put(c, stock);
        self.initial += mass;
        Ok(Some(stock))
    }
    pub(super) fn fresh(view: &mut View<'_>, stocks: &[WaterStock]) -> Result<Self, String> {
        let mut field = Self { voxel_kg: view.geometry.spacing.iter().product::<f64>() * 1000.0, ..Self::default() };
        let mut authored = BTreeMap::new();
        for s in stocks {
            if !s.mass_kg.is_finite() || s.mass_kg < 0.0 || authored.insert(s.id.as_str(), s.mass_kg).is_some() { return Err("invalid or duplicate water stock".into()); }
        }
        for c in &view.geometry.cells.clone() {
            let Some(shape) = view.shape(*c)? else { continue; };
            let id = format!("cell:{},{},{}", c.x, c.y, c.z);
            let mass = authored.remove(id.as_str()).unwrap_or(view.baseline(*c, shape)?);
            if mass > shape.capacity { return Err("initial water exceeds capacity".into()); }
            field.put(*c, Stock { mass, shape });
            field.initial += mass;
            if mass > 0.0 { field.wake(*c); }
        }
        if !authored.is_empty() { return Err("water stock has no initial cell".into()); }
        Ok(field)
    }
    pub(super) fn liquid_volume(&self, c: Cell) -> Option<f64> {
        self.get(c).map(|s| if s.shape.kind == WaterCellKind::Void { s.mass / 1000.0 } else { 0.0 })
    }
    pub(super) fn changed_liquid(&self, next: &Self) -> Vec<Cell> {
        next.pages.iter().filter(|(key, value)| self.pages.get(*key).is_none_or(|old| !Arc::ptr_eq(old, value)))
            .flat_map(|(_, page)| page.iter()).filter(|(c, s)| s.shape.kind == WaterCellKind::Void && self.liquid_volume(**c).unwrap_or(0.0) != s.mass / 1000.0)
            .map(|(c, _)| *c).collect()
    }
    pub(super) fn facts(&self) -> Result<WaterFacts, String> {
        let mut total = 0.0;
        let mut cells = Vec::with_capacity(self.count);
        for (c, s) in self.entries() {
            total += s.mass;
            cells.push(WaterCellFact { id: format!("cell:{},{},{}", c.x, c.y, c.z), at: coordinates(c)?, kind: s.shape.kind,
                mass_kg: s.mass, capacity_kg: s.shape.capacity, mobile_kg: (s.mass - s.shape.retained).max(0.0),
                liquid_volume_m3: if s.shape.kind == WaterCellKind::Void { s.mass / 1000.0 } else { 0.0 },
                moisture: if s.shape.kind == WaterCellKind::Soil { s.mass / self.voxel_kg } else { 0.0 } });
        }
        cells.sort_by_key(|c| c.at);
        Ok(WaterFacts { total_kg: total, residual_kg: total - self.initial - self.boundary,
            initial_total_kg: self.initial, boundary_kg: self.boundary, cells })
    }
    pub(super) fn admission_block(&self, c: Cell) -> Option<WaterRebindBlock> {
        (self.get(c).is_none() && self.count >= MAX_STOCKS).then_some(WaterRebindBlock::RecordCapacity { limit: MAX_STOCKS })
    }
    pub(super) fn excavate(&self, c: Cell, view: &mut View<'_>) -> Result<(Self, f64), String> {
        let mut next = self.clone();
        let stock = next.realize(c, view)?;
        if stock.is_none() {
            if next.count >= MAX_STOCKS { return Err("local water stock record capacity reached".into()); }
            next.put(c, Stock { mass: 0.0, shape: Shape { kind: WaterCellKind::Void, capacity: 0.0, retained: 0.0, absorb: 0.0, seep: 0.0 } });
        }
        let mass = stock.filter(|s| s.shape.kind == WaterCellKind::Soil).map_or(0.0, |s| s.mass);
        if let Some(mut s) = stock { s.mass -= mass; next.put(c, s); }
        next.boundary -= mass;
        next.wake_neighborhood(c, view.terrain.bounds());
        Ok((next, mass))
    }
    pub(super) fn rebind(&mut self, view: &mut View<'_>) -> Result<Option<WaterRebindBlock>, String> {
        let old: Vec<_> = self.entries().collect();
        for (c, s) in old {
            match view.shape(c)? {
                None if s.mass > 0.0 => return Ok(Some(WaterRebindBlock::WetCellRemoved { at: coordinates(c)?, mass_kg: s.mass })),
                Some(shape) if s.mass > shape.capacity => return Ok(Some(WaterRebindBlock::CapacityExceeded { at: coordinates(c)?, mass_kg: s.mass, capacity_kg: shape.capacity })),
                Some(shape) => self.put(c, Stock { shape, ..s }),
                None => self.put(c, Stock { mass: 0.0, shape: Shape { kind: WaterCellKind::Void,
                    capacity: 0.0, retained: 0.0, absorb: 0.0, seep: 0.0 } }),
            }
        }
        Ok(None)
    }
    pub(super) fn advance(&self, seconds: f64, view: &mut View<'_>) -> Result<(Self, WaterWork), String> {
        if !seconds.is_finite() || seconds < 0.0 || seconds > view.geometry.limits.max_seconds { return Err("invalid water advance duration".into()); }
        let mut next = self.clone();
        let mut work = WaterWork::default();
        // Missed time is deliberately coarse, not an unbounded catch-up loop.
        next.elapsed = (next.elapsed + seconds).min(STEP * MAX_STEPS as f64);
        while next.elapsed + 1e-12 >= STEP {
            next.elapsed = (next.elapsed - STEP).max(0.0);
            let count = next.active.len().min(CELLS_PER_STEP);
            let mut faces = BTreeSet::new();
            for _ in 0..count {
                let c = next.active.pop_front().expect("count bounded by queue");
                next.queued.remove(&c);
                for b in neighbors(c) {
                    if !view.contains(b) || !view.connected(c, b) { continue; }
                    let key = if c < b { (c, b) } else { (b, c) };
                    if !faces.insert(key) { continue; }
                    work.faces += 1;
                    next.exchange(c, b, view, &mut work)?;
                }
            }
        }
        work.unresolved = next.active.len();
        Ok((next, work))
    }
    fn peek(&self, c: Cell, view: &mut View<'_>) -> Result<Option<Stock>, String> {
        if let Some(s) = self.get(c) { return Ok((s.shape.capacity > 0.0).then_some(s)); }
        let Some(shape) = view.shape(c)? else { return Ok(None); };
        Ok(Some(Stock { mass: view.baseline(c, shape)?, shape }))
    }
    fn exchange(&mut self, a: Cell, b: Cell, view: &mut View<'_>, work: &mut WaterWork) -> Result<(), String> {
        let (Some(sa), Some(sb)) = (self.peek(a, view)?, self.peek(b, view)?) else { return Ok(()); };
        // Local seepage/infiltration, not a whole-aquifer pressure solve.
        if sa.shape.kind == WaterCellKind::Soil && sb.shape.kind == WaterCellKind::Soil { return Ok(()); }
        let (from, to, source, dest, rate, demand) = transfer(a, b, sa, sb, view.geometry);
        let amount = demand.min((source.mass - source.shape.retained).max(0.0))
            .min((dest.shape.capacity - dest.mass).max(0.0)).min(rate * STEP);
        if amount < MIN_TRANSFER_KG { return Ok(()); }
        // A record limit pauses the local interface; it cannot fail the entire
        // game tick or erase an unrecorded source. It stays awake for diagnosis.
        let needed = usize::from(self.get(from).is_none()) + usize::from(self.get(to).is_none());
        if self.count + needed > MAX_STOCKS { self.wake(a); return Ok(()); }
        let Some(debited) = resolve_quantity_change(source.mass, -amount)? else { return Ok(()); };
        let Some(credited) = resolve_quantity_change(dest.mass, amount)? else { return Ok(()); };
        self.realize(from, view)?;
        self.realize(to, view)?;
        self.put(from, Stock { mass: debited, ..source });
        self.put(to, Stock { mass: credited, ..dest });
        work.requests += 1;
        self.wake_neighborhood(from, view.terrain.bounds());
        self.wake_neighborhood(to, view.terrain.bounds());
        Ok(())
    }
    pub(super) fn encode(&self) -> Result<Vec<u8>, String> {
        let saved = Saved { version: 1, stocks: self.entries().map(|(c, s)| (c, s.mass)).collect(),
            active: self.active.iter().copied().collect(), initial: self.initial, boundary: self.boundary, elapsed: self.elapsed };
        let bytes = postcard::to_allocvec(&saved).map_err(|_| "water record encoding failed")?;
        if bytes.len() > 256 * 1024 { return Err("local water record exceeds byte budget".into()); }
        Ok(bytes)
    }
    pub(super) fn decode(bytes: &[u8], view: &mut View<'_>) -> Result<Self, String> {
        if bytes.len() > 256 * 1024 { return Err("local water record exceeds byte budget".into()); }
        let (saved, rest): (Saved, _) = postcard::take_from_bytes(bytes).map_err(|_| "invalid local water record")?;
        if !rest.is_empty() || saved.version != 1 || saved.stocks.len() > MAX_STOCKS || saved.active.len() > MAX_STOCKS
            || !saved.initial.is_finite() || saved.initial < 0.0 || !saved.boundary.is_finite() || saved.boundary > 0.0
            || !saved.elapsed.is_finite() || saved.elapsed < 0.0 || saved.elapsed >= STEP + 1e-9 { return Err("invalid local water record fields".into()); }
        let mut field = Self { initial: saved.initial, boundary: saved.boundary, elapsed: saved.elapsed,
            voxel_kg: view.geometry.spacing.iter().product::<f64>() * 1000.0, ..Self::default() };
        for (c, mass) in saved.stocks {
            if field.get(c).is_some() || !mass.is_finite() || mass < 0.0 { return Err("invalid saved water stock".into()); }
            if !view.contains(c) { return Err("saved water cell outside world bounds".into()); }
            let shape = match view.shape(c)? {
                Some(shape) => shape,
                None if mass == 0.0 => Shape { kind: WaterCellKind::Void, capacity: 0.0, retained: 0.0, absorb: 0.0, seep: 0.0 },
                None => return Err("saved wet cell is physically closed".into()),
            };
            if mass > shape.capacity { return Err("saved water exceeds cell capacity".into()); }
            field.put(c, Stock { mass, shape });
        }
        for c in saved.active {
            if field.get(c).is_none() || field.queued.contains(&c) { return Err("invalid pending water cell".into()); }
            field.wake(c);
        }
        let facts = field.facts()?;
        if view.geometry.generated_groundwater {
            let mut original = 0.0;
            for (c, _) in field.entries() { original += view.original_stock(c)?; }
            if (original - field.initial).abs() > 1e-9 * original.max(1.0) { return Err("saved initial water differs from original geology".into()); }
        }
        if facts.residual_kg.abs() > 1e-9 * facts.initial_total_kg.max(1.0) { return Err("saved local water conservation mismatch".into()); }
        Ok(field)
    }
}

fn transfer(a: Cell, b: Cell, sa: Stock, sb: Stock, geometry: &TerrainWaterGeometry) -> (Cell, Cell, Stock, Stock, f64, f64) {
    let void_a = sa.shape.kind == WaterCellKind::Void;
    let void_b = sb.shape.kind == WaterCellKind::Void;
    let area = if a.y != b.y { geometry.spacing[0] * geometry.spacing[2] }
        else if a.x != b.x { geometry.spacing[1] * geometry.spacing[2] } else { geometry.spacing[0] * geometry.spacing[1] };
    if void_a && void_b {
        if a.y != b.y {
            let (from, to, s, d) = if a.y > b.y { (a, b, sa, sb) } else { (b, a, sb, sa) };
            return (from, to, s, d, geometry.fall * area * 1000.0, s.mass);
        }
        let (from, to, s, d) = if sa.mass >= sb.mass { (a, b, sa, sb) } else { (b, a, sb, sa) };
        return (from, to, s, d, geometry.spread * area * 1000.0, (s.mass - d.mass) * 0.5);
    }
    let (water_at, soil_at, water, soil) = if void_a { (a, b, sa, sb) } else { (b, a, sb, sa) };
    if water_at.y > soil_at.y {
        (water_at, soil_at, water, soil, soil.shape.absorb * area * 1000.0, water.mass)
    } else if soil_at.y > water_at.y {
        (soil_at, water_at, soil, water, soil.shape.seep * area * 1000.0, (soil.mass - soil.shape.retained).max(0.0))
    } else {
        let soil_head = ((soil.mass - soil.shape.retained) / soil.shape.capacity).max(0.0);
        let water_head = water.mass / water.shape.capacity;
        let demand = (soil_head - water_head).abs() / (1.0 / soil.shape.capacity + 1.0 / water.shape.capacity);
        if soil_head > water_head {
            (soil_at, water_at, soil, water, soil.shape.seep * area * 1000.0, demand)
        } else {
            (water_at, soil_at, water, soil, soil.shape.absorb * area * 1000.0, demand)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_stock_record_budget_blocks_only_the_new_excavation() {
        let mut world = super::super::TerrainWater::fresh(super::super::field_tests::geometry(), super::super::field_tests::terrain(), &[]).unwrap();
        for x in -32..32 { for z in -32..32 { for y in 30..32 {
            world.field.put(Cell { x, y, z }, Stock { mass: 0.0, shape: Shape { kind: WaterCellKind::Void,
                capacity: 540.0, retained: 0.0, absorb: 0.0, seep: 0.0 } });
        } } }
        assert_eq!(world.field.count, MAX_STOCKS);
        let target = world.terrain.surface_cells(&[(12, 10)]).unwrap()[0].unwrap().cell;
        let material = world.material(target).unwrap();
        assert!(matches!(world.prepare_excavation(target, material, 0).unwrap(),
            super::super::ExcavationResult::WaterBlocked(WaterRebindBlock::RecordCapacity { .. })));
        assert_eq!(world.material(target).unwrap(), material);
        assert_eq!(world.advance(0.25).unwrap().faces, 0);
        assert!(world.save_records().is_ok());
    }
}
