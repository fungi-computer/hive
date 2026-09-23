// Cold, bounded geometry projection from the canonical voxel owner. This is a
// 2-D vertical section with an explicit one-voxel extrusion, NOT a 3-D gas solve.
// No quantities, solver clocks or independent saved terrain live here.
import { MATERIAL } from './voxel-world.mjs';

function checkedWindow(description, window) {
  const { origin, axis, columns, rows } = window ?? {};
  if (!['x','z'].includes(axis)) throw new TypeError('section horizontal axis must be world x or z');
  for (const key of ['x','y','z']) {
    if (!Number.isSafeInteger(origin?.[key])) throw new TypeError('integer world origin required');
  }
  if (![columns,rows].every(n=>Number.isSafeInteger(n)&&n>=2) || columns*rows>16384)
    throw new RangeError('section requires 2+ cells per axis within 16384-cell budget');
  const bounds=description.identity.base.bounds;
  const last={...origin,[axis]:origin[axis]+columns-1,y:origin.y+rows-1};
  for(const key of ['x','y','z']) {
    const capital=key.toUpperCase();
    if(origin[key]<bounds[`min${capital}`] || last[key]>=bounds[`max${capital}`])
      throw new RangeError('section lies outside the supported world');
  }
  return {origin:{...origin},axis,columns,rows};
}

/** Returned arrays are independent geometry inputs. The gas solver admits them
 * under its existing constructor; mutating them cannot modify the voxel world.
 * An exterior opening must be deliberately supplied by the caller. The default
 * constructor boundary is sealed; reading a section does not create ambient air.
 */
export function compileGasSection(world, window) {
  const description=world.describe();
  const {identity,revision}=description;
  const {origin,axis,columns,rows}=checkedWindow(description,window);
  const {horizontalMetres:h,verticalMetres:v}=identity.base.units;
  if (![h,v].every(x=>Number.isFinite(x)&&x>0)) throw new TypeError('positive SI voxel metric required');
  const solid=[];
  for(let row=0;row<rows;row++) for(let column=0;column<columns;column++) {
    const cell={...origin,[axis]:origin[axis]+column,y:origin.y+row};
    if(world.read(cell)!==MATERIAL.air) solid.push(row*columns+column);
  }
  if(world.describe().revision!==revision) throw new Error('world changed during geometry extraction');
  // Local shape alone cannot distinguish two identical rooms in different
  // places/worlds. Bind that context through the existing solver identity.
  const domainId=JSON.stringify({identity,origin,axis,columns,rows});
  return {
    binding:{identity,revision,axis,origin,columns,rows},
    geometryInput:{nx:columns,nz:rows,hx:h,hz:v,depth:h,solid,revision,domainId},
    sampledCells:columns*rows,
  };
}

/** Cell centers use one explicit map: solver horizontal→selected world axis,
 * solver vertical→world y. World z never silently becomes vertical. */
export function sectionCellCenter(section,column,row) {
  const {binding:b,geometryInput:g}=section;
  if(!Number.isInteger(column)||!Number.isInteger(row)||column<0||row<0||column>=b.columns||row>=b.rows)
    throw new RangeError('section cell outside its window');
  return {
    x:(b.origin.x+(b.axis==='x'?column:0)+.5)*g.hx,
    y:(b.origin.y+row+.5)*g.hz,
    z:(b.origin.z+(b.axis==='z'?column:0)+.5)*g.depth,
  };
}

export function assertCurrentSection(world,section) {
  const current=world.describe();
  if(current.revision!==section.binding.revision ||
    JSON.stringify(current.identity)!==JSON.stringify(section.binding.identity))
    throw new Error('stale or different world geometry');
}
