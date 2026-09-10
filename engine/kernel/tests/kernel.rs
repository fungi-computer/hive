use hive_kernel::Kernel;
use serde_json::{Value, json};

fn scene(initial: Value, components: Value) -> String {
    serde_json::to_string(&json!({
        "format":"hive-game", "version":1, "game":"test.game",
        "components":components, "initial":initial
    }))
    .unwrap()
}
fn builtins(id: &str, position: [f64; 3], extra: Value) -> Value {
    let mut components = serde_json::Map::new();
    components.insert(
        "hive.position".into(),
        json!({"x":position[0],"y":position[1],"z":position[2],"facing":0.0}),
    );
    components.extend(extra.as_object().unwrap().clone());
    json!({"id":id,"components":components})
}
fn moving_deck_scene() -> String {
    scene(
        json!([
            builtins(
                "ship",
                [10.0, 0.0, 20.0],
                json!({
                    "hive.body":{"speed":4.0},
                    "hive.surface":{"min_x":-3.0,"max_x":3.0,"min_z":-2.0,"max_z":2.0,"height":1.0}
                })
            ),
            builtins(
                "crew",
                [1.0, 1.0, 0.0],
                json!({
                    "hive.body":{"speed":1.0},
                    "hive.support":{"entity":"ship"}
                })
            ),
            builtins(
                "deck-rock",
                [0.0, 1.0, 0.0],
                json!({
                    "hive.obstacle":{"occupied":true},
                    "hive.support":{"entity":"ship"}
                })
            )
        ]),
        json!([]),
    )
}
fn custom_morale() -> Value {
    json!([{"id":"army.morale","version":1,"fields":{"value":"number","formation":"nullable-entity"}}])
}
fn cargo_scene() -> String {
    let mut root: Value = serde_json::from_str(&moving_deck_scene()).unwrap();
    let initial = root["initial"].as_array_mut().unwrap();
    initial
        .iter_mut()
        .find(|row| row["id"] == "crew")
        .unwrap()["components"]["hive.container"] = json!({"capacity":2});
    initial.push(builtins(
        "chest",
        [2.0, 1.0, 0.0],
        json!({
            "hive.container":{"capacity":2},
            "hive.support":{"entity":"ship"}
        }),
    ));
    initial.push(json!({
        "id":"cargo-lot",
        "components":{"hive.lot":{"kind":"bread","quantity":1,"container":"crew"}}
    }));
    serde_json::to_string(&root).unwrap()
}
fn snapshot(kernel: &Kernel) -> Value {
    serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap()
}

#[test]
fn fractional_snapshot_restore_preserves_float_bits() {
    let mut kernel = Kernel::new();
    kernel
        .load(&scene(
            json!([builtins(
                "fractional",
                [0.12345678901234567, 0.39600000000000013, -0.9876543210987654],
                json!({}),
            )]),
            json!([]),
        ))
        .unwrap();
    kernel
        .advance_json(r#"{"delta":0.198,"writes":[],"actions":[]}"#)
        .unwrap();
    kernel
        .advance_json(r#"{"delta":0.198,"writes":[],"actions":[]}"#)
        .unwrap();
    let before = kernel.snapshot_json().unwrap();
    let before_value: Value = serde_json::from_str(&before).unwrap();
    let before_scene = &before_value["scene"]["initial"][0]["components"]["hive.position"];
    let before_time = before_value["time"].as_f64().unwrap();
    kernel.restore_json(&before).unwrap();
    let after_wire = kernel.snapshot_json().unwrap();
    assert_eq!(after_wire, before, "snapshot bytes changed during restore");
    let after: Value = serde_json::from_str(&after_wire).unwrap();
    let after_scene = &after["scene"]["initial"][0]["components"]["hive.position"];
    assert_eq!(after["time"].as_f64().unwrap().to_bits(), before_time.to_bits());
    for field in ["x", "y", "z", "facing"] {
        assert_eq!(after_scene[field].as_f64().unwrap().to_bits(), before_scene[field].as_f64().unwrap().to_bits(), "position field {field}");
    }
}

#[test]
fn dynamic_component_join_write_and_restore() {
    let mut kernel = Kernel::new();
    kernel
        .load(&scene(
            json!([
                builtins(
                    "unit-a",
                    [0.0, 0.0, 0.0],
                    json!({"army.morale":{"value":40.0,"formation":null}})
                ),
                builtins("unit-b", [1.0, 0.0, 0.0], json!({}))
            ]),
            custom_morale(),
        ))
        .unwrap();
    let rows: Value =
        serde_json::from_str(&kernel.query_json(r#"["army.morale"]"#).unwrap()).unwrap();
    assert_eq!(rows.as_array().unwrap().len(), 1);
    kernel.advance_json(r#"{"delta":0,"writes":[{"entity":"unit-a","component":"army.morale","value":{"value":75.5,"formation":null}}],"actions":[]}"#).unwrap();
    let saved = kernel.snapshot_json().unwrap();
    kernel.restore_json(&saved).unwrap();
    let rows: Value =
        serde_json::from_str(&kernel.query_json(r#"["army.morale"]"#).unwrap()).unwrap();
    assert_eq!(rows[0]["components"]["army.morale"]["value"], 75.5);
}

#[test]
fn invalid_batch_and_reserved_write_leave_snapshot_unchanged() {
    let mut kernel = Kernel::new();
    kernel
        .load(&scene(
            json!([builtins("unit", [0.0, 0.0, 0.0], json!({}))]),
            json!([]),
        ))
        .unwrap();
    let before = snapshot(&kernel);
    assert!(kernel.advance_json(r#"{"delta":0,"writes":[{"entity":"unit","component":"hive.position","value":{"x":9,"y":0,"z":0,"facing":0}}],"actions":[]}"#).is_err());
    assert_eq!(snapshot(&kernel), before);
    assert!(kernel.advance_json(r#"{"delta":0,"writes":[{"entity":"unit","component":"missing.component","value":{}}],"actions":[]}"#).is_err());
    assert_eq!(snapshot(&kernel), before);
}

fn material_scene(far: bool) -> String {
    let destination = if far {
        [10.0, 0.0, 0.0]
    } else {
        [1.0, 0.0, 0.0]
    };
    scene(
        json!([
            builtins("source", [0.0,0.0,0.0], json!({"hive.container":{"capacity":10}})),
            builtins("destination", destination, json!({"hive.container":{"capacity":10}})),
            {"id":"food-lot","components":{"hive.lot":{"kind":"food","quantity":5,"container":"source"}}}
        ]),
        json!([]),
    )
}

#[test]
fn partial_transfer_conserves_quantity_and_keeps_moved_lot_id() {
    let mut kernel = Kernel::new();
    kernel.load(&material_scene(false)).unwrap();
    let result: Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"food-lot","from":"source","to":"destination","quantity":2}]}"#).unwrap()).unwrap();
    assert_eq!(result["results"][0]["accepted"], true);
    let snap = snapshot(&kernel);
    let rows = snap["scene"]["initial"].as_array().unwrap();
    let lots: Vec<_> = rows
        .iter()
        .filter_map(|row| row["components"]["hive.lot"].as_object())
        .collect();
    assert_eq!(lots.len(), 2);
    assert!(
        lots.iter()
            .any(|lot| lot["container"] == "destination" && lot["quantity"] == 2)
    );
    assert!(
        lots.iter()
            .any(|lot| lot["container"] == "source" && lot["quantity"] == 3)
    );
    assert_eq!(
        lots.iter()
            .map(|lot| lot["quantity"].as_u64().unwrap())
            .sum::<u64>(),
        5
    );
}

#[test]
fn consume_then_snapshot_restore_preserves_exhausted_lot() {
    let mut kernel = Kernel::new();
    kernel.load(&material_scene(false)).unwrap();
    kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"consume","entity":"source","lot":"food-lot","quantity":5}]}"#).unwrap();
    let saved = kernel.snapshot_json().unwrap();
    kernel.restore_json(&saved).unwrap();
    let snap = snapshot(&kernel);
    let lot = snap["scene"]["initial"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == "food-lot")
        .unwrap();
    assert_eq!(lot["components"]["hive.lot"]["quantity"], 0);
}

#[test]
fn out_of_reach_transfer_is_rejected_without_change() {
    let mut kernel = Kernel::new();
    kernel.load(&material_scene(true)).unwrap();
    let before = snapshot(&kernel);
    let result: Value = serde_json::from_str(&kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"food-lot","from":"source","to":"destination","quantity":1}]}"#).unwrap()).unwrap();
    assert_eq!(result["results"][0]["accepted"], false);
    assert_eq!(snapshot(&kernel)["scene"], before["scene"]);
    assert_eq!(snapshot(&kernel)["time"], before["time"]);
}

#[test]
fn movement_advances_over_time_and_routes_around_obstacle() {
    let mut kernel = Kernel::new();
    kernel
        .load(&scene(
            json!([
                builtins(
                    "walker",
                    [0.0, 0.0, 0.0],
                    json!({"hive.body":{"speed":1.0}})
                ),
                builtins(
                    "rock",
                    [1.0, 0.0, 0.0],
                    json!({"hive.obstacle":{"occupied":true}})
                )
            ]),
            json!([]),
        ))
        .unwrap();
    kernel.advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"walker","destination":{"x":2,"y":0,"z":0,"frame":null}}]}"#).unwrap();
    let first = snapshot(&kernel)["scene"]["initial"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == "walker")
        .unwrap()["components"]["hive.position"]["x"]
        .as_f64()
        .unwrap();
    assert_eq!(first, 0.0);
    kernel
        .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
        .unwrap();
    let second = snapshot(&kernel)["scene"]["initial"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == "walker")
        .unwrap()["components"]["hive.position"]["x"]
        .as_f64()
        .unwrap();
    assert!(second < 2.0);
    for _ in 0..5 {
        kernel
            .advance_json(r#"{"delta":1,"writes":[],"actions":[]}"#)
            .unwrap();
        let rows: Value = serde_json::from_str(
            &kernel
                .query_json(r#"["hive.position","hive.body"]"#)
                .unwrap(),
        )
        .unwrap();
        let p = &rows[0]["components"]["hive.position"];
        assert!(!(p["x"] == 1.0 && p["z"] == 0.0));
    }
    let rows: Value = serde_json::from_str(
        &kernel
            .query_json(r#"["hive.position","hive.body"]"#)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(rows[0]["components"]["hive.position"]["x"], 2.0);
    assert_eq!(rows[0]["components"]["hive.position"]["z"], 0.0);
}

#[test]
fn supported_world_pose_follows_parent_without_changing_local_pose() {
    let mut kernel = Kernel::new();
    kernel.load(&moving_deck_scene()).unwrap();
    let before: Value = serde_json::from_str(&kernel.world_pose_json(r#"["crew"]"#).unwrap()).unwrap();
    assert_eq!(before[0]["world"]["x"], 11.0);
    kernel
        .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"ship","destination":{"x":12,"y":0,"z":20,"frame":null}}]}"#)
        .unwrap();
    kernel.advance_json(r#"{"delta":0.5,"writes":[],"actions":[]}"#).unwrap();
    let after: Value = serde_json::from_str(&kernel.world_pose_json(r#"["crew"]"#).unwrap()).unwrap();
    assert_eq!(after[0]["local"]["x"], 1.0);
    assert!(after[0]["world"]["x"].as_f64().unwrap() > 11.0);
    kernel
        .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"ship","destination":{"x":12,"y":0,"z":20,"frame":null},"facing":1}]}"#)
        .unwrap();
    let rotated: Value = serde_json::from_str(&kernel.world_pose_json(r#"["crew"]"#).unwrap()).unwrap();
    assert_eq!(rotated[0]["world"]["z"], 21.0);
}

#[test]
fn supported_move_requires_frame_and_stays_on_surface() {
    let mut kernel = Kernel::new();
    kernel.load(&moving_deck_scene()).unwrap();
    let result: Value = serde_json::from_str(
        &kernel
            .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"crew","destination":{"x":2,"y":1,"z":0,"frame":"ship"}}]}"#)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(result["results"][0]["accepted"], true);
    let result: Value = serde_json::from_str(
        &kernel
            .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"crew","destination":{"x":2,"y":1,"z":0,"frame":null}}]}"#)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(result["results"][0]["accepted"], false);
    kernel.advance_json(r#"{"delta":0.5,"writes":[],"actions":[]}"#).unwrap();
    let moved: Value = serde_json::from_str(&kernel.query_json(r#"["hive.position"]"#).unwrap()).unwrap();
    let crew = moved
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == "crew")
        .unwrap();
    assert!(crew["components"]["hive.position"]["x"].as_f64().unwrap() > 1.0);
    let result: Value = serde_json::from_str(
        &kernel
            .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"crew","destination":{"x":4,"y":1,"z":0,"frame":"ship"}}]}"#)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(result["results"][0]["accepted"], false);
}

#[test]
fn supported_crew_routes_around_deck_obstacle_while_ship_moves() {
    let mut kernel = Kernel::new();
    kernel.load(&moving_deck_scene()).unwrap();
    let accepted: Value = serde_json::from_str(
        &kernel
            .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"crew","destination":{"x":-1,"y":1,"z":0,"frame":"ship"}},{"kind":"move","entity":"ship","destination":{"x":12,"y":0,"z":20,"frame":null}}]}"#)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(accepted["results"][0]["accepted"], true);
    assert_eq!(accepted["results"][1]["accepted"], true);
    for _ in 0..8 {
        kernel.advance_json(r#"{"delta":0.25,"writes":[],"actions":[]}"#).unwrap();
    }
    let local: Value = serde_json::from_str(&kernel.query_json(r#"["hive.position"]"#).unwrap()).unwrap();
    let crew = local
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == "crew")
        .unwrap();
    assert!(!(crew["components"]["hive.position"]["x"] == 0.0
        && crew["components"]["hive.position"]["z"] == 0.0));
    let world: Value = serde_json::from_str(&kernel.world_pose_json(r#"["crew"]"#).unwrap()).unwrap();
    assert!(world[0]["world"]["x"].as_f64().unwrap() > 10.0);
}

#[test]
fn resolved_contact_and_midvoyage_cargo_restore_are_deterministic() {
    let mut kernel = Kernel::new();
    kernel.load(&cargo_scene()).unwrap();
    let transfer: Value = serde_json::from_str(
        &kernel
            .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"transfer","lot":"cargo-lot","from":"crew","to":"chest","quantity":1}]}"#)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(transfer["results"][0]["accepted"], true);
    kernel = Kernel::new();
    kernel.load(&cargo_scene()).unwrap();
    kernel
        .advance_json(r#"{"delta":0,"writes":[],"actions":[{"kind":"move","entity":"crew","destination":{"x":-1,"y":1,"z":0,"frame":"ship"}},{"kind":"move","entity":"ship","destination":{"x":13,"y":0,"z":20,"frame":null}}]}"#)
        .unwrap();
    kernel.advance_json(r#"{"delta":0.5,"writes":[],"actions":[]}"#).unwrap();
    let saved = kernel.snapshot_json().unwrap();
    let mut restored = Kernel::new();
    restored.restore_json(&saved).unwrap();
    for _ in 0..5 {
        kernel.advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#).unwrap();
        restored.advance_json(r#"{"delta":0.2,"writes":[],"actions":[]}"#).unwrap();
    }
    assert_eq!(kernel.snapshot_json().unwrap(), restored.snapshot_json().unwrap());
}

#[test]
fn invalid_support_graph_is_rejected_atomically() {
    let mut kernel = Kernel::new();
    kernel.load(&moving_deck_scene()).unwrap();
    let before = kernel.snapshot_json().unwrap();
    let missing = scene(
        json!([builtins(
            "crew",
            [0.0, 1.0, 0.0],
            json!({"hive.support":{"entity":"missing"}})
        )]),
        json!([]),
    );
    assert!(kernel.load(&missing).is_err());
    assert_eq!(kernel.snapshot_json().unwrap(), before);

    let cycle = scene(
        json!([
            builtins(
                "a",
                [0.0, 0.0, 0.0],
                json!({
                    "hive.surface":{"min_x":-1.0,"max_x":1.0,"min_z":-1.0,"max_z":1.0,"height":0.0},
                    "hive.support":{"entity":"b"}
                })
            ),
            builtins(
                "b",
                [0.0, 0.0, 0.0],
                json!({
                    "hive.surface":{"min_x":-1.0,"max_x":1.0,"min_z":-1.0,"max_z":1.0,"height":0.0},
                    "hive.support":{"entity":"a"}
                })
            )
        ]),
        json!([]),
    );
    assert!(kernel.load(&cycle).is_err());
    assert_eq!(kernel.snapshot_json().unwrap(), before);
}

#[test]
fn support_chain_allows_sixteen_links_and_rejects_seventeen() {
    let mut entities = vec![builtins(
        "root",
        [0.0, 0.0, 0.0],
        json!({"hive.surface":{"min_x":-1.0,"max_x":1.0,"min_z":-1.0,"max_z":1.0,"height":0.0}}),
    )];
    for index in 1..=16 {
        let id = format!("node-{index}");
        let parent = if index == 1 { "root".to_string() } else { format!("node-{}", index - 1) };
        entities.push(builtins(
            &id,
            [0.0, 0.0, 0.0],
            json!({
                "hive.surface":{"min_x":-1.0,"max_x":1.0,"min_z":-1.0,"max_z":1.0,"height":0.0},
                "hive.support":{"entity":parent}
            }),
        ));
    }
    let mut kernel = Kernel::new();
    kernel.load(&scene(Value::Array(entities.clone()), json!([]))).unwrap();
    entities.push(builtins(
        "node-17",
        [0.0, 0.0, 0.0],
        json!({
            "hive.surface":{"min_x":-1.0,"max_x":1.0,"min_z":-1.0,"max_z":1.0,"height":0.0},
            "hive.support":{"entity":"node-16"}
        }),
    ));
    assert!(kernel.load(&scene(Value::Array(entities), json!([]))).is_err());
}

#[test]
fn malformed_restore_keeps_old_world() {
    let mut kernel = Kernel::new();
    kernel
        .load(&scene(
            json!([builtins("unit", [0.0, 0.0, 0.0], json!({}))]),
            json!([]),
        ))
        .unwrap();
    let before = snapshot(&kernel);
    assert!(kernel.restore_json(r#"{"format":"hive-kernel","version":1,"revision":0,"time":0,"next_lot":1,"scene":{"format":"hive-game","version":1,"game":"test.game","components":[],"initial":[{"id":"unit","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.body":{"speed":-1}}}]}}"#).is_err());
    assert_eq!(snapshot(&kernel), before);
}
