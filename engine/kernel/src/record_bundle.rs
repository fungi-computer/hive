//! Bounded opaque capture/restore records for the native Kernel boundary.

use crate::world::KernelRecords;
use postcard::take_from_bytes;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const RECORD_BYTES: usize = 256 * 1024;
pub const ENTITY_BYTES: usize = 8 * 1024 * 1024;
pub const TOTAL_BYTES: usize = 9 * 1024 * 1024;
pub const MAX_RECORDS: usize = 40;
pub const MAX_KEY_BYTES: usize = 80;
const HEADER_KEY: &str = "kernel/header";
const ENV_HEADER_KEY: &str = "kernel/environment/header";
const DEFINITION_KEY: &str = "kernel/environment/definition";
const TERRAIN_KEY: &str = "kernel/environment/terrain";
const WATER_KEY: &str = "kernel/environment/water";
const ENTITY_PREFIX: &str = "kernel/entities/";

#[derive(Serialize, Deserialize)]
struct Header {
    version: u16,
    entity_bytes: u64,
    environment: bool,
}

pub struct RecordBundle {
    records: BTreeMap<String, Vec<u8>>,
}

impl RecordBundle {
    pub fn new() -> Self {
        Self {
            records: BTreeMap::new(),
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
        self.records.values().map(Vec::len).sum()
    }

    pub fn from_records(records: KernelRecords) -> Result<Self, String> {
        let entity = records.entities.into_bytes();
        if entity.len() > ENTITY_BYTES {
            return Err("entity records exceed 8MiB".into());
        }
        records
            .environment
            .as_ref()
            .map(|(definition, records)| {
                if definition.len() > 128 * 1024
                    || records.header.len() > 65_568
                    || records.terrain.len() > RECORD_BYTES
                    || records.water.len() > RECORD_BYTES
                {
                    return Err("environment record exceeds bound".to_owned());
                }
                Ok(())
            })
            .transpose()?;
        let entity_chunks = entity.len().div_ceil(RECORD_BYTES).max(1);
        let environment_records = usize::from(records.environment.is_some()) * 4;
        if entity_chunks + environment_records + 1 > MAX_RECORDS {
            return Err("record count exceeds bound".into());
        }
        let mut bundle = Self::new();
        for index in 0..entity_chunks {
            let start = index * RECORD_BYTES;
            let end = (start + RECORD_BYTES).min(entity.len());
            bundle.insert(&format!("{ENTITY_PREFIX}{index:04}"), &entity[start..end])?;
        }
        let environment_present = records.environment.is_some();
        let header = postcard::to_allocvec(&Header {
            version: 1,
            entity_bytes: entity.len() as u64,
            environment: environment_present,
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
        }
        Ok(bundle)
    }

    pub fn into_records(self) -> Result<KernelRecords, String> {
        let header_bytes = self
            .records
            .get(HEADER_KEY)
            .ok_or("missing record header")?;
        if header_bytes.len() > 65_568 {
            return Err("record header exceeds bound".into());
        }
        let (header, remainder): (Header, &[u8]) =
            take_from_bytes(header_bytes).map_err(|_| "invalid record header")?;
        if !remainder.is_empty() || header.version != 1 || header.entity_bytes > ENTITY_BYTES as u64
        {
            return Err("invalid record header binding".into());
        }
        if self.records.len() > MAX_RECORDS {
            return Err("record count exceeds bound".into());
        }
        for key in self.records.keys() {
            validate_key(key)?;
        }
        let environment_keys = [DEFINITION_KEY, ENV_HEADER_KEY, TERRAIN_KEY, WATER_KEY];
        for key in environment_keys {
            if header.environment != self.records.contains_key(key) {
                return Err("environment record set is incomplete or unexpected".into());
            }
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
            {
                return Err("environment record exceeds bound");
            }
        }
        if !header.environment
            && self
                .records
                .keys()
                .any(|key| environment_keys.contains(&key.as_str()))
        {
            return Err("unexpected environment record");
        }
        let mut chunks = Vec::new();
        for (key, bytes) in &self.records {
            if let Some(suffix) = key.strip_prefix(ENTITY_PREFIX) {
                if suffix.len() != 4
                    || !suffix.bytes().all(|byte| byte.is_ascii_digit())
                    || bytes.len() > RECORD_BYTES
                {
                    return Err("invalid entity chunk".into());
                }
                chunks.push((
                    suffix
                        .parse::<usize>()
                        .map_err(|_| "invalid entity chunk")?,
                    bytes,
                ));
            }
        }
        if chunks.is_empty() {
            return Err("missing entity chunks".into());
        }
        chunks.sort_by_key(|(index, _)| *index);
        let expected_chunks = (header.entity_bytes as usize).div_ceil(RECORD_BYTES).max(1);
        if chunks.len() != expected_chunks
            || chunks
                .iter()
                .enumerate()
                .any(|(position, (index, _))| *index != position)
        {
            return Err("entity chunks are incomplete or out of order".into());
        }
        if chunks
            .iter()
            .take(expected_chunks.saturating_sub(1))
            .any(|(_, bytes)| bytes.len() != RECORD_BYTES)
        {
            return Err("entity chunk has invalid length".into());
        }
        let final_len = chunks.last().map(|(_, bytes)| bytes.len()).unwrap_or(0);
        if final_len
            != (header.entity_bytes as usize)
                .saturating_sub(RECORD_BYTES * expected_chunks.saturating_sub(1))
        {
            return Err("entity length does not match header".into());
        }
        let mut entity = Vec::with_capacity(header.entity_bytes as usize);
        for (_, bytes) in chunks {
            entity.extend_from_slice(bytes);
        }
        let entities = String::from_utf8(entity).map_err(|_| "entity records are not UTF-8")?;
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
            if definition.len() > 128 * 1024
                || environment_header.len() > 65_568
                || terrain.len() > RECORD_BYTES
                || water.len() > RECORD_BYTES
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
                },
            ))
        } else {
            None
        };
        Ok(KernelRecords {
            entities,
            environment,
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
    if let Some(suffix) = key.strip_prefix(ENTITY_PREFIX) {
        if suffix.len() != 4
            || !suffix.bytes().all(|byte| byte.is_ascii_digit())
            || suffix
                .parse::<usize>()
                .map_err(|_| "invalid entity chunk")?
                >= 32
        {
            return Err("invalid entity chunk key".into());
        }
    } else if !matches!(
        key,
        HEADER_KEY | DEFINITION_KEY | ENV_HEADER_KEY | TERRAIN_KEY | WATER_KEY
    ) {
        return Err("unrecognized record key".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn entity_chunk_roundtrip_and_limits() {
        let entities = format!("{}é", "a".repeat(RECORD_BYTES - 1));
        let records = KernelRecords {
            entities: entities.clone(),
            environment: None,
        };
        let bundle = RecordBundle::from_records(records).unwrap();
        assert_eq!(bundle.into_records().unwrap().entities, entities);
    }
    #[test]
    fn opaque_empty_environment_roundtrips() {
        let records = KernelRecords {
            entities: "{}".into(),
            environment: Some((
                String::new(),
                crate::terrain_water::TerrainWaterRecords {
                    header: vec![1],
                    terrain: vec![],
                    water: vec![],
                },
            )),
        };
        let bundle = RecordBundle::from_records(records).unwrap();
        let roundtrip = bundle.into_records().unwrap();
        assert_eq!(roundtrip.environment.unwrap().1.terrain, Vec::<u8>::new());
    }
    #[test]
    fn rejects_missing_extra_duplicate_oversized_and_trailing_header() {
        let records = KernelRecords {
            entities: "{}".into(),
            environment: None,
        };
        let mut bundle = RecordBundle::from_records(records).unwrap();
        let header = bundle.records.get_mut(HEADER_KEY).unwrap();
        header.push(0);
        assert!(bundle.into_records().is_err());
        let mut bundle = RecordBundle::from_records(KernelRecords {
            entities: "{}".into(),
            environment: None,
        })
        .unwrap();
        bundle.records.remove(HEADER_KEY);
        assert!(bundle.into_records().is_err());
        let mut bundle = RecordBundle::from_records(KernelRecords {
            entities: "{}".into(),
            environment: None,
        })
        .unwrap();
        bundle.records.insert("kernel/extra".into(), vec![]);
        assert!(bundle.into_records().is_err());
        let mut bundle = RecordBundle::new();
        assert!(bundle.insert("kernel/extra", &[]).is_err());
        let oversized = vec![0; RECORD_BYTES + 1];
        assert!(bundle.insert("kernel/entities/0000", &oversized).is_err());
        assert!(bundle.insert("kernel/entities/0000", &[]).is_ok());
        assert!(bundle.insert("kernel/entities/0000", &[]).is_err());
    }
}
