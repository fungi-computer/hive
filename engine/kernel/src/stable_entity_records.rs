//! Stable persistence identities, with coupled private facts stored on their
//! entity and frequent mobile poses projected into bounded stable cohorts.
use std::collections::BTreeMap;
use serde_json::Value;
use crate::record_bundle::{ENTITY_BYTES, RECORD_BYTES};

const ROOT: &str = "kernel/state/root";
const DEFINITION: &str = "kernel/state/definition";
const FAMILIES: [&str; 6] = ["entities", "routes", "direct", "contacts", "parties", "attempts"];
const POINTERS: [&str; 6] = ["/scene/initial", "/routes", "/direct", "/projectile_contacts", "/party_bindings", "/work_attempts"];
const IDENTITIES: [&str; 6] = ["/id", "/entity", "/entity", "/projectile_id", "/bindingId", "/key/task"];
type Records = BTreeMap<String, Vec<u8>>;

pub(crate) fn validate_key(key: &str) -> Result<(), String> {
    if key == ROOT || key == DEFINITION { return Ok(()); }
    if key.starts_with(crate::motion_records::PREFIX) { return crate::motion_records::validate_key(key); }
    if key.starts_with(crate::route_records::PREFIX) { return crate::route_records::validate_key(key); }
    if let Some(suffix) = key.strip_prefix(crate::search_records::PREFIX) { return if crate::search_records::valid_suffix(suffix) { Ok(()) } else { Err("invalid search record identity".into()) }; }
    let suffix = key.strip_prefix("kernel/state/").ok_or("invalid state key")?;
    let (family, id) = suffix.split_once('/').ok_or("invalid state key")?;
    if !FAMILIES.contains(&family) || !crate::components::valid_id(id) { return Err("invalid state identity".into()); }
    Ok(())
}

pub(crate) fn counts(records: &Records) -> [u32; 11] { counts_keys(records.keys()) }
pub(crate) fn counts_keys<'a>(keys: impl Iterator<Item = &'a String>) -> [u32; 11] {
    let mut counts = [0; 11];
    for key in keys {
        if key == ROOT { counts[0] += 1; }
        else if key == DEFINITION { counts[10] += 1; }
        else if key.starts_with(crate::search_records::PREFIX) { counts[7] += 1; }
        else if key.starts_with(crate::route_records::PREFIX) { counts[8] += 1; }
        else if key.starts_with(crate::motion_records::PREFIX) { counts[9] += 1; }
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

pub(crate) fn private_entity_bytes(key: &str, bytes: &[u8]) -> Result<usize, String> {
    if !key.starts_with("kernel/state/entities/") { return Ok(0); }
    let row: Value = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    let id = row.get("id").and_then(Value::as_str).ok_or("missing state identity")?;
    ["job", "task"].iter().try_fold(0, |sum, field| {
        row.get(*field).map_or(Ok(sum), |value| Ok(sum + serde_json::to_vec(value).map_err(|error| error.to_string())?.len() + id.len() + 32))
    })
}

pub(crate) fn encode(snapshot: &str) -> Result<Records, String> {
    if snapshot.len() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    let mut root: Value = serde_json::from_str(snapshot).map_err(|error| error.to_string())?;
    let mut owned = BTreeMap::<String, BTreeMap<String, Value>>::new();
    for (collection, field) in [("jobs", "job"), ("tasks", "task")] {
        let rows = root.get_mut(collection).and_then(Value::as_array_mut).ok_or("missing private state collection")?;
        for row in std::mem::take(rows) {
            let id = row.get("id").and_then(Value::as_str).ok_or("missing private state identity")?.to_owned();
            let value = row.get(field).ok_or("missing private state fact")?.clone();
            if owned.entry(id).or_default().insert(field.into(), value).is_some() { return Err("duplicate private state identity".into()); }
        }
    }
    let mut records = Records::new();
    let mut positions = BTreeMap::new();
    for index in 0..FAMILIES.len() {
        let rows = root.pointer_mut(POINTERS[index]).and_then(Value::as_array_mut).ok_or("missing state collection")?;
        for mut row in std::mem::take(rows) {
            let id = row.pointer(IDENTITIES[index]).and_then(Value::as_str).ok_or("missing state identity")?.to_owned();
            let key = format!("kernel/state/{}/{}", FAMILIES[index], id);
            validate_key(&key)?;
            if index == 0 {
                if let Some(facts) = owned.remove(&id) { row.as_object_mut().ok_or("invalid entity row")?.extend(facts); }
                if let Some(position) = crate::motion_records::extract(&mut row) { positions.insert(id.clone(), position); }
            }
            if index == 1 {
                for (key, bytes) in crate::route_records::encode(&id, row)? {
                    if records.insert(key, bytes).is_some() { return Err("duplicate state identity".into()); }
                }
            } else if records.insert(key, bytes(&row)?).is_some() { return Err("duplicate state identity".into()); }
        }
    }
    if !owned.is_empty() { return Err("private fact has no owning entity".into()); }
    records.extend(crate::motion_records::encode(positions)?);
    records.extend(crate::search_records::extract(&mut root)?);
    let definition = root.get_mut("scene").ok_or("missing scene definition")?.take();
    records.insert(DEFINITION.into(), bytes(&definition)?);
    records.insert(ROOT.into(), bytes(&root)?);
    if records.values().map(Vec::len).sum::<usize>() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    Ok(records)
}

pub(crate) fn decode(records: &Records) -> Result<String, String> {
    if records.values().map(Vec::len).sum::<usize>() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    let mut root: Value = serde_json::from_slice(records.get(ROOT).ok_or("missing state root")?).map_err(|error| error.to_string())?;
    if root.get("scene") != Some(&Value::Null) { return Err("state root contains inline definition".into()); }
    root["scene"] = serde_json::from_slice(records.get(DEFINITION).ok_or("missing state definition")?).map_err(|error| error.to_string())?;
    for pointer in POINTERS.into_iter().chain(["/jobs", "/tasks"]) {
        if !root.pointer(pointer).and_then(Value::as_array).is_some_and(Vec::is_empty) { return Err("state root contains inline rows".into()); }
    }
    let mut positions = crate::motion_records::decode(records)?;
    let mut route_ids = std::collections::BTreeSet::new();
    for (key, value) in records {
        validate_key(key)?;
        if key == ROOT || key == DEFINITION || key.starts_with(crate::search_records::PREFIX)
            || key.starts_with(crate::route_records::PREFIX) || key.starts_with(crate::motion_records::PREFIX) { continue; }
        if value.len() > RECORD_BYTES { return Err("state record exceeds 256KiB".into()); }
        let (family, id) = key.strip_prefix("kernel/state/").unwrap().split_once('/').unwrap();
        let index = FAMILIES.iter().position(|candidate| *candidate == family).unwrap();
        let mut row: Value = serde_json::from_slice(value).map_err(|error| error.to_string())?;
        if row.pointer(IDENTITIES[index]).and_then(Value::as_str) != Some(id) { return Err("state record identity mismatch".into()); }
        if index == 0 {
            for (collection, field) in [("jobs", "job"), ("tasks", "task")] {
                if let Some(value) = row.as_object_mut().ok_or("invalid entity row")?.remove(field) {
                    root[collection].as_array_mut().unwrap().push(serde_json::json!({"id":id,field:value}));
                }
            }
            if let Some(position) = positions.remove(id) {
                let components = row.get_mut("components").and_then(Value::as_object_mut).ok_or("missing entity components")?;
                if !components.contains_key("hive.body") || components.insert("hive.position".into(), position).is_some() { return Err("motion cohort does not match body ownership".into()); }
            }
        } else if index == 1 {
            route_ids.insert(id.to_owned());
            crate::route_records::restore(id, &mut row, records)?;
        }
        root.pointer_mut(POINTERS[index]).and_then(Value::as_array_mut).unwrap().push(row);
    }
    if !positions.is_empty() { return Err("motion cohort has no owning entity".into()); }
    for key in records.keys().filter(|key| key.starts_with(crate::route_records::PREFIX)) {
        let id = key[crate::route_records::PREFIX.len()..].split('/').next().unwrap();
        if !route_ids.contains(id) { return Err("route geometry has no progress owner".into()); }
    }
    crate::search_records::restore(&mut root, records)?;
    let result = serde_json::to_string(&root).map_err(|error| error.to_string())?;
    if result.len() > ENTITY_BYTES { return Err("entity records exceed 8MiB".into()); }
    Ok(result)
}
