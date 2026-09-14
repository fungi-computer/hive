use super::*;
use serde_json::{json, Value};

fn plan() -> Value {
    json!([
 {"id":"party:1","components":{"hive.party":{"ownerPlayer":"player:1"}}},
 {"id":"party:1:person:0","components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.party-member":{"party":"party:1"}}},
 {"id":"party:1:person:1","components":{"hive.position":{"x":2.0,"y":0.0,"z":0.0,"facing":0.0},"hive.party-member":{"party":"party:1"}}},
 {"id":"party:1:storage","components":{"hive.position":{"x":0.0,"y":0.0,"z":2.0,"facing":0.0},"hive.container":{"capacity":8},"hive.owned-by-party":{"party":"party:1"}}}
    ])
}
fn request(binding: &str, player: &str, party: &str, records: Value) -> Value {
    json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"host"},"request":{"kind":"establish-party","bindingId":binding,"player":player,"party":party,"records":records}}]})
}
fn accepted(kernel: &mut Kernel, input: Value) -> bool {
    serde_json::from_str::<Value>(&kernel.advance_json(&input.to_string()).unwrap()).unwrap()["results"][0]["accepted"] == true
}

fn party_batch(party: &str, request: Value) -> Value {
    json!({"delta":0,"writes":[],"actions":[{"scope":{"kind":"party","party":party},"request":request}]})
}

#[test]
fn prepared_party_replay_and_mismatches_are_atomic() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":1,"game":"party","components":[],"initial":[]}).to_string()).unwrap();
    assert!(accepted(&mut kernel, request("bind:1", "player:1", "party:1", plan())));
    let party = kernel.entity("party:1").unwrap();
    let receipt = kernel.ecs.get::<PartyReceipt>(party).unwrap();
    assert_eq!((receipt.binding_id.as_str(), receipt.player.as_str(), receipt.party.as_str()), ("bind:1", "player:1", "party:1"));
    assert_eq!(kernel.ecs.query::<&PartyMember>().iter(&kernel.ecs).count(), 2);
    for member in kernel.ecs.query::<&PartyMember>().iter(&kernel.ecs) { assert_eq!(member.party, "party:1"); }
    for owner in kernel.ecs.query::<&OwnedByParty>().iter(&kernel.ecs) { assert_eq!(owner.party, "party:1"); }
    let count = kernel.known.len();
    let saved = kernel.save_records().unwrap();
    let mut restored = Kernel::new(); restored.restore_records(&saved).unwrap();
    assert!(accepted(&mut restored, request("bind:1", "player:1", "party:1", plan())));
    assert_eq!(restored.known.len(), count);
    let mut changed = plan(); changed[2]["components"]["hive.position"]["x"] = json!(3.0);
    for input in [request("bind:1", "player:1", "party:1", changed), request("bind:2", "player:1", "party:1", plan()), request("bind:1", "player:2", "party:1", plan())] {
        let before = restored.save_records().unwrap().entities;
        assert!(!accepted(&mut restored, input));
        assert_eq!(restored.known.len(), count);
        let strip = |bytes: String| { let mut value: Value = serde_json::from_str(&bytes).unwrap(); value.as_object_mut().unwrap().remove("revision"); value.to_string() };
        assert_eq!(strip(restored.save_records().unwrap().entities), strip(before));
    }
}

#[test]
fn scoped_authored_creation_attaches_party_ownership_atomically() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":1,"game":"party-create","components":[{"id":"game.order","version":1,"fields":{"phase":"string"}}],"initial":[]}).to_string()).unwrap();
    assert!(accepted(&mut kernel, request("bind:1", "player:1", "party:1", plan())));
    let batch = json!({"delta":0,"writes":[],"creates":[{"scope":{"kind":"party","party":"party:1"},"record":{"id":"order:1","components":{"game.order":{"phase":"queued"}}}}],"actions":[]});
    assert!(kernel.advance_json(&batch.to_string()).is_ok());
    let order = kernel.entity("order:1").unwrap();
    assert_eq!(kernel.ecs.get::<OwnedByParty>(order).unwrap().party, "party:1");
    let forged = json!({"delta":0,"writes":[],"creates":[{"scope":{"kind":"party","party":"party:1"},"record":{"id":"order:2","components":{"hive.owned-by-party":{"party":"party:2"},"game.order":{"phase":"queued"}}}}],"actions":[]});
    assert!(kernel.advance_json(&forged.to_string()).is_err());
    assert!(kernel.entity("order:2").is_err());
}

#[test]
fn party_scope_rejects_foreign_worker_and_work_attempt_party_drift() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":1,"game":"party-scope","components":[],"initial":[
        {"id":"party:1","components":{"hive.party":{"ownerPlayer":"player:1"}}},
        {"id":"party:2","components":{"hive.party":{"ownerPlayer":"player:2"}}},
        {"id":"worker","components":{"hive.party-member":{"party":"party:1"},"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0},"hive.body":{"speed":1.0}}},
        {"id":"task","components":{"hive.owned-by-party":{"party":"party:1"}}}
    ]}).to_string()).unwrap();
    let foreign_move = party_batch("party:2", json!({"kind":"move","entity":"worker","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}));
    assert!(!accepted(&mut kernel, foreign_move));
    let drift = party_batch("party:2", json!({"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party:1","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}));
    assert!(!accepted(&mut kernel, drift));
    let valid = party_batch("party:1", json!({"kind":"begin-work-attempt","task":"task","worker":"worker","party":"party:1","operation":{"kind":"route","destination":{"x":1.0,"y":0.0,"z":0.0,"frame":null}}}));
    assert!(accepted(&mut kernel, valid));
}

#[test]
fn scoped_batch_rejects_malformed_scope_before_mutation() {
    let mut kernel = Kernel::new();
    kernel.load(&json!({"format":"hive-game","version":1,"game":"scope-parse","components":[],"initial":[]}).to_string()).unwrap();
    let malformed = json!({"delta":0,"writes":[],"actions":[{"scope":{"party":"party:1"},"request":{"kind":"move","entity":"missing","destination":{"x":0.0,"y":0.0,"z":0.0,"frame":null}}}]});
    assert!(kernel.advance_json(&malformed.to_string()).is_err());
}
