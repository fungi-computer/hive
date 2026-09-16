//! Rebuildable inverse index for canonical player ownership.

use crate::components::OwnedBy;
use bevy_ecs::prelude::{Entity, World};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub(crate) struct OwnershipIndex {
    player_by_actor: BTreeMap<String, String>,
    actors_by_player: BTreeMap<String, BTreeSet<String>>,
}

impl OwnershipIndex {
    pub(crate) fn rebuild(&mut self, world: &World, ids: &BTreeMap<String, Entity>) {
        self.player_by_actor.clear();
        self.actors_by_player.clear();
        for (id, entity) in ids {
            if let Some(owner) = world.get::<OwnedBy>(*entity) {
                self.player_by_actor.insert(id.clone(), owner.player.clone());
                self.actors_by_player.entry(owner.player.clone()).or_default().insert(id.clone());
            }
        }
    }

    pub(crate) fn refresh(&mut self, world: &World, id: &str, entity: Option<Entity>) {
        if let Some(previous) = self.player_by_actor.remove(id) {
            if let Some(actors) = self.actors_by_player.get_mut(&previous) {
                actors.remove(id);
                if actors.is_empty() { self.actors_by_player.remove(&previous); }
            }
        }
        let Some(owner) = entity.and_then(|entity| world.get::<OwnedBy>(entity)) else { return; };
        self.player_by_actor.insert(id.into(), owner.player.clone());
        self.actors_by_player.entry(owner.player.clone()).or_default().insert(id.into());
    }

    pub(crate) fn player(&self, actor: &str) -> Option<&str> {
        self.player_by_actor.get(actor).map(String::as_str)
    }

    #[cfg(test)]
    fn actors(&self, player: &str) -> Vec<&str> {
        self.actors_by_player.get(player).into_iter().flatten().map(String::as_str).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::ExternalId;

    #[test]
    fn rebuild_and_refresh_keep_one_inverse_owner() {
        let mut world = World::new();
        let a = world.spawn((ExternalId("a".into()), OwnedBy { player: "p1".into() })).id();
        let b = world.spawn((ExternalId("b".into()), OwnedBy { player: "p1".into() })).id();
        let ids = BTreeMap::from([("a".into(), a), ("b".into(), b)]);
        let mut index = OwnershipIndex::default();
        index.rebuild(&world, &ids);
        assert_eq!(index.actors("p1"), vec!["a", "b"]);

        world.entity_mut(a).insert(OwnedBy { player: "p2".into() });
        index.refresh(&world, "a", Some(a));
        assert_eq!(index.actors("p1"), vec!["b"]);
        assert_eq!(index.player("a"), Some("p2"));

        world.entity_mut(b).remove::<OwnedBy>();
        index.refresh(&world, "b", Some(b));
        assert!(index.actors("p1").is_empty());
    }
}
