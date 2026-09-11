//! Generated base terrain plus bounded canonical material edits.
//!
//! The generator is immutable and produces no stocks.  This owner only keeps
//! sparse replacements durable and a bounded rebuildable page cache.

use crate::generation::{BRICK_SIDE, Cell, CompiledWorld, GENERATOR_VERSION};
use serde::de::{SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

pub const TERRAIN_STATE_VERSION: u16 = 2;

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

#[derive(Clone, Debug, PartialEq)]
pub enum PrepareResult {
    Prepared(PreparedChange),
    Blocked { current: u16, reason: BlockReason },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockReason {
    ExpectedMaterialChanged,
    ReplacementUnknown,
    Unchanged,
    NotExcavatable,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PreparedChange {
    base_revision: u64,
    cell: Cell,
    expected: u16,
    replacement: u16,
    removed: u16,
    cell_volume_m3: f64,
    binding: Arc<str>,
    owner_token: Arc<()>,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AppliedChange {
    pub revision: u64,
    pub cell: Cell,
    pub removed: u16,
    pub cell_volume_m3: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SurfaceCell {
    pub cell: Cell,
    pub material: u16,
}

#[derive(Serialize, Deserialize)]
struct TerrainSave {
    version: u16,
    generator_version: String,
    binding: String,
    revision: u64,
    edits: BoundedEdits,
}
#[derive(Serialize, Deserialize)]
struct EditRecord {
    x: i64,
    y: i32,
    z: i64,
    slot: u16,
}

#[derive(Serialize)]
struct BoundedEdits(Vec<EditRecord>);
impl<'de> Deserialize<'de> for BoundedEdits {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct EditsVisitor;
        impl<'de> Visitor<'de> for EditsVisitor {
            type Value = BoundedEdits;
            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("at most 65536 terrain edits")
            }
            fn visit_seq<A: SeqAccess<'de>>(
                self,
                mut sequence: A,
            ) -> Result<Self::Value, A::Error> {
                let hint = sequence.size_hint().unwrap_or(0);
                if hint > 65_536 {
                    return Err(serde::de::Error::custom(
                        "terrain edit count exceeds absolute bound",
                    ));
                }
                let mut edits = Vec::with_capacity(hint);
                while let Some(edit) = sequence.next_element()? {
                    if edits.len() >= 65_536 {
                        return Err(serde::de::Error::custom(
                            "terrain edit count exceeds absolute bound",
                        ));
                    }
                    edits.push(edit);
                }
                Ok(BoundedEdits(edits))
            }
        }
        deserializer.deserialize_seq(EditsVisitor)
    }
}

pub struct TerrainOwner {
    generator: CompiledWorld,
    binding: Arc<str>,
    owner_token: Arc<()>,
    properties: BTreeMap<u16, MaterialProperty>,
    cache: BTreeMap<Page, Box<[u16; 4096]>>,
    max_pages: usize,
    edits: BTreeMap<Cell, u16>,
    max_edits: usize,
    max_bytes: usize,
    revision: u64,
    edit_bytes: usize,
}

impl TerrainOwner {
    const SURFACE_COLUMNS: usize = 64;
    const SURFACE_SAMPLES: usize = 4096;
    fn edit_entry_bytes(cell: Cell, slot: u16) -> Result<usize, &'static str> {
        postcard::experimental::serialized_size(&(cell.x, cell.y, cell.z, slot))
            .map_err(|_| "terrain entry size failed")
    }
    fn encoded_size(
        &self,
        revision: u64,
        edit_bytes: usize,
        count: usize,
    ) -> Result<usize, &'static str> {
        let header = postcard::experimental::serialized_size(&(
            TERRAIN_STATE_VERSION,
            GENERATOR_VERSION,
            self.binding.as_ref(),
            revision,
            count as u32,
        ))
        .map_err(|_| "terrain header size failed")?;
        header
            .checked_add(edit_bytes)
            .ok_or("terrain encoded size overflow")
    }
    pub fn new(
        generator: CompiledWorld,
        properties: impl IntoIterator<Item = MaterialProperty>,
        max_pages: usize,
        max_edits: usize,
        max_bytes: usize,
    ) -> Result<Self, &'static str> {
        if max_pages == 0
            || max_pages > 32
            || max_edits == 0
            || max_edits > 65_536
            || max_bytes == 0
            || max_bytes > 1_048_576
        {
            return Err("terrain bounds out of range");
        }
        let mut map = BTreeMap::new();
        let mut property_count = 0usize;
        for property in properties {
            property_count += 1;
            if property_count > 1024 {
                return Err("material definition budget exceeded");
            }
            if map.insert(property.slot, property).is_some() {
                return Err("duplicate material property");
            }
        }
        let slots = generator.material_slots();
        if !map.contains_key(&slots.air)
            || !map.contains_key(&slots.soil)
            || !map.contains_key(&slots.stone)
        {
            return Err("generated material slot lacks properties");
        }
        let mut binding_text = format!("{}|properties:", generator.identity_binding());
        for property in map.values() {
            binding_text.push_str(&format!(
                "{}:{}:{};",
                property.slot, property.solid as u8, property.diggable as u8
            ));
        }
        let empty_size = postcard::experimental::serialized_size(&(
            TERRAIN_STATE_VERSION,
            GENERATOR_VERSION,
            binding_text.as_str(),
            0u64,
            0u32,
        ))
        .map_err(|_| "terrain header size failed")?;
        if max_bytes < empty_size {
            return Err("terrain byte budget cannot represent empty state");
        }
        Ok(Self {
            generator,
            binding: Arc::from(binding_text),
            owner_token: Arc::new(()),
            properties: map,
            cache: BTreeMap::new(),
            max_pages,
            edits: BTreeMap::new(),
            max_edits,
            max_bytes,
            revision: 0,
            edit_bytes: 0,
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
            let mut values = Box::new([0u16; 4096]);
            let origin = Cell {
                x: page.x,
                y: page.y,
                z: page.z,
            };
            let cells = if self.generator.contains_cell(origin)
                && self.generator.contains_cell(Cell {
                    x: page.x + 15,
                    y: page.y + 15,
                    z: page.z + 15,
                }) {
                self.generator.sample_brick(origin)?
            } else {
                let mut clipped = Vec::new();
                for y in page.y..page.y + 16 {
                    for z in page.z..page.z + 16 {
                        for x in page.x..page.x + 16 {
                            let cell = Cell { x, y, z };
                            if self.generator.contains_cell(cell) {
                                clipped.push(self.generator.sample(cell)?);
                            }
                        }
                    }
                }
                clipped
            };
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
    fn base_query(&mut self, cell: Cell) -> Result<u16, &'static str> {
        let page = Self::page_of(cell).ok_or("invalid page coordinate")?;
        let values = self.page_values(page)?;
        Ok(
            values[((cell.y.rem_euclid(16) as usize * 16 + cell.z.rem_euclid(16) as usize) * 16)
                + cell.x.rem_euclid(16) as usize],
        )
    }
    pub fn query(&mut self, cell: Cell) -> Result<u16, &'static str> {
        if !self.generator.contains_cell(cell) {
            return Err("cell outside world bounds");
        }
        if let Some(slot) = self.edits.get(&cell) {
            return Ok(*slot);
        }
        self.base_query(cell)
    }
    /// Query a bounded batch in caller order. Validation is completed before
    /// touching the rebuildable page cache, so a rejected request has no
    /// partial result.
    pub fn query_cells(&mut self, cells: &[Cell]) -> Result<Vec<u16>, &'static str> {
        if cells.is_empty() || cells.len() > 256 {
            return Err("terrain query batch exceeds bound");
        }
        if cells.iter().any(|cell| !self.generator.contains_cell(*cell)) {
            return Err("cell outside world bounds");
        }
        cells.iter().map(|cell| self.query(*cell)).collect()
    }
    /// Find the highest current solid cell at each exterior x/z column. The
    /// generator bed is the first air row, so the search starts at bed - 1;
    /// sparse solid edits may raise that start. The search never enters a
    /// cave from below the exterior surface and has one shared sample budget.
    pub fn surface_cells(&mut self, columns: &[(i64, i64)]) -> Result<Vec<Option<SurfaceCell>>, &'static str> {
        if columns.is_empty() || columns.len() > Self::SURFACE_COLUMNS {
            return Err("surface query batch exceeds bound");
        }
        let (min_y, max_y) = self.generator.vertical_bounds();
        let mut requested = BTreeMap::new();
        for &(x, z) in columns {
            let bed = self.generator.bed_level(x, z)?;
            let start = bed.checked_sub(1).ok_or("surface coordinate underflow")?.clamp(min_y, max_y - 1);
            requested.entry((x, z)).and_modify(|value| *value = (*value).max(start)).or_insert(start);
        }
        for (cell, slot) in &self.edits {
            if requested.contains_key(&(cell.x, cell.z)) && self.properties.get(slot).is_some_and(|property| property.solid) {
                requested.entry((cell.x, cell.z)).and_modify(|value| *value = (*value).max(cell.y));
            }
        }
        let mut samples = 0usize;
        let mut result = Vec::with_capacity(columns.len());
        for (x, z) in columns {
            let mut y = *requested.get(&(*x, *z)).expect("validated surface column");
            let mut found = None;
            while self.generator.contains_cell(Cell { x, y, z }) {
                if samples == Self::SURFACE_SAMPLES {
                    return Err("surface query sample budget exhausted");
                }
                let cell = Cell { x, y, z };
                let material = self.query(cell)?;
                samples += 1;
                if self.properties.get(&material).is_some_and(|property| property.solid) {
                    found = Some(SurfaceCell { cell, material });
                    break;
                }
                y = y.checked_sub(1).ok_or("surface coordinate underflow")?;
            }
            result.push(found);
        }
        Ok(result)
    }
    pub fn page_projection(&mut self, origin: Cell) -> Result<Box<[u16; 4096]>, &'static str> {
        if origin.x.rem_euclid(16) != 0
            || origin.y.rem_euclid(16) != 0
            || origin.z.rem_euclid(16) != 0
        {
            return Err("page origin must be 16-cell aligned");
        }
        let page = Self::page_of(origin).ok_or("invalid page coordinate")?;
        if !self.generator.intersects_page(origin) {
            return Err("page outside world bounds");
        }
        let end_x = page.x.checked_add(16).ok_or("page coordinate overflow")?;
        let end_y = page.y.checked_add(16).ok_or("page coordinate overflow")?;
        let end_z = page.z.checked_add(16).ok_or("page coordinate overflow")?;
        let mut values = Box::new((*self.page_values(page)?).clone());
        for (cell, slot) in self.edits.iter() {
            if cell.x >= page.x
                && cell.x < end_x
                && cell.y >= page.y
                && cell.y < end_y
                && cell.z >= page.z
                && cell.z < end_z
                && self.generator.contains_cell(*cell)
            {
                values[((cell.y.rem_euclid(16) as usize * 16 + cell.z.rem_euclid(16) as usize)
                    * 16)
                    + cell.x.rem_euclid(16) as usize] = *slot;
            }
        }
        Ok(values)
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
                reason: BlockReason::Unchanged,
            });
        }
        Ok(PrepareResult::Prepared(PreparedChange {
            base_revision: self.revision,
            cell,
            expected,
            replacement,
            removed: current,
            cell_volume_m3: self.generator_cell_metric(),
            binding: self.binding.clone(),
            owner_token: self.owner_token.clone(),
        }))
    }
    pub fn prepare_excavation(
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
                reason: BlockReason::Unchanged,
            });
        }
        if !self
            .properties
            .get(&current)
            .is_some_and(|property| property.solid && property.diggable)
        {
            return Ok(PrepareResult::Blocked {
                current,
                reason: BlockReason::NotExcavatable,
            });
        }
        self.prepare_replacement(cell, expected, replacement)
    }
    fn generator_cell_metric(&self) -> f64 {
        self.generator.vertical_metres()
    }
    pub fn apply(&mut self, prepared: PreparedChange) -> Result<AppliedChange, &'static str> {
        if prepared.base_revision != self.revision {
            return Err("prepared terrain change is stale");
        }
        if !Arc::ptr_eq(&prepared.binding, &self.binding) {
            return Err("prepared terrain change belongs to another terrain owner");
        }
        if !Arc::ptr_eq(&prepared.owner_token, &self.owner_token) {
            return Err("prepared terrain change belongs to another owner instance");
        }
        if self.query(prepared.cell)? != prepared.expected {
            return Err("prepared terrain material changed");
        }
        if !self.material_known(prepared.replacement) {
            return Err("prepared replacement is unknown");
        }
        let base = self.base_query(prepared.cell)?;
        let old = self.edits.get(&prepared.cell).copied();
        let old_bytes = match old {
            Some(slot) => Self::edit_entry_bytes(prepared.cell, slot)?,
            None => 0,
        };
        let new_bytes = if prepared.replacement == base {
            0
        } else {
            Self::edit_entry_bytes(prepared.cell, prepared.replacement)?
        };
        let next_count =
            self.edits.len() - usize::from(old.is_some()) + usize::from(new_bytes != 0);
        let next_edit_bytes = self.edit_bytes - old_bytes + new_bytes;
        if next_count > self.max_edits {
            return Err("terrain edit budget exceeded");
        }
        let next_revision = self
            .revision
            .checked_add(1)
            .ok_or("terrain revision overflow")?;
        if self.encoded_size(next_revision, next_edit_bytes, next_count)? > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
        if new_bytes == 0 {
            self.edits.remove(&prepared.cell);
        } else {
            self.edits.insert(prepared.cell, prepared.replacement);
        }
        self.edit_bytes = next_edit_bytes;
        self.revision = next_revision;
        Ok(AppliedChange {
            revision: self.revision,
            cell: prepared.cell,
            removed: prepared.removed,
            cell_volume_m3: prepared.cell_volume_m3,
        })
    }
    pub fn export(&self) -> Result<Vec<u8>, &'static str> {
        if self.encoded_size(self.revision, self.edit_bytes, self.edits.len())? > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
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
            binding: self.binding.to_string(),
            revision: self.revision,
            edits: BoundedEdits(edits),
        };
        let bytes = postcard::to_allocvec(&save).map_err(|_| "terrain save encoding failed")?;
        if bytes.len() > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
        Ok(bytes)
    }
    pub fn restore(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
        if bytes.len() > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
        let (save, remainder): (TerrainSave, &[u8]) =
            postcard::take_from_bytes(bytes).map_err(|_| "invalid terrain save")?;
        if !remainder.is_empty() {
            return Err("terrain save has trailing bytes");
        }
        if save.version != TERRAIN_STATE_VERSION
            || save.generator_version != GENERATOR_VERSION
            || save.binding != self.binding.as_ref()
        {
            return Err("unsupported terrain save binding");
        }
        if save.edits.0.len() > self.max_edits {
            return Err("terrain edit count exceeds budget");
        }
        let mut found = BTreeSet::new();
        let mut checked = BTreeMap::new();
        let mut checked_bytes = 0usize;
        for edit in save.edits.0 {
            let cell = Cell {
                x: edit.x,
                y: edit.y,
                z: edit.z,
            };
            if !found.insert(cell) || !self.material_known(edit.slot) {
                return Err("duplicate or unknown terrain edit");
            }
            if !self.generator.contains_cell(cell) {
                return Err("terrain edit outside bounds");
            }
            checked_bytes = checked_bytes
                .checked_add(Self::edit_entry_bytes(cell, edit.slot)?)
                .ok_or("terrain edit bytes overflow")?;
            checked.insert(cell, edit.slot);
        }
        if self.encoded_size(save.revision, checked_bytes, checked.len())? > self.max_bytes {
            return Err("terrain save exceeds byte budget");
        }
        self.edits = checked;
        self.edit_bytes = checked_bytes;
        self.revision = save.revision;
        self.cache.clear();
        Ok(())
    }
    pub fn is_open_material(&self, slot: u16) -> bool {
        self.properties.get(&slot).is_some_and(|property| !property.solid)
    }
    pub fn cell_spacing_m(&self) -> [f64; 3] {
        [1.0, self.generator.vertical_metres(), 1.0]
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }
    pub fn cache_len(&self) -> usize {
        self.cache.len()
    }
    pub fn prepared_cell(&self, prepared: &PreparedChange) -> Cell {
        prepared.cell
    }
    pub fn prepared_removed(&self, prepared: &PreparedChange) -> u16 {
        prepared.removed
    }
    pub fn prepared_volume_m3(&self, prepared: &PreparedChange) -> f64 {
        prepared.cell_volume_m3
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::{Bounds, MaterialSlots, WorldSpec};

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
                    let index = (y as usize * 16 + z.rem_euclid(16) as usize) * 16
                        + x.rem_euclid(16) as usize;
                    assert_eq!(terrain.query(cell).unwrap(), page[index]);
                }
            }
        }
        terrain.edits.insert(
            Cell {
                x: -16,
                y: 0,
                z: -16,
            },
            1,
        );
        terrain.edits.insert(Cell { x: 0, y: 0, z: 0 }, 2);
        let negative = terrain
            .page_projection(Cell {
                x: -16,
                y: 0,
                z: -16,
            })
            .unwrap();
        let positive = terrain.page_projection(Cell { x: 0, y: 0, z: 0 }).unwrap();
        assert_eq!(negative[0], 1);
        assert_eq!(positive[0], 2);
    }
    #[test]
    fn blocked_and_retry_laws_preserve_revision() {
        let mut terrain = owner();
        let cell = (-32..32)
            .flat_map(|x| (-32..32).flat_map(move |z| (-32..0).map(move |y| Cell { x, y, z })))
            .find(|cell| {
                terrain
                    .query(*cell)
                    .ok()
                    .is_some_and(|slot| slot == 1 || slot == 2)
            })
            .expect("bounded fixture has solid cell");
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
            let prepared = match terrain.prepare_excavation(cell, current, 0).unwrap() {
                PrepareResult::Prepared(value) => value,
                blocked => panic!("unexpected {blocked:?}"),
            };
            let replay = prepared.clone();
            let mut other = owner();
            assert!(other.apply(replay.clone()).is_err());
            let result = terrain.apply(prepared).unwrap();
            assert_eq!(result.removed, current);
            assert_eq!(terrain.query(cell).unwrap(), 0);
            assert!(terrain.apply(replay).is_err());
        }
    }
    #[test]
    fn save_binding_and_generator_version_are_checked() {
        let mut terrain = owner();
        let cell = Cell { x: 0, y: -1, z: 0 };
        let current = terrain.query(cell).unwrap();
        let replacement = if current == 0 { 1 } else { 0 };
        let prepared = terrain
            .prepare_replacement(cell, current, replacement)
            .unwrap();
        let PrepareResult::Prepared(prepared) = prepared else {
            panic!("fixture replacement must be admitted")
        };
        terrain.apply(prepared).unwrap();
        let bytes = terrain.export().unwrap();
        assert!(!bytes.is_empty());
        let mut restored = owner();
        restored.restore(&bytes).unwrap();
        assert_eq!(restored.query(cell).unwrap(), terrain.query(cell).unwrap());
        let before = restored.query(cell).unwrap();
        let mut broken = bytes.clone();
        broken[0] = b'!';
        assert!(restored.restore(&broken).is_err());
        assert_eq!(restored.query(cell).unwrap(), before);
        let mut trailing = bytes.clone();
        trailing.push(0);
        assert!(restored.restore(&trailing).is_err());
        let mut small = owner();
        small.max_edits = 0;
        assert!(small.restore(&bytes).is_err());
        assert_eq!(small.query(cell).unwrap(), current);
    }
    #[test]
    fn cache_stays_bounded_across_cold_pages() {
        let mut terrain = owner();
        for x in (-64..64).step_by(16) {
            let _ = terrain.query(Cell { x, y: -1, z: 0 });
        }
        assert!(terrain.cache_len() <= 4);
    }

    #[test]
    fn batch_query_returns_changed_cells_in_input_order() {
        let mut terrain = owner();
        let changed = Cell { x: 0, y: -1, z: 0 };
        let other = Cell { x: 1, y: -1, z: 0 };
        let expected = terrain.query(other).unwrap();
        let current = terrain.query(changed).unwrap();
        let replacement = if current == 0 { 1 } else { 0 };
        let prepared = match terrain.prepare_replacement(changed, current, replacement).unwrap() {
            PrepareResult::Prepared(value) => value,
            blocked => panic!("unexpected {blocked:?}"),
        };
        terrain.apply(prepared).unwrap();
        assert_eq!(terrain.query_cells(&[changed, other, changed]).unwrap(), vec![replacement, expected, replacement]);
    }

    #[test]
    fn batch_query_rejects_bad_budget_and_bounds_before_sampling() {
        let mut terrain = owner();
        let valid = Cell { x: 0, y: -1, z: 0 };
        let too_many = vec![valid; 257];
        assert!(terrain.query_cells(&too_many).is_err());
        assert!(terrain.query_cells(&[valid, Cell { x: i64::MAX, y: i32::MAX, z: i64::MAX }]).is_err());
    }

    #[test]
    fn surface_query_finds_generated_surface_and_sparse_excavation_lowers_it() {
        let mut terrain = owner();
        let column = (0, 0);
        let bed = terrain.generator.bed_level(column.0, column.1).unwrap();
        let surface = Cell { x: column.0, y: bed - 1, z: column.1 };
        let original = terrain.surface_cells(&[column]).unwrap()[0].unwrap();
        assert_eq!(original.cell, surface);
        let prepared = match terrain.prepare_excavation(surface, original.material, 0).unwrap() {
            PrepareResult::Prepared(value) => value,
            blocked => panic!("unexpected {blocked:?}"),
        };
        terrain.apply(prepared).unwrap();
        let lowered = terrain.surface_cells(&[column]).unwrap()[0].unwrap();
        assert_eq!(lowered.cell.y, surface.y - 1);
    }

    #[test]
    fn surface_query_rejects_bad_count_and_column_bounds() {
        let mut terrain = owner();
        assert!(terrain.surface_cells(&vec![(0, 0); 65]).is_err());
        assert!(terrain.surface_cells(&[(i64::MAX, 0)]).is_err());
    }

    #[test]
    fn surface_query_clamps_generated_bed_to_clipped_upper_bound() {
        let spec = WorldSpec {
            seed: "clipped-surface",
            identity: "clipped-surface",
            bounds: Bounds { min_x: -8, max_x: 8, min_y: -16, max_y: 8, min_z: -8, max_z: 8 },
            slots: MaterialSlots { air: 0, soil: 1, stone: 2 },
            sea_level: 4,
            vertical_metres: 1.0,
            max_samples: 4096,
        };
        let generator = spec.compile().unwrap();
        let column = (-8..8)
            .flat_map(|x| (-8..8).map(move |z| (x, z)))
            .find(|&(x, z)| generator.bed_level(x, z).unwrap() > 8)
            .expect("fixture has a bed above clipped bound");
        let mut terrain = TerrainOwner::new(
            generator,
            [
                MaterialProperty { slot: 0, solid: false, diggable: false },
                MaterialProperty { slot: 1, solid: true, diggable: true },
                MaterialProperty { slot: 2, solid: true, diggable: true },
            ],
            4,
            64,
            32 * 1024,
        ).unwrap();
        let surface = terrain.surface_cells(&[column]).unwrap()[0].unwrap();
        assert_eq!(surface.cell.y, 7);
    }
    #[test]
    fn encoded_size_matches_export_for_empty_and_negative_edits() {
        let mut terrain = owner();
        assert_eq!(
            terrain.export().unwrap().len(),
            terrain.encoded_size(0, 0, 0).unwrap()
        );
        let first = Cell {
            x: -1,
            y: -2,
            z: -3,
        };
        terrain.edits.insert(first, 1);
        terrain.edit_bytes = TerrainOwner::edit_entry_bytes(first, 1).unwrap();
        assert_eq!(
            terrain.export().unwrap().len(),
            terrain.encoded_size(0, terrain.edit_bytes, 1).unwrap()
        );
        let second = Cell {
            x: -16,
            y: -17,
            z: -18,
        };
        terrain.edits.insert(second, 2);
        terrain.edit_bytes += TerrainOwner::edit_entry_bytes(second, 2).unwrap();
        terrain.revision = 127;
        assert_eq!(
            terrain.export().unwrap().len(),
            terrain.encoded_size(127, terrain.edit_bytes, 2).unwrap()
        );
        terrain.revision = 128;
        assert_eq!(
            terrain.export().unwrap().len(),
            terrain.encoded_size(128, terrain.edit_bytes, 2).unwrap()
        );
        terrain.max_edits = 128;
        terrain.revision = 127;
        for count in [127usize, 128] {
            terrain.edits.clear();
            terrain.edit_bytes = 0;
            for index in 0..count {
                let cell = Cell { x: index as i64 - 64, y: -2, z: -3 };
                terrain.edits.insert(cell, 1);
                terrain.edit_bytes += TerrainOwner::edit_entry_bytes(cell, 1).unwrap();
            }
            assert_eq!(terrain.export().unwrap().len(),
                terrain.encoded_size(127, terrain.edit_bytes, count).unwrap());
        }
    }
}
