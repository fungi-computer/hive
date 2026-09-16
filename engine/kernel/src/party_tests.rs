use super::*;
use serde_json::{json, Value};

fn scene(game: &str) -> Value {
    json!({
        "format":"hive-game","version":3,"game":game,
        "components":[],"materialCatalog":[{"kind":"wood","unitVolume":1}],"initial":[],
        "actors":[
            {"id":"test.party","version":1,"parameters":[{"name":"owner","type":"string"}],"components":[{"component":"hive.party","fields":{"ownerPlayer":{"kind":"parameter","parameter":"owner"}}}]},
            {"id":"test.person","version":1,"parameters":[{"name":"x","type":"number"},{"name":"party","type":"actor-reference"}],"components":[
                {"component":"hive.position","fields":{"x":{"kind":"parameter","parameter":"x"},"y":{"kind":"value","value":0},"z":{"kind":"value","value":0},"facing":{"kind":"value","value":0}}},
                {"component":"hive.party-member","fields":{"party":{"kind":"parameter","parameter":"party"}}}
            ]},
            {"id":"test.store","version":1,"parameters":[{"name":"x","type":"number"},{"name":"party","type":"actor-reference"}],"components":[
                {"component":"hive.position","fields":{"x":{"kind":"parameter","parameter":"x"},"y":{"kind":"value","value":0},"z":{"kind":"value","value":2},"facing":{"kind":"value","value":0}}},
                {"component":"hive.container","fields":{"capacity":{"kind":"value","value":8}}},
                {"component":"hive.owned-by-party","fields":{"party":{"kind":"parameter","parameter":"party"}}}
            ]}
        ]
    })
}
fn plan(sequence: u64) -> Value {
    let x = (sequence - 1) as f64 * 8.0;
    json!({
        "partySlot":"party","peopleSlots":["person.0","person.1"],
        "actors":[
            {"slot":"party","definition":"test.party","arguments":{"owner":{"kind":"joining-player"}}},
            {"slot":"person.0","definition":"test.person","arguments":{"x":{"kind":"value","value":x},"party":{"kind":"spawned","slot":"party"}}},
            {"slot":"person.1","definition":"test.person","arguments":{"x":{"kind":"value","value":x+2.0},"party":{"kind":"spawned","slot":"party"}}},
            {"slot":"store","definition":"test.store","arguments":{"x":{"kind":"value","value":x+4.0},"party":{"kind":"spawned","slot":"party"}}}
        ],
        "initialMaterials":[{"container":{"kind":"spawned","slot":"store"},"kind":"wood","quantity":8}]
    })
}
fn request(binding: &str, sequence: u64, plan: Value) -> Value {
    json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"instantiate-actors","bindingId":binding,"expectedSequence":sequence,"plan":plan}}]})
}
fn accepted(kernel: &mut Kernel, input: Value) -> bool {
    kernel.advance_json(&input.to_string()).ok().and_then(|output| serde_json::from_str::<Value>(&output).ok()).is_some_and(|value| value["results"][0]["accepted"] == true)
}
fn party_batch(party: &str, request: Value) -> Value {
    json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"party","player":party.replace("party", "player"),"party":party},"request":request}]})
}

#[test]
fn party_sequence_exhaustion_is_atomic_before_spawn() {
    let max = u64::MAX;
    let mut kernel = Kernel::new();
    kernel.load(&scene("party-max").to_string()).unwrap();
    let saved = kernel.snapshot_json().unwrap().replace("\"next_party_sequence\":1", &format!("\"next_party_sequence\":{max}"));
    kernel.restore_json(&saved).unwrap();
    let before = kernel.save_records().unwrap().entities;
    assert!(!accepted(&mut kernel, request("bind:max", max, plan(max))));
    assert_eq!(kernel.save_records().unwrap().entities, before);
}

#[test]
fn party_join_identity_is_native_and_replay_stable() {
    let mut kernel = Kernel::new();
    kernel.load(&scene("party-query").to_string()).unwrap();
    let available: Value = serde_json::from_str(&kernel.party_join_identity_json("\"binding:a\"").unwrap()).unwrap();
    assert_eq!((available["status"].as_str(), available["sequence"].as_u64(), available["player"].as_str(), available["party"].as_str()), (Some("available"), Some(1), Some("player:1"), Some("party:1")));
    assert!(accepted(&mut kernel, request("binding:a", 1, plan(1))));
    let existing: Value = serde_json::from_str(&kernel.party_join_identity_json("\"binding:a\"").unwrap()).unwrap();
    assert_eq!(existing["people"], json!(["party:1.person.0", "party:1.person.1"]));
    assert!(accepted(&mut kernel, request("binding:a", 1, plan(1))));
    let mut saved: Value = serde_json::from_str(&kernel.snapshot_json().unwrap()).unwrap();
    saved["scene"]["initial"].as_array_mut().unwrap().retain(|record| !record["id"].as_str().is_some_and(|id| id.starts_with("party:1")) && !record["id"].as_str().is_some_and(|id| id.starts_with("lot.")));
    let mut without_live_party = Kernel::new();
    without_live_party.restore_json(&saved.to_string()).unwrap();
    let reconnect: Value = serde_json::from_str(&without_live_party.party_join_identity_json("\"binding:a\"").unwrap()).unwrap();
    assert_eq!(reconnect["people"], existing["people"]);
    assert!(accepted(&mut kernel, request("binding:b", 2, plan(2))));
    let second: Value = serde_json::from_str(&kernel.party_join_identity_json("\"binding:b\"").unwrap()).unwrap();
    assert_eq!(second["people"], json!(["party:2.person.0", "party:2.person.1"]));
}

#[test]
fn prepared_party_replay_and_mismatches_are_atomic() {
    let mut kernel = Kernel::new();
    kernel.load(&scene("party").to_string()).unwrap();
    assert!(accepted(&mut kernel, request("bind:1", 1, plan(1))));
    assert_eq!(kernel.ecs.query::<&PartyMember>().iter(&kernel.ecs).count(), 2);
    let count = kernel.known.len();
    let saved = kernel.save_records().unwrap();
    let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
    assert!(accepted(&mut restored, request("bind:1", 1, plan(1))));
    assert_eq!(restored.known.len(), count);
    let mut changed = plan(1); changed["actors"][2]["arguments"]["x"]["value"] = json!(3.0);
    for input in [request("bind:1", 1, changed), request("bind:2", 1, plan(1))] {
        let before = restored.save_records().unwrap().entities;
        assert!(!accepted(&mut restored, input));
        assert_eq!(restored.known.len(), count);
        assert_eq!(restored.save_records().unwrap().entities, before);
    }
}

#[test]
fn invalid_starter_material_rolls_back_actors_lots_and_sequence() {
    let mut kernel = Kernel::new();
    kernel.load(&scene("party-invalid-material").to_string()).unwrap();
    let before = kernel.save_records().unwrap().entities;
    let mut invalid = plan(1);
    invalid["initialMaterials"][0]["kind"] = json!("missing-kind");
    assert!(!accepted(&mut kernel, request("bind:bad", 1, invalid)));
    assert_eq!(kernel.save_records().unwrap().entities, before);
    assert!(kernel.known.iter().all(|id| !id.starts_with("party:1") && !id.starts_with("lot.")));
    let available: Value = serde_json::from_str(&kernel.party_join_identity_json("\"bind:next\"").unwrap()).unwrap();
    assert_eq!(available["sequence"], 1);
}

#[test]
fn scoped_authored_creation_attaches_party_ownership_atomically() {
    let mut kernel = Kernel::new();
    let mut definition = scene("party-create");
    definition["components"] = json!([{"id":"game.order","version":1,"fields":{"phase":"string"}}]);
    kernel.load(&definition.to_string()).unwrap();
    assert!(accepted(&mut kernel, request("bind:1", 1, plan(1))));
    let batch = json!({"delta":0,"writes":[],"creates":[{"scope":{"kind":"party","player":"player:1","party":"party:1"},"record":{"id":"order:1","components":{"game.order":{"phase":"queued"}}}}],"actions":[]});
    assert!(kernel.advance_json(&batch.to_string()).is_ok());
    let order = kernel.entity("order:1").unwrap();
    assert_eq!(kernel.ecs.get::<OwnedByParty>(order).unwrap().party, "party:1");
    let forged = json!({"delta":0,"writes":[],"creates":[{"scope":{"kind":"party","player":"player:1","party":"party:1"},"record":{"id":"order:2","components":{"hive.owned-by-party":{"party":"party:2"},"game.order":{"phase":"queued"}}}}],"actions":[]});
    assert!(kernel.advance_json(&forged.to_string()).is_err());
    assert!(kernel.entity("order:2").is_err());
    let forged_player = json!({"delta":0,"writes":[],"creates":[{"scope":{"kind":"party","player":"player:2","party":"party:1"},"record":{"id":"order:3","components":{"game.order":{"phase":"queued"}}}}],"actions":[]});
    assert!(kernel.advance_json(&forged_player.to_string()).is_err());
    assert!(kernel.entity("order:3").is_err());
}

#[test]
fn party_scope_rejects_foreign_worker_and_work_attempt_party_drift() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":3,"game":"party-scope","components":[],"materialCatalog":[],"initial":[
        {"id":"party:1","components":{"hive.party":{"ownerPlayer":"player:1"}}},
        {"id":"party:2","components":{"hive.party":{"ownerPlayer":"player:2"}}},
        {"id":"worker","components":{"hive.party-member":{"party":"party:1"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},
        {"id":"task","components":{"hive.owned-by-party":{"party":"party:1"}}}
    ]}).to_string()).unwrap();
    let foreign_move = party_batch("party:2", json!({"kind":"move","entity":"worker","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}));
    assert!(!accepted(&mut kernel, foreign_move));
    let drift = party_batch("party:2", json!({"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party:1","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}));
    assert!(kernel.advance_json(&drift.to_string()).is_err());
    let valid = party_batch("party:1", json!({"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party:1","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}));
    assert!(accepted(&mut kernel, valid));
}

#[test]
fn party_scope_requires_authenticated_owner_player() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":3,"game":"party-owner-scope","components":[],"materialCatalog":[],"initial":[
        {"id":"party:1","components":{"hive.party":{"ownerPlayer":"player:1"}}}
    ]}).to_string()).unwrap();
    let forged = json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"party","player":"player:2","party":"party:1"},"request":{"kind":"move","entity":"missing","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}]});
    let result: Value = serde_json::from_str(&kernel.advance_json(&forged.to_string()).unwrap()).unwrap();
    assert_eq!(result["results"][0]["accepted"], false);
}

#[test]
fn scoped_batch_rejects_malformed_scope_before_mutation() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":3,"game":"scope-parse","components":[],"materialCatalog":[],"initial":[]}).to_string()).unwrap();
    let malformed = json!({"delta":0,"writes":[],"actions":[{"scope":{"party":"party:1"},"request":{"kind":"move","entity":"missing","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}]});
    assert!(kernel.advance_json(&malformed.to_string()).is_err());
}

#[test]
fn scoped_authored_removal_enforces_party_and_preserves_physical_entities() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":3,"game":"scoped-remove","components":[{"id":"game.order","version":1,"fields":{"phase":"string"}}],"materialCatalog":[], "initial":[
        {"id":"party:1","components":{"hive.party":{"ownerPlayer":"player:1"}}},
        {"id":"party:2","components":{"hive.party":{"ownerPlayer":"player:2"}}},
        {"id":"worker","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}}
    ]}).to_string()).unwrap();
    let create = json!({"delta":0,"writes":[],"creates":[{"scope":{"kind":"party","player":"player:1","party":"party:1"},"record":{"id":"order:1","components":{"game.order":{"phase":"queued"}}}}],"removes":[],"actions":[]});
    assert!(kernel.advance_json(&create.to_string()).is_ok());
    let before = kernel.save_records().unwrap().entities;
    let foreign = json!({"delta":0,"writes":[],"creates":[],"removes":[{"scope":{"kind":"party","player":"player:2","party":"party:2"},"entity":"order:1"}],"actions":[]});
    assert!(kernel.advance_json(&foreign.to_string()).is_err());
    assert_eq!(kernel.save_records().unwrap().entities, before);
    let forged_player = json!({"delta":0,"writes":[],"creates":[],"removes":[{"scope":{"kind":"party","player":"player:2","party":"party:1"},"entity":"order:1"}],"actions":[]});
    assert!(kernel.advance_json(&forged_player.to_string()).is_err());
    assert_eq!(kernel.save_records().unwrap().entities, before);
    let owned = json!({"delta":0,"writes":[],"creates":[],"removes":[{"scope":{"kind":"party","player":"player:1","party":"party:1"},"entity":"order:1"}],"actions":[]});
    assert!(kernel.advance_json(&owned.to_string()).is_ok());
    let physical = json!({"delta":0,"writes":[],"creates":[],"removes":[{"scope":{"kind":"host"},"entity":"worker"}],"actions":[]});
    assert!(kernel.advance_json(&physical.to_string()).is_err());
    assert!(kernel.entity("worker").is_ok());
}
