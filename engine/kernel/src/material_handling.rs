//! Bounded material volume accounting. Containers own volume capacity; lots
//! own quantity and kind. This module owns only checked arithmetic.
use std::collections::BTreeMap;

#[derive(Clone, Debug, Default)]
pub struct Catalog { unit_volume: BTreeMap<String, u32> }
impl Catalog {
    pub fn new(unit_volume: BTreeMap<String, u32>) -> Self { Self { unit_volume } }
    pub fn unit_volume(&self, kind: &str) -> Option<u32> { self.unit_volume.get(kind).copied() }
    pub fn quantity_volume(&self, kind: &str, quantity: u32) -> Result<u64, String> {
        let unit = self.unit_volume(kind).ok_or_else(|| format!("material kind has no unit volume: {kind}"))?;
        u64::from(unit).checked_mul(u64::from(quantity)).ok_or_else(|| "material volume overflow".into())
    }
    pub fn fits(&self, capacity: u32, occupied: u64, kind: &str, quantity: u32) -> Result<bool, String> {
        Ok(occupied.checked_add(self.quantity_volume(kind, quantity)?).ok_or("material volume overflow")? <= u64::from(capacity))
    }
}
