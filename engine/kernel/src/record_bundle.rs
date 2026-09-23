//! Bounded opaque capture/restore records for the native Kernel boundary.

use crate::world::KernelRecords;
use postcard::take_from_bytes;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const RECORD_BYTES: usize = 256 * 1024;
pub const ENTITY_BYTES: usize = 8 * 1024 * 1024;
pub const TOTAL_BYTES: usize = 9 * 1024 * 1024;
pub const MAX_RECORDS: usize = 65_536;
pub const MAX_KEY_BYTES: usize = 160;
const HEADER_KEY: &str = "kernel/header";
const ENV_HEADER_KEY: &str = "kernel/environment/header";
const DEFINITION_KEY: &str = "kernel/environment/definition";
const TERRAIN_KEY: &str = "kernel/environment/terrain";
const WATER_KEY: &str = "kernel/environment/water";
const STRUCTURES_KEY: &str = "kernel/environment/structures";
const ENTITY_PREFIX: &str = "kernel/state/";
const ATMOSPHERE_PREFIX: &str = "kernel/atmosphere/";
const ATMOSPHERE_BYTES: usize = 2 * 1024 * 1024 + 64 * 1024;
const MAX_ATMOSPHERE_CHUNKS: usize = 9;

#[derive(Serialize, Deserialize)]
struct Header {
    version: u16,
    entity_counts: [u32; 9],
    environment: bool,
    atmosphere_bytes: Option<u64>,
}

pub struct RecordBundle {
    total_bytes: usize,
    records: BTreeMap<String, Vec<u8>>,
}

/// Disposable exact-byte baseline. The Region receipt still owns commitment;
/// dropping a failed resident drops this cursor with it.
#[derive(Default)]
pub(crate) struct RecordCapture {
    sequence: u32,
    baseline: Option<RecordBundle>,
    journal: Option<crate::world::JournalToken>,
}

#[derive(Serialize)]
pub(crate) struct CaptureManifest {
    pub sequence: u32,
    pub base: Option<u32>,
    pub revision: u64,
    pub time: f64,
    pub keys: Vec<String>,
}

impl RecordCapture {
    pub(crate) fn current(&self, since: Option<u32>) -> bool { since == Some(self.sequence) && self.baseline.is_some() }
    pub(crate) fn invalidate(&mut self) { self.baseline = None; self.journal = None; }
    pub(crate) fn remember(&mut self, token: crate::world::JournalToken) { self.journal = Some(token); }
    pub(crate) fn accept(&mut self, sequence: u32) -> Result<crate::world::JournalToken, String> {
        if sequence != self.sequence { return Err("stale record acknowledgement".into()); }
        self.journal.take().ok_or_else(|| "record capture is not awaiting acknowledgement".into())
    }
    pub(crate) fn capture_changed(&mut self, delta: RecordBundle, removes: Vec<String>, since: u32, revision: u64, time: f64, state_weight: usize) -> Result<(RecordBundle, CaptureManifest), String> {
        if !self.current(Some(since)) { return Err("record capture frontier mismatch".into()); }
        let sequence = self.sequence.checked_add(1).ok_or("record capture sequence exhausted")?;
        // Take the disposable baseline: a rejected patch forces a complete
        // resync, never leaves a partly patched baseline available for reuse.
        let mut baseline = self.baseline.take().unwrap();
        let old_header = baseline.read(HEADER_KEY)?;
        let mut changed = RecordBundle::new();
        for key in removes { baseline.remove(&key); }
        for (key, bytes) in delta.records {
            if key == HEADER_KEY {
                baseline.replace(&key, bytes)?;
            } else if baseline.records.get(&key) != Some(&bytes) {
                changed.insert(&key, &bytes)?;
                baseline.replace(&key, bytes)?;
            }
        }
        let (mut header, _): (Header, &[u8]) = take_from_bytes(baseline.records.get(HEADER_KEY).ok_or("missing record header")?).map_err(|_| "invalid record header")?;
        header.entity_counts = crate::stable_entity_records::counts_keys(baseline.records.keys());
        let entity_bytes: usize = baseline.records.iter().filter(|(key, _)| key.starts_with(ENTITY_PREFIX)).map(|(_, bytes)| bytes.len()).sum();
        let separators: usize = header.entity_counts[1..].iter().map(|count| count.saturating_sub(1) as usize).sum();
        if entity_bytes.saturating_add(separators) > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
        baseline.validate_canonical_capacity(state_weight)?;
        let header = postcard::to_allocvec(&header).map_err(|_| "record header encoding failed")?;
        if header != old_header { changed.insert(HEADER_KEY, &header)?; }
        baseline.replace(HEADER_KEY, header)?;
        let keys = baseline.keys();
        self.baseline = Some(baseline);
        self.sequence = sequence;
        Ok((changed, CaptureManifest { sequence, base: Some(since), revision, time, keys }))
    }
    pub fn restore(&mut self, baseline: RecordBundle, restore: impl FnOnce(&RecordBundle) -> Result<(), String>) -> Result<u32, String> {
        let sequence = self.sequence.checked_add(1).ok_or("record capture sequence exhausted")?;
        // Failure leaves both the physical world and its capture frontier intact.
        restore(&baseline)?;
        self.sequence = sequence;
        self.baseline = Some(baseline);
        self.journal = None;
        Ok(sequence)
    }
    pub fn capture(&mut self, next: RecordBundle, since: Option<u32>, revision: u64, time: f64)
        -> Result<(RecordBundle, CaptureManifest), String> {
        let keys = next.keys();
        // No cursor means a detached export. It cannot disturb a resident's
        // incremental baseline, even when a save is requested between steps.
        let Some(since) = since else {
            return Ok((next, CaptureManifest { sequence: 0, base: None, revision, time, keys }));
        };
        let sequence = self.sequence.checked_add(1).ok_or("record capture sequence exhausted")?;
        let baseline = self.baseline.as_ref().filter(|_| since == self.sequence);
        let records: BTreeMap<String, Vec<u8>> = next.records.iter().filter(|(key, bytes)|
            baseline.and_then(|prior| prior.records.get(*key)) != Some(*bytes))
            .map(|(key, bytes)| (key.clone(), bytes.clone())).collect();
        let manifest = CaptureManifest { sequence, base: baseline.map(|_| since), revision, time, keys };
        self.sequence = sequence;
        self.baseline = Some(next);
        let total_bytes = records.values().map(Vec::len).sum();
        Ok((RecordBundle { records, total_bytes }, manifest))
    }
}

impl RecordBundle {
    fn validate_canonical_capacity(&self, state_weight: usize) -> Result<(), String> {
        let mut arrays = [2usize; 5];
        let families = ["routes", "direct", "jobs", "tasks", "parties"];
        let mut counts = [0usize; 5];
        for (key, bytes) in &self.records {
            let Some(suffix) = key.strip_prefix(ENTITY_PREFIX) else { continue; };
            let Some((family, _)) = suffix.split_once('/') else { continue; };
            if let Some(index) = families.iter().position(|candidate| *candidate == family) { arrays[index] += bytes.len(); counts[index] += 1; }
        }
        for (array, count) in arrays.iter_mut().zip(counts) { *array += count.saturating_sub(1); }
        let root: serde_json::Value = serde_json::from_slice(self.records.get("kernel/state/root").ok_or("missing state root")?).map_err(|error| error.to_string())?;
        let planner_bytes = serde_json::to_vec(root.get("planner").ok_or("missing planner state")?).map_err(|error| error.to_string())?.len();
        // Same route/direct and (jobs,tasks,parties,planner) tuple accounting as
        // the full checkpoint oracle, using cached encoded row sizes.
        let owned = arrays.iter().sum::<usize>() + planner_bytes + 5;
        if state_weight.saturating_add(owned) > ENTITY_BYTES { return Err("job state exceeds canonical capacity".into()); }
        Ok(())
    }
    fn remove(&mut self, key: &str) {
        if let Some(bytes) = self.records.remove(key) { self.total_bytes -= bytes.len(); }
    }
    fn replace(&mut self, key: &str, bytes: Vec<u8>) -> Result<(), String> {
        self.remove(key);
        self.insert(key, &bytes)
    }
    pub fn new() -> Self {
        Self {
            records: BTreeMap::new(),
            total_bytes: 0,
        }
    }

    pub fn insert(&mut self, key: &str, bytes: &[u8]) -> Result<(), String> {
        validate_key(key)?;
        if bytes.len() > RECORD_BYTES {
            return Err("record exceeds 256KiB".into());
        }
        if self.records.contains_key(key) {
            return Err("duplicate record key".into());
        }
        if self.records.len() >= MAX_RECORDS {
            return Err("record count exceeds bound".into());
        }
        let next = self
            .total_bytes()
            .checked_add(bytes.len())
            .ok_or("record bytes overflow")?;
        if next > TOTAL_BYTES {
            return Err("record bytes exceed 9MiB".into());
        }
        self.records.insert(key.to_owned(), bytes.to_vec());
        self.total_bytes = next;
        Ok(())
    }

    pub fn keys(&self) -> Vec<String> {
        self.records.keys().cloned().collect()
    }
    pub fn read(&self, key: &str) -> Result<Vec<u8>, String> {
        self.records
            .get(key)
            .cloned()
            .ok_or_else(|| "record key not found".into())
    }
    fn total_bytes(&self) -> usize {
        self.total_bytes
    }

    pub fn from_records(records: KernelRecords) -> Result<Self, String> {
        let entity = crate::stable_entity_records::encode(&records.entities)?;
        let entity_counts = crate::stable_entity_records::counts(&entity);
        records
            .environment
            .as_ref()
            .map(|(definition, records)| {
                if definition.len() > 128 * 1024
                    || records.header.len() > 65_568
                    || records.terrain.len() > RECORD_BYTES
                    || records.water.len() > RECORD_BYTES
                    || records.structures.len() > RECORD_BYTES
                {
                    return Err("environment record exceeds bound".to_owned());
                }
                Ok(())
            })
            .transpose()?;
        let atmosphere = records.atmosphere;
        if atmosphere
            .as_ref()
            .is_some_and(|bytes| bytes.len() > ATMOSPHERE_BYTES)
        {
            return Err("atmosphere records exceed 2MiB+64KiB".into());
        }
        if atmosphere.is_some() && records.environment.is_none() {
            return Err("atmosphere records require environment".into());
        }
        let entity_chunks = entity.len();
        let atmosphere_chunks = atmosphere
            .as_ref()
            .map_or(0, |bytes| bytes.len().div_ceil(RECORD_BYTES).max(1));
        if atmosphere_chunks > MAX_ATMOSPHERE_CHUNKS {
            return Err("atmosphere chunk count exceeds bound".into());
        }
        let environment_records = usize::from(records.environment.is_some()) * 5;
        if entity_chunks + environment_records + atmosphere_chunks + 1 > MAX_RECORDS {
            return Err("record count exceeds bound".into());
        }
        let mut bundle = Self::new();
        for (key, bytes) in entity { bundle.insert(&key, &bytes)?; }
        let environment_present = records.environment.is_some();
        let header = postcard::to_allocvec(&Header {
            version: 4,
            entity_counts,
            environment: environment_present,
            atmosphere_bytes: atmosphere.as_ref().map(|bytes| bytes.len() as u64),
        })
        .map_err(|_| "record header encoding failed")?;
        if header.len() > 65_568 {
            return Err("record header exceeds bound".into());
        }
        bundle.insert(HEADER_KEY, &header)?;
        if let Some((definition, environment)) = records.environment {
            if environment.header.len() > 65_568 {
                return Err("environment header exceeds bound".into());
            }
            bundle.insert(DEFINITION_KEY, definition.as_bytes())?;
            bundle.insert(ENV_HEADER_KEY, &environment.header)?;
            bundle.insert(TERRAIN_KEY, &environment.terrain)?;
            bundle.insert(WATER_KEY, &environment.water)?;
            bundle.insert(STRUCTURES_KEY, &environment.structures)?;
        }
        if let Some(atmosphere) = atmosphere {
            insert_chunks(
                &mut bundle,
                ATMOSPHERE_PREFIX,
                &atmosphere,
                MAX_ATMOSPHERE_CHUNKS,
                ATMOSPHERE_BYTES,
            )?;
        }
        Ok(bundle)
    }

    pub fn decode(&self) -> Result<KernelRecords, String> {
        let header_bytes = self
            .records
            .get(HEADER_KEY)
            .ok_or("missing record header")?;
        if header_bytes.len() > 65_568 {
            return Err("record header exceeds bound".into());
        }
        let (header, remainder): (Header, &[u8]) =
            take_from_bytes(header_bytes).map_err(|_| "invalid record header")?;
        if !remainder.is_empty() || header.version != 4
        {
            return Err("invalid record header binding".into());
        }
        if self.records.len() > MAX_RECORDS {
            return Err("record count exceeds bound".into());
        }
        for key in self.records.keys() {
            validate_key(key)?;
        }
        let environment_keys = [
            DEFINITION_KEY,
            ENV_HEADER_KEY,
            TERRAIN_KEY,
            WATER_KEY,
            STRUCTURES_KEY,
        ];
        for key in environment_keys {
            if header.environment != self.records.contains_key(key) {
                return Err("environment record set is incomplete or unexpected".into());
            }
        }
        let atmosphere_chunks = collect_chunks(
            &self.records,
            ATMOSPHERE_PREFIX,
            header.atmosphere_bytes,
            MAX_ATMOSPHERE_CHUNKS,
            ATMOSPHERE_BYTES,
        )?;
        if header.atmosphere_bytes.is_some() && !header.environment {
            return Err("atmosphere record requires environment".into());
        }
        if header.environment {
            let definition = self.records.get(DEFINITION_KEY).unwrap();
            let environment_header = self.records.get(ENV_HEADER_KEY).unwrap();
            let terrain = self.records.get(TERRAIN_KEY).unwrap();
            let water = self.records.get(WATER_KEY).unwrap();
            if definition.len() > 128 * 1024
                || environment_header.len() > 65_568
                || terrain.len() > RECORD_BYTES
                || water.len() > RECORD_BYTES
                || self
                    .records
                    .get(STRUCTURES_KEY)
                    .is_some_and(|bytes| bytes.len() > RECORD_BYTES)
            {
                return Err("environment record exceeds bound".into());
            }
        }
        let entity_records = self.records.iter().filter(|(key, _)| key.starts_with(ENTITY_PREFIX))
            .map(|(key, bytes)| (key.clone(), bytes.clone())).collect();
        if crate::stable_entity_records::counts(&entity_records) != header.entity_counts {
            return Err("entity record set is incomplete".into());
        }
        let entities = crate::stable_entity_records::decode(&entity_records)?;
        let environment = if header.environment {
            let definition = self
                .records
                .get(DEFINITION_KEY)
                .ok_or("missing environment definition")?;
            let environment_header = self
                .records
                .get(ENV_HEADER_KEY)
                .ok_or("missing environment header")?;
            let terrain = self
                .records
                .get(TERRAIN_KEY)
                .ok_or("missing terrain record")?;
            let water = self.records.get(WATER_KEY).ok_or("missing water record")?;
            let structures = self
                .records
                .get(STRUCTURES_KEY)
                .ok_or("missing structures record")?;
            if definition.len() > 128 * 1024
                || environment_header.len() > 65_568
                || terrain.len() > RECORD_BYTES
                || water.len() > RECORD_BYTES
                || structures.len() > RECORD_BYTES
            {
                return Err("environment record exceeds bound".into());
            }
            Some((
                String::from_utf8(definition.clone())
                    .map_err(|_| "environment definition is not UTF-8")?,
                crate::terrain_water::TerrainWaterRecords {
                    header: environment_header.clone(),
                    terrain: terrain.clone(),
                    water: water.clone(),
                    structures: structures.clone(),
                },
            ))
        } else {
            None
        };
        Ok(KernelRecords {
            entities,
            environment,
            atmosphere: atmosphere_chunks,
        })
    }
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty()
        || key.len() > MAX_KEY_BYTES
        || !key
            .bytes()
            .all(|byte| byte.is_ascii() && !byte.is_ascii_control())
    {
        return Err("invalid record key".into());
    }
    if key.starts_with(ENTITY_PREFIX) {
        crate::stable_entity_records::validate_key(key)?;
    } else if key.strip_prefix(ATMOSPHERE_PREFIX).is_some() {
        let suffix = key.strip_prefix(ATMOSPHERE_PREFIX).unwrap();
        if suffix.len() != 4
            || !suffix.bytes().all(|byte| byte.is_ascii_digit())
            || suffix
                .parse::<usize>()
                .map_err(|_| "invalid atmosphere chunk")?
                >= MAX_ATMOSPHERE_CHUNKS
        {
            return Err("invalid atmosphere chunk key".into());
        }
    } else if !matches!(
        key,
        HEADER_KEY | DEFINITION_KEY | ENV_HEADER_KEY | TERRAIN_KEY | WATER_KEY | STRUCTURES_KEY
    ) {
        return Err("unrecognized record key".into());
    }
    Ok(())
}

fn insert_chunks(
    bundle: &mut RecordBundle,
    prefix: &str,
    bytes: &[u8],
    max_chunks: usize,
    max_bytes: usize,
) -> Result<(), String> {
    if bytes.len() > max_bytes {
        return Err("chunked record exceeds bound".into());
    }
    let count = bytes.len().div_ceil(RECORD_BYTES).max(1);
    if count > max_chunks {
        return Err("chunk count exceeds bound".into());
    }
    for index in 0..count {
        let start = index * RECORD_BYTES;
        let end = (start + RECORD_BYTES).min(bytes.len());
        bundle.insert(&format!("{prefix}{index:04}"), &bytes[start..end])?;
    }
    Ok(())
}

fn collect_chunks(
    records: &BTreeMap<String, Vec<u8>>,
    prefix: &str,
    expected: Option<u64>,
    max_chunks: usize,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, String> {
    let mut chunks = Vec::new();
    for (key, bytes) in records {
        if let Some(suffix) = key.strip_prefix(prefix) {
            if suffix.len() != 4
                || !suffix.bytes().all(|byte| byte.is_ascii_digit())
                || bytes.len() > RECORD_BYTES
            {
                return Err("invalid chunk".into());
            }
            chunks.push((suffix.parse::<usize>().map_err(|_| "invalid chunk")?, bytes));
        }
    }
    let Some(expected) = expected else {
        if !chunks.is_empty() {
            return Err("unexpected atmosphere records".into());
        }
        return Ok(None);
    };
    if expected > max_bytes as u64 {
        return Err("chunked record exceeds bound".into());
    }
    let count = (expected as usize).div_ceil(RECORD_BYTES).max(1);
    if count > max_chunks || chunks.len() != count {
        return Err("atmosphere chunks are incomplete".into());
    }
    chunks.sort_by_key(|(index, _)| *index);
    if chunks
        .iter()
        .enumerate()
        .any(|(position, (index, _))| *index != position)
    {
        return Err("atmosphere chunks are out of order".into());
    }
    if chunks
        .iter()
        .take(count.saturating_sub(1))
        .any(|(_, bytes)| bytes.len() != RECORD_BYTES)
    {
        return Err("atmosphere chunk has invalid length".into());
    }
    let final_len = expected as usize - RECORD_BYTES * count.saturating_sub(1);
    if chunks.last().map_or(0, |(_, bytes)| bytes.len()) != final_len {
        return Err("atmosphere length does not match header".into());
    }
    let mut result = Vec::with_capacity(expected as usize);
    for (_, bytes) in chunks {
        result.extend_from_slice(bytes);
    }
    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture_snapshot(value: &str) -> String {
        serde_json::json!({"format":"hive-kernel", "version":19, "scene":{"initial":[{"id":"subject", "components":{"value":value}}]}, "routes":[], "direct":[], "projectile_contacts":[], "party_bindings":[], "work_attempts":[], "jobs":[], "tasks":[]}).to_string()
    }
    fn capture_bundle(entity: &str) -> RecordBundle {
        RecordBundle::from_records(KernelRecords { entities: fixture_snapshot(entity), environment: None, atmosphere: None }).unwrap()
    }

    #[test]
    fn capture_transfers_only_exact_changed_records_and_tracks_removals() {
        let mut cursor = RecordCapture::default();
        let (first, first_manifest) = cursor.capture(capture_bundle(&"a".repeat(4096)), Some(0), 1, 0.1).unwrap();
        assert_eq!(first.keys(), first_manifest.keys);
        let (same, same_manifest) = cursor.capture(capture_bundle(&"a".repeat(4096)), Some(first_manifest.sequence), 1, 0.1).unwrap();
        assert!(same.keys().is_empty());
        assert_eq!(same_manifest.base, Some(first_manifest.sequence));
        let (changed, manifest) = cursor.capture(capture_bundle("b"), Some(same_manifest.sequence), 2, 0.2).unwrap();
        assert_eq!(changed.keys(), vec!["kernel/state/entities/subject"]);
        assert!(manifest.keys.contains(&"kernel/state/root".to_owned()));
        assert!(String::from_utf8(changed.read("kernel/state/entities/subject").unwrap()).unwrap().contains("b"));
    }

    #[test]
    fn detached_exports_leave_cursor_intact_and_stale_cursors_get_full_records() {
        let mut cursor = RecordCapture::default();
        let (_, first) = cursor.capture(capture_bundle("one"), Some(0), 0, 0.0).unwrap();
        let (export, detached) = cursor.capture(capture_bundle("one"), None, 0, 0.0).unwrap();
        assert_eq!(export.keys(), detached.keys);
        assert_eq!(detached.sequence, 0);
        let (unchanged, second) = cursor.capture(capture_bundle("one"), Some(first.sequence), 0, 0.0).unwrap();
        assert!(unchanged.keys().is_empty());
        let (resync, third) = cursor.capture(capture_bundle("one"), Some(first.sequence), 0, 0.0).unwrap();
        assert_eq!(resync.keys(), third.keys);
        assert!(third.base.is_none());
        assert!(third.sequence > second.sequence);
    }
    #[test]
    fn stable_entity_record_roundtrip_and_limits() {
        let entities = fixture_snapshot(&format!("{}é", "a".repeat(4096)));
        let records = KernelRecords {
            entities: entities.clone(),
            environment: None,
            atmosphere: None,
        };
        let bundle = RecordBundle::from_records(records).unwrap();
        assert_eq!(bundle.decode().unwrap().entities, entities);
    }
    #[test]
    fn opaque_empty_environment_roundtrips() {
        let records = KernelRecords {
            entities: fixture_snapshot(""),
            environment: Some((
                String::new(),
                crate::terrain_water::TerrainWaterRecords {
                    header: vec![1, 0],
                    terrain: vec![0, 255, 0],
                    water: vec![0, 0, 128],
                    structures: vec![4, 5, 6],
                },
            )),
            atmosphere: None,
        };
        let bundle = RecordBundle::from_records(records).unwrap();
        let roundtrip = bundle.decode().unwrap();
        let (definition, environment) = roundtrip.environment.unwrap();
        assert_eq!(definition, "");
        assert_eq!(environment.header, [1, 0]);
        assert_eq!(environment.terrain, [0, 255, 0]);
        assert_eq!(environment.water, [0, 0, 128]);
        assert_eq!(environment.structures, [4, 5, 6]);
    }
    #[test]
    fn environment_requires_structures_record() {
        let records = KernelRecords {
            entities: fixture_snapshot(""),
            environment: Some((
                String::new(),
                crate::terrain_water::TerrainWaterRecords {
                    header: vec![1],
                    terrain: vec![2],
                    water: vec![3],
                    structures: vec![4],
                },
            )),
            atmosphere: None,
        };
        let mut bundle = RecordBundle::from_records(records).unwrap();
        bundle.records.remove(STRUCTURES_KEY);
        assert!(bundle.decode().is_err());
    }

    #[test]
    fn rejects_previous_record_format_without_migration() {
        let records = KernelRecords {
            entities: fixture_snapshot(""),
            environment: None,
            atmosphere: None,
        };
        let mut bundle = RecordBundle::from_records(records).unwrap();
        bundle.records.get_mut(HEADER_KEY).unwrap()[0] = 3;
        assert!(bundle.decode().is_err());
    }

    #[test]
    fn rejects_missing_extra_duplicate_oversized_and_trailing_header() {
        let records = KernelRecords {
            entities: fixture_snapshot(""),
            environment: None,
            atmosphere: None,
        };
        let mut bundle = RecordBundle::from_records(records).unwrap();
        let header = bundle.records.get_mut(HEADER_KEY).unwrap();
        header.push(0);
        assert!(bundle.decode().is_err());
        let mut bundle = RecordBundle::from_records(KernelRecords {
            entities: fixture_snapshot(""),
            environment: None,
            atmosphere: None,
        })
        .unwrap();
        bundle.records.remove(HEADER_KEY);
        assert!(bundle.decode().is_err());
        let mut bundle = RecordBundle::from_records(KernelRecords {
            entities: fixture_snapshot(""),
            environment: None,
            atmosphere: None,
        })
        .unwrap();
        bundle.records.insert("kernel/extra".into(), vec![]);
        assert!(bundle.decode().is_err());
        let mut bundle = RecordBundle::new();
        assert!(bundle.insert("kernel/extra", &[]).is_err());
        let oversized = vec![0; RECORD_BYTES + 1];
        assert!(bundle.insert("kernel/state/entities/subject", &oversized).is_err());
        assert!(bundle.insert("kernel/state/entities/subject", &[]).is_ok());
        assert!(bundle.insert("kernel/state/entities/subject", &[]).is_err());
    }

    fn atmosphere_records(atmosphere: Option<Vec<u8>>) -> KernelRecords {
        KernelRecords {
            entities: fixture_snapshot(""),
            environment: Some((
                String::new(),
                crate::terrain_water::TerrainWaterRecords {
                    header: vec![1],
                    terrain: vec![2],
                    water: vec![3],
                    structures: vec![4],
                },
            )),
            atmosphere,
        }
    }

    #[test]
    fn atmosphere_zero_and_cross_chunk_roundtrip_preserves_exact_option() {
        for source in [
            Some(Vec::new()),
            Some(
                (0..(RECORD_BYTES + 17))
                    .map(|value| (value % 251) as u8)
                    .collect(),
            ),
        ] {
            let bundle = RecordBundle::from_records(atmosphere_records(source.clone())).unwrap();
            assert_eq!(bundle.decode().unwrap().atmosphere, source);
        }
        assert_eq!(
            RecordBundle::from_records(atmosphere_records(None))
                .unwrap()
                .decode()
                .unwrap()
                .atmosphere,
            None
        );
    }

    #[test]
    fn atmosphere_chunks_require_complete_current_environment_binding() {
        let mut bundle =
            RecordBundle::from_records(atmosphere_records(Some(vec![7; RECORD_BYTES + 1])))
                .unwrap();
        bundle.records.remove("kernel/atmosphere/0001");
        assert!(bundle.decode().is_err());

        let mut no_environment = RecordBundle::from_records(KernelRecords {
            entities: fixture_snapshot(""),
            environment: None,
            atmosphere: None,
        })
        .unwrap();
        no_environment
            .records
            .insert("kernel/atmosphere/0000".into(), vec![]);
        assert!(no_environment.decode().is_err());
    }
}
