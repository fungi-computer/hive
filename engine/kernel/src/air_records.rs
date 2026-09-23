//! Stable atmosphere records. The live owner keeps a work deque; persistence
//! stores its successor relation with each stock in a bounded spatial page. Rotating the front therefore
//! changes boundary links, never the identities of untouched queued cells.
use crate::generation::Cell;
use crate::terrain_atmosphere::{Amount, SmokeState, TerrainAtmosphereConfig,
    TerrainAtmosphereRecords, MAX_ACTIVE, VERSION, validate_state};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::collections::{BTreeMap, VecDeque};

pub(crate) const PREFIX: &str = "kernel/atmosphere/";
pub(crate) const SAVED_AIR_VERSION: u16 = 2;
const HEADER: &str = "kernel/atmosphere/header";
pub(crate) const EMISSIONS: &str = "kernel/atmosphere/emissions";
const TILE_PREFIX: &str = "kernel/atmosphere/tiles/";
const TILE_SIDE: i64 = 4;
const TILE_CELLS: usize = 64;
const MAX_BYTES: usize = 2 * 1024 * 1024 + 64 * 1024;
pub(crate) type Records = BTreeMap<String, Vec<u8>>;

/// Rebuildable encoding cache owned beside the canonical smoke mutation. The
/// persisted stock map and queue remain the only authority; this cache keeps
/// page bytes and an acknowledgement journal so changed capture never walks
/// the whole atmosphere.
#[derive(Default)]
pub(crate) struct AirRecordCache {
    records: Records,
    generation: u64,
    changed: BTreeMap<String, (u64, Option<Vec<u8>>)>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct PaidEmission {
    pub catalog: String,
    pub cell: Cell,
    pub elapsed_s: f64,
    pub admitted_revision: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SavedAir {
    pub version: u16,
    pub atmosphere: TerrainAtmosphereRecords,
    pub emissions: BTreeMap<String, PaidEmission>,
}

impl AirRecordCache {
    pub(crate) fn from_state(config: &TerrainAtmosphereConfig, state: &SmokeState) -> Result<Self, String> {
        let records = encode_pages(config, state)?;
        Ok(Self { records, generation: 0, changed: BTreeMap::new() })
    }

    pub(crate) fn token(&self) -> u64 { self.generation }

    pub(crate) fn acknowledge(&mut self, token: u64) {
        self.changed.retain(|_, (generation, _)| *generation > token);
    }

    pub(crate) fn delta(&self) -> (Records, Vec<String>) {
        let mut puts = Records::new();
        let mut removes = Vec::new();
        for (key, (_, value)) in &self.changed {
            if let Some(value) = value { puts.insert(key.clone(), value.clone()); }
            else { removes.push(key.clone()); }
        }
        (puts, removes)
    }

    pub(crate) fn publish(&mut self, config: &TerrainAtmosphereConfig, state: &SmokeState,
        changed_cells: &[Cell], appended: &[Cell], old_tail: Option<Cell>) -> Result<(), String> {
        let mut changes_by_tile: BTreeMap<Cell, Vec<Cell>> = BTreeMap::new();
        for cell in changed_cells { changes_by_tile.entry(tile(*cell)).or_default().push(*cell); }
        let mut appended_by_tile: BTreeMap<Cell, Vec<Cell>> = BTreeMap::new();
        for cell in appended { appended_by_tile.entry(tile(*cell)).or_default().push(*cell); }
        let appended_next: BTreeMap<Cell, Option<Cell>> = appended.iter().enumerate()
            .map(|(index, cell)| (*cell, appended.get(index + 1).copied())).collect();
        let mut dirty_tiles: std::collections::BTreeSet<Cell> = changes_by_tile.keys().copied().collect();
        dirty_tiles.extend(appended_by_tile.keys().copied());
        if !appended.is_empty() {
            if let Some(tail) = old_tail.filter(|cell| state.stocks.contains_key(cell) && !appended.contains(cell)) {
                dirty_tiles.insert(tile(tail));
            }
        }

        for identity in dirty_tiles {
            let key = tile_key(identity);
            let mut page: BTreeMap<Cell, Stock> = self.records.get(&key)
                .map(|bytes| read::<Vec<(Cell, Stock)>>(bytes).map(|rows| rows.into_iter().collect()))
                .transpose()?.unwrap_or_default();
            if let Some(cells) = changes_by_tile.get(&identity) {
                for cell in cells {
                    if let Some(amount) = state.stocks.get(cell).copied() {
                        page.entry(*cell).and_modify(|stock| stock.amount = amount)
                            .or_insert(Stock { amount, next: None });
                    } else { page.remove(cell); }
                }
            }
            if let Some(cells) = appended_by_tile.get(&identity) {
                for cell in cells {
                    if let Some(stock) = page.get_mut(cell) {
                        stock.next = appended_next.get(cell).copied().flatten();
                    }
                }
            }
            if !appended.is_empty() {
                if let Some(tail) = old_tail.filter(|cell| state.stocks.contains_key(cell) && !appended_next.contains_key(cell)) {
                    if tile(tail) == identity {
                        page.get_mut(&tail).ok_or("air queue tail record missing")?.next = appended.first().copied();
                    }
                }
            }
            let value = if page.is_empty() { None } else { Some(write(&page.into_iter().collect::<Vec<_>>())?) };
            self.replace(key, value)?;
        }

        let ledger = SmokeState {
            clock: state.clock,
            stocks: BTreeMap::new(),
            queue: VecDeque::new(),
            smoke_emitted: state.smoke_emitted,
            heat_emitted: state.heat_emitted,
            smoke_out: state.smoke_out,
            heat_out: state.heat_out,
            smoke_deposited: state.smoke_deposited,
            heat_deposited: state.heat_deposited,
        };
        let header = write(&Header { version: VERSION, config: config.clone(), ledger,
            count: state.stocks.len(), first: state.queue.front().copied() })?;
        self.replace(HEADER.into(), Some(header))?;
        Ok(())
    }

    fn replace(&mut self, key: String, value: Option<Vec<u8>>) -> Result<(), String> {
        if matches!((self.records.get(&key), value.as_ref()), (None, None))
            || matches!((self.records.get(&key), value.as_ref()), (Some(current), Some(next)) if current == next) {
            return Ok(());
        }
        self.generation = self.generation.checked_add(1).ok_or("air record generation exhausted")?;
        if let Some(value) = &value { self.records.insert(key.clone(), value.clone()); }
        else { self.records.remove(&key); }
        self.changed.insert(key, (self.generation, value));
        Ok(())
    }
}

#[derive(Serialize, Deserialize)]
struct Header {
    version: u16,
    config: TerrainAtmosphereConfig,
    // Stocks and queue must be empty here. These small scalar facts remain one
    // atomic ledger; the complete cell records own all physical amounts/order.
    ledger: SmokeState,
    count: usize,
    first: Option<Cell>,
}

#[derive(Serialize, Deserialize)]
struct Stock {
    amount: Amount,
    next: Option<Cell>,
}

fn tile(cell: Cell) -> Cell {
    Cell { x: cell.x.div_euclid(TILE_SIDE), y: cell.y.div_euclid(TILE_SIDE as i32), z: cell.z.div_euclid(TILE_SIDE) }
}

fn tile_key(cell: Cell) -> String {
    format!("{TILE_PREFIX}{},{},{}", cell.x, cell.y, cell.z)
}

fn parse_tile(key: &str) -> Result<Cell, String> {
    let mut parts = key.strip_prefix(TILE_PREFIX).ok_or("invalid atmosphere cell key")?.split(',');
    let cell = Cell {
        x: parts.next().and_then(|v| v.parse().ok()).ok_or("invalid atmosphere x")?,
        y: parts.next().and_then(|v| v.parse().ok()).ok_or("invalid atmosphere y")?,
        z: parts.next().and_then(|v| v.parse().ok()).ok_or("invalid atmosphere z")?,
    };
    if parts.next().is_some() || tile_key(cell) != key {
        return Err("noncanonical atmosphere cell key".into());
    }
    Ok(cell)
}

pub(crate) fn validate_key(key: &str) -> Result<(), String> {
    if key == HEADER || key == EMISSIONS { return Ok(()); }
    parse_tile(key).map(|_| ())
}

fn read<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, String> {
    if bytes.len() > MAX_BYTES { return Err("air records exceed bound".into()); }
    let (value, rest) = postcard::take_from_bytes(bytes).map_err(|_| "invalid air record")?;
    if !rest.is_empty() { return Err("trailing air record bytes".into()); }
    Ok(value)
}

fn write<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    postcard::to_allocvec(value).map_err(|_| "air record encoding failed".into())
}

fn encode_pages(config: &TerrainAtmosphereConfig, state: &SmokeState) -> Result<Records, String> {
    validate_state(state, config)?;
    let mut ledger = state.clone();
    let stocks = std::mem::take(&mut ledger.stocks);
    let queue = std::mem::take(&mut ledger.queue);
    let mut records = Records::new();
    records.insert(HEADER.into(), write(&Header { version: VERSION, config: config.clone(), ledger,
        count: stocks.len(), first: queue.front().copied() })?);
    let mut pages: BTreeMap<Cell, BTreeMap<Cell, Stock>> = BTreeMap::new();
    for (index, cell) in queue.iter().copied().enumerate() {
        pages.entry(tile(cell)).or_default().insert(cell, Stock {
            amount: stocks[&cell], next: queue.get(index + 1).copied(),
        });
    }
    for (tile, page) in pages {
        records.insert(tile_key(tile), write(&page.into_iter().collect::<Vec<_>>())?);
    }
    Ok(records)
}

pub(crate) fn encode(bytes: &[u8]) -> Result<Records, String> {
    let saved: SavedAir = read(bytes)?;
    if saved.version != SAVED_AIR_VERSION || saved.atmosphere.version != VERSION
        || saved.emissions.len() > 64 {
        return Err("invalid air record binding".into());
    }
    let TerrainAtmosphereRecords { config, state, .. } = saved.atmosphere;
    let mut records = encode_pages(&config, &state)?;
    records.insert(EMISSIONS.into(), write(&saved.emissions)?);
    Ok(records)
}

pub(crate) fn decode(records: &Records) -> Result<Option<Vec<u8>>, String> {
    let records: Records = records.iter().filter(|(key, _)| key.starts_with(PREFIX))
        .map(|(key, value)| (key.clone(), value.clone())).collect();
    if records.is_empty() { return Ok(None); }
    if records.len() > MAX_ACTIVE + 2 || records.values().map(Vec::len).sum::<usize>() > MAX_BYTES {
        return Err("air records exceed bound".into());
    }
    for key in records.keys() { validate_key(key)?; }
    let mut header: Header = read(records.get(HEADER).ok_or("missing air header")?)?;
    if header.version != VERSION || header.count > MAX_ACTIVE
        || !header.ledger.stocks.is_empty() || !header.ledger.queue.is_empty() {
        return Err("invalid air header binding".into());
    }
    let emissions: BTreeMap<String, PaidEmission> =
        read(records.get(EMISSIONS).ok_or("missing air emissions")?)?;
    if emissions.len() > 64 { return Err("air emission count exceeds bound".into()); }
    let mut pending = BTreeMap::new();
    for (key, bytes) in records.iter().filter(|(key, _)| key.starts_with(TILE_PREFIX)) {
        let identity = parse_tile(key)?;
        let page: Vec<(Cell, Stock)> = read(bytes)?;
        if page.is_empty() || page.len() > TILE_CELLS {
            return Err("invalid air tile length".into());
        }
        for (cell, stock) in page {
            if tile(cell) != identity || pending.insert(cell, stock).is_some() {
                return Err("invalid air tile binding".into());
            }
        }
    }
    if pending.len() != header.count { return Err("air stock count mismatch".into()); }
    let mut next = header.first;
    let mut queue = VecDeque::with_capacity(header.count);
    while let Some(cell) = next {
        // Removing as we traverse rejects a cycle, duplicate custody, or a
        // missing successor without an unbounded traversal.
        let stock = pending.remove(&cell).ok_or("invalid air work chain")?;
        header.ledger.stocks.insert(cell, stock.amount);
        queue.push_back(cell);
        next = stock.next;
    }
    if !pending.is_empty() || queue.len() != header.count {
        return Err("incomplete air work chain".into());
    }
    header.ledger.queue = queue;
    validate_state(&header.ledger, &header.config)?;
    let bytes = write(&SavedAir {
        version: SAVED_AIR_VERSION,
        atmosphere: TerrainAtmosphereRecords {
            version: VERSION, config: header.config, state: header.ledger,
        },
        emissions,
    })?;
    if bytes.len() > MAX_BYTES { return Err("air records exceed bound".into()); }
    Ok(Some(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terrain_atmosphere::ExteriorPolicy;

    fn fixture() -> SavedAir {
        let mut state = SmokeState::default();
        for x in -16..16 {
            for z in -16..16 {
                let cell = Cell { x, y: 30, z };
                state.stocks.insert(cell, Amount { smoke: 0.125, heat: 1.0, updated: 0.0 });
                state.queue.push_back(cell);
            }
        }
        state.smoke_emitted = state.stocks.len() as f64 * 0.125;
        state.heat_emitted = state.stocks.len() as f64;
        SavedAir {
            version: SAVED_AIR_VERSION,
            atmosphere: TerrainAtmosphereRecords {
                version: VERSION,
                config: TerrainAtmosphereConfig {
                    region_id: "air-record-law".into(),
                    min: Cell { x: -32, y: 0, z: -32 },
                    max: Cell { x: 32, y: 40, z: 32 },
                    exterior: ExteriorPolicy::Closed,
                    ambient_temperature_c: 20.0, spread_per_second: 1.0,
                    rise_bias: 2.0, wind: [0.0; 3], outdoor_loss_per_second: 0.0,
                    heat_capacity_j_per_m3_k: 1200.0,
                },
                state,
            },
            emissions: BTreeMap::new(),
        }
    }

    #[test]
    fn queue_rotation_changes_only_boundary_tiles_and_preserves_exact_order() {
        let mut saved = fixture();
        let before_bytes = write(&saved).unwrap();
        let before = encode(&before_bytes).unwrap();
        let mut cache = AirRecordCache::from_state(&saved.atmosphere.config, &saved.atmosphere.state).unwrap();
        assert_eq!(before.len(), 66); // 1,024 stocks, 64 spatial pages + ledger/emissions.
        assert_eq!(decode(&before).unwrap().unwrap(), before_bytes);
        let old_tail = saved.atmosphere.state.queue.back().copied();
        let appended: Vec<_> = saved.atmosphere.state.queue.iter().take(256).copied().collect();
        saved.atmosphere.state.queue.rotate_left(256);
        cache.publish(&saved.atmosphere.config, &saved.atmosphere.state, &[], &appended, old_tail).unwrap();
        let bytes = write(&saved).unwrap();
        let after = encode(&bytes).unwrap();
        let (puts, removes) = cache.delta();
        let mut patched = before.clone();
        for key in removes { patched.remove(&key); }
        patched.extend(puts);
        assert_eq!(patched, after, "dirty air page delta exactly matches full checkpoint encoding");
        let token = cache.token();
        let next_tail = saved.atmosphere.state.queue.back().copied();
        let next_appended = vec![saved.atmosphere.state.queue.front().copied().unwrap()];
        saved.atmosphere.state.queue.rotate_left(1);
        cache.publish(&saved.atmosphere.config, &saved.atmosphere.state, &[], &next_appended, next_tail).unwrap();
        cache.acknowledge(token);
        let bytes = write(&saved).unwrap();
        let expected = encode(&bytes).unwrap();
        let (puts, removes) = cache.delta();
        let mut patched = after;
        for key in removes { patched.remove(&key); }
        patched.extend(puts);
        assert_eq!(patched, expected, "acknowledging an earlier capture retains later page progress");
        let token = cache.token();
        cache.acknowledge(token);
        assert!(cache.delta().0.is_empty() && cache.delta().1.is_empty(), "ack clears only captured cache changes");
        let changed: Vec<_> = expected.iter().filter(|(key, value)| before.get(*key) != Some(*value)).collect();
        assert_eq!(changed.len(), 3); // Head + old/new tail; no shifted page identities.
        assert!(changed.iter().map(|(_, value)| value.len()).sum::<usize>() < before_bytes.len() / 8);
        assert_eq!(decode(&expected).unwrap().unwrap(), bytes);
    }

    #[test]
    fn dirty_page_retirement_matches_full_air_checkpoint() {
        let mut saved = fixture();
        let retired = tile(saved.atmosphere.state.queue[0]);
        let removed: Vec<_> = saved.atmosphere.state.stocks.keys().copied()
            .filter(|cell| tile(*cell) == retired).collect();
        let mut ordered = removed.clone();
        ordered.extend(saved.atmosphere.state.queue.iter().copied().filter(|cell| tile(*cell) != retired));
        saved.atmosphere.state.queue = ordered.into();
        let mut cache = AirRecordCache::from_state(&saved.atmosphere.config, &saved.atmosphere.state).unwrap();
        let before = encode(&write(&saved).unwrap()).unwrap();
        saved.atmosphere.state.queue.drain(..removed.len());
        for cell in &removed {
            let amount = saved.atmosphere.state.stocks.remove(cell).unwrap();
            saved.atmosphere.state.smoke_out += amount.smoke;
            saved.atmosphere.state.heat_out += amount.heat;
        }
        saved.atmosphere.state.queue.retain(|cell| tile(*cell) != retired);
        let old_tail = saved.atmosphere.state.queue.back().copied();
        cache.publish(&saved.atmosphere.config, &saved.atmosphere.state, &removed, &[], old_tail).unwrap();
        let after = encode(&write(&saved).unwrap()).unwrap();
        let (puts, removes) = cache.delta();
        assert!(removes.contains(&tile_key(retired)), "empty page retirement is explicit");
        let mut patched = before;
        for key in removes { patched.remove(&key); }
        patched.extend(puts);
        assert_eq!(patched, after);
        assert_eq!(decode(&patched).unwrap().unwrap(), write(&saved).unwrap());
    }

    #[test]
    fn air_pages_reject_missing_or_misbound_stock_and_invalid_work_chains() {
        let source = encode(&write(&fixture()).unwrap()).unwrap();
        let key = source.keys().find(|key| key.starts_with(TILE_PREFIX)).unwrap().clone();
        let first = Cell { x: -16, y: 30, z: -16 };
        for corruption in 0..6 {
            let mut records = source.clone();
            let mut page: Vec<(Cell, Stock)> = read(&records[&key]).unwrap();
            match corruption {
                0 => { records.remove(&key); }
                1 => { page[0].1.next = Some(first); records.insert(key.clone(), write(&page).unwrap()); }
                2 => { page[0].1.next = None; records.insert(key.clone(), write(&page).unwrap()); }
                3 => { page[0].0.x += 100; records.insert(key.clone(), write(&page).unwrap()); }
                4 => { page[0].1.amount.smoke += 1.0; records.insert(key.clone(), write(&page).unwrap()); }
                _ => { records.get_mut(&key).unwrap().push(0); }
            }
            assert!(decode(&records).is_err(), "corruption {corruption}");
        }
        let mut duplicate = source.clone();
        let mut page: Vec<(Cell, Stock)> = read(&duplicate[&key]).unwrap();
        let copied = read::<Vec<(Cell, Stock)>>(&duplicate[&key]).unwrap().remove(0);
        page.push(copied);
        duplicate.insert(key, write(&page).unwrap());
        assert!(decode(&duplicate).is_err());
    }

    #[test]
    fn current_air_format_rejects_old_versions_and_noncanonical_keys() {
        let mut saved = fixture();
        saved.version -= 1;
        assert!(encode(&write(&saved).unwrap()).is_err());
        saved.version = SAVED_AIR_VERSION;
        saved.atmosphere.version -= 1;
        assert!(encode(&write(&saved).unwrap()).is_err());
        for key in ["kernel/atmosphere/0000", "kernel/atmosphere/tiles/00,1,2", "kernel/atmosphere/tiles/-0,1,2"] {
            assert!(validate_key(key).is_err());
        }
        assert!(decode(&Records::new()).unwrap().is_none());
    }

    #[test]
    fn incremental_capture_retires_empty_air_tiles_and_matches_checkpoint() {
        use crate::record_bundle::{RecordBundle, RecordCapture, RecordDelta};
        use crate::world::KernelRecords;
        fn bundle(air: &[u8]) -> RecordBundle {
            let entities = serde_json::json!({
                "format":"hive-kernel", "version":21,
                "scene":{"initial":[]}, "routes":[], "direct":[],
                "projectile_contacts":[], "party_bindings":[], "work_attempts":[],
                "jobs":[], "tasks":[],
                "planner":{"routeSearches":{"entries":{},"occurrence":null,"spent":0}}
            }).to_string();
            RecordBundle::from_records(KernelRecords {
                entities,
                environment: Some((String::new(), crate::terrain_water::TerrainWaterRecords {
                    header: vec![1], terrain: vec![2], water: vec![3], structures: vec![4],
                })),
                atmosphere: Some(air.to_vec()),
            }).unwrap()
        }
        let mut saved = fixture();
        let initial = bundle(&write(&saved).unwrap());
        let mut persisted: Records = initial.keys().into_iter()
            .map(|key| { let bytes = initial.read(&key).unwrap(); (key, bytes) }).collect();
        let mut cursor = RecordCapture::default();
        let (_, first) = cursor.capture(initial, Some(0), 0, 0.0).unwrap();
        let retired = tile(saved.atmosphere.state.queue[0]);
        let state = &mut saved.atmosphere.state;
        let cells: Vec<_> = state.stocks.keys().copied().filter(|cell| tile(*cell) == retired).collect();
        for cell in cells {
            let amount = state.stocks.remove(&cell).unwrap();
            state.smoke_out += amount.smoke;
            state.heat_out += amount.heat;
        }
        state.queue.retain(|cell| tile(*cell) != retired);
        state.clock = 0.25;
        let current = write(&saved).unwrap();
        let (changed, second) = cursor.capture_changed(RecordDelta {
            puts: bundle(&current), removes: Vec::new(), searches: Vec::new(),
            routes: Vec::new(), motion: BTreeMap::new(),
        }, first.sequence, 1, 0.25, 0).unwrap();
        assert!(!second.keys.contains(&tile_key(retired)));
        persisted.retain(|key, _| second.keys.contains(key));
        for key in changed.keys() { persisted.insert(key.clone(), changed.read(&key).unwrap()); }
        let mut recovered = RecordBundle::new();
        for (key, bytes) in persisted { recovered.insert(&key, &bytes).unwrap(); }
        assert_eq!(recovered.decode().unwrap().atmosphere.unwrap(), current);
        let (difference, _) = cursor.capture(bundle(&current), Some(second.sequence), 1, 0.25).unwrap();
        assert!(difference.keys().is_empty(), "incremental air removal equals full checkpoint");
    }
}
