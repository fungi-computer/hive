//! Cohorts of mobile poses. ECS Position remains authoritative; this projection
//! groups its frequent replacements without rewriting each actor's static facts.
use std::collections::BTreeMap;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub(crate) const PREFIX: &str = "kernel/state/motion/";
const PAGE_BYTES: usize = 16 * 1024;
type Records = BTreeMap<String, Vec<u8>>;

fn identity(id: &str) -> String { format!("{:x}", Sha256::digest(id.as_bytes())) }
pub(crate) fn validate_key(key: &str) -> Result<(), String> {
    let suffix = key.strip_prefix(PREFIX).ok_or("invalid motion page key")?;
    if suffix.is_empty() || suffix.len() > 64 || !suffix.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()) {
        return Err("invalid motion page identity".into());
    }
    Ok(())
}

pub(crate) fn extract(row: &mut Value) -> Option<Value> {
    let components = row.get_mut("components")?.as_object_mut()?;
    if !components.contains_key("hive.body") { return None; }
    components.remove("hive.position")
}

fn page(prefix: String, rows: BTreeMap<String, Value>, records: &mut Records) -> Result<(), String> {
    if rows.is_empty() { return Ok(()); }
    let bytes = serde_json::to_vec(&rows).map_err(|error| error.to_string())?;
    if bytes.len() <= PAGE_BYTES { records.insert(format!("{PREFIX}{prefix}"), bytes); return Ok(()); }
    if prefix.len() == 64 { return Err("motion cohort identity collision".into()); }
    let mut children = BTreeMap::<String, BTreeMap<String, Value>>::new();
    for (id, value) in rows { children.entry(identity(&id)[..prefix.len()+1].to_owned()).or_default().insert(id, value); }
    for (prefix, rows) in children { page(prefix, rows, records)?; }
    Ok(())
}

pub(crate) fn encode(positions: BTreeMap<String, Value>) -> Result<Records, String> {
    let mut groups = BTreeMap::<String, BTreeMap<String, Value>>::new();
    for (id, value) in positions { groups.entry(identity(&id)[..1].to_owned()).or_default().insert(id, value); }
    let mut records = Records::new();
    for (prefix, rows) in groups { page(prefix, rows, &mut records)?; }
    Ok(records)
}

pub(crate) fn decode(records: &Records) -> Result<BTreeMap<String, Value>, String> {
    let mut positions = BTreeMap::new();
    for (key, bytes) in records.range(PREFIX.to_owned()..).take_while(|(key, _)| key.starts_with(PREFIX)) {
        validate_key(key)?;
        let prefix = &key[PREFIX.len()..];
        let rows: BTreeMap<String, Value> = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
        if rows.is_empty() || bytes.len() > PAGE_BYTES { return Err("invalid motion cohort page".into()); }
        for (id, value) in rows {
            if !crate::components::valid_id(&id) || !identity(&id).starts_with(prefix) || positions.insert(id, value).is_some() {
                return Err("invalid motion cohort member".into());
            }
        }
    }
    // The canonical partition has one spelling. Overlapping or needlessly
    // split pages cannot conceal duplicate data or alter later capture costs.
    let canonical = encode(positions.clone())?;
    if canonical.iter().any(|(key, bytes)| records.get(key) != Some(bytes))
        || canonical.len() != records.keys().filter(|key| key.starts_with(PREFIX)).count() { return Err("noncanonical motion cohorts".into()); }
    Ok(positions)
}

/// Patch only affected cohorts in the disposable capture baseline. No physical
/// state is kept here and acknowledging a capture still uses the ECS journal.
pub(crate) fn patch(baseline: &Records, changes: BTreeMap<String, Option<Value>>) -> Result<(Records, Vec<String>), String> {
    let mut groups = BTreeMap::<String, Vec<(String, Option<Value>)>>::new();
    for (id, value) in changes { groups.entry(identity(&id)[..1].to_owned()).or_default().push((id, value)); }
    let mut puts = Records::new();
    let mut removes = Vec::new();
    for (group, changes) in groups {
        let prefix = format!("{PREFIX}{group}");
        let prior: Records = baseline.range(prefix.clone()..).take_while(|(key, _)| key.starts_with(&prefix)).map(|(key, bytes)| (key.clone(), bytes.clone())).collect();
        let mut positions = decode(&prior)?;
        for (id, value) in changes { if let Some(value) = value { positions.insert(id, value); } else { positions.remove(&id); } }
        let next = encode(positions)?;
        removes.extend(prior.keys().filter(|key| !next.contains_key(*key)).cloned());
        puts.extend(next);
    }
    Ok((puts, removes))
}
