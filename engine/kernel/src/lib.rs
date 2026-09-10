//! Headless Bevy-backed Hive kernel. Bevy owns entity state; string IDs and
//! records below form the stable host boundary.
use bevy_ecs::prelude::{Component, Entity, World};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub mod assign;
pub use assign::{Assignment, AssignmentError, Candidate, compute_cost, optimize};
pub type EntityId = String;
pub type ComponentId = String;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)] pub enum FieldType { Number, Boolean, Text, Entity, Nullable(Box<FieldType>), EntityArray }
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] pub enum Value { Number(f64), Boolean(bool), Text(String), Entity(EntityId), Null, EntityArray(Vec<EntityId>) }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)] pub struct FieldDefinition { pub ty: FieldType, pub optional: bool }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)] pub struct ComponentDefinition { pub id: ComponentId, pub version: u32, pub fields: BTreeMap<String, FieldDefinition> }
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] pub struct ComponentRecord { pub component: ComponentId, pub values: BTreeMap<String, Value> }
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)] pub struct Position { pub x: f64, pub y: f64, pub z: f64 }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)] pub struct MaterialLot { pub material: String, pub quantity: u32 }

#[derive(Component, Clone, Debug, PartialEq, Eq)] struct ExternalId(pub EntityId);
#[derive(Component, Clone, Debug, Default, PartialEq)] struct PhysicalPosition(pub Position);
#[derive(Component, Clone, Debug, Default, PartialEq, Eq)] struct MaterialInventory(pub BTreeMap<String, u32>);
#[derive(Component, Clone, Debug, Default, PartialEq)] struct AuthoredComponents(pub BTreeMap<ComponentId, ComponentRecord>);
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] pub struct EntitySnapshot { pub id: EntityId, pub position: Option<Position>, pub materials: Vec<MaterialLot>, pub components: Vec<ComponentRecord> }
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] pub struct Snapshot { pub version: u32, pub next_id: u64, pub entities: Vec<EntitySnapshot> }
#[derive(Debug, PartialEq, Eq)] pub enum KernelError { UnknownEntity(EntityId), UnknownComponent(ComponentId), DuplicateComponent(ComponentId), InvalidField(String), WrongType(String), MissingField(String), InvalidQuantity, InsufficientMaterial, SameEntity, UnsupportedSnapshotVersion(u32), DuplicateEntity(EntityId), DuplicateMaterial(String), InvalidNumber, InvalidId }

pub struct Kernel { ecs: World, ids: BTreeMap<EntityId, Entity>, schemas: BTreeMap<ComponentId, ComponentDefinition>, next_id: u64 }
impl Default for Kernel { fn default() -> Self { Self::new() } }
impl Kernel {
 pub fn new() -> Self { Self { ecs: World::new(), ids: BTreeMap::new(), schemas: BTreeMap::new(), next_id: 1 } }
 pub fn define_component(&mut self,d:ComponentDefinition)->Result<(),KernelError>{if self.schemas.contains_key(&d.id){return Err(KernelError::DuplicateComponent(d.id))}self.schemas.insert(d.id.clone(),d);Ok(())}
 pub fn spawn(&mut self)->EntityId{let id=format!("e{}",self.next_id);self.next_id+=1;let e=self.ecs.spawn((ExternalId(id.clone()),)).id();self.ids.insert(id.clone(),e);id}
 pub fn despawn(&mut self,id:&str)->Result<(),KernelError>{let e=self.ids.remove(id).ok_or_else(||KernelError::UnknownEntity(id.into()))?;self.ecs.despawn(e);Ok(())}
 pub fn set_position(&mut self,id:&str,p:Position)->Result<(),KernelError>{if !p.x.is_finite()||!p.y.is_finite()||!p.z.is_finite(){return Err(KernelError::InvalidNumber)}let e=self.entity(id)?;self.ecs.entity_mut(e).insert(PhysicalPosition(p));Ok(())}
 pub fn move_entities(&mut self,moves:&[(EntityId,Position)])->Result<(),KernelError>{for (id,p) in moves{self.set_position(id,p.clone())?}Ok(())}
 pub fn write_components(&mut self,writes:&[ComponentWrite])->Result<(),KernelError>{for w in writes{self.validate_write(w,None)?}for w in writes{let e=self.entity(&w.entity)?;let mut set=self.ecs.get::<AuthoredComponents>(e).cloned().unwrap_or_default();set.0.insert(w.component.clone(),ComponentRecord{component:w.component.clone(),values:w.values.clone()});self.ecs.entity_mut(e).insert(set);}Ok(())}
 pub fn query(&self,c:&str)->Result<Vec<EntityId>,KernelError>{self.schema(c)?;let mut out=Vec::new();for (id,e) in &self.ids{if self.ecs.get::<AuthoredComponents>(*e).is_some_and(|s|s.0.contains_key(c)){out.push(id.clone())}}Ok(out)}
 pub fn query_records(&self,c:&str)->Result<Vec<(EntityId,ComponentRecord)>,KernelError>{self.schema(c)?;Ok(self.query(c)?.into_iter().filter_map(|id|{let e=self.ids[&id];self.ecs.get::<AuthoredComponents>(e).and_then(|s|s.0.get(c).cloned().map(|r|(id,r)))}).collect())}
 pub fn add_material(&mut self,id:&str,mat:&str,q:u32)->Result<(),KernelError>{let e=self.entity(id)?;let mut i=self.ecs.get::<MaterialInventory>(e).cloned().unwrap_or_default();let old=i.0.get(mat).copied().unwrap_or(0);i.0.insert(mat.into(),old.checked_add(q).ok_or(KernelError::InvalidQuantity)?);self.ecs.entity_mut(e).insert(i);Ok(())}
 pub fn transfer_material(&mut self,from:&str,to:&str,mat:&str,q:u32)->Result<(),KernelError>{if q==0{return Err(KernelError::InvalidQuantity)}if from==to{return Err(KernelError::SameEntity)}let a=self.entity(from)?;let b=self.entity(to)?;let old=self.ecs.get::<MaterialInventory>(a).and_then(|i|i.0.get(mat)).copied().unwrap_or(0);if old<q{return Err(KernelError::InsufficientMaterial)}let mut si=self.ecs.get::<MaterialInventory>(a).cloned().unwrap_or_default();si.0.insert(mat.into(),old-q);let mut di=self.ecs.get::<MaterialInventory>(b).cloned().unwrap_or_default();let dest=di.0.get(mat).copied().unwrap_or(0);di.0.insert(mat.into(),dest.checked_add(q).ok_or(KernelError::InvalidQuantity)?);self.ecs.entity_mut(a).insert(si);self.ecs.entity_mut(b).insert(di);Ok(())}
 pub fn consume_material(&mut self,id:&str,mat:&str,q:u32)->Result<(),KernelError>{if q==0{return Err(KernelError::InvalidQuantity)}let e=self.entity(id)?;let mut i=self.ecs.get::<MaterialInventory>(e).cloned().unwrap_or_default();let old=i.0.get(mat).copied().unwrap_or(0);if old<q{return Err(KernelError::InsufficientMaterial)}i.0.insert(mat.into(),old-q);self.ecs.entity_mut(e).insert(i);Ok(())}
 pub fn snapshot(&self)->Snapshot{Snapshot{version:1,next_id:self.next_id,entities:self.ids.iter().map(|(id,e)|{let position=self.ecs.get::<PhysicalPosition>(*e).map(|x|x.0);let materials=self.ecs.get::<MaterialInventory>(*e).into_iter().flat_map(|i|i.0.iter().map(|(m,q)|MaterialLot{material:m.clone(),quantity:*q})).collect();let components=self.ecs.get::<AuthoredComponents>(*e).into_iter().flat_map(|s|s.0.values().cloned()).collect();EntitySnapshot{id:id.clone(),position,materials,components}}).collect()}}
 pub fn restore(&mut self,s:&Snapshot)->Result<(),KernelError>{self.validate_snapshot(s)?;let mut ecs=World::new();let mut ids=BTreeMap::new();for r in &s.entities{let e=ecs.spawn((ExternalId(r.id.clone()),)).id();if let Some(p)=r.position{ecs.entity_mut(e).insert(PhysicalPosition(p))}let mut i=MaterialInventory::default();for l in &r.materials{i.0.insert(l.material.clone(),l.quantity);}if !i.0.is_empty(){ecs.entity_mut(e).insert(i)}let mut a=AuthoredComponents::default();for c in &r.components{a.0.insert(c.component.clone(),c.clone());}if !a.0.is_empty(){ecs.entity_mut(e).insert(a)}ids.insert(r.id.clone(),e);}self.ecs=ecs;self.ids=ids;self.next_id=s.next_id;Ok(())}
 fn entity(&self,id:&str)->Result<Entity,KernelError>{self.ids.get(id).copied().ok_or_else(||KernelError::UnknownEntity(id.into()))}
 fn schema(&self,id:&str)->Result<&ComponentDefinition,KernelError>{self.schemas.get(id).ok_or_else(||KernelError::UnknownComponent(id.into()))}
 fn validate_write(&self,w:&ComponentWrite,known:Option<&BTreeSet<EntityId>>)->Result<(),KernelError>{self.entity(&w.entity)?;let d=self.schema(&w.component)?;for(n,v)in&w.values{let f=d.fields.get(n).ok_or_else(||KernelError::InvalidField(n.clone()))?;if !matches_value(&f.ty,v){return Err(KernelError::WrongType(n.clone()))}if let Value::Number(x)=v{if !x.is_finite(){return Err(KernelError::InvalidNumber)}}let valid=|x:&EntityId|known.map_or_else(||self.ids.contains_key(x),|k|k.contains(x));if let Value::Entity(x)=v{if !valid(x){return Err(KernelError::UnknownEntity(x.clone()))}}if let Value::EntityArray(xs)=v{if xs.iter().any(|x|!valid(x)){return Err(KernelError::UnknownEntity("array".into()))}}}for(n,f)in&d.fields{if !f.optional&&!w.values.contains_key(n){return Err(KernelError::MissingField(n.clone()))}}Ok(())}
 fn validate_snapshot(&self,s:&Snapshot)->Result<(),KernelError>{if s.version!=1{return Err(KernelError::UnsupportedSnapshotVersion(s.version))}if s.next_id==0{return Err(KernelError::InvalidId)}let known:BTreeSet<_>=s.entities.iter().map(|r|r.id.clone()).collect();if known.len()!=s.entities.len(){return Err(KernelError::DuplicateEntity("duplicate".into()))}for r in &s.entities{if r.id.is_empty(){return Err(KernelError::InvalidId)}if r.materials.iter().map(|x|x.material.clone()).collect::<BTreeSet<_>>().len()!=r.materials.len(){return Err(KernelError::DuplicateMaterial(r.id.clone()))}if r.components.iter().map(|x|x.component.clone()).collect::<BTreeSet<_>>().len()!=r.components.len(){return Err(KernelError::DuplicateComponent(r.id.clone()))}for c in &r.components{let d=self.schema(&c.component)?;for(n,v)in&c.values{let f=d.fields.get(n).ok_or_else(||KernelError::InvalidField(n.clone()))?;if !matches_value(&f.ty,v){return Err(KernelError::WrongType(n.clone()))}if let Value::Number(x)=v{if !x.is_finite(){return Err(KernelError::InvalidNumber)}}if let Value::Entity(x)=v{if !known.contains(x){return Err(KernelError::UnknownEntity(x.clone()))}}if let Value::EntityArray(xs)=v{if xs.iter().any(|x|!known.contains(x)){return Err(KernelError::UnknownEntity("array".into()))}}}for(n,f)in&d.fields{if !f.optional&&!c.values.contains_key(n){return Err(KernelError::MissingField(n.clone()))}}}}Ok(())}
}
#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]pub struct ComponentWrite{pub entity:EntityId,pub component:ComponentId,pub values:BTreeMap<String,Value>}
fn matches_value(t:&FieldType,v:&Value)->bool{match(t,v){(FieldType::Number,Value::Number(_))|(FieldType::Boolean,Value::Boolean(_))|(FieldType::Text,Value::Text(_))|(FieldType::Entity,Value::Entity(_))|(FieldType::EntityArray,Value::EntityArray(_))|(FieldType::Nullable(_),Value::Null)=>true,(FieldType::Nullable(i),x)=>matches_value(i,x),_=>false}}

/// JSON batch bridge for Worker/DO hosts. The batch is validated before any
/// operation commits; snapshots are the only durable representation.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub struct WasmKernel(Kernel);
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
impl WasmKernel {
 #[wasm_bindgen::prelude::wasm_bindgen(constructor)] pub fn new()->Self{Self(Kernel::new())}
 pub fn define_component(&mut self,json:&str)->Result<(),wasm_bindgen::JsValue>{let d:ComponentDefinition=serde_json::from_str(json).map_err(|e|wasm_bindgen::JsValue::from_str(&e.to_string()))?;self.0.define_component(d).map_err(|e|wasm_bindgen::JsValue::from_str(&format!("{e:?}")))}
 pub fn spawn(&mut self)->String{self.0.spawn()}
 pub fn apply_writes(&mut self,json:&str)->Result<(),wasm_bindgen::JsValue>{let writes:Vec<ComponentWrite>=serde_json::from_str(json).map_err(|e|wasm_bindgen::JsValue::from_str(&e.to_string()))?;self.0.write_components(&writes).map_err(|e|wasm_bindgen::JsValue::from_str(&format!("{e:?}")))}
 pub fn snapshot(&self)->Result<String,wasm_bindgen::JsValue>{serde_json::to_string(&self.0.snapshot()).map_err(|e|wasm_bindgen::JsValue::from_str(&e.to_string()))}
 pub fn restore(&mut self,json:&str)->Result<(),wasm_bindgen::JsValue>{let s:Snapshot=serde_json::from_str(json).map_err(|e|wasm_bindgen::JsValue::from_str(&e.to_string()))?;self.0.restore(&s).map_err(|e|wasm_bindgen::JsValue::from_str(&format!("{e:?}")))}
}
