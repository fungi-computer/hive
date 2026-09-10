use hive_kernel::Kernel;
use serde_json::{json, Value};

fn scene(initial: Value, components: Value) -> String {
    serde_json::to_string(&json!({
        "format":"hive-game", "version":1, "game":"test.game",
        "components":components, "initial":initial
    })).unwrap()
}
fn builtins(id: &str, position: [f64; 3], extra: Value) -> Value {
    let mut components = serde_json::Map::new();
    components.insert("hive.position".into(), json!({"x":position[0],"y":position[1],"z":position[2],"facing":0.0}));
    components.extend(extra.as_object().unwrap().clone());
    json!({"id":id,"components":components})
}
fn custom_morale() -> Value { json!([{"id":"army.morale","version":1,"fields":{"value":"number","formation":"nullable-entity"}}]) }
fn snapshot(kernel: &Kernel) -> Value { serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap() }

#[test]
fn dynamic_component_join_write_and_restore() {
    let mut kernel = Kernel::new();
    kernel.load(&scene(json!([
        builtins("unit-a", [0.0,0.0,0.0], json!({"army.morale":{"value":40.0,"formation":null}})),
        builtins("unit-b", [1.0,0.0,0.0], json!({}))
    ]), custom_morale())).unwrap();
    let rows: Value = serde_json::from_str(&kernel.query_json(r#"["army.morale"]"#).unwrap()).unwrap();
    assert_eq!(rows.as_array().unwrap().len(), 1);
    kernel.advance_json(r#"{"delta":0,"writes":[{"entity":"unit-a","component":"army.morale","value":{"value":75.5,"formation":null}}],"actions":[]}"#).unwrap();
    let saved = kernel.snapshot_json().unwrap(); kernel.restore_json(&saved).unwrap();
    let rows: Value = serde_json::from_str(&kernel.query_json(r#"["army.morale"]"#).unwrap()).unwrap();
    assert_eq!(rows[0]["components"]["army.morale"]["value"], 75.5);
}

#[test]
fn invalid_batch_and_reserved_write_leave_snapshot_unchanged() {
    let mut kernel = Kernel::new(); kernel.load(&scene(json!([builtins("unit", [0.0,0.0,0.0], json!({}))]), json!([]))).unwrap();
    let before = snapshot(&kernel);
    assert!(kernel.advance_json(r#"{"delta":0,"writes":[{"entity":"unit","component":"hive.position","value":{"x":9,"y":0,"z":0,"facing":0}}],"actions":[]}"#).is_err());
    assert_eq!(snapshot(&kernel), before);
    assert!(kernel.advance_json(r#"{"delta":0,"writes":[{"entity":"unit","component":"missing.component","value":{}}],"actions":[]}"#).is_err());
    assert_eq!(snapshot(&kernel), before);
}

fn material_scene(far: bool) -> String {
    let destination = if far { [10.0,0.0,0.0] } else { [1.0,0.0,0.0] };
    scene(json!([
        builtins("source", [0.0,0.0,0.0], json!({"hive.container":{"capacity":10}})),
        builtins("destination", destination, json!({"hive.container":{"capacity":10}})),
        {"id":"food-lot","components":{"hive.lot":{"kind":"food","quantity":5,"container":"source"}}}
    ]), json!([]))
}

#[test]
fn partial_transfer_conserves_quantity_and_keeps_moved_lot_id() {
    let mut kernel = Kernel::new(); kernel.load(&material_scene(false)).unwrap();
    let result: Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"food-lot","from":"source","to":"destination","quantity":2}]}"#).unwrap()).unwrap();
    assert_eq!(result["results"][0]["accepted"], true);
    let snap = snapshot(&kernel); let rows = snap["scene"]["initial"].as_array().unwrap();
    let lots: Vec<_> = rows.iter().filter_map(|row| row["components"]["hive.lot"].as_object()).collect();
    assert_eq!(lots.len(), 2);
    assert!(lots.iter().any(|lot| lot["container"] == "destination" && lot["quantity"] == 2));
    assert!(lots.iter().any(|lot| lot["container"] == "source" && lot["quantity"] == 3));
    assert_eq!(lots.iter().map(|lot| lot["quantity"].as_u64().unwrap()).sum::<u64>(), 5);
}

#[test]
fn consume_then_snapshot_restore_preserves_exhausted_lot() {
    let mut kernel = Kernel::new(); kernel.load(&material_scene(false)).unwrap();
    kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"food-lot","quantity":5}]}"#).unwrap();
    let saved = kernel.snapshot_json().unwrap(); kernel.restore_json(&saved).unwrap();
    let snap = snapshot(&kernel); let lot = snap["scene"]["initial"].as_array().unwrap().iter().find(|row| row["id"] == "food-lot").unwrap();
    assert_eq!(lot["components"]["hive.lot"]["quantity"], 0);
}

#[test]
fn out_of_reach_transfer_is_rejected_without_change() {
    let mut kernel = Kernel::new(); kernel.load(&material_scene(true)).unwrap(); let before = snapshot(&kernel);
    let result: Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"food-lot","from":"source","to":"destination","quantity":1}]}"#).unwrap()).unwrap();
    assert_eq!(result["results"][0]["accepted"], false); assert_eq!(snapshot(&kernel), before);
}

#[test]
fn movement_advances_over_time_and_routes_around_obstacle() {
    let mut kernel = Kernel::new(); kernel.load(&scene(json!([
        builtins("walker", [0.0,0.0,0.0], json!({"hive.body":{"speed":1.0}})),
        builtins("rock", [1.0,0.0,0.0], json!({"hive.obstacle":{"occupied":true}}))
    ]), json!([]))).unwrap();
    kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":{"x":2,"y":0,"z":0}}]}"#).unwrap();
    let first = snapshot(&kernel)["scene"]["initial"].as_array().unwrap().iter().find(|e|e["id"]=="walker").unwrap()["components"]["hive.position"]["x"].as_f64().unwrap();
    assert_eq!(first, 0.0);
    kernel.advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#).unwrap();
    let second = snapshot(&kernel)["scene"]["initial"].as_array().unwrap().iter().find(|e|e["id"]=="walker").unwrap()["components"]["hive.position"]["x"].as_f64().unwrap();
    assert!(second < 2.0);
}

#[test]
fn malformed_restore_keeps_old_world() {
    let mut kernel = Kernel::new(); kernel.load(&scene(json!([builtins("unit", [0.0,0.0,0.0], json!({}))]), json!([]))).unwrap(); let before = snapshot(&kernel);
    assert!(kernel.restore_json(r#"{"format":"hive-kernel","version":1,"revision":0,"time":0,"next_lot":1,"scene":{"format":"hive-game","version":1,"game":"test.game","components":[],"initial":[{"id":"unit","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.body":{"speed":-1}}}]}}"#).is_err());
    assert_eq!(snapshot(&kernel), before);
}
