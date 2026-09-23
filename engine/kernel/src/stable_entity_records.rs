//! Stable persistence identities for canonical entity-owned facts.
//!
//! Checkpoint assembly is deliberately separate from record identity. This owner
//! currently scans the checkpoint; it does not claim mutation-proportional CPU.
//! Changing a row's encoded length cannot move another row's record boundary.
use std::collections::BTreeMap;
use serde_json::Value;
use crate::record_bundle::{ENTITY_BYTES, RECORD_BYTES};

const ROOT: &str = "kernel/state/root";
const FAMILIES: [&str; 8] = ["entities", "routes", "direct", "contacts", "parties", "attempts", "jobs", "tasks"];
const POINTERS: [&str; 8] = ["/scene/initial", "/routes", "/direct", "/projectile_contacts", "/party_bindings", "/work_attempts", "/jobs", "/tasks"];
const IDENTITIES: [&str; 8] = ["/id", "/entity", "/entity", "/projectile_id", "/bindingId", "/key/task", "/id", "/id"];
type Records = BTreeMap<String, Vec<u8>>;

pub(crate) fn validate_key(key: &str) -> Result<(), String> {
    if key == ROOT { return Ok(()); }
    if let Some(suffix) = key.strip_prefix(crate::search_records::PREFIX) { return if crate::search_records::valid_suffix(suffix) { Ok(()) } else { Err("invalid search record identity".into()) }; }
    let suffix = key.strip_prefix("kernel/state/").ok_or("invalid state key")?;
    let (family, id) = suffix.split_once('/').ok_or("invalid state key")?;
    if !FAMILIES.contains(&family) || !crate::components::valid_id(id) { return Err("invalid state identity".into()); }
    Ok(())
}

pub(crate) fn counts(records: &Records) -> [u32; 10] { counts_keys(records.keys()) }

pub(crate) fn counts_keys<'a>(keys: impl Iterator<Item = &'a String>) -> [u32; 10] {
    let mut counts = [0; 10];
    for key in keys {
        if key == ROOT { counts[0] += 1; }
        else if key.starts_with(crate::search_records::PREFIX) { counts[9] += 1; }
        else if let Some(suffix) = key.strip_prefix("kernel/state/") {
            if let Some((family, _)) = suffix.split_once('/') {
                if let Some(index) = FAMILIES.iter().position(|candidate| *candidate == family) { counts[index + 1] += 1; }
            }
        }
    }
    counts
}

fn bytes(value: &Value) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > RECORD_BYTES { return Err("state record exceeds 256KiB".into()); }
    Ok(bytes)
}

pub(crate) fn encode(snapshot: &str) -> Result<Records, String> {
    if snapshot.len() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    let mut root: Value = serde_json::from_str(snapshot).map_err(|error| error.to_string())?;
    let mut records = Records::new();
    for index in 0..FAMILIES.len() {
        let rows = root.pointer_mut(POINTERS[index]).and_then(Value::as_array_mut).ok_or("missing state collection")?;
        for row in std::mem::take(rows) {
            let id = row.pointer(IDENTITIES[index]).and_then(Value::as_str).ok_or("missing state identity")?;
            let key = format!("kernel/state/{}/{id}", FAMILIES[index]);
            validate_key(&key)?;
            if records.insert(key, bytes(&row)?).is_some() { return Err("duplicate state identity".into()); }
        }
    }
    records.extend(crate::search_records::extract(&mut root)?);
    records.insert(ROOT.into(), bytes(&root)?);
    if records.values().map(Vec::len).sum::<usize>() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    Ok(records)
}

pub(crate) fn decode(records: &Records) -> Result<String, String> {
    if records.values().map(Vec::len).sum::<usize>() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    let mut root: Value = serde_json::from_slice(records.get(ROOT).ok_or("missing state root")?).map_err(|error| error.to_string())?;
    for pointer in POINTERS {
        if !root.pointer(pointer).and_then(Value::as_array).is_some_and(Vec::is_empty) { return Err("state root contains inline rows".into()); }
    }
    for (key, value) in records {
        validate_key(key)?;
        if key == ROOT || key.starts_with(crate::search_records::PREFIX) { continue; }
        if value.len() > RECORD_BYTES { return Err("state record exceeds 256KiB".into()); }
        let suffix = key.strip_prefix("kernel/state/").unwrap();
        let (family, id) = suffix.split_once('/').unwrap();
        let index = FAMILIES.iter().position(|candidate| *candidate == family).unwrap();
        let row: Value = serde_json::from_slice(value).map_err(|error| error.to_string())?;
        if row.pointer(IDENTITIES[index]).and_then(Value::as_str) != Some(id) { return Err("state record identity mismatch".into()); }
        root.pointer_mut(POINTERS[index]).and_then(Value::as_array_mut).unwrap().push(row);
    }
    crate::search_records::restore(&mut root, records)?;
    let result = serde_json::to_string(&root).map_err(|error| error.to_string())?;
    if result.len() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    Ok(result)
}
