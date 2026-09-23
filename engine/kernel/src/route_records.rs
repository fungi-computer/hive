//! Durable route geometry is immutable while its small progress record advances.
use std::collections::BTreeMap;
use serde_json::Value;

pub(crate) const PREFIX: &str = "kernel/state/paths/";
const PAGE: usize = 128;

pub(crate) fn validate_key(key: &str) -> Result<(), String> {
    let parts = key.strip_prefix(PREFIX).ok_or("invalid route geometry key")?.split('/').collect::<Vec<_>>();
    if parts.len() != 3 || !crate::components::valid_id(parts[0]) || !matches!(parts[1], "p" | "t")
        || parts[2].len() != 4 || !parts[2].bytes().all(|byte| byte.is_ascii_digit())
        || parts[2].parse::<usize>().map_err(|_| "invalid route page")? >= 64 {
        return Err("invalid route geometry key".into());
    }
    Ok(())
}

pub(crate) fn encode(id: &str, mut row: Value) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut records = BTreeMap::new();
    for (field, kind) in [("path", "p"), ("terrain_path", "t")] {
        let value = row.get_mut(field).ok_or("route geometry is missing")?;
        let count = if value.is_null() { Value::Null } else {
            let points = value.as_array_mut().ok_or("invalid route geometry")?;
            let count = points.len();
            if count > 8192 { return Err("route geometry exceeds bound".into()); }
            for (index, page) in points.chunks(PAGE).enumerate() {
                records.insert(format!("{PREFIX}{id}/{kind}/{index:04}"), serde_json::to_vec(page).map_err(|error| error.to_string())?);
            }
            points.clear();
            Value::from(count)
        };
        row.as_object_mut().ok_or("invalid route record")?.insert(format!("{field}_count"), count);
    }
    records.insert(format!("kernel/state/routes/{id}"), serde_json::to_vec(&row).map_err(|error| error.to_string())?);
    Ok(records)
}

pub(crate) fn restore(id: &str, row: &mut Value, records: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    let object = row.as_object_mut().ok_or("invalid route record")?;
    for (field, kind) in [("path", "p"), ("terrain_path", "t")] {
        let count = object.remove(&format!("{field}_count")).ok_or("missing route geometry count")?;
        let prefix = format!("{PREFIX}{id}/{kind}/");
        let pages: Vec<_> = records.range(prefix.clone()..).take_while(|(key, _)| key.starts_with(&prefix)).collect();
        if count.is_null() {
            if field != "terrain_path" || object.get(field) != Some(&Value::Null) || !pages.is_empty() { return Err("unexpected route geometry".into()); }
            continue;
        }
        let count = count.as_u64().ok_or("invalid route geometry count")? as usize;
        if count > 8192 || pages.len() != count.div_ceil(PAGE)
            || !object.get(field).and_then(Value::as_array).is_some_and(Vec::is_empty) { return Err("invalid route geometry count".into()); }
        let mut points = Vec::with_capacity(count);
        for (index, (key, bytes)) in pages.into_iter().enumerate() {
            if key != &format!("{prefix}{index:04}") { return Err("route geometry pages are incomplete".into()); }
            let page: Vec<Value> = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
            if page.len() != (count - index * PAGE).min(PAGE) { return Err("invalid route geometry page length".into()); }
            points.extend(page);
        }
        object.insert(field.into(), Value::Array(points));
    }
    Ok(())
}
