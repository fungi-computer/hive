//! Kernel persistence projection from mutation-owned identities. Full checkpoints
//! remain the independent recovery oracle; incremental capture visits dirty rows.
use super::*;
use crate::record_bundle::{RecordBundle, RecordDelta};
use crate::record_changes::EntityChanges;

#[derive(Clone, Default)]
pub(crate) struct JournalToken { entities: u64, routes: u64, terrain_routes: u64, direct: u64, contacts: u64, parties: u64, air: u64, searches: BTreeMap<String, u64> }

impl Kernel {
    pub(crate) fn record_state_weight(&self) -> usize { self.state_weight }
    pub(crate) fn record_journal_token(&self) -> JournalToken {
        JournalToken { entities: self.ecs.resource::<EntityChanges>().token(), routes: self.routes.token(), terrain_routes: self.terrain_routes.token(), direct: self.direct.token(), contacts: self.projectile_contacts.token(), parties: self.party_bindings.token(), air: self.environment.as_ref().and_then(|environment| environment.atmosphere.as_ref()).map_or(0, |air| air.record_token()), searches: self.planner.route_searches.changed.clone() }
    }
    pub(crate) fn accept_record_journal(&mut self, token: JournalToken) {
        self.ecs.resource_mut::<EntityChanges>().accept(token.entities);
        self.routes.accept(token.routes);
        self.terrain_routes.accept(token.terrain_routes);
        self.direct.accept(token.direct);
        self.projectile_contacts.accept(token.contacts);
        self.party_bindings.accept(token.parties);
        if let Some(air) = self.environment.as_mut().and_then(|environment| environment.atmosphere.as_mut()) { air.acknowledge_records(token.air); }
        self.planner.route_searches.acknowledge(&token.searches);
    }
    pub(crate) fn changed_records(&self) -> Result<RecordDelta> {
        self.ensure_ready()?;
        let environment_started = crate::capture_diagnostics::now_ms();
        let environment = self.environment.as_ref().map(|environment| {
            Ok::<_, String>((environment.definition.clone(), environment.world.save_records()?))
        }).transpose()?;
        crate::capture_diagnostics::record("environment_projection", environment_started);
        let metadata_started = crate::capture_diagnostics::now_ms();
        let mut bank = crate::terrain_route::SearchBank::default();
        bank.occurrence = self.planner.route_searches.occurrence;
        bank.spent = self.planner.route_searches.spent;
        let planner = PlannerState { party_cursor: self.planner.party_cursor, task_cursor: self.planner.task_cursor,
            review_tick: self.planner.review_tick, assignment_generation: self.planner.assignment_generation,
            continuation: self.planner.continuation.clone(), route_searches: bank };
        let metadata = serde_json::to_string(&self.snapshot_metadata_with_planner(planner)).map_err(|error| error.to_string())?;
        crate::capture_diagnostics::record("planner_root_metadata", metadata_started);
        let bundle_started = crate::capture_diagnostics::now_ms();
        let mut puts = RecordBundle::from_records(KernelRecords { entities: metadata, environment, atmosphere: None })?;
        crate::capture_diagnostics::record("delta_record_bundle", bundle_started);
        let mut removes = Vec::new();
        if let Some(environment) = &self.environment {
            let (air_puts, air_removes) = environment.changed_air_records()?;
            for (key, bytes) in air_puts { puts.insert(&key, &bytes)?; }
            removes.extend(air_removes);
        }
        let mut changed: BTreeSet<_> = self.ecs.resource::<EntityChanges>().ids().cloned().collect();
        let mut route_ids = BTreeSet::new();
        for entity in self.routes.changed().chain(self.terrain_routes.changed()) {
            if let Some(id) = self.ecs.get::<ExternalId>(*entity) { route_ids.insert(id.0.clone()); }
        }
        for entity in self.direct.changed() { if let Some(id) = self.ecs.get::<ExternalId>(*entity) { changed.insert(id.0.clone()); } }
        changed.extend(self.projectile_contacts.changed().cloned());
        let mut motion = BTreeMap::new();
        let entities_started = crate::capture_diagnostics::now_ms();
        for id in changed {
            let entity = self.ids.get(&id).copied();
            let mut row = entity.map(|entity| EntityRecord { id: id.clone(), components: self.registry.schemas.keys().filter_map(|name| self.registry.read(&self.ecs, entity, name).map(|value| (name.clone(), value))).collect() })
                .map(serde_json::to_value).transpose().map_err(|error| error.to_string())?;
            if let Some(row) = &mut row {
                let entity = entity.unwrap();
                if let Some(job) = self.ecs.get::<crate::job::Job>(entity) { row["job"] = serde_json::to_value(job).map_err(|error| error.to_string())?; }
                if let Some(task) = self.ecs.get::<crate::job::Task>(entity) { row["task"] = serde_json::to_value(task).map_err(|error| error.to_string())?; }
            } else { route_ids.insert(id.clone()); }
            motion.insert(id.clone(), row.as_mut().and_then(crate::motion_records::extract));
            record(&mut puts, &mut removes, "entities", &id, row)?;
            record(&mut puts, &mut removes, "attempts", &id, entity.and_then(|entity| self.ecs.get::<WorkAttempt>(entity)).cloned())?;
            record(&mut puts, &mut removes, "direct", &id, entity.and_then(|entity| self.direct.get(&entity)))?;
            record(&mut puts, &mut removes, "contacts", &id, self.projectile_contacts.get(&id).map(|targets| ProjectileContactsSnapshot { projectile_id: id.clone(), targets: targets.iter().cloned().collect() }))?;
        }
        crate::capture_diagnostics::record("changed_entity_attempt_direct_contact_rows", entities_started);
        let routes_started = crate::capture_diagnostics::now_ms();
        for id in &route_ids {
            let entity = self.ids.get(id).copied();
            let route = entity.and_then(|entity| self.routes.get(&entity).map(|path| self.route_snapshot_for(entity, path, self.terrain_routes.get(&entity))));
            if let Some(route) = route {
                for (key, bytes) in crate::route_records::encode(id, serde_json::to_value(route).map_err(|error| error.to_string())?)? { puts.insert(&key, &bytes)?; }
            } else { removes.push(format!("kernel/state/routes/{id}")); }
        }
        crate::capture_diagnostics::record("changed_route_rows", routes_started);
        let other_started = crate::capture_diagnostics::now_ms();
        for id in self.party_bindings.changed() { record(&mut puts, &mut removes, "parties", id, self.party_bindings.get(id))?; }
        let searches: Vec<_> = self.planner.route_searches.changed.keys().cloned().collect();
        for id in &searches {
            if let Some(request) = self.planner.route_searches.entries.get(id) {
                let request = serde_json::to_value(request).map_err(|error| error.to_string())?;
                for (key, bytes) in crate::search_records::encode(id, request)? { puts.insert(&key, &bytes)?; }
            }
        }
        crate::capture_diagnostics::record("changed_party_search_rows", other_started);
        Ok(RecordDelta { puts, removes, searches, routes: route_ids.into_iter().collect(), motion })
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
        let delta = kernel.changed_records().unwrap();
        assert_eq!(delta.puts.keys().iter().filter(|key| key.starts_with("kernel/state/entities/")).count(), 1);
        let second = kernel.entity("row-0999").unwrap();
        kernel.ecs.entity_mut(second).remove::<Position>();
        kernel.accept_record_journal(captured);
        assert_eq!(kernel.ecs.resource::<EntityChanges>().ids().cloned().collect::<Vec<_>>(), ["row-0999"]);
        kernel.ecs.despawn(second);
        assert!(kernel.ecs.resource::<EntityChanges>().ids().any(|id| id == "row-0999"), "despawn remembers the external identity after its component is gone");
    }
    #[test]
    fn pending_search_capture_matches_checkpoint_and_ack_preserves_new_progress() {
        use crate::generation::Cell;
        use crate::terrain_traversal::{TraversalConfig, TraversalMaterial};
        use crate::record_bundle::RecordCapture;
        let mut kernel = Kernel::new();
        kernel.load(r#"{"format":"hive-game","version":3,"game":"journal","components":[],"materialCatalog":[],"initial":[]}"#).unwrap();
        let config = TraversalConfig { spacing: [1.0;3], clearance_cells:1, max_step_cells:1 };
        let mut query = |at: Cell| Ok(TraversalMaterial { solid:at.y == 0, outside:false, sealed_top:false });
        let mut search = |kernel: &mut Kernel, occurrence| kernel.planner.route_searches.search("worker", occurrence, 0,
            Cell { x:0,y:0,z:0 }, &[Cell { x:80,y:0,z:80 }], config, &BTreeSet::new(), &mut query, &|_| false, &[], &|_,_| false);
        let mut cursor = RecordCapture::default();
        let baseline = RecordBundle::from_records(kernel.save_records().unwrap()).unwrap();
        let (_, first) = cursor.capture(baseline, Some(0), 0, 0.0).unwrap();
        kernel.accept_record_journal(kernel.record_journal_token());
        assert!(search(&mut kernel, 1).is_err());
        let captured = kernel.record_journal_token();
        let (_, manifest) = cursor.capture_changed(kernel.changed_records().unwrap(), first.sequence, 0, 0.0, kernel.record_state_weight()).unwrap();
        let oracle = RecordBundle::from_records(kernel.save_records().unwrap()).unwrap();
        // Reconstruct using the actual cursor's unchanged/changed record baseline.
        let (unchanged_records, unchanged) = cursor.capture(RecordBundle::from_records(kernel.save_records().unwrap()).unwrap(), Some(manifest.sequence), 0, 0.0).unwrap();
        assert_eq!(unchanged.base, Some(manifest.sequence));
        assert!(unchanged_records.keys().is_empty(), "incremental capture equals the detached full checkpoint byte for byte");
        let mut recovered = Kernel::new();
        recovered.restore_records(&oracle.decode().unwrap()).unwrap();
        assert_eq!(recovered.snapshot_json().unwrap(), kernel.snapshot_json().unwrap());
        search(&mut kernel, 2).ok();
        let (_, final_capture) = cursor.capture_changed(kernel.changed_records().unwrap(), unchanged.sequence, 0, 0.0, kernel.record_state_weight()).unwrap();
        let (difference, _) = cursor.capture(RecordBundle::from_records(kernel.save_records().unwrap()).unwrap(), Some(final_capture.sequence), 0, 0.0).unwrap();
        assert!(difference.keys().is_empty(), "later progress and removed frontier pages match checkpoint");
        kernel.accept_record_journal(captured);
        assert!(!kernel.planner.route_searches.changed.is_empty(), "accepting prior capture must retain later progress/removal");
        let token = kernel.record_journal_token();
        kernel.accept_record_journal(token);
        assert!(kernel.planner.route_searches.changed.is_empty());
    }

    #[test]
    fn moving_cohorts_keep_geometry_and_definition_stable_and_restore_cursor() {
        use crate::record_bundle::RecordCapture;
        let initial: Vec<_> = (0..100).map(|index| serde_json::json!({"id":format!("worker-{index:03}"),"components":{
            "hive.position":{"x":0.0,"y":0.0,"z":0.0,"facing":0.0}, "hive.body":{"speed":1.0}
        }})).collect();
        let mut kernel = Kernel::new();
        kernel.load(&serde_json::json!({"format":"hive-game","version":3,"game":"cohorts","components":[],"materialCatalog":[],"initial":initial}).to_string()).unwrap();
        let actions: Vec<_> = (0..100).map(|index| serde_json::json!({"scope":{"kind":"host"},"request":{
            "kind":"move","entity":format!("worker-{index:03}"),"destination":{"x":20.0,"y":0.0,"z":0.0,"frame":null}
        }})).collect();
        kernel.advance_json(&serde_json::json!({"delta":0,"writes":[],"actions":actions}).to_string()).unwrap();
        assert_eq!(kernel.routes.len(), 100);
        let mut cursor = RecordCapture::default();
        let (_, mut manifest) = cursor.capture(RecordBundle::from_records(kernel.save_records().unwrap()).unwrap(), Some(0), kernel.revision, kernel.time).unwrap();
        kernel.accept_record_journal(kernel.record_journal_token());
        for _ in 0..12 {
            kernel.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap();
            let token = kernel.record_journal_token();
            let (changes, next) = cursor.capture_changed(kernel.changed_records().unwrap(), manifest.sequence, kernel.revision, kernel.time, kernel.record_state_weight()).unwrap();
            assert!(changes.keys().iter().all(|key| !key.starts_with("kernel/state/paths/") && !key.starts_with("kernel/state/entities/") && key != "kernel/state/definition"), "moving a body changes only its cohort and route progress");
            assert!(changes.keys().iter().filter(|key| key.starts_with("kernel/state/motion/")).count() <= 16);
            kernel.accept_record_journal(token);
            let (difference, next) = cursor.capture(RecordBundle::from_records(kernel.save_records().unwrap()).unwrap(), Some(next.sequence), kernel.revision, kernel.time).unwrap();
            assert!(difference.keys().is_empty(), "incremental projection must match canonical checkpoint");
            manifest = next;
        }
        assert!(kernel.routes.values().all(|route| route.cursor() > 0));
        let saved = RecordBundle::from_records(kernel.save_records().unwrap()).unwrap();
        let mut restored = Kernel::new();
        restored.restore_records(&saved.decode().unwrap()).unwrap();
        assert_eq!(restored.snapshot_json().unwrap(), kernel.snapshot_json().unwrap());
        for _ in 0..10 {
            for world in [&mut kernel, &mut restored] { world.advance_json(r#"{"delta":0.1,"writes":[],"actions":[]}"#).unwrap(); }
            assert_eq!(restored.snapshot_json().unwrap(), kernel.snapshot_json().unwrap());
        }
        // Capability removal moves the same Position back to the entity row;
        // deleting a body removes its cohort membership as well.
        let first = kernel.entity("worker-000").unwrap();
        kernel.clear_destination(first);
        kernel.ecs.entity_mut(first).remove::<Body>();
        let removed = kernel.entity("worker-001").unwrap();
        kernel.clear_destination(removed);
        kernel.ecs.entity_mut(removed).remove::<Position>();
        let (_, next) = cursor.capture_changed(kernel.changed_records().unwrap(), manifest.sequence, kernel.revision, kernel.time, kernel.record_state_weight()).unwrap();
        let (difference, _) = cursor.capture(RecordBundle::from_records(kernel.save_records().unwrap()).unwrap(), Some(next.sequence), kernel.revision, kernel.time).unwrap();
        assert!(difference.keys().is_empty(), "component removal cannot leave stale cohort facts");
    }

}
