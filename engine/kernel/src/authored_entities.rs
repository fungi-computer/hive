//! Dynamic authored records share the world's identity and transaction owner.
//! They cannot create or delete physical capabilities, goods, or actors.
use super::*;

pub(super) struct PreparedAuthoredEntities {
    creates: Vec<EntityRecord>,
    removes: Vec<String>,
    writes: Vec<Write>,
    weight: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn world() -> Kernel {
        let mut kernel = Kernel::new();
        kernel.load(&json!({
            "format":"hive-game", "version":1, "game":"authored-orders",
            "components":[{"id":"game.order","version":1,"fields":{"owner":"nullable-entity","phase":"string"}}],
            "initial":[{"id":"worker","components":{"hive.position":{"x":0,"y":0,"z":0,"facing":0},"hive.body":{"speed":1}}}]
        }).to_string()).unwrap();
        kernel
    }

    fn order(id: &str, owner: serde_json::Value) -> serde_json::Value {
        json!({"id":id,"components":{"game.order":{"owner":owner,"phase":"queued"}}})
    }

    fn advance(kernel: &mut Kernel, creates: serde_json::Value, removes: serde_json::Value, writes: serde_json::Value) -> Result<String> {
        kernel.advance_json(&json!({"delta":0,"creates":creates,"removes":removes,"writes":writes,"actions":[]}).to_string())
    }

    #[test]
    fn authored_order_creation_survives_restore_and_can_be_removed() {
        let mut kernel = world();
        advance(&mut kernel, json!([order("dig:1", json!("worker"))]), json!([]), json!([])).unwrap();
        let saved = kernel.snapshot_json().unwrap();
        let mut restored = Kernel::new();
        restored.restore_json(&saved).unwrap();
        assert_eq!(saved, restored.snapshot_json().unwrap());
        assert!(restored.known.contains("dig:1"));
        advance(&mut restored, json!([]), json!(["dig:1"]), json!([])).unwrap();
        assert!(!restored.known.contains("dig:1"));
        assert!(restored.known.contains("worker"));
    }

    #[test]
    fn authored_order_invalid_batches_leave_no_partial_identity() {
        let mut kernel = world();
        let before = kernel.snapshot_json().unwrap();
        for creates in [
            json!([order("new", json!(null)), order("bad", json!("missing"))]),
            json!([order("same", json!(null)), order("same", json!(null))]),
            json!([{"id":"free-goods","components":{"hive.container":{"capacity":10}}}]),
        ] {
            assert!(advance(&mut kernel, creates, json!([]), json!([])).is_err());
            assert_eq!(before, kernel.snapshot_json().unwrap());
        }
        assert!(advance(&mut kernel, json!([]), json!(["worker"]), json!([])).is_err());
        assert_eq!(before, kernel.snapshot_json().unwrap());
    }

    #[test]
    fn authored_order_removal_requires_surviving_claim_release() {
        let mut kernel = world();
        advance(&mut kernel, json!([order("job", json!(null)), order("claim", json!("job"))]), json!([]), json!([])).unwrap();
        let before = kernel.snapshot_json().unwrap();
        assert!(advance(&mut kernel, json!([]), json!(["job"]), json!([])).is_err());
        assert_eq!(before, kernel.snapshot_json().unwrap());
        advance(&mut kernel, json!([]), json!(["job"]), json!([{
            "component":"game.order", "entity":"claim", "value":{"owner":null,"phase":"idle"}
        }])).unwrap();
        assert!(!kernel.known.contains("job"));
        assert!(kernel.known.contains("claim"));
    }
}

impl Kernel {
    pub(super) fn prepare_authored_entities(
        &self,
        creates: Vec<EntityRecord>,
        removes: Vec<String>,
        writes: Vec<Write>,
    ) -> Result<PreparedAuthoredEntities> {
        if creates.len() > 256 || removes.len() > 256 || writes.len() > 4096 {
            return Err("authored record edit exceeds budget".into());
        }
        let mut known = std::borrow::Cow::Borrowed(&self.known);
        let mut removed = BTreeSet::new();
        let mut weight = self.state_weight;
        for id in &removes {
            if !removed.insert(id.clone()) { return Err("duplicate authored removal".into()); }
            let entity = self.entity(id)?;
            for name in self.registry.schemas.keys() {
                if let Some(value) = self.registry.read(&self.ecs, entity, name) {
                    if Registry::is_physical(name) {
                        return Err("cannot remove physical entity through authored records".into());
                    }
                    weight -= self.registry.weight(name, &value);
                }
            }
            weight -= id.len() + 128;
            known.to_mut().remove(id);
        }
        let mut created = BTreeSet::new();
        for row in &creates {
            if !valid_id(&row.id) || self.known.contains(&row.id) || !created.insert(row.id.clone()) {
                return Err("invalid or duplicate authored creation".into());
            }
            if row.components.is_empty() || row.components.len() > 32 {
                return Err("authored creation needs bounded components".into());
            }
            known.to_mut().insert(row.id.clone());
            weight += row.id.len() + 128;
        }
        if known.len() > 16384 { return Err("region entity capacity".into()); }
        // Overlay all final authored records before checking references. A batch
        // may release a claim and remove its task together, but cannot leave a
        // surviving reference to the removed task.
        let mut final_values = BTreeMap::new();
        for row in &creates {
            for (name, value) in &row.components {
                if Registry::is_physical(name) { return Err("physical component is not game-writable".into()); }
                self.registry.validate(name, value, &known)?;
                weight += self.registry.weight(name, value);
                final_values.insert((row.id.clone(), name.clone()), value.clone());
            }
        }
        for write in &writes {
            if !known.contains(&write.entity) { return Err("unknown authored write target".into()); }
            if Registry::is_physical(&write.component) { return Err("physical component is not game-writable".into()); }
            self.registry.validate(&write.component, &write.value, &known)?;
            let key = (write.entity.clone(), write.component.clone());
            let old = final_values.get(&key).cloned().or_else(|| {
                self.ids.get(&write.entity).and_then(|entity| self.registry.read(&self.ecs, *entity, &write.component))
            });
            weight -= old.as_ref().map_or(0, |value| self.registry.weight(&write.component, value));
            weight += self.registry.weight(&write.component, &write.value);
            final_values.insert(key, write.value.clone());
        }
        if !removed.is_empty() {
            for (id, entity) in &self.ids {
                if removed.contains(id) { continue; }
                for (name, schema) in &self.registry.schemas {
                    if !schema.fields.values().any(|kind| matches!(kind, FieldType::Entity | FieldType::NullableEntity)) { continue; }
                    let value = final_values.get(&(id.clone(), name.clone())).cloned()
                        .or_else(|| self.registry.read(&self.ecs, *entity, name));
                    if let Some(value) = value { self.registry.validate(name, &value, &known)?; }
                }
            }
        }
        if weight > STATE_BYTES { return Err("region canonical state capacity".into()); }
        Ok(PreparedAuthoredEntities { creates, removes, writes, weight })
    }

    pub(super) fn publish_authored_entities(&mut self, prepared: PreparedAuthoredEntities) {
        for id in prepared.removes {
            let entity = self.ids.remove(&id).expect("prepared authored removal");
            self.known.remove(&id);
            self.ecs.despawn(entity);
        }
        for row in prepared.creates {
            let entity = self.ecs.spawn(ExternalId(row.id.clone())).id();
            self.known.insert(row.id.clone());
            self.ids.insert(row.id, entity);
            for (name, value) in row.components {
                self.registry.insert(&mut self.ecs, entity, &name, &value).expect("prepared authored creation");
            }
        }
        for write in prepared.writes {
            self.registry.insert(&mut self.ecs, self.ids[&write.entity], &write.component, &write.value)
                .expect("prepared authored write");
        }
        self.state_weight = prepared.weight;
    }
}
