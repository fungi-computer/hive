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

#[cfg(test)]
mod tests {
    use super::Catalog;
    use std::collections::BTreeMap;

    #[test]
    fn mixed_unit_volumes_are_checked_against_one_capacity() {
        let catalog = Catalog::new(BTreeMap::from([
            ("water".into(), 1),
            ("stone".into(), 3),
        ]));
        assert_eq!(catalog.quantity_volume("stone", 2).unwrap(), 6);
        assert!(catalog.fits(8, 1, "stone", 2).unwrap());
        assert!(!catalog.fits(6, 1, "stone", 2).unwrap());
        assert!(catalog.fits(8, 7, "water", 1).unwrap());
        assert!(!catalog.fits(8, 8, "water", 1).unwrap());
    }

    #[test]
    fn unknown_or_overflowing_material_is_rejected() {
        let catalog = Catalog::new(BTreeMap::from([("water".into(), 1)]));
        assert!(catalog.quantity_volume("missing", 1).is_err());
        assert!(catalog.quantity_volume("water", u32::MAX).is_ok());
    }
}
