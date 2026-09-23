//! Kernel persistence projection from mutation-owned identities. Full checkpoints
//! remain the independent recovery oracle; incremental capture visits dirty rows.
use super::*;
use crate::record_bundle::RecordBundle;
use crate::record_changes::EntityChanges;

#[derive(Clone, Copy, Default)]
pub(crate) struct JournalToken { entities: u64, routes: u64, terrain_routes: u64, direct: u64, contacts: u64, parties: u64 }

impl Kernel {
    pub(crate) fn record_state_weight(&self) -> usize { self.state_weight }
    pub(crate) fn record_journal_token(&self) -> JournalToken {
        JournalToken { entities: self.ecs.resource::<EntityChanges>().token(), routes: self.routes.token(), terrain_routes: self.terrain_routes.token(), direct: self.direct.token(), contacts: self.projectile_contacts.token(), parties: self.party_bindings.token() }
    }
    pub(crate) fn accept_record_journal(&mut self, token: JournalToken) {
        self.ecs.resource_mut::<EntityChanges>().accept(token.entities);
        self.routes.accept(token.routes);
        self.terrain_routes.accept(token.terrain_routes);
        self.direct.accept(token.direct);
        self.projectile_contacts.accept(token.contacts);
        self.party_bindings.accept(token.parties);
    }
    pub(crate) fn changed_records(&self) -> Result<(RecordBundle, Vec<String>)> {
        self.ensure_ready()?;
        let environment = self.environment.as_ref().map(|environment| {
            Ok::<_, String>((environment.definition.clone(), environment.world.save_records()?))
        }).transpose()?;
        let atmosphere = self.environment.as_ref().map(|environment| environment.save_air()).transpose()?.flatten();
        let metadata = serde_json::to_string(&self.snapshot_metadata()).map_err(|error| error.to_string())?;
        let mut puts = RecordBundle::from_records(KernelRecords { entities: metadata, environment, atmosphere })?;
        let mut removes = Vec::new();
        let mut changed: BTreeSet<_> = self.ecs.resource::<EntityChanges>().ids().cloned().collect();
        for entity in self.routes.changed().chain(self.terrain_routes.changed()).chain(self.direct.changed()) {
            if let Some(id) = self.ecs.get::<ExternalId>(*entity) { changed.insert(id.0.clone()); }
        }
        changed.extend(self.projectile_contacts.changed().cloned());
        for id in changed {
            let entity = self.ids.get(&id).copied();
            let row = entity.map(|entity| EntityRecord { id: id.clone(), components: self.registry.schemas.keys().filter_map(|name| self.registry.read(&self.ecs, entity, name).map(|value| (name.clone(), value))).collect() });
            record(&mut puts, &mut removes, "entities", &id, row)?;
            record(&mut puts, &mut removes, "jobs", &id, entity.and_then(|entity| self.ecs.get::<crate::job::Job>(entity)).cloned().map(|job| JobSnapshot { id: id.clone(), job }))?;
            record(&mut puts, &mut removes, "tasks", &id, entity.and_then(|entity| self.ecs.get::<crate::job::Task>(entity)).cloned().map(|task| TaskSnapshot { id: id.clone(), task }))?;
            record(&mut puts, &mut removes, "attempts", &id, entity.and_then(|entity| self.ecs.get::<WorkAttempt>(entity)).cloned())?;
            record(&mut puts, &mut removes, "routes", &id, entity.and_then(|entity| self.routes.get(&entity).map(|path| self.route_snapshot_for(entity, path, self.terrain_routes.get(&entity)))))?;
            record(&mut puts, &mut removes, "direct", &id, entity.and_then(|entity| self.direct.get(&entity)))?;
            record(&mut puts, &mut removes, "contacts", &id, self.projectile_contacts.get(&id).map(|targets| ProjectileContactsSnapshot { projectile_id: id.clone(), targets: targets.iter().cloned().collect() }))?;
        }
        for id in self.party_bindings.changed() { record(&mut puts, &mut removes, "parties", id, self.party_bindings.get(id))?; }
        Ok((puts, removes))
    }
}

fn record<T: serde::Serialize>(puts: &mut RecordBundle, removes: &mut Vec<String>, family: &str, id: &str, value: Option<T>) -> Result<()> {
    let key = format!("kernel/state/{family}/{id}");
    if let Some(value) = value {
        // Same canonical map ordering as the detached checkpoint oracle.
        let value = serde_json::to_value(value).map_err(|error| error.to_string())?;
        let bytes = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
        puts.insert(&key, &bytes)?;
    } else { removes.push(key); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn one_component_replacement_journals_one_identity_and_acknowledges_only_captured_generation() {
        let mut kernel = Kernel::new();
        let initial: Vec<_> = (0..1000).map(|index| serde_json::json!({"id":format!("row-{index:04}"),"components":{"hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}}})).collect();
        kernel.load(&serde_json::json!({"format":"hive-game","version":3,"game":"journal","components":[],"materialCatalog":[],"initial":initial}).to_string()).unwrap();
        kernel.accept_record_journal(kernel.record_journal_token());
        let first = kernel.entity("row-0000").unwrap();
        kernel.ecs.entity_mut(first).insert(Position { x: 1.0, y: 0.0, z: 0.0, facing: 0.0 });
        let captured = kernel.record_journal_token();
        assert_eq!(kernel.ecs.resource::<EntityChanges>().ids().cloned().collect::<Vec<_>>(), ["row-0000"]);
        let (delta, _) = kernel.changed_records().unwrap();
        assert_eq!(delta.keys().iter().filter(|key| key.starts_with("kernel/state/entities/")).count(), 1);
        let second = kernel.entity("row-0999").unwrap();
        kernel.ecs.entity_mut(second).remove::<Position>();
        kernel.accept_record_journal(captured);
        assert_eq!(kernel.ecs.resource::<EntityChanges>().ids().cloned().collect::<Vec<_>>(), ["row-0999"]);
        kernel.ecs.despawn(second);
        assert!(kernel.ecs.resource::<EntityChanges>().ids().any(|id| id == "row-0999"), "despawn remembers the external identity after its component is gone");
    }
}
