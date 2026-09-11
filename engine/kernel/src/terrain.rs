//! Generated base terrain plus bounded canonical material edits.
//!
//! The generator is immutable and produces no stocks.  This owner only keeps
//! sparse replacements durable and a bounded rebuildable page cache.

use crate::generation::{BRICK_SIDE, Cell, CompiledWorld, GENERATOR_VERSION};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const TERRAIN_STATE_VERSION: u16 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MaterialProperty {
    pub slot: u16,
    pub solid: bool,
    pub diggable: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Page {
    x: i64,
    y: i32,
    z: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PrepareResult {
    Prepared(PreparedChange),
    Blocked { current: u16, reason: BlockReason },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockReason {
    ExpectedMaterialChanged,
    ReplacementUnknown,
    NotDiggable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreparedChange {
    pub base_revision: u64,
    pub cell: Cell,
    pub expected: u16,
    pub replacement: u16,
    pub removed: u16,
    pub cell_metric_millilitres: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AppliedChange {
    pub revision: u64,
    pub cell: Cell,
    pub removed: u16,
    pub cell_metric_millilitres: u64,
}

#[derive(Serialize, Deserialize)]
struct TerrainSave {
    version: u16,
    generator_version: String,
    binding: String,
    revision: u64,
    edits: Vec<EditRecord>,
}
#[derive(Serialize, Deserialize)]
struct EditRecord {
    x: i64,
    y: i32,
    z: i64,
    slot: u16,
}

pub struct TerrainOwner {
    generator: CompiledWorld,
    binding: String,
    properties: BTreeMap<u16, MaterialProperty>,
    cache: BTreeMap<Page, Box<[u16; 4096]>>,
    max_pages: usize,
    edits: BTreeMap<Cell, u16>,
    max_edits: usize,
    max_bytes: usize,
    revision: u64,
}

impl TerrainOwner {
    pub fn new(
        generator: CompiledWorld,
        binding: impl Into<String>,
        properties: impl IntoIterator<Item = MaterialProperty>,
        max_pages: usize,
        max_edits: usize,
        max_bytes: usize,
    ) -> Result<Self, &'static str> {
        if max_pages == 0
            || max_pages > 32
            || max_edits == 0
            || max_edits > 65_536
            || max_bytes < 256
            || max_bytes > 1_048_576
        {
            return Err("terrain bounds out of range");
        }
        let mut map = BTreeMap::new();
        for property in properties {
            if map.insert(property.slot, property).is_some() {
                return Err("duplicate material property");
            }
        }
        if map.len() > 1024 {
            return Err("material definition budget exceeded");
        }
        let slots = generator.material_slots();
        if !map.contains_key(&slots.air)
            || !map.contains_key(&slots.soil)
            || !map.contains_key(&slots.stone)
        {
            return Err("generated material slot lacks properties");
        }
        Ok(Self {
            generator,
            binding: binding.into(),
            properties: map,
            cache: BTreeMap::new(),
            max_pages,
            edits: BTreeMap::new(),
            max_edits,
            max_bytes,
            revision: 0,
        })
    }
    fn page_of(cell: Cell) -> Option<Page> {
        Some(Page {
            x: super::generation::floor_div(cell.x, i64::from(BRICK_SIDE))? * i64::from(BRICK_SIDE),
            y: super::generation::floor_div(i64::from(cell.y), i64::from(BRICK_SIDE))? as i32
                * BRICK_SIDE,
            z: super::generation::floor_div(cell.z, i64::from(BRICK_SIDE))? * i64::from(BRICK_SIDE),
        })
    }
    fn material_known(&self, slot: u16) -> bool {
        self.properties.contains_key(&slot)
    }
    fn page_values(&mut self, page: Page) -> Result<&[u16; 4096], &'static str> {
        if !self.cache.contains_key(&page) {
            if self.cache.len() >= self.max_pages {
                self.cache.pop_first();
            }
            let cells = self.generator.sample_brick(Cell {
                x: page.x,
                y: page.y,
                z: page.z,
            })?;
            let mut values = Box::new([0u16; 4096]);
            for generated in cells {
                let lx = generated.cell.x.rem_euclid(16) as usize;
                let ly = generated.cell.y.rem_euclid(16) as usize;
                let lz = generated.cell.z.rem_euclid(16) as usize;
                values[(ly * 16 + lz) * 16 + lx] = generated.material;
            }
            self.cache.insert(page, values);
        }
        Ok(self.cache.get(&page).expect("inserted page"))
    }
    pub fn query(&mut self, cell: Cell) -> Result<u16, &'static str> {
        if let Some(slot) = self.edits.get(&cell) {
            return Ok(*slot);
        }
        let page = Self::page_of(cell).ok_or("invalid page coordinate")?;
        let values = self.page_values(page)?;
        Ok(
            values[((cell.y.rem_euclid(16) as usize * 16 + cell.z.rem_euclid(16) as usize) * 16)
                + cell.x.rem_euclid(16) as usize],
        )
    }
    pub fn prepare_replacement(
        &mut self,
        cell: Cell,
        expected: u16,
        replacement: u16,
    ) -> Result<PrepareResult, &'static str> {
        let current = self.query(cell)?;
        if current != expected {
            return Ok(PrepareResult::Blocked {
                current,
                reason: BlockReason::ExpectedMaterialChanged,
            });
        }
        if !self.material_known(replacement) {
            return Ok(PrepareResult::Blocked {
                current,
                reason: BlockReason::ReplacementUnknown,
            });
        }
        if replacement == current {
            return Ok(PrepareResult::Blocked {
                current,
                reason: BlockReason::NotDiggable,
            });
        }
        if !self
            .properties
            .get(&current)
            .is_some_and(|property| property.diggable)
        {
            return Ok(PrepareResult::Blocked {
                current,
                reason: BlockReason::NotDiggable,
            });
        }
        Ok(PrepareResult::Prepared(PreparedChange {
            base_revision: self.revision,
            cell,
            expected,
            replacement,
            removed: current,
            cell_metric_millilitres: (1000.0 * self.generator_cell_metric()).round() as u64,
        }))
    }
    fn generator_cell_metric(&self) -> f64 {
        self.generator.vertical_metres()
    }
    pub fn apply(&mut self, prepared: PreparedChange) -> Result<AppliedChange, &'static str> {
        if prepared.base_revision != self.revision {
            return Err("prepared terrain change is stale");
        }
        if self.query(prepared.cell)? != prepared.expected {
            return Err("prepared terrain material changed");
        }
        if !self.material_known(prepared.replacement) {
            return Err("prepared replacement is unknown");
        }
        if !self.edits.contains_key(&prepared.cell) && self.edits.len() >= self.max_edits {
            return Err("terrain edit budget exceeded");
        }
        self.edits.insert(prepared.cell, prepared.replacement);
        self.revision = self
            .revision
            .checked_add(1)
            .ok_or("terrain revision overflow")?;
        if let Some(page) = Self::page_of(prepared.cell) {
            self.cache.remove(&page);
        }
        Ok(AppliedChange {
            revision: self.revision,
            cell: prepared.cell,
            removed: prepared.removed,
            cell_metric_millilitres: prepared.cell_metric_millilitres,
        })
    }
    pub fn export(&self) -> Result<Vec<u8>, &'static str> {
        let edits = self
            .edits
            .iter()
            .map(|(cell, slot)| EditRecord {
                x: cell.x,
                y: cell.y,
                z: cell.z,
                slot: *slot,
            })
            .collect::<Vec<_>>();
        let save = TerrainSave {
            version: TERRAIN_STATE_VERSION,
            generator_version: GENERATOR_VERSION.to_owned(),
            binding: self.binding.clone(),
            revision: self.revision,
            edits,
        };
        let bytes = serde_json::to_vec(&save).map_err(|_| "terrain save encoding failed")?;
        if bytes.len() > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
        Ok(bytes)
    }
    pub fn restore(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
        if bytes.len() > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
        let save: TerrainSave =
            serde_json::from_slice(bytes).map_err(|_| "invalid terrain save")?;
        if save.version != TERRAIN_STATE_VERSION
            || save.generator_version != GENERATOR_VERSION
            || save.binding != self.binding
        {
            return Err("unsupported terrain save binding");
        }
        if save.edits.len() > self.max_edits {
            return Err("terrain edit count exceeds budget");
        }
        let mut found = BTreeSet::new();
        let mut checked = BTreeMap::new();
        for edit in save.edits {
            let cell = Cell {
                x: edit.x,
                y: edit.y,
                z: edit.z,
            };
            if !found.insert(cell) || !self.material_known(edit.slot) {
                return Err("duplicate or unknown terrain edit");
            }
            let page = Self::page_of(cell).ok_or("invalid terrain edit coordinate")?;
            if self
                .generator
                .sample_brick(Cell {
                    x: page.x,
                    y: page.y,
                    z: page.z,
                })
                .is_err()
            {
                return Err("terrain edit outside bounds");
            }
            checked.insert(cell, edit.slot);
        }
        self.edits = checked;
        self.revision = save.revision;
        self.cache.clear();
        Ok(())
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }
    pub fn cache_len(&self) -> usize {
        self.cache.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::{Bounds, GENERATOR_VERSION, MaterialSlots, WorldSpec};

    fn owner() -> TerrainOwner {
        let spec = WorldSpec {
            seed: "terrain-test",
            identity: "terrain-recipe",
            bounds: Bounds {
                min_x: -64,
                max_x: 64,
                min_y: -64,
                max_y: 64,
                min_z: -64,
                max_z: 64,
            },
            slots: MaterialSlots {
                air: 0,
                soil: 1,
                stone: 2,
            },
            sea_level: 12,
            vertical_metres: 0.54,
            max_samples: 4096,
        };
        let generator = spec.compile().unwrap();
        TerrainOwner::new(
            generator,
            "terrain-binding",
            [
                MaterialProperty {
                    slot: 0,
                    solid: false,
                    diggable: false,
                },
                MaterialProperty {
                    slot: 1,
                    solid: true,
                    diggable: true,
                },
                MaterialProperty {
                    slot: 2,
                    solid: true,
                    diggable: true,
                },
            ],
            4,
            64,
            32 * 1024,
        )
        .unwrap()
    }
    #[test]
    fn point_and_negative_page_queries_agree() {
        let mut terrain = owner();
        let page = terrain
            .page_values(Page {
                x: -16,
                y: 0,
                z: -16,
            })
            .unwrap()
            .to_owned();
        for z in -16..0 {
            for x in -16..0 {
                for y in 0..16 {
                    let cell = Cell { x, y, z };
                    let index =
                        (y * 16 + z.rem_euclid(16)) as usize * 16 + x.rem_euclid(16) as usize;
                    assert_eq!(terrain.query(cell).unwrap(), page[index]);
                }
            }
        }
    }
    #[test]
    fn blocked_and_retry_laws_preserve_revision() {
        let mut terrain = owner();
        let cell = Cell { x: 0, y: 0, z: 0 };
        let current = terrain.query(cell).unwrap();
        let revision = terrain.revision();
        let blocked = terrain
            .prepare_replacement(cell, current.wrapping_add(99), 0)
            .unwrap();
        assert!(matches!(
            blocked,
            PrepareResult::Blocked {
                reason: BlockReason::ExpectedMaterialChanged,
                ..
            }
        ));
        assert_eq!(terrain.revision(), revision);
        if current != 0 {
            let prepared = match terrain.prepare_replacement(cell, current, 0).unwrap() {
                PrepareResult::Prepared(value) => value,
                blocked => panic!("unexpected {blocked:?}"),
            };
            let result = terrain.apply(prepared).unwrap();
            assert_eq!(result.removed, current);
            assert_eq!(terrain.query(cell).unwrap(), 0);
            assert!(terrain.apply(prepared).is_err());
        }
    }
    #[test]
    fn save_binding_and_generator_version_are_checked() {
        let terrain = owner();
        let bytes = terrain.export().unwrap();
        assert!(
            bytes
                .windows(GENERATOR_VERSION.len())
                .any(|window| window == GENERATOR_VERSION.as_bytes())
        );
    }
}
