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
    json!({"delta":0,"writes":[],"actions":[{"kind":"establish-party","bindingId":binding,"player":player,"party":party,"records":records}]})
}
fn accepted(kernel: &mut Kernel, input: Value) -> bool {
    serde_json::from_str::<Value>(&kernel.advance_json(&input.to_string()).unwrap()).unwrap()["results"][0]["accepted"] == true
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
