//! Sparse local smoke/heat gameplay. No carrier air, pressure or room graph.
use crate::generation::Cell;
use crate::terrain_water::{LocalAir, TerrainWater};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub(crate) const VERSION: u16 = 6;
pub(crate) const MAX_ACTIVE: usize = 4096;
const WORK_PER_UPDATE: usize = 256;
const INTERVAL: f64 = 0.25;
const TRACE_SMOKE: f64 = 1e-9;
const TRACE_HEAT: f64 = 0.01;
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ExteriorPolicy {
    Closed,
    WorldTop,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TerrainAtmosphereConfig {
    pub region_id: String,
    pub min: Cell,
    pub max: Cell,
    pub exterior: ExteriorPolicy,
    pub ambient_temperature_c: f64,
    pub spread_per_second: f64,
    pub rise_bias: f64,
    pub wind: [f64; 3],
    pub outdoor_loss_per_second: f64,
    pub heat_capacity_j_per_m3_k: f64,
}
impl TerrainAtmosphereConfig {
    fn contains(&self, c: Cell) -> bool {
        c.x >= self.min.x
            && c.x < self.max.x
            && c.y >= self.min.y
            && c.y < self.max.y
            && c.z >= self.min.z
            && c.z < self.max.z
    }
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub(crate) struct Amount {
    pub(crate) smoke: f64,
    pub(crate) heat: f64,
    pub(crate) updated: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub(crate) struct SmokeState {
    pub(crate) clock: f64,
    pub(crate) stocks: BTreeMap<Cell, Amount>,
    pub(crate) queue: VecDeque<Cell>,
    pub(crate) smoke_emitted: f64,
    pub(crate) heat_emitted: f64,
    pub(crate) smoke_out: f64,
    pub(crate) heat_out: f64,
    pub(crate) smoke_deposited: f64,
    pub(crate) heat_deposited: f64,
}
#[derive(Default)]
struct SmokeLedgerDelta {
    emitted_smoke: f64,
    emitted_heat: f64,
    escaped_smoke: f64,
    escaped_heat: f64,
    deposited_smoke: f64,
    deposited_heat: f64,
    stock_smoke: f64,
    stock_heat: f64,
}
struct PreparedSmokeAdvance {
    clock: f64,
    changes: BTreeMap<Cell, Option<Amount>>,
    base_queue_consumed: usize,
    appended: VecDeque<Cell>,
    active: usize,
    ledger: SmokeLedgerDelta,
}
impl PreparedSmokeAdvance {
    fn new(state: &SmokeState, clock: f64) -> Self {
        Self {
            clock,
            changes: BTreeMap::new(),
            base_queue_consumed: 0,
            appended: VecDeque::new(),
            active: state.stocks.len(),
            ledger: SmokeLedgerDelta::default(),
        }
    }
    fn amount(&self, state: &SmokeState, cell: Cell) -> Option<Amount> {
        self.changes.get(&cell).copied().unwrap_or_else(|| state.stocks.get(&cell).copied())
    }
    fn put(&mut self, state: &SmokeState, cell: Cell, amount: Amount) {
        let before = self.amount(state, cell);
        if before.is_none() {
            self.active += 1;
        }
        self.ledger.stock_smoke += amount.smoke - before.map_or(0.0, |value| value.smoke);
        self.ledger.stock_heat += amount.heat - before.map_or(0.0, |value| value.heat);
        self.changes.insert(cell, Some(amount));
    }
    fn remove(&mut self, state: &SmokeState, cell: Cell) {
        if let Some(before) = self.amount(state, cell) {
            self.active -= 1;
            self.ledger.stock_smoke -= before.smoke;
            self.ledger.stock_heat -= before.heat;
            self.changes.insert(cell, None);
        }
    }
    fn add(
        &mut self,
        state: &SmokeState,
        cell: Cell,
        smoke: f64,
        heat: f64,
        time: f64,
    ) -> Result<(), String> {
        if smoke == 0.0 && heat == 0.0 {
            return Ok(());
        }
        let existing = self.amount(state, cell);
        if existing.is_none() {
            if self.active >= MAX_ACTIVE {
                return Err("active smoke budget reached".into());
            }
            self.appended.push_back(cell);
        }
        let mut amount = existing.unwrap_or(Amount {
            smoke: 0.0,
            heat: 0.0,
            updated: time,
        });
        amount.smoke += smoke;
        amount.heat += heat;
        self.put(state, cell, amount);
        Ok(())
    }
    fn pop_work(&mut self, state: &SmokeState) -> Option<Cell> {
        if let Some(cell) = state.queue.get(self.base_queue_consumed).copied() {
            self.base_queue_consumed += 1;
            Some(cell)
        } else {
            self.appended.pop_front()
        }
    }
    fn validate(&self, state: &SmokeState, config: &TerrainAtmosphereConfig) -> Result<(), String> {
        if !self.clock.is_finite() || self.clock < state.clock || self.active > MAX_ACTIVE {
            return Err("invalid prepared smoke state".into());
        }
        for (cell, amount) in &self.changes {
            if !config.contains(*cell) {
                return Err("invalid prepared smoke cell".into());
            }
            if let Some(amount) = amount {
                if ![amount.smoke, amount.heat, amount.updated].iter().all(|v| v.is_finite() && *v >= 0.0)
                    || amount.updated > self.clock
                {
                    return Err("invalid prepared smoke amount".into());
                }
            }
        }
        let ledger = &self.ledger;
        if ![ledger.emitted_smoke, ledger.emitted_heat, ledger.escaped_smoke, ledger.escaped_heat,
            ledger.deposited_smoke, ledger.deposited_heat, ledger.stock_smoke, ledger.stock_heat]
            .iter().all(|value| value.is_finite())
        {
            return Err("invalid prepared smoke ledger".into());
        }
        if (ledger.stock_smoke + ledger.escaped_smoke + ledger.deposited_smoke - ledger.emitted_smoke).abs() > 1e-10
            || (ledger.stock_heat + ledger.escaped_heat + ledger.deposited_heat - ledger.emitted_heat).abs() > 1e-8 {
            return Err("prepared smoke amount conservation".into());
        }
        Ok(())
    }
    fn publish(self, state: &mut SmokeState) {
        state.clock = self.clock;
        for (cell, amount) in self.changes {
            if let Some(amount) = amount {
                state.stocks.insert(cell, amount);
            } else {
                state.stocks.remove(&cell);
            }
        }
        for _ in 0..self.base_queue_consumed {
            state.queue.pop_front().expect("prepared queue consumption");
        }
        state.queue.extend(self.appended);
        state.smoke_emitted += self.ledger.emitted_smoke;
        state.heat_emitted += self.ledger.emitted_heat;
        state.smoke_out += self.ledger.escaped_smoke;
        state.heat_out += self.ledger.escaped_heat;
        state.smoke_deposited += self.ledger.deposited_smoke;
        state.heat_deposited += self.ledger.deposited_heat;
        debug_assert_eq!(state.stocks.len(), state.queue.len());
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TerrainAtmosphereRecords {
    pub(crate) version: u16,
    pub(crate) config: TerrainAtmosphereConfig,
    pub(crate) state: SmokeState,
}
#[derive(Clone, Debug)]
struct Contact {
    physical: LocalAir,
    outdoor: bool,
}
pub struct TerrainAtmosphere {
    config: TerrainAtmosphereConfig,
    state: SmokeState,
    records: crate::air_records::AirRecordCache,
    contacts: BTreeMap<Cell, Contact>,
    geometry_revision: u64,
}
pub(crate) struct SmokeSource {
    pub cell: Cell,
    pub smoke_kg: f64,
    pub heat_j: f64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmokeReceipt {
    pub processed_cells: usize,
    pub pending_cells: usize,
    pub active_cells: usize,
    pub source_smoke_kg: f64,
    pub source_heat_j: f64,
    pub escaped_smoke_kg: f64,
    pub escaped_heat_j: f64,
    pub deposited_smoke_kg: f64,
    pub deposited_heat_j: f64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmokeSample {
    volume_id: String,
    temperature_c: f64,
    smoke_kg_m3: f64,
}
impl TerrainAtmosphere {
    #[cfg(test)]
    pub(crate) fn seed_benchmark_cells(&mut self, cells: &[Cell]) {
        self.state = SmokeState::default();
        for (index, &cell) in cells.iter().enumerate() {
            let amount = Amount {
                smoke: 0.001,
                heat: 1.0,
                updated: 0.0,
            };
            self.state.stocks.insert(cell, amount);
            self.state.queue.push_back(cell);
            self.state.smoke_emitted += amount.smoke;
            self.state.heat_emitted += amount.heat;
            assert_eq!(self.state.stocks.len(), index + 1);
        }
        validate_state(&self.state, &self.config).unwrap();
        self.records = crate::air_records::AirRecordCache::from_state(&self.config, &self.state).unwrap();
    }
    #[cfg(test)]
    pub(crate) fn benchmark_copy_validate(&self, repetitions: usize) -> std::time::Duration {
        let started = std::time::Instant::now();
        for _ in 0..repetitions {
            let next = self.state.clone();
            validate_state(&next, &self.config).unwrap();
            std::hint::black_box(next);
        }
        started.elapsed()
    }
    pub fn fresh(
        world: &mut TerrainWater,
        config: TerrainAtmosphereConfig,
    ) -> Result<Self, String> {
        validate_config(world, &config)?;
        let state = SmokeState::default();
        let records = crate::air_records::AirRecordCache::from_state(&config, &state)?;
        Ok(Self {
            config,
            state,
            records,
            contacts: BTreeMap::new(),
            geometry_revision: world.terrain_revision(),
        })
    }
    #[cfg(test)]
    pub(crate) fn emitted(&self) -> (f64, f64) {
        (self.state.smoke_emitted, self.state.heat_emitted)
    }
    pub fn config(&self) -> &TerrainAtmosphereConfig {
        &self.config
    }
    pub fn geometry_revision(&self) -> u64 {
        self.geometry_revision
    }
    fn contact(&mut self, world: &mut TerrainWater, cell: Cell) -> Result<Contact, String> {
        if let Some(contact) = self.contacts.get(&cell) {
            return Ok(contact.clone());
        }
        let mut physical = world.local_air(cell)?;
        physical.neighbors.retain(|c| self.config.contains(*c));
        let outdoor = physical.volume_m3 > 0.0
            && self.config.exterior == ExteriorPolicy::WorldTop
            && world.smoke_outdoors(cell, self.config.max.y)?;
        let contact = Contact { physical, outdoor };
        // Disposable cache only; evicting does not drop pending gas or time.
        if self.contacts.len() >= MAX_ACTIVE * 2 {
            self.contacts.clear();
        }
        self.contacts.insert(cell, contact.clone());
        Ok(contact)
    }
    pub(crate) fn can_emit(
        &mut self,
        world: &mut TerrainWater,
        cell: Cell,
    ) -> Result<bool, String> {
        Ok(self.config.contains(cell) && self.contact(world, cell)?.physical.volume_m3 > 0.0)
    }
    /// Physical publication never waits for gas pressure. Rebuild only affected
    /// contacts lazily; a roof can change outdoor status below it in its column.
    pub(crate) fn invalidate(&mut self, cells: &[Cell], revision: u64) {
        if cells.is_empty() {
            return;
        }
        let columns: BTreeSet<_> = cells.iter().map(|c| (c.x, c.z)).collect();
        self.contacts.retain(|c, _| {
            ![(0_i64, 0_i64), (1, 0), (-1, 0), (0, 1), (0, -1)]
                .into_iter()
                .any(|(dx, dz)| {
                    c.x.checked_add(dx)
                        .zip(c.z.checked_add(dz))
                        .is_some_and(|column| columns.contains(&column))
                })
        });
        self.geometry_revision = revision;
    }
    pub(crate) fn sample(
        &mut self,
        world: &mut TerrainWater,
        cells: &[Cell],
    ) -> Result<Vec<Option<SmokeSample>>, String> {
        if cells.len() > 64 {
            return Err("smoke observation budget".into());
        }
        let mut result = Vec::with_capacity(cells.len());
        for &cell in cells {
            if !self.config.contains(cell) {
                result.push(None);
                continue;
            }
            let contact = self.contact(world, cell)?;
            if contact.physical.volume_m3 <= 0.0 {
                result.push(None);
                continue;
            }
            let amount = self.state.stocks.get(&cell).copied().unwrap_or_default();
            let temperature_c = self.config.ambient_temperature_c
                + amount.heat / (contact.physical.volume_m3 * self.config.heat_capacity_j_per_m3_k);
            let smoke_kg_m3 = amount.smoke / contact.physical.volume_m3;
            if !temperature_c.is_finite() || !smoke_kg_m3.is_finite() {
                return Err("unrepresentable smoke observation".into());
            }
            result.push(Some(SmokeSample {
                volume_id: format!("cell:{},{},{}", cell.x, cell.y, cell.z),
                temperature_c,
                smoke_kg_m3,
            }));
        }
        Ok(result)
    }
    pub fn save(&self) -> Result<TerrainAtmosphereRecords, String> {
        validate_state(&self.state, &self.config)?;
        Ok(TerrainAtmosphereRecords {
            version: VERSION,
            config: self.config.clone(),
            state: self.state.clone(),
        })
    }
    pub fn restore(
        world: &mut TerrainWater,
        records: &TerrainAtmosphereRecords,
    ) -> Result<Self, String> {
        if records.version != VERSION {
            return Err("unsupported local smoke records".into());
        }
        let mut air = Self::fresh(world, records.config.clone())?;
        validate_state(&records.state, &air.config)?;
        air.state = records.state.clone();
        air.records = crate::air_records::AirRecordCache::from_state(&air.config, &air.state)?;
        Ok(air)
    }
    /// Sources and bounded spreading publish together; rejected admission leaves
    /// paid fuel progress and all smoke amounts unchanged.
    pub(crate) fn advance(
        &mut self,
        world: &mut TerrainWater,
        seconds: f64,
        sources: &[SmokeSource],
    ) -> Result<SmokeReceipt, String> {
        if !seconds.is_finite() || !(0.0..=6.0).contains(&seconds) || sources.len() > 64 {
            return Err("invalid smoke interval or sources".into());
        }
        if seconds == 0.0 && !sources.is_empty() {
            return Err("paused smoke cannot emit".into());
        }
        for s in sources {
            if !s.smoke_kg.is_finite()
                || s.smoke_kg < 0.0
                || !s.heat_j.is_finite()
                || s.heat_j < 0.0
                || !self.can_emit(world, s.cell)?
            {
                return Err("invalid smoke source".into());
            }
        }
        let next_clock = self.state.clock + seconds;
        if !next_clock.is_finite() {
            return Err("smoke clock overflow".into());
        }
        let mut prepared = PreparedSmokeAdvance::new(&self.state, next_clock);
        for s in sources {
            prepared.add(&self.state, s.cell, s.smoke_kg, s.heat_j, self.state.clock)?;
            prepared.ledger.emitted_smoke += s.smoke_kg;
            prepared.ledger.emitted_heat += s.heat_j;
        }
        let count = if seconds > 0.0 {
            (self.state.queue.len() + prepared.appended.len()).min(WORK_PER_UPDATE)
        } else {
            0
        };
        let mut processed = 0;
        for _ in 0..count {
            let cell = prepared.pop_work(&self.state).ok_or("smoke queue mismatch")?;
            let amount = prepared.amount(&self.state, cell).ok_or("smoke stock missing")?;
            let dt = (prepared.clock - amount.updated).min(INTERVAL);
            if dt < INTERVAL {
                prepared.appended.push_back(cell);
                continue;
            }
            let contact = self.contact(world, cell)?;
            let mut remaining = amount;
            remaining.updated += dt;
            processed += 1;
            // Construction/water occupying a cell deposits its trace pollution
            // locally. This explicit gameplay sink cannot block physical work.
            if contact.physical.volume_m3 <= 0.0 {
                prepared.ledger.deposited_smoke += remaining.smoke;
                prepared.ledger.deposited_heat += remaining.heat;
                prepared.remove(&self.state, cell);
                continue;
            }
            if contact.outdoor {
                let fraction = (self.config.outdoor_loss_per_second * dt).min(1.0);
                let smoke = remaining.smoke * fraction;
                let heat = remaining.heat * fraction;
                remaining.smoke -= smoke;
                remaining.heat -= heat;
                prepared.ledger.escaped_smoke += smoke;
                prepared.ledger.escaped_heat += heat;
            }
            let targets: Vec<_> = contact
                .physical
                .neighbors
                .iter()
                .filter(|c| prepared.amount(&self.state, **c).is_some() || prepared.active < MAX_ACTIVE)
                .map(|&c| {
                    let direction = [
                        (c.x - cell.x) as f64,
                        f64::from(c.y - cell.y),
                        (c.z - cell.z) as f64,
                    ];
                    let wind = direction
                        .iter()
                        .zip(self.config.wind)
                        .map(|(a, b)| a * b)
                        .sum::<f64>();
                    let weight = (1.0
                        + wind
                        + if c.y > cell.y {
                            self.config.rise_bias
                        } else {
                            0.0
                        })
                    .max(0.0);
                    (c, weight)
                })
                .collect();
            let weights: f64 = targets.iter().map(|(_, w)| w).sum();
            let fraction = (self.config.spread_per_second * dt).min(0.5);
            if weights > 0.0 {
                let (smoke, heat) = (remaining.smoke * fraction, remaining.heat * fraction);
                for (target, weight) in targets {
                    let share = weight / weights;
                    if share == 0.0
                        || (prepared.amount(&self.state, target).is_none() && prepared.active >= MAX_ACTIVE)
                    {
                        continue;
                    }
                    let (s, h) = (smoke * share, heat * share);
                    prepared.add(&self.state, target, s, h, self.state.clock)?;
                    remaining.smoke -= s;
                    remaining.heat -= h;
                }
            }
            if remaining.smoke <= TRACE_SMOKE && remaining.heat <= TRACE_HEAT {
                prepared.ledger.deposited_smoke += remaining.smoke;
                prepared.ledger.deposited_heat += remaining.heat;
                prepared.remove(&self.state, cell);
            } else {
                prepared.put(&self.state, cell, remaining);
                prepared.appended.push_back(cell);
            }
        }
        prepared.validate(&self.state, &self.config)?;
        let receipt = SmokeReceipt {
            processed_cells: processed,
            pending_cells: self.state.queue.len() - prepared.base_queue_consumed + prepared.appended.len(),
            active_cells: prepared.active,
            source_smoke_kg: prepared.ledger.emitted_smoke,
            source_heat_j: prepared.ledger.emitted_heat,
            escaped_smoke_kg: prepared.ledger.escaped_smoke,
            escaped_heat_j: prepared.ledger.escaped_heat,
            deposited_smoke_kg: prepared.ledger.deposited_smoke,
            deposited_heat_j: prepared.ledger.deposited_heat,
        };
        let changed_cells: Vec<_> = prepared.changes.keys().copied().collect();
        let appended: Vec<_> = prepared.appended.iter().copied().collect();
        let old_tail = self.state.queue.back().copied();
        prepared.publish(&mut self.state);
        self.records.publish(&self.config, &self.state, &changed_cells, &appended, old_tail)?;
        Ok(receipt)
    }

    pub(crate) fn record_delta(&self) -> (BTreeMap<String, Vec<u8>>, Vec<String>) { self.records.delta() }
    pub(crate) fn record_token(&self) -> u64 { self.records.token() }
    pub(crate) fn acknowledge_records(&mut self, token: u64) { self.records.acknowledge(token); }
}
fn validate_config(world: &TerrainWater, c: &TerrainAtmosphereConfig) -> Result<(), String> {
    let b = world.bounds();
    if c.region_id.is_empty()
        || c.region_id.len() > 128
        || c.min.x >= c.max.x
        || c.min.y >= c.max.y
        || c.min.z >= c.max.z
        || c.min.x < b.min_x
        || c.max.x > b.max_x
        || c.min.y < b.min_y
        || c.max.y > b.max_y
        || c.min.z < b.min_z
        || c.max.z > b.max_z
        || (c.exterior == ExteriorPolicy::WorldTop && c.max.y != b.max_y)
    {
        return Err("invalid smoke bounds".into());
    }
    if !c.ambient_temperature_c.is_finite()
        || !c.heat_capacity_j_per_m3_k.is_finite()
        || c.heat_capacity_j_per_m3_k <= 0.0
        || ![c.spread_per_second, c.rise_bias, c.outdoor_loss_per_second]
            .iter()
            .all(|v| v.is_finite() && *v >= 0.0 && *v <= 100.0)
        || !c.wind.iter().all(|v| v.is_finite() && v.abs() <= 100.0)
    {
        return Err("invalid local smoke model".into());
    }
    Ok(())
}
pub(crate) fn validate_state(s: &SmokeState, c: &TerrainAtmosphereConfig) -> Result<(), String> {
    if !s.clock.is_finite()
        || s.clock < 0.0
        || s.stocks.len() > MAX_ACTIVE
        || s.queue.len() != s.stocks.len()
        || s.queue.iter().copied().collect::<BTreeSet<_>>() != s.stocks.keys().copied().collect()
    {
        return Err("invalid smoke queue".into());
    }
    if ![
        s.smoke_emitted,
        s.heat_emitted,
        s.smoke_out,
        s.heat_out,
        s.smoke_deposited,
        s.heat_deposited,
    ]
    .iter()
    .all(|v| v.is_finite() && *v >= 0.0)
    {
        return Err("invalid smoke ledger".into());
    }
    let (mut smoke, mut heat) = (0.0, 0.0);
    for (cell, a) in &s.stocks {
        if !c.contains(*cell)
            || ![a.smoke, a.heat, a.updated]
                .iter()
                .all(|v| v.is_finite() && *v >= 0.0)
            || a.updated > s.clock
        {
            return Err("invalid smoke amount".into());
        }
        smoke += a.smoke;
        heat += a.heat;
    }
    if (smoke + s.smoke_out + s.smoke_deposited - s.smoke_emitted).abs()
        > 1e-8 * s.smoke_emitted.max(1.0)
        || (heat + s.heat_out + s.heat_deposited - s.heat_emitted).abs()
            > 1e-8 * s.heat_emitted.max(1.0)
    {
        return Err("smoke amount conservation".into());
    }
    Ok(())
}
