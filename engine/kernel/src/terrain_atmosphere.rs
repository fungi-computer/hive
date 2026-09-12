//! Sparse local smoke/heat gameplay. No carrier air, pressure or room graph.
use crate::generation::Cell;
use crate::terrain_water::{LocalAir, TerrainWater};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

const VERSION: u16 = 5;
const MAX_ACTIVE: usize = 4096;
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
struct Amount {
    smoke: f64,
    heat: f64,
    updated: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct SmokeState {
    clock: f64,
    stocks: BTreeMap<Cell, Amount>,
    queue: VecDeque<Cell>,
    smoke_emitted: f64,
    heat_emitted: f64,
    smoke_out: f64,
    heat_out: f64,
    smoke_deposited: f64,
    heat_deposited: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TerrainAtmosphereRecords {
    version: u16,
    config: TerrainAtmosphereConfig,
    state: SmokeState,
}
#[derive(Clone, Debug)]
struct Contact {
    physical: LocalAir,
    outdoor: bool,
}
pub struct TerrainAtmosphere {
    config: TerrainAtmosphereConfig,
    state: SmokeState,
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
    pub fn fresh(
        world: &mut TerrainWater,
        config: TerrainAtmosphereConfig,
    ) -> Result<Self, String> {
        validate_config(world, &config)?;
        Ok(Self {
            config,
            state: SmokeState::default(),
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
        let mut next = self.state.clone();
        next.clock += seconds;
        if !next.clock.is_finite() {
            return Err("smoke clock overflow".into());
        }
        for s in sources {
            add(&mut next, s.cell, s.smoke_kg, s.heat_j, self.state.clock)?;
            next.smoke_emitted += s.smoke_kg;
            next.heat_emitted += s.heat_j;
        }
        let count = if seconds > 0.0 {
            next.queue.len().min(WORK_PER_UPDATE)
        } else {
            0
        };
        let mut processed = 0;
        for _ in 0..count {
            let cell = next.queue.pop_front().ok_or("smoke queue mismatch")?;
            let amount = *next.stocks.get(&cell).ok_or("smoke stock missing")?;
            let dt = (next.clock - amount.updated).min(INTERVAL);
            if dt < INTERVAL {
                next.queue.push_back(cell);
                continue;
            }
            let contact = self.contact(world, cell)?;
            let mut remaining = amount;
            remaining.updated += dt;
            processed += 1;
            // Construction/water occupying a cell deposits its trace pollution
            // locally. This explicit gameplay sink cannot block physical work.
            if contact.physical.volume_m3 <= 0.0 {
                next.smoke_deposited += remaining.smoke;
                next.heat_deposited += remaining.heat;
                next.stocks.remove(&cell);
                continue;
            }
            if contact.outdoor {
                let fraction = (self.config.outdoor_loss_per_second * dt).min(1.0);
                let smoke = remaining.smoke * fraction;
                let heat = remaining.heat * fraction;
                remaining.smoke -= smoke;
                remaining.heat -= heat;
                next.smoke_out += smoke;
                next.heat_out += heat;
            }
            let targets: Vec<_> = contact
                .physical
                .neighbors
                .iter()
                .filter(|c| next.stocks.contains_key(c) || next.stocks.len() < MAX_ACTIVE)
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
                        || (!next.stocks.contains_key(&target) && next.stocks.len() >= MAX_ACTIVE)
                    {
                        continue;
                    }
                    let (s, h) = (smoke * share, heat * share);
                    add(&mut next, target, s, h, self.state.clock)?;
                    remaining.smoke -= s;
                    remaining.heat -= h;
                }
            }
            if remaining.smoke <= TRACE_SMOKE && remaining.heat <= TRACE_HEAT {
                next.smoke_deposited += remaining.smoke;
                next.heat_deposited += remaining.heat;
                next.stocks.remove(&cell);
            } else {
                next.stocks.insert(cell, remaining);
                next.queue.push_back(cell);
            }
        }
        validate_state(&next, &self.config)?;
        let receipt = SmokeReceipt {
            processed_cells: processed,
            pending_cells: next.queue.len(),
            active_cells: next.stocks.len(),
            source_smoke_kg: next.smoke_emitted - self.state.smoke_emitted,
            source_heat_j: next.heat_emitted - self.state.heat_emitted,
            escaped_smoke_kg: next.smoke_out - self.state.smoke_out,
            escaped_heat_j: next.heat_out - self.state.heat_out,
            deposited_smoke_kg: next.smoke_deposited - self.state.smoke_deposited,
            deposited_heat_j: next.heat_deposited - self.state.heat_deposited,
        };
        self.state = next;
        Ok(receipt)
    }
}
fn add(state: &mut SmokeState, cell: Cell, smoke: f64, heat: f64, time: f64) -> Result<(), String> {
    if smoke == 0.0 && heat == 0.0 {
        return Ok(());
    }
    if !state.stocks.contains_key(&cell) {
        if state.stocks.len() >= MAX_ACTIVE {
            return Err("active smoke budget reached".into());
        }
        state.stocks.insert(
            cell,
            Amount {
                updated: time,
                ..Amount::default()
            },
        );
        state.queue.push_back(cell);
    }
    let amount = state.stocks.get_mut(&cell).unwrap();
    amount.smoke += smoke;
    amount.heat += heat;
    Ok(())
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
fn validate_state(s: &SmokeState, c: &TerrainAtmosphereConfig) -> Result<(), String> {
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
