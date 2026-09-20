import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {initSync,WasmKernel} from '../../generated/hive_kernel.js';
import {wasmKernelPort} from './wasm-kernel';
import {environmentFixture} from './fixtures/environment';
initSync({module:readFileSync('engine/generated/hive_kernel_bg.wasm')});
function saved(kernel:WasmKernel) {
 const records=kernel.capture_records();
 try {return JSON.parse(records.keys()).map((key:string)=>[key,Array.from(records.read(key))]);}
 finally {records.free();}
}
function loaded() {
 const kernel=new WasmKernel();
 kernel.load(JSON.stringify({format:'hive-game',version:3,game:'colony',components:[],materialCatalog:[],initial:[]}));
 kernel.load_environment(JSON.stringify(environmentFixture));
 return kernel;
}

test('768-cell native and adapter queries preserve caller order and physical state',()=>{
 const kernel=loaded(),port=wasmKernelPort(kernel);
 try {
  const cells:[number,number,number][]=Array.from({length:768},(_,i)=>[i%16-8,Math.floor(i/16)%48-8,(i*3)%16-8]);
  const expected=Array.from({length:3},(_,i)=>port.terrainMaterials(cells.slice(i*256,(i+1)*256))).flat();
  const before=saved(kernel);
  assert.deepEqual(port.terrainMaterials(cells),expected);
  assert.deepEqual(JSON.parse(kernel.terrain_materials(JSON.stringify(cells))),expected);
  assert.deepEqual(saved(kernel),before,'bulk reads cannot change saved state');
  assert.throws(()=>port.terrainMaterials([...cells,cells[0]]),/between 1 and 768/);
  assert.throws(()=>kernel.terrain_materials(JSON.stringify([...cells,cells[0]])),/cell budget/);
  assert.throws(()=>port.terrainMaterials([]),/between 1 and 768/);
  assert.throws(()=>kernel.terrain_materials('[]'),/batch exceeds/);
 } finally {port.dispose();}
});

test('existing 32 KiB native input cap and signed-coordinate checks remain enforced',()=>{
 const kernel=loaded(),port=wasmKernelPort(kernel);
 try {
  const input='[[0,0,0]]',atLimit=input+' '.repeat(32768-input.length);
  assert.equal(Buffer.byteLength(atLimit),32768);
  assert.deepEqual(JSON.parse(kernel.terrain_materials(atLimit)),port.terrainMaterials([[0,0,0]]));
  assert.throws(()=>kernel.terrain_materials(atLimit+' '),/input budget/);
  const worst=JSON.stringify(Array.from({length:768},()=>[-2147483648,-2147483648,-2147483648]));
  assert.equal(Buffer.byteLength(worst),29185);assert(Buffer.byteLength(worst)<32768);
  assert.throws(()=>kernel.terrain_materials(worst),/outside world bounds/,'valid count/input reaches physical bounds validation');
  assert.throws(()=>port.terrainMaterials([[2147483648,0,0]]),/signed integer cells/);
  assert.throws(()=>port.terrainMaterials([[0,.5,0]]),/signed integer cells/);
  assert.throws(()=>port.terrainMaterials([[0,0,NaN]]),/signed integer cells/);
  const before=saved(kernel);
  assert.throws(()=>port.terrainMaterials([[0,0,0],[1000,0,0]]),/outside world bounds/);
  assert.deepEqual(saved(kernel),before,'invalid batch cannot partially mutate authority');
 } finally {port.dispose();}
});
