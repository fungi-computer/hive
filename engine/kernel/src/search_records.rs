//! Persistence pages for resumable route searches. Node indices are permanent
//! within one search. Frontier pages use those indices, so popping a cheap node
//! cannot shift unrelated frontier records.
use std::collections::BTreeMap;
use serde_json::{Value, json};

pub(crate) const PREFIX: &str = "kernel/state/searches/";
const PAGE_ROWS: usize = 256;
const MAX_NODES: usize = 32_768;
type Records = BTreeMap<String, Vec<u8>>;

pub(crate) fn valid_suffix(suffix: &str) -> bool {
    let Some((id, part)) = suffix.split_once('.') else { return false; };
    if id.len() != 64 || !id.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()) { return false; }
    if part == "head" { return true; }
    let Some((kind, page)) = part.split_once('.') else { return false; };
    matches!(kind, "nodes" | "frontier") && page.len() == 4 && page.bytes().all(|byte| byte.is_ascii_digit()) && page.parse::<usize>().is_ok_and(|page| page < MAX_NODES / PAGE_ROWS)
}
fn put(records: &mut Records, key: String, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > crate::record_bundle::RECORD_BYTES { return Err("route search page exceeds record budget".into()); }
    records.insert(key, bytes);
    Ok(())
}

pub(crate) fn encode(id: &str, mut request: Value) -> Result<Records, String> {
    if !valid_suffix(&format!("{id}.head")) { return Err("invalid route search identity".into()); }
    let nodes = request.pointer_mut("/search/nodes").and_then(Value::as_array_mut).ok_or("missing route search nodes")?;
    let nodes = std::mem::take(nodes);
    if nodes.is_empty() || nodes.len() > MAX_NODES { return Err("route search node count exceeds bound".into()); }
    let frontier = request.pointer_mut("/search/frontier").and_then(Value::as_array_mut).ok_or("missing route search frontier")?;
    let frontier = std::mem::take(frontier);
    if frontier.len() > MAX_NODES { return Err("route search frontier count exceeds bound".into()); }
    let mut records = Records::new();
    for (index, page) in nodes.chunks(PAGE_ROWS).enumerate() {
        put(&mut records, format!("{PREFIX}{id}.nodes.{index:04}"), &Value::Array(page.to_vec()))?;
    }
    let mut frontier_pages: BTreeMap<usize, Vec<Value>> = BTreeMap::new();
    for row in &frontier {
        let index = row.get(2).and_then(Value::as_u64).and_then(|value| usize::try_from(value).ok()).ok_or("invalid route search frontier row")?;
        if index >= nodes.len() { return Err("route search frontier references missing node".into()); }
        frontier_pages.entry(index / PAGE_ROWS).or_default().push(row.clone());
    }
    for (index, page) in frontier_pages { put(&mut records, format!("{PREFIX}{id}.frontier.{index:04}"), &Value::Array(page))?; }
    put(&mut records, format!("{PREFIX}{id}.head"), &json!({"request":request,"nodeCount":nodes.len(),"frontierCount":frontier.len()}))?;
    Ok(records)
}

pub(crate) fn extract(root: &mut Value) -> Result<Records, String> {
    let entries = root.pointer_mut("/planner/routeSearches/entries").and_then(Value::as_object_mut).ok_or("missing route search bank")?;
    let mut records = Records::new();
    for (id, request) in std::mem::take(entries) { records.extend(encode(&id, request)?); }
    Ok(records)
}

pub(crate) fn restore(root: &mut Value, records: &Records) -> Result<(), String> {
    let entries = root.pointer_mut("/planner/routeSearches/entries").and_then(Value::as_object_mut).ok_or("missing route search bank")?;
    if !entries.is_empty() { return Err("state root contains inline route searches".into()); }
    let mut groups: BTreeMap<&str, BTreeMap<&str, Value>> = BTreeMap::new();
    for (key, bytes) in records {
        let Some(suffix) = key.strip_prefix(PREFIX) else { continue; };
        if !valid_suffix(suffix) { return Err("invalid route search record key".into()); }
        let (id, part) = suffix.split_once('.').unwrap();
        groups.entry(id).or_default().insert(part, serde_json::from_slice(bytes).map_err(|error| error.to_string())?);
    }
    for (id, mut pages) in groups {
        let mut head = pages.remove("head").ok_or("missing route search head")?;
        let node_count = head.get("nodeCount").and_then(Value::as_u64).and_then(|value| usize::try_from(value).ok()).ok_or("invalid route search node count")?;
        let frontier_count = head.get("frontierCount").and_then(Value::as_u64).and_then(|value| usize::try_from(value).ok()).ok_or("invalid route search frontier count")?;
        if node_count == 0 || node_count > MAX_NODES || frontier_count > MAX_NODES { return Err("route search count exceeds bound".into()); }
        let mut nodes = Vec::with_capacity(node_count);
        for index in 0..node_count.div_ceil(PAGE_ROWS) {
            let page = pages.remove(format!("nodes.{index:04}").as_str()).ok_or("missing route search node page")?;
            let page = page.as_array().ok_or("invalid route search node page")?;
            if page.len() != PAGE_ROWS.min(node_count - index * PAGE_ROWS) { return Err("invalid route search node page length".into()); }
            nodes.extend(page.iter().cloned());
        }
        let mut frontier = Vec::with_capacity(frontier_count);
        for (part, page) in pages {
            let suffix = part.strip_prefix("frontier.").ok_or("unexpected route search page")?;
            let index = suffix.parse::<usize>().map_err(|_| "invalid frontier page index")?;
            let rows = page.as_array().ok_or("invalid frontier page")?;
            if rows.is_empty() || rows.iter().any(|row| row.get(2).and_then(Value::as_u64).is_none_or(|node| node >= node_count as u64 || node / PAGE_ROWS as u64 != index as u64)) { return Err("frontier page identity mismatch".into()); }
            frontier.extend(rows.iter().cloned());
        }
        if frontier.len() != frontier_count { return Err("route search frontier count mismatch".into()); }
        let key = |row: &Value| -> Result<(u64, u64, u64), String> {
            let row = row.as_array().filter(|row| row.len() == 3).ok_or("invalid frontier row")?;
            Ok((row[0].as_u64().ok_or("invalid frontier cost")?, row[1].as_u64().ok_or("invalid frontier cost")?, row[2].as_u64().ok_or("invalid frontier identity")?))
        };
        let mut ordered = frontier.into_iter().map(|row| key(&row).map(|key| (key, row))).collect::<Result<Vec<_>, _>>()?;
        ordered.sort_by_key(|(key, _)| *key);
        if ordered.windows(2).any(|pair| pair[0].0 == pair[1].0) { return Err("duplicate frontier row".into()); }
        let request = head.get_mut("request").ok_or("missing route search request")?;
        for (pointer, value) in [("/search/nodes", nodes), ("/search/frontier", ordered.into_iter().map(|(_, row)| row).collect())] {
            let slot = request.pointer_mut(pointer).and_then(Value::as_array_mut).ok_or("missing route search page field")?;
            if !slot.is_empty() { return Err("route search head contains inline pages".into()); }
            *slot = value;
        }
        entries.insert(id.into(), request.take());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Value {
        json!({"actor":"worker","search":{"nodes":(0..600).map(|i| json!([[i,0,0],i,if i == 0 { None } else { Some(i-1) }])).collect::<Vec<_>>(),"frontier":[[1,1,0],[2,2,300],[3,3,599]]}})
    }
    fn root() -> Value { json!({"planner":{"routeSearches":{"entries":{}}}}) }
    #[test]
    fn pages_roundtrip_and_local_edits_preserve_other_pages() {
        let id = "a".repeat(64);
        let value = request();
        let before = encode(&id, value.clone()).unwrap();
        let mut restored = root();
        restore(&mut restored, &before).unwrap();
        assert_eq!(restored["planner"]["routeSearches"]["entries"][&id], value);
        let mut edited = value;
        edited["search"]["nodes"][0][1] = json!(999999);
        edited["search"]["frontier"].as_array_mut().unwrap().remove(0);
        let after = encode(&id, edited).unwrap();
        for suffix in ["nodes.0001", "nodes.0002", "frontier.0001", "frontier.0002"] {
            let key = format!("{PREFIX}{id}.{suffix}");
            assert_eq!(before[&key], after[&key], "{suffix}");
        }
        assert!(!after.contains_key(&format!("{PREFIX}{id}.frontier.0000")));
    }
    #[test]
    fn incomplete_or_misbound_pages_are_rejected() {
        let id = "a".repeat(64);
        let before = encode(&id, request()).unwrap();
        let mut broken = before.clone();
        broken.remove(&format!("{PREFIX}{id}.nodes.0001"));
        assert!(restore(&mut root(), &broken).is_err());
        let mut broken = before.clone();
        broken.insert(format!("{PREFIX}{id}.frontier.0000"), serde_json::to_vec(&json!([[1,1,300]])).unwrap());
        assert!(restore(&mut root(), &broken).is_err());
        let mut broken = before;
        let key = format!("{PREFIX}{id}.head");
        let mut head: Value = serde_json::from_slice(&broken[&key]).unwrap();
        head["nodeCount"] = json!(4294967896u64);
        broken.insert(key, serde_json::to_vec(&head).unwrap());
        assert!(restore(&mut root(), &broken).is_err());
    }
}
