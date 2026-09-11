//! Deterministic, bounded world source. It produces immutable facts only.

use std::f64::consts::PI;

pub const GENERATOR_VERSION: &str = "world-lab-terrain-height-sea-v5-native-1";
pub const BRICK_SIDE: i32 = 16;

pub fn floor_div(value: i64, divisor: i64) -> Option<i64> {
    if divisor <= 0 {
        return None;
    }
    let q = value / divisor;
    Some(if value % divisor < 0 { q - 1 } else { q })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cell {
    pub x: i64,
    pub y: i32,
    pub z: i64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Bounds {
    pub min_x: i64,
    pub max_x: i64,
    pub min_y: i32,
    pub max_y: i32,
    pub min_z: i64,
    pub max_z: i64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MaterialSlots {
    pub air: u16,
    pub soil: u16,
    pub stone: u16,
}
#[derive(Clone, Copy, Debug)]
pub struct WorldSpec<'a> {
    pub seed: &'a str,
    pub identity: &'a str,
    pub bounds: Bounds,
    pub slots: MaterialSlots,
    pub sea_level: i32,
    pub vertical_metres: f64,
    pub max_samples: usize,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Terrain {
    SurfaceWater,
    SeaLevelGround,
    Land,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Geology {
    Air,
    Soil,
    Stone,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GeneratedCell {
    pub cell: Cell,
    pub material: u16,
    pub terrain: Terrain,
    pub geology: Geology,
    pub bed_level: i32,
    pub wet: bool,
    pub cave_void: bool,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GroundwaterProposal {
    pub head_level: i32,
    pub pore_fill: f64,
    pub recharge: f64,
}

// FNV-1a over UTF-16 code units, matching the retained JS owner.
fn hash_string(value: &str, initial: u32) -> u32 {
    value.encode_utf16().fold(initial, |h, unit| {
        (h ^ unit as u32).wrapping_mul(16_777_619)
    })
}
fn integer_hash(mut hash: u32, value: i64) -> u32 {
    if value.unsigned_abs() > 999_999_999 {
        return hash_string(&value.to_string(), hash);
    }
    if value < 0 {
        hash = hash_string("-", hash);
    }
    let mut n = value.unsigned_abs();
    let mut place = 1;
    while place * 10 <= n {
        place *= 10;
    }
    loop {
        let digit = (b'0' as u64 + n / place) as u16;
        hash = (hash ^ digit as u32).wrapping_mul(16_777_619);
        n -= (n / place) * place;
        if place == 1 {
            break;
        }
        place /= 10;
    }
    hash
}
fn pipe(hash: u32) -> u32 {
    (hash ^ b'|' as u32).wrapping_mul(16_777_619)
}
fn lattice2(prefix: u32, x: i64, z: i64, salt: &str) -> u32 {
    hash_string(salt, pipe(integer_hash(pipe(integer_hash(prefix, x)), z)))
}
fn lattice3(prefix: u32, x: i64, y: i64, z: i64, salt: &str) -> u32 {
    let xy = pipe(integer_hash(pipe(integer_hash(prefix, x)), y));
    hash_string(salt, pipe(integer_hash(xy, z)))
}
fn unit(hash: u32) -> f64 {
    hash as f64 / 4_294_967_295.0
}
fn smooth(v: f64) -> f64 {
    v * v * (3.0 - 2.0 * v)
}
fn noise2(prefix: u32, x: f64, z: f64, salt: &str) -> f64 {
    let x0 = x.floor() as i64;
    let z0 = z.floor() as i64;
    let fx = smooth(x - x0 as f64);
    let fz = smooth(z - z0 as f64);
    let a = unit(lattice2(prefix, x0, z0, salt));
    let b = unit(lattice2(prefix, x0 + 1, z0, salt));
    let c = unit(lattice2(prefix, x0, z0 + 1, salt));
    let d = unit(lattice2(prefix, x0 + 1, z0 + 1, salt));
    a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}
fn noise3(prefix: u32, x: f64, y: f64, z: f64, salt: &str) -> f64 {
    let x0 = x.floor() as i64;
    let y0 = y.floor() as i64;
    let z0 = z.floor() as i64;
    let (fx, fy, fz) = (
        smooth(x - x0 as f64),
        smooth(y - y0 as f64),
        smooth(z - z0 as f64),
    );
    let at = |dx: i64, dy: i64, dz: i64| {
        unit(lattice3(prefix, x0 + dx, y0 + dy, z0 + dz, salt)) * 2.0 - 1.0
    };
    let lerp = |a: f64, b: f64, t: f64| a + (b - a) * t;
    let x00 = lerp(at(0, 0, 0), at(1, 0, 0), fx);
    let x10 = lerp(at(0, 1, 0), at(1, 1, 0), fx);
    let x01 = lerp(at(0, 0, 1), at(1, 0, 1), fx);
    let x11 = lerp(at(0, 1, 1), at(1, 1, 1), fx);
    lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz)
}
fn bell(distance: f64, radius: f64) -> f64 {
    let f = 1.0 - smooth((distance.abs() / radius).min(1.0));
    f * f
}

#[derive(Clone, Copy)]
enum FieldKind {
    Elevation,
    Groundwater,
}

pub struct CompiledWorld {
    bounds: Bounds,
    slots: MaterialSlots,
    sea_level: i32,
    vertical_metres: f64,
    max_samples: usize,
    height_prefix: u32,
    cave_prefix: u32,
    coast_phase: f64,
    ridge_phase: f64,
    canyon_phase: f64,
}

impl<'a> WorldSpec<'a> {
    pub fn compile(&self) -> Result<CompiledWorld, &'static str> {
        if self.seed.is_empty() || self.identity.is_empty() {
            return Err("world identity required");
        }
        if self.bounds.min_x >= self.bounds.max_x
            || self.bounds.min_y >= self.bounds.max_y
            || self.bounds.min_z >= self.bounds.max_z
        {
            return Err("invalid world bounds");
        }
        if self.bounds.min_x < -8_000_000
            || self.bounds.max_x > 8_000_000
            || self.bounds.min_z < -8_000_000
            || self.bounds.max_z > 8_000_000
        {
            return Err("coordinate domain exceeds exact noise range");
        }
        if self.max_samples == 0 || self.max_samples > 65_536 {
            return Err("sample budget out of range");
        }
        if !self.vertical_metres.is_finite()
            || self.vertical_metres <= 0.0
            || self.vertical_metres > 100.0
        {
            return Err("vertical metric out of range");
        }
        if self.sea_level < self.bounds.min_y || self.sea_level >= self.bounds.max_y {
            return Err("sea level outside vertical bounds");
        }
        if self.bounds.min_y > 0 || self.bounds.max_y <= 32 {
            return Err("vertical bounds must contain generated bed range 0..=32");
        }
        if self.slots.air == self.slots.soil
            || self.slots.air == self.slots.stone
            || self.slots.soil == self.slots.stone
        {
            return Err("material slots must be distinct");
        }
        let full = format!("{}:{}:{}", GENERATOR_VERSION, self.identity, self.seed);
        let height_prefix = hash_string(&format!("{}|", full), 2_166_136_261);
        let cave_prefix = hash_string(
            &format!(
                "{}:height-sea-cave-density-v2:global-trilinear-two-octave-cave-v1|",
                full
            ),
            2_166_136_261,
        );
        Ok(CompiledWorld {
            bounds: self.bounds,
            slots: self.slots,
            sea_level: self.sea_level,
            vertical_metres: self.vertical_metres,
            max_samples: self.max_samples,
            height_prefix,
            cave_prefix,
            coast_phase: noise2(height_prefix, 0.0, 0.0, "coast-phase") * PI * 2.0,
            ridge_phase: noise2(height_prefix, 0.0, 0.0, "ridge-phase") * PI * 2.0,
            canyon_phase: noise2(height_prefix, 0.0, 0.0, "canyon-phase") * PI * 2.0,
        })
    }
}

impl CompiledWorld {
    fn field(&self, x: f64, z: f64, footprint: f64, kind: FieldKind) -> f64 {
        const OCTAVES: [(f64, f64, &str, &str); 6] = [
            (1024.0, 0.56, "elevation-broad", "groundwater-broad"),
            (512.0, 0.26, "elevation-region", "groundwater-region"),
            (256.0, 0.12, "elevation-landform", "groundwater-landform"),
            (64.0, 0.05, "elevation-detail", "groundwater-detail"),
            (24.0, 0.025, "elevation-fine", "groundwater-fine"),
            (8.0, 0.012, "elevation-grain", "groundwater-grain"),
        ];
        OCTAVES
            .iter()
            .filter(|(scale, _, _, _)| *scale >= footprint * 1.5)
            .map(|(scale, amplitude, elevation_salt, groundwater_salt)| {
                let salt = match kind {
                    FieldKind::Elevation => elevation_salt,
                    FieldKind::Groundwater => groundwater_salt,
                };
                *amplitude * noise2(self.height_prefix, x / *scale, z / *scale, salt)
            })
            .sum()
    }
    pub fn bed_level(&self, x: i64, z: i64) -> Result<i32, &'static str> {
        if x < self.bounds.min_x
            || x >= self.bounds.max_x
            || z < self.bounds.min_z
            || z >= self.bounds.max_z
        {
            return Err("terrain coordinate outside world bounds");
        }
        let (xf, zf) = (x as f64, z as f64);
        let coast = 180.0 * ((xf + self.coast_phase * 90.0) / 620.0).sin()
            + 0.14 * xf
            + 42.0 * (noise2(self.height_prefix, xf / 700.0, 0.37, "coast-warp") - 0.5);
        let ridge = coast + 180.0 + 38.0 * ((xf + self.ridge_phase * 60.0) / 360.0).sin();
        let canyon = coast
            + 430.0
            + 52.0 * ((xf - self.canyon_phase * 70.0) / 410.0).sin()
            + 18.0 * (noise2(self.height_prefix, xf / 560.0, -0.41, "canyon-warp") - 0.5);
        let raw = ((zf - coast + 96.0) / 192.0).clamp(0.0, 1.0);
        let base = (0.18 + self.field(xf, zf, 1.0, FieldKind::Elevation) * 0.82 - 0.1
            + 0.18 * smooth(raw))
        .clamp(0.0, 1.0);
        Ok(
            (base + 0.3 * bell(zf - ridge, 92.0) - 0.34 * bell(zf - canyon, 82.0))
                .clamp(0.0, 1.0)
                .mul_add(32.0, 0.0)
                .round() as i32,
        )
    }
    fn cave_void(&self, cell: Cell, bed: i32) -> bool {
        if cell.y >= bed - 3 {
            return false;
        }
        let m = noise3(
            self.cave_prefix,
            cell.x as f64 / 32.0,
            cell.y as f64 * self.vertical_metres / 18.0,
            cell.z as f64 / 32.0,
            "cave-macro",
        );
        let d = noise3(
            self.cave_prefix,
            cell.x as f64 / 11.0,
            cell.y as f64 * self.vertical_metres / 7.0,
            cell.z as f64 / 11.0,
            "cave-detail",
        );
        0.78 * m + 0.22 * d >= 0.42
    }
    pub fn sample(&self, cell: Cell) -> Result<GeneratedCell, &'static str> {
        if cell.x < self.bounds.min_x
            || cell.x >= self.bounds.max_x
            || cell.y < self.bounds.min_y
            || cell.y >= self.bounds.max_y
            || cell.z < self.bounds.min_z
            || cell.z >= self.bounds.max_z
        {
            return Err("cell outside world bounds");
        }
        let bed = self.bed_level(cell.x, cell.z)?;
        let cave_void = self.cave_void(cell, bed);
        let wet = bed < self.sea_level;
        let geology = if cell.y >= bed || cave_void {
            Geology::Air
        } else if cell.y >= bed - 2 {
            Geology::Soil
        } else {
            Geology::Stone
        };
        let material = match geology {
            Geology::Air => self.slots.air,
            Geology::Soil => self.slots.soil,
            Geology::Stone => self.slots.stone,
        };
        Ok(GeneratedCell {
            cell,
            material,
            terrain: if wet {
                Terrain::SurfaceWater
            } else if bed == self.sea_level {
                Terrain::SeaLevelGround
            } else {
                Terrain::Land
            },
            geology,
            bed_level: bed,
            wet,
            cave_void,
        })
    }
    pub fn sample_brick(&self, origin: Cell) -> Result<Vec<GeneratedCell>, &'static str> {
        if origin.x.rem_euclid(16) != 0
            || origin.y.rem_euclid(16) != 0
            || origin.z.rem_euclid(16) != 0
        {
            return Err("brick origin must be 16-cell aligned");
        }
        let end_x = origin
            .x
            .checked_add(16)
            .ok_or("brick coordinate overflow")?;
        let end_y = origin
            .y
            .checked_add(16)
            .ok_or("brick coordinate overflow")?;
        let end_z = origin
            .z
            .checked_add(16)
            .ok_or("brick coordinate overflow")?;
        if origin.x < self.bounds.min_x
            || origin.y < self.bounds.min_y
            || origin.z < self.bounds.min_z
            || end_x > self.bounds.max_x
            || end_y > self.bounds.max_y
            || end_z > self.bounds.max_z
        {
            return Err("brick outside world bounds");
        }
        if 4096 > self.max_samples {
            return Err("sample budget exceeded");
        }
        let mut out = Vec::with_capacity(4096);
        for z in origin.z..end_z {
            for x in origin.x..end_x {
                let bed = self.bed_level(x, z)?;
                for y in origin.y..end_y {
                    let cell = Cell { x, y, z };
                    let cave_void = self.cave_void(cell, bed);
                    let geology = if y >= bed || cave_void {
                        Geology::Air
                    } else if y >= bed - 2 {
                        Geology::Soil
                    } else {
                        Geology::Stone
                    };
                    let material = match geology {
                        Geology::Air => self.slots.air,
                        Geology::Soil => self.slots.soil,
                        Geology::Stone => self.slots.stone,
                    };
                    out.push(GeneratedCell {
                        cell,
                        material,
                        terrain: if bed < self.sea_level {
                            Terrain::SurfaceWater
                        } else if bed == self.sea_level {
                            Terrain::SeaLevelGround
                        } else {
                            Terrain::Land
                        },
                        geology,
                        bed_level: bed,
                        wet: bed < self.sea_level,
                        cave_void,
                    });
                }
            }
        }
        Ok(out)
    }
    pub fn groundwater(&self, x: i64, z: i64) -> Result<GroundwaterProposal, &'static str> {
        let bed = self.bed_level(x, z)?;
        let coarse =
            (self.field(x as f64 / 8.0, z as f64 / 8.0, 8.0, FieldKind::Groundwater) - 0.5) * 4.0;
        let raw = (i64::from(self.sea_level) as f64
            + 0.35 * (i64::from(bed) - i64::from(self.sea_level)).max(0) as f64
            + coarse)
            .round() as i64;
        let head = raw.clamp(
            i64::from(self.bounds.min_y),
            i64::from(bed.min(self.bounds.max_y)),
        ) as i32;
        Ok(GroundwaterProposal {
            head_level: head,
            pore_fill: 0.65,
            recharge: 0.0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn spec<'a>(seed: &'a str) -> WorldSpec<'a> {
        WorldSpec {
            seed,
            identity: GENERATOR_VERSION,
            bounds: Bounds {
                min_x: -2048,
                max_x: 2048,
                min_y: -64,
                max_y: 64,
                min_z: -2048,
                max_z: 2048,
            },
            slots: MaterialSlots {
                air: 0,
                soil: 1,
                stone: 2,
            },
            sea_level: 12,
            vertical_metres: 0.54,
            max_samples: 4096,
        }
    }
    #[test]
    fn hash_reference_vectors_include_utf16() {
        assert_eq!(hash_string("a", 2166136261), 3826002220);
        assert_eq!(hash_string("é", 2166136261), 1812687940);
        assert_eq!(hash_string("𐐷", 2166136261), 865687542);
    }
    #[test]
    fn seeds_change_world_and_negative_seams_match_brick() {
        let a = spec("a").compile().unwrap();
        let b = spec("b").compile().unwrap();
        assert!(
            (-2048..2048)
                .flat_map(|x| [-1, 0, 1].into_iter().map(move |z| (x, z)))
                .any(|(x, z)| a.bed_level(x, z) != b.bed_level(x, z))
        );
        let brick = a
            .sample_brick(Cell {
                x: -16,
                y: 0,
                z: -16,
            })
            .unwrap();
        for generated in &brick {
            assert_eq!(*generated, a.sample(generated.cell).unwrap());
        }
    }
    #[test]
    fn invalid_inputs_are_rejected() {
        assert!(spec("").compile().is_err());
        let mut s = spec("x");
        s.vertical_metres = 0.0;
        assert!(s.compile().is_err());
        s = spec("x");
        s.bounds.max_x = s.bounds.min_x;
        assert!(s.compile().is_err());
        s = spec("x");
        s.bounds.min_y = 1;
        assert!(s.compile().is_err());
        s = spec("x");
        s.bounds.max_y = 32;
        assert!(s.compile().is_err());
        s = spec("x");
        let compiled = s.compile().unwrap();
        assert!(compiled.sample_brick(Cell { x: 0, y: -80, z: 0 }).is_err());
        s.sea_level = i32::MIN;
        assert!(s.compile().is_err());
        assert_eq!(floor_div(-1, 16), Some(-1));
    }
    #[test]
    fn groundwater_is_finite_proposal() {
        let p = spec("x").compile().unwrap().groundwater(0, 0).unwrap();
        assert!((0.0..=1.0).contains(&p.pore_fill));
        assert_eq!(p.recharge, 0.0);
    }
}
