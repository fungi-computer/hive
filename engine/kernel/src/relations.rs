use crate::components::{FieldType, Result};
#[cfg(test)]
use crate::components::RelationRemovalPolicy;
use crate::registry::Registry;
use bevy_ecs::{entity::Entity, world::World};
use std::collections::BTreeMap;
#[cfg(test)]
use std::collections::BTreeSet;

/// A derived view of the registered one-target relations.
///
/// Relation values remain canonical ECS components. This index only keeps the
/// two bounded lookup directions needed by later consumers and is rebuilt from
/// those components after load/restore.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RelationIndex {
    by_source: BTreeMap<(String, String), String>,
    by_target: BTreeMap<(String, String), Vec<String>>,
}

impl RelationIndex {
    pub fn target(&self, kind: &str, source: &str) -> Option<&str> {
        self.by_source
            .get(&(kind.to_owned(), source.to_owned()))
            .map(String::as_str)
    }

    pub fn sources(&self, kind: &str, target: &str) -> &[String] {
        self.by_target
            .get(&(kind.to_owned(), target.to_owned()))
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn rebuild(
        &mut self,
        registry: &Registry,
        world: &World,
        ids: &BTreeMap<String, Entity>,
    ) -> Result<()> {
        self.by_source.clear();
        self.by_target.clear();
        for source in ids.keys() {
            self.refresh_source(registry, world, ids, source)?;
        }
        Ok(())
    }

    /// Refresh all relation kinds owned by one source identity. An absent
    /// source clears stale derived edges, which is the restore/removal shape
    /// needed by callers while the ECS remains authoritative.
    pub fn refresh_source(
        &mut self,
        registry: &Registry,
        world: &World,
        ids: &BTreeMap<String, Entity>,
        source: &str,
    ) -> Result<()> {
        let relation_kinds = registry
            .schemas
            .values()
            .filter(|schema| schema.target_field.is_some())
            .map(|schema| schema.id.as_str())
            .collect::<Vec<_>>();
        let mut updates = Vec::new();
        if ids.contains_key(source) {
            for kind in relation_kinds {
                if let Some(target) = relation_target(registry, world, ids, kind, source)? {
                    updates.push((kind.to_owned(), target));
                }
            }
        }

        self.remove_source(source);
        for (kind, target) in updates {
            self.by_source
                .insert((kind.clone(), source.to_owned()), target.clone());
            let sources = self.by_target.entry((kind, target)).or_default();
            sources.push(source.to_owned());
            sources.sort();
            sources.dedup();
        }
        Ok(())
    }

    fn remove_source(&mut self, source: &str) {
        let old = self
            .by_source
            .keys()
            .filter(|(_, candidate)| candidate == source)
            .cloned()
            .collect::<Vec<_>>();
        for (kind, source) in old {
            if let Some(target) = self.by_source.remove(&(kind.clone(), source.clone())) {
                let key = (kind, target);
                if let Some(sources) = self.by_target.get_mut(&key) {
                    sources.retain(|candidate| candidate != &source);
                    if sources.is_empty() {
                        self.by_target.remove(&key);
                    }
                }
            }
        }
    }
}

fn relation_target(
    registry: &Registry,
    world: &World,
    ids: &BTreeMap<String, Entity>,
    kind: &str,
    source: &str,
) -> Result<Option<String>> {
    let schema = registry
        .schemas
        .get(kind)
        .ok_or_else(|| format!("unknown relation schema {kind}"))?;
    let target_field = schema
        .target_field
        .as_deref()
        .ok_or_else(|| format!("schema {kind} is not a relation"))?;
    let source_entity = *ids
        .get(source)
        .ok_or_else(|| format!("relation source does not exist: {source}"))?;
    let Some(value) = registry.read(world, source_entity, kind) else {
        return Ok(None);
    };
    let target_value = value
        .get(target_field)
        .ok_or_else(|| format!("relation target field is missing: {kind}.{target_field}"))?;
    let target = match schema.fields.get(target_field) {
        Some(FieldType::Entity) => target_value
            .as_str()
            .ok_or_else(|| format!("relation target is not an entity: {kind}.{target_field}"))?,
        Some(FieldType::NullableEntity) => match target_value.as_str() {
            Some(target) => target,
            None if target_value.is_null() => return Ok(None),
            None => return Err(format!("relation target is not an entity: {kind}.{target_field}")),
        },
        Some(_) => return Err(format!("relation target is not an entity: {kind}.{target_field}")),
        None => return Err(format!("relation target field is missing: {kind}.{target_field}")),
    };
    let target_entity = *ids
        .get(target)
        .ok_or_else(|| format!("relation target does not exist: {kind}.{source}->{target}"))?;
    if source == target && !schema.allow_self {
        return Err(format!("relation self target is forbidden: {kind}.{source}"));
    }
    for capability in &schema.source_requires {
        require_component(registry, world, source_entity, capability, "source", kind)?;
    }
    for capability in &schema.target_requires {
        require_component(registry, world, target_entity, capability, "target", kind)?;
    }
    Ok(Some(target.to_owned()))
}

fn require_component(
    registry: &Registry,
    world: &World,
    entity: Entity,
    capability: &str,
    endpoint: &str,
    kind: &str,
) -> Result<()> {
    let component = *registry
        .ids
        .get(capability)
        .ok_or_else(|| format!("relation {kind} references unknown {endpoint} capability {capability}"))?;
    if world.get_by_id(entity, component).is_none() {
        return Err(format!("relation {kind} {endpoint} lacks capability {capability}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::{FieldType, Record, Schema};
    use bevy_ecs::prelude::World;
    use serde_json::json;

    fn relation_schema(
        id: &str,
        target_requires: Vec<&str>,
        source_requires: Vec<&str>,
        allow_self: bool,
    ) -> Schema {
        Schema {
            id: id.into(),
            version: 1,
            fields: BTreeMap::from([("target".into(), FieldType::Entity)]),
            target_field: Some("target".into()),
            source_requires: source_requires.into_iter().map(str::to_owned).collect(),
            target_requires: target_requires.into_iter().map(str::to_owned).collect(),
            on_target_removed: Some(RelationRemovalPolicy::Detach),
            allow_self,
        }
    }

    fn insert_entity(
        world: &mut World,
        registry: &Registry,
        ids: &mut BTreeMap<String, Entity>,
        id: &str,
        components: &[(&str, Record)],
    ) {
        let entity = world.spawn(crate::components::ExternalId(id.into())).id();
        ids.insert(id.into(), entity);
        let known = ids.keys().cloned().collect::<BTreeSet<_>>();
        for (kind, value) in components {
            registry.validate(kind, value, &known).unwrap();
            registry.insert(world, entity, kind, value).unwrap();
        }
    }

    fn party_record() -> Record {
        BTreeMap::new()
    }

    #[test]
    fn stable_sources_and_rebuild_equivalence() {
        let mut world = World::new();
        let registry = Registry::new(
            &mut world,
            vec![relation_schema("test.member-of", vec!["hive.party"], vec![], false)],
            vec![],
        )
        .unwrap();
        let mut ids = BTreeMap::new();
        insert_entity(&mut world, &registry, &mut ids, "party", &[("hive.party", party_record())]);
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source-b",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("party"))]))],
        );
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source-a",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("party"))]))],
        );
        let mut index = RelationIndex::default();
        index.rebuild(&registry, &world, &ids).unwrap();
        assert_eq!(index.target("test.member-of", "source-a"), Some("party"));
        assert_eq!(index.sources("test.member-of", "party"), &["source-a", "source-b"]);

        let mut equivalent = RelationIndex::default();
        equivalent.rebuild(&registry, &world, &ids).unwrap();
        assert_eq!(index, equivalent);
    }

    #[test]
    fn refresh_source_removes_old_target_and_matches_rebuild() {
        let mut world = World::new();
        let registry = Registry::new(
            &mut world,
            vec![relation_schema("test.member-of", vec!["hive.party"], vec![], false)],
            vec![],
        )
        .unwrap();
        let mut ids = BTreeMap::new();
        insert_entity(&mut world, &registry, &mut ids, "party-a", &[("hive.party", party_record())]);
        insert_entity(&mut world, &registry, &mut ids, "party-b", &[("hive.party", party_record())]);
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("party-a"))]))],
        );
        let mut index = RelationIndex::default();
        index.rebuild(&registry, &world, &ids).unwrap();
        let source_entity = ids["source"];
        registry
            .insert(
                &mut world,
                source_entity,
                "test.member-of",
                &BTreeMap::from([("target".into(), json!("party-b"))]),
            )
            .unwrap();
        index.refresh_source(&registry, &world, &ids, "source").unwrap();
        assert_eq!(index.sources("test.member-of", "party-a"), &[] as &[String]);
        assert_eq!(index.sources("test.member-of", "party-b"), &["source"]);
        let mut equivalent = RelationIndex::default();
        equivalent.rebuild(&registry, &world, &ids).unwrap();
        assert_eq!(index, equivalent);
    }

    #[test]
    fn rebuild_rejects_invalid_endpoint_capability_and_self_relation() {
        let mut world = World::new();
        let registry = Registry::new(
            &mut world,
            vec![relation_schema("test.member-of", vec!["hive.party"], vec![], false)],
            vec![],
        )
        .unwrap();
        let mut ids = BTreeMap::new();
        insert_entity(&mut world, &registry, &mut ids, "target", &[]);
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("target"))]))],
        );
        ids.remove("target");
        let mut index = RelationIndex::default();
        assert!(index.rebuild(&registry, &world, &ids).unwrap_err().contains("target does not exist"));

        let mut world = World::new();
        let registry = Registry::new(
            &mut world,
            vec![relation_schema("test.member-of", vec!["hive.party"], vec![], false)],
            vec![],
        )
        .unwrap();
        let mut ids = BTreeMap::new();
        insert_entity(&mut world, &registry, &mut ids, "party", &[]);
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("party"))]))],
        );
        assert!(RelationIndex::default().rebuild(&registry, &world, &ids).unwrap_err().contains("lacks capability"));

        let mut world = World::new();
        let registry = Registry::new(
            &mut world,
            vec![relation_schema("test.member-of", vec![], vec!["hive.party"], false)],
            vec![],
        )
        .unwrap();
        let mut ids = BTreeMap::new();
        insert_entity(&mut world, &registry, &mut ids, "target", &[]);
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("target"))]))],
        );
        assert!(RelationIndex::default().rebuild(&registry, &world, &ids).unwrap_err().contains("source lacks capability"));

        let mut world = World::new();
        let registry = Registry::new(
            &mut world,
            vec![relation_schema("test.member-of", vec![], vec![], false)],
            vec![],
        )
        .unwrap();
        let mut ids = BTreeMap::new();
        insert_entity(
            &mut world,
            &registry,
            &mut ids,
            "source",
            &[("test.member-of", BTreeMap::from([("target".into(), json!("source"))]))],
        );
        assert!(RelationIndex::default().rebuild(&registry, &world, &ids).unwrap_err().contains("self target"));
    }
}
