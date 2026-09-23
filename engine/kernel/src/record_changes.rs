//! Mutation journals for the canonical persistence owner. ECS persisted values
//! are immutable: insertion/removal hooks therefore see every replacement.
use bevy_ecs::{component::{ComponentId, Immutable}, lifecycle::HookContext, prelude::*, world::DeferredWorld};
use std::{collections::{BTreeMap, BTreeSet}, ops::{Deref, DerefMut}};
use crate::components::ExternalId;

#[derive(Resource, Default)]
pub(crate) struct EntityChanges { clock: u64, ids: BTreeMap<String, u64>, installed: BTreeSet<ComponentId> }
impl EntityChanges {
    fn mark(&mut self, id: String) { self.clock += 1; self.ids.insert(id, self.clock); }
    pub(crate) fn token(&self) -> u64 { self.clock }
    pub(crate) fn ids(&self) -> impl Iterator<Item = &String> { self.ids.keys() }
    pub(crate) fn accept(&mut self, token: u64) { self.ids.retain(|_, generation| *generation > token); }
}
fn changed(mut world: DeferredWorld, context: HookContext) {
    if let Some(id) = world.get::<ExternalId>(context.entity).map(|id| id.0.clone()) {
        world.resource_mut::<EntityChanges>().mark(id);
    }
}
pub(crate) fn install(world: &mut World, component: ComponentId) {
    world.init_resource::<EntityChanges>();
    assert!(!world.components().get_info(component).expect("registered record component").mutable(), "persisted component must be immutable");
    if !world.resource_mut::<EntityChanges>().installed.insert(component) { return; }
    let hooks = world.register_component_hooks_by_id(component).expect("registered record component");
    hooks.on_insert(changed);
    hooks.on_remove(changed);
}

/// An edit owns a private replacement, never mutable access to persisted ECS
/// bytes. Dropping a changed edit publishes through Bevy insertion and its
/// canonical journal hook. Read-only use does not publish anything.
pub(crate) struct Replacement<'a, T: Component<Mutability = Immutable> + Clone> {
    world: &'a mut World, entity: Entity, value: Option<T>, changed: bool,
}
impl<T: Component<Mutability = Immutable> + Clone> Deref for Replacement<'_, T> {
    type Target = T;
    fn deref(&self) -> &T { self.value.as_ref().unwrap() }
}
impl<T: Component<Mutability = Immutable> + Clone> DerefMut for Replacement<'_, T> {
    fn deref_mut(&mut self) -> &mut T { self.changed = true; self.value.as_mut().unwrap() }
}
impl<T: Component<Mutability = Immutable> + Clone> Drop for Replacement<'_, T> {
    fn drop(&mut self) { if self.changed { self.world.entity_mut(self.entity).insert(self.value.take().unwrap()); } }
}
pub(crate) fn edit<T: Component<Mutability = Immutable> + Clone>(entity: Entity, world: &mut World) -> Option<Replacement<'_, T>> {
    let value = world.get::<T>(entity)?.clone();
    Some(Replacement { world, entity, value: Some(value), changed: false })
}

/// Map-owned dirty keys for physical facts outside ECS. Immutable reads cannot
/// bypass tracking; every mutation capability records the affected identity.
pub(crate) struct RecordMap<K: Ord + Clone, V> {
    rows: BTreeMap<K, V>, clock: u64, changes: BTreeMap<K, u64>,
}
impl<K: Ord + Clone, V> Default for RecordMap<K, V> {
    fn default() -> Self { Self { rows: BTreeMap::new(), clock: 0, changes: BTreeMap::new() } }
}
impl<K: Ord + Clone, V> Deref for RecordMap<K, V> {
    type Target = BTreeMap<K, V>;
    fn deref(&self) -> &Self::Target { &self.rows }
}
impl<K: Ord + Clone, V> From<BTreeMap<K, V>> for RecordMap<K, V> {
    fn from(rows: BTreeMap<K, V>) -> Self {
        let changes = rows.keys().cloned().map(|key| (key, 1)).collect();
        Self { rows, clock: 1, changes }
    }
}
impl<K: Ord + Clone, V> RecordMap<K, V> {
    fn mark(&mut self, key: K) { self.clock += 1; self.changes.insert(key, self.clock); }
    pub(crate) fn insert(&mut self, key: K, value: V) -> Option<V> { self.mark(key.clone()); self.rows.insert(key, value) }
    pub(crate) fn remove<Q: Ord + ?Sized>(&mut self, key: &Q) -> Option<V> where K: std::borrow::Borrow<Q> {
        let owned = self.rows.get_key_value(key).map(|(key, _)| key.clone())?;
        self.mark(owned); self.rows.remove(key)
    }
    pub(crate) fn get_mut<Q: Ord + ?Sized>(&mut self, key: &Q) -> Option<&mut V> where K: std::borrow::Borrow<Q> {
        let owned = self.rows.get_key_value(key).map(|(key, _)| key.clone())?;
        self.mark(owned); self.rows.get_mut(key)
    }
    pub(crate) fn retain(&mut self, mut keep: impl FnMut(&K, &mut V) -> bool) {
        let keys: BTreeSet<_> = self.rows.keys().cloned().collect();
        for key in keys { self.mark(key); }
        self.rows.retain(|key, value| keep(key, value));
    }
    pub(crate) fn clear(&mut self) { for key in self.rows.keys().cloned().collect::<Vec<_>>() { self.mark(key); } self.rows.clear(); }
    pub(crate) fn changed(&self) -> impl Iterator<Item = &K> { self.changes.keys() }
    pub(crate) fn token(&self) -> u64 { self.clock }
    pub(crate) fn accept(&mut self, token: u64) { self.changes.retain(|_, generation| *generation > token); }
}
