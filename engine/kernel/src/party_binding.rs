//! Durable host binding for the one-time starter result.
//!
//! This record outlives every actor it originally returned. It is deliberately
//! not an ECS component or a live membership index.
use crate::components::{valid_id, PartyBinding, Result};
use std::collections::BTreeSet;

#[derive(Default)]
pub(crate) struct PartyBindingStore {
    rows: crate::record_changes::RecordMap<String, PartyBinding>,
}

impl PartyBindingStore {
    pub(crate) fn changed(&self) -> impl Iterator<Item = &String> { self.rows.changed() }
    pub(crate) fn token(&self) -> u64 { self.rows.token() }
    pub(crate) fn accept(&mut self, token: u64) { self.rows.accept(token); }
    pub(crate) fn get(&self, binding_id: &str) -> Option<&PartyBinding> {
        self.rows.get(binding_id)
    }

    pub(crate) fn insert(&mut self, binding: PartyBinding) -> Result<()> {
        if self.rows.contains_key(&binding.binding_id) {
            return Err("duplicate party binding".into());
        }
        self.rows.insert(binding.binding_id.clone(), binding);
        Ok(())
    }

    pub(crate) fn snapshot(&self) -> Vec<PartyBinding> {
        self.rows.values().cloned().collect()
    }

    pub(crate) fn restore(rows: Vec<PartyBinding>, next_sequence: u64) -> Result<Self> {
        let mut store = Self::default();
        for row in rows {
            store.insert(row)?;
        }
        store.validate(next_sequence)?;
        Ok(store)
    }

    fn validate(&self, next_sequence: u64) -> Result<()> {
        let mut players = BTreeSet::new();
        let mut parties = BTreeSet::new();
        for row in self.rows.values() {
            let people = row.people.iter().collect::<BTreeSet<_>>();
            if !valid_id(&row.binding_id)
                || row.sequence == 0
                || row.sequence >= next_sequence
                || row.player != format!("player:{}", row.sequence)
                || row.party != format!("party:{}", row.sequence)
                || row.people.len() > 32
                || row.people.iter().any(|id| !valid_id(id))
                || people.len() != row.people.len()
                || row.digest.len() != 64
                || !row.digest.bytes().all(|byte| byte.is_ascii_hexdigit())
                || !players.insert(row.player.clone())
                || !parties.insert(row.party.clone())
            {
                return Err("invalid party binding".into());
            }
        }
        Ok(())
    }
}
