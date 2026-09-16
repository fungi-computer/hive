//! The sole mutation door for registered one-target relations.
//!
//! Canonical values remain ECS components. Every accepted replacement or clear
//! refreshes the derived inverse index and the work-planner view before return.
use super::*;

impl Kernel {
    pub(crate) fn set_relation(
        &mut self,
        kind: &str,
        source: &str,
        target: &str,
        _scope: &ActionScope,
    ) -> Result<()> {
        let field = self
            .registry
            .schemas
            .get(kind)
            .ok_or("unknown relation")?
            .target_field
            .clone()
            .ok_or("component is not a relation")?;
        let source_entity = self.entity(source)?;
        self.entity(target)?;
        let value = BTreeMap::from([(
            field,
            serde_json::Value::String(target.to_owned()),
        )]);
        self.registry.validate(kind, &value, &self.known)?;
        self.registry
            .insert(&mut self.ecs, source_entity, kind, &value)?;
        self.refresh_relation_source(source)?;
        self.refresh_planner_index(source);
        self.refresh_state_weight();
        Ok(())
    }

    pub(crate) fn clear_relation(
        &mut self,
        kind: &str,
        source: &str,
        _scope: &ActionScope,
    ) -> Result<()> {
        if self
            .registry
            .schemas
            .get(kind)
            .ok_or("unknown relation")?
            .target_field
            .is_none()
        {
            return Err("component is not a relation".into());
        }
        let source_entity = self.entity(source)?;
        self.registry
            .remove(&mut self.ecs, source_entity, kind)?;
        self.refresh_relation_source(source)?;
        self.refresh_planner_index(source);
        self.refresh_state_weight();
        Ok(())
    }
}
