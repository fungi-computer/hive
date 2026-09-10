//! The only unsafe boundary: known layout/drop and IDs belonging to one World.
use crate::components::*;
use crate::components::Result;
use bevy_ecs::{
    component::{ComponentCloneBehavior, ComponentDescriptor, ComponentId, StorageType},
    prelude::*,
    ptr::OwningPtr,
};
use std::{
    alloc::Layout,
    collections::{BTreeMap, BTreeSet},
};

pub struct Registry {
    pub schemas: BTreeMap<String, Schema>,
    pub ids: BTreeMap<String, ComponentId>,
}
impl Registry {
    pub fn new(world: &mut World, schemas: Vec<Schema>) -> Result<Self> {
        let mut this = Self {
            schemas: BTreeMap::new(),
            ids: BTreeMap::new(),
        };
        if schemas.len() > 128 {
            return Err("too many schemas".into());
        }
        for schema in schemas {
            if !valid_id(&schema.id)
                || !schema.id.contains('.')
                || schema.version == 0
                || schema.fields.len() > 32
                || schema.fields.keys().any(|n| !valid_id(n))
            {
                return Err("invalid schema".into());
            }
            if this.schemas.insert(schema.id.clone(), schema).is_some() {
                return Err("duplicate schema".into());
            }
        }
        for (name, fields) in [
            (
                "hive.position",
                vec![
                    ("x", FieldType::Number),
                    ("y", FieldType::Number),
                    ("z", FieldType::Number),
                    ("facing", FieldType::Number),
                ],
            ),
            ("hive.body", vec![("speed", FieldType::Number)]),
            ("hive.container", vec![("capacity", FieldType::Number)]),
            (
                "hive.lot",
                vec![
                    ("kind", FieldType::String),
                    ("quantity", FieldType::Number),
                    ("container", FieldType::Entity),
                ],
            ),
            (
                "hive.destination",
                vec![
                    ("x", FieldType::Number),
                    ("y", FieldType::Number),
                    ("z", FieldType::Number),
                    ("facing", FieldType::Number),
                    ("frame", FieldType::NullableEntity),
                ],
            ),
            ("hive.support", vec![("entity", FieldType::Entity)]),
            (
                "hive.surface",
                vec![
                    ("minX", FieldType::Number),
                    ("maxX", FieldType::Number),
                    ("minZ", FieldType::Number),
                    ("maxZ", FieldType::Number),
                    ("height", FieldType::Number),
                ],
            ),
            ("hive.obstacle", vec![("occupied", FieldType::Boolean)]),
            (
                "hive.visual",
                vec![("sprite", FieldType::String), ("label", FieldType::String)],
            ),
        ] {
            let schema = Schema {
                id: name.into(),
                version: 1,
                fields: fields.into_iter().map(|(n, t)| (n.into(), t)).collect(),
            };
            if this.schemas.get(name).is_some_and(|s| s != &schema) {
                return Err(format!("reserved schema differs: {name}"));
            }
            this.schemas.insert(name.into(), schema);
        }
        if this.schemas.len() > 128 {
            return Err("too many total schemas".into());
        }
        for name in this.schemas.keys() {
            let id = match name.as_str() {
                "hive.position" => world.register_component::<Position>(),
                "hive.body" => world.register_component::<Body>(),
                "hive.container" => world.register_component::<Container>(),
                "hive.lot" => world.register_component::<Lot>(),
                "hive.destination" => world.register_component::<Destination>(),
                "hive.support" => world.register_component::<Support>(),
                "hive.surface" => world.register_component::<Surface>(),
                "hive.obstacle" => world.register_component::<Obstacle>(),
                "hive.visual" => world.register_component::<Visual>(),
                _ => {
                    // All dynamic insertions use AuthoredRecord, a Send+Sync
                    // layout. The destructor matches exactly; no relationships.
                    let descriptor = unsafe {
                        ComponentDescriptor::new_with_layout(
                            name.clone(),
                            StorageType::Table,
                            Layout::new::<AuthoredRecord>(),
                            Some(drop_record),
                            true,
                            ComponentCloneBehavior::Ignore,
                            None,
                        )
                    };
                    world.register_component_with_descriptor(descriptor)
                }
            };
            this.ids.insert(name.clone(), id);
        }
        Ok(this)
    }
    pub fn is_physical(name: &str) -> bool {
        matches!(
            name,
            "hive.position"
                | "hive.body"
                | "hive.container"
                | "hive.lot"
                | "hive.destination"
                | "hive.support"
                | "hive.surface"
                | "hive.obstacle"
                | "hive.visual"
        )
    }
    /// Conservative canonical JSON size. Numeric poses can advance without
    /// changing this weight; entity reference IDs have a fixed validated bound.
    pub fn weight(&self, name: &str, value: &Record) -> usize {
        name.len()
            + 8
            + value
                .iter()
                .map(|(key, v)| {
                    let size = match self.schemas[name].fields[key] {
                        FieldType::Entity | FieldType::NullableEntity => 132,
                        FieldType::Number | FieldType::Boolean => 64,
                        FieldType::String => {
                            serde_json::to_string(v).expect("validated string").len()
                        }
                    };
                    key.len() + 8 + size
                })
                .sum::<usize>()
    }
    pub fn validate(&self, name: &str, value: &Record, known: &BTreeSet<String>) -> Result<()> {
        let schema = self
            .schemas
            .get(name)
            .ok_or_else(|| format!("unknown component {name}"))?;
        if schema.fields.len() != value.len() {
            return Err(format!("fields differ for {name}"));
        }
        for (field, ty) in &schema.fields {
            let v = value
                .get(field)
                .ok_or_else(|| format!("missing {name}.{field}"))?;
            let valid = match ty {
                FieldType::Number => v.as_f64().is_some_and(f64::is_finite),
                FieldType::Boolean => v.is_boolean(),
                FieldType::String => v.as_str().is_some_and(|s| s.len() <= 4096),
                FieldType::Entity => v.as_str().is_some_and(|s| known.contains(s)),
                FieldType::NullableEntity => {
                    v.is_null() || v.as_str().is_some_and(|s| known.contains(s))
                }
            };
            if !valid {
                return Err(format!("invalid {name}.{field}"));
            }
        }
        match name {
            "hive.body" => {
                let body: Body = decode(value)?;
                if body.speed <= 0.0 || body.speed > 100.0 {
                    return Err("invalid speed".into());
                }
            }
            "hive.container" => {
                let _: Container = decode(value)?;
            }
            "hive.lot" => {
                let lot: Lot = decode(value)?;
                if !valid_id(&lot.kind) {
                    return Err("invalid lot".into());
                }
            }
            _ => {}
        }
        Ok(())
    }
    pub fn insert(
        &self,
        world: &mut World,
        entity: Entity,
        name: &str,
        value: &Record,
    ) -> Result<()> {
        match name {
            "hive.position" => {
                world.entity_mut(entity).insert(decode::<Position>(value)?);
            }
            "hive.body" => {
                world.entity_mut(entity).insert(decode::<Body>(value)?);
            }
            "hive.container" => {
                world.entity_mut(entity).insert(decode::<Container>(value)?);
            }
            "hive.lot" => {
                world.entity_mut(entity).insert(decode::<Lot>(value)?);
            }
            "hive.destination" => {
                world
                    .entity_mut(entity)
                    .insert(decode::<Destination>(value)?);
            }
            "hive.support" => {
                world.entity_mut(entity).insert(decode::<Support>(value)?);
            }
            "hive.surface" => {
                world.entity_mut(entity).insert(decode::<Surface>(value)?);
            }
            "hive.obstacle" => {
                world.entity_mut(entity).insert(decode::<Obstacle>(value)?);
            }
            "hive.visual" => {
                world.entity_mut(entity).insert(decode::<Visual>(value)?);
            }
            _ => {
                let id = *self.ids.get(name).ok_or("unknown component")?;
                OwningPtr::make(AuthoredRecord(value.clone()), |ptr| {
                    // Registry's ID and World stay paired throughout lifetime.
                    unsafe {
                        world.entity_mut(entity).insert_by_id(id, ptr);
                    }
                });
            }
        }
        Ok(())
    }
    pub fn read(&self, world: &World, entity: Entity, name: &str) -> Option<Record> {
        match name {
            "hive.position" => world.get::<Position>(entity).map(record),
            "hive.body" => world.get::<Body>(entity).map(record),
            "hive.container" => world.get::<Container>(entity).map(record),
            "hive.lot" => world.get::<Lot>(entity).map(record),
            "hive.destination" => world.get::<Destination>(entity).map(record),
            "hive.support" => world.get::<Support>(entity).map(record),
            "hive.surface" => world.get::<Surface>(entity).map(record),
            "hive.obstacle" => world.get::<Obstacle>(entity).map(record),
            "hive.visual" => world.get::<Visual>(entity).map(record),
            _ => {
                let id = *self.ids.get(name)?;
                // Every value inserted for this ID has AuthoredRecord layout.
                world
                    .get_by_id(entity, id)
                    .map(|ptr| unsafe { ptr.deref::<AuthoredRecord>().0.clone() })
            }
        }
    }
}
unsafe fn drop_record(ptr: OwningPtr<'_>) {
    unsafe {
        ptr.drop_as::<AuthoredRecord>();
    }
}
