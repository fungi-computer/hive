import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@fungi.computer/caps/components/button';
import { Card, CardContent } from '@fungi.computer/caps/components/card';
import '@fungi.computer/caps/styles.css';
import { createWetView } from './view.js';
import './style.css';

const sameAt = (left, right) => left?.length === 3 && right?.length === 3 &&
  left.every((value, index) => value === right[index]);

function explainRejection(message) {
  if (message.includes('canonical water ownership'))
    return 'That edge block opens onto soil outside this modeled patch. Choose an interior block beside the marker or an existing hole.';
  if (message.includes('unobstructed vertical vent'))
    return 'Dig the exposed top block before digging deeper in that column.';
  if (message.includes('same modeled rim'))
    return 'That cut would make an unsupported uneven opening. Keep connected holes at the same ground rim.';
  if (message.includes('remaining owned'))
    return 'Choose a visible brown soil block inside the modeled patch. Stone and already-open cells cannot be dug here.';
  return 'That request is outside this clearing’s current soil rules. The world was left unchanged.';
}

function WetClearing() {
  const host = useRef(null), view = useRef(null), worker = useRef(null), sequence = useRef(0);
  const [scene, setScene] = useState(null), [selection, setSelection] = useState(null);
  const [target, setTarget] = useState(null), [turn, setTurn] = useState(0);
  const [busy, setBusy] = useState(true), [notice, setNotice] = useState('Opening the clearing…');
  const checkpoint = useRef(null);
  const send = (action, details = {}) => {
    if (!worker.current || busy) return;
    setBusy(true); worker.current.postMessage({ id: ++sequence.current, action,
      ...(action === 'dig' ? { at: selection } : {}), ...details });
  };
  useEffect(() => {
    let disposed = false;
    const runtime = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.current = runtime;
    runtime.onmessage = ({ data }) => {
      if (disposed || data.id !== sequence.current) return;
      setBusy(false);
      if (!data.ok) { setNotice(explainRejection(data.error)); return; }
      checkpoint.current = data.checkpoint;
      setScene(data.scene); setTarget(data.target);
      if (data.action === 'dig') setSelection(null);
      if (data.action === 'dig')
        setNotice(`Excavated ${data.scene.exports.length} wet-soil block${data.scene.exports.length === 1 ? '' : 's'}. Select adjacent soil or an exposed floor to continue.`);
      else if (data.action === 'advance')
        setNotice(`Advanced this finite water system by ${data.seconds} seconds.`);
      else setNotice(data.scene.water.length
        ? 'The checkpoint is open. Select adjacent modeled soil or an exposed floor to dig again.'
        : 'Select the marked soil block, then dig.');
    };
    const stop = message => {
      runtime.terminate(); worker.current = null; setBusy(true);
      setNotice(`${message} Reload to start again; the last checkpoint can still be downloaded.`);
    };
    runtime.onerror = event => stop(event.message || 'The local world stopped.');
    createWetView(host.current, setSelection).then(renderer => {
      if (disposed) { renderer.destroy(); return; }
      view.current = renderer;
      runtime.postMessage({ id: ++sequence.current, action: 'inspect' });
    }).catch(error => { if (!disposed) stop(error.message); });
    return () => { disposed = true; runtime.terminate(); view.current?.destroy(); view.current = null; };
  }, []);
  useEffect(() => { if (scene && view.current)
    view.current.draw(scene, selection ?? (scene.revision === 0 ? target : null), turn); }, [scene, selection, target, turn]);
  const selectedCell = scene?.cells.find(cell => sameAt(cell.at, selection));
  const modeledSoilSelected = selectedCell?.theta !== null && selectedCell?.theta !== undefined;
  const selectionHint = selection === null
    ? scene?.revision > 0 ? 'Select visible modeled soil beside a hole, or select an exposed soil floor to deepen it.'
      : 'Select the marked soil block to begin.'
    : modeledSoilSelected ? 'This soil is modeled. Digging will still check that the opening stays inside the finite patch.'
      : 'That selection is stone or lies outside the modeled soil patch.';
  function download() {
    const url = URL.createObjectURL(new Blob([checkpoint.current], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'wet-clearing.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <>
    <header><h1>A hole in wet ground</h1><p>Dig into the hillside. The water already in the soil has somewhere new to go.</p></header>
    <div className="wet-layout">
      <div className="wet-world" ref={host} data-wet-world />
      <Card variant="outline"><CardContent>
        <p role="status">{notice}</p>
        <p>Selected: <strong data-wet-selected>{selection?.join(', ') ?? 'none'}</strong></p>
        <div className="wet-actions">
          <Button size="sm" disabled={busy || !modeledSoilSelected} onClick={() => send('dig')}>Dig selected soil</Button>
          <Button size="sm" disabled={busy || !scene?.water.length} onClick={() => send('advance', { seconds: 6 })}>Watch 6 seconds</Button>
          <Button size="sm" disabled={busy || !scene?.water.length} onClick={() => send('advance', { seconds: 600 })}>Wait ten minutes</Button>
          <Button size="sm" variant="outline" disabled={busy || !scene} onClick={() => setTurn((turn + 1) % 4)}>Turn view</Button>
          <Button size="sm" variant="outline" disabled={busy || !scene} onClick={() => send('reopen')}>Reopen checkpoint</Button>
          <Button size="sm" variant="outline" disabled={!scene} onClick={download}>Download world</Button>
          <Button size="sm" variant="outline" disabled={busy || !scene} onClick={() => { setSelection(null); send('reset'); }}>New clearing</Button>
        </div>
        <p className="wet-selection-hint">{selectionHint}</p>
        {scene && <dl className="wet-facts" data-wet-facts>
          <dt>Time</dt><dd>{scene.timeS} seconds</dd>
          <dt>Open holes</dt><dd>{scene.water.length}</dd>
          <dt>Water in the holes</dt><dd>{scene.balance.pitWaterKg.toFixed(2)} kg</dd>
          <dt>Deepest water</dt><dd>{(Math.max(0, ...scene.water.map(column => column.depthM)) * 100).toFixed(2)} cm</dd>
          <dt>Water in remaining soil</dt><dd>{scene.balance.retainedWaterKg.toFixed(2)} kg</dd>
          <dt>Water in removed soil</dt><dd>{scene.balance.exportWaterKg.toFixed(2)} kg</dd>
          <dt>Total water accounted for</dt><dd>{scene.balance.totalWaterKg.toFixed(2)} kg</dd>
        </dl>}
        {scene?.water.length > 0 && <><h2 className="wet-pool-heading">Water in each hole</h2>
          <ul className="wet-pools">{scene.water.map(column => <li key={column.id}>
            <span>At {column.at.join(', ')}</span>
            <span>{column.massKg.toFixed(2)} kg · {(column.depthM * 100).toFixed(2)} cm</span>
          </li>)}</ul></>}
      </CardContent></Card>
    </div>
    <p className="wet-scope">Live local world, with a bounded 4 × 4 soil patch and a fixed initial water supply.
      Darker modeled soil contains more water. Water height is drawn at its actual scale.
      Its generated ground has exactly two soil layers above stone. Edge cuts that would expose unknown soil are rejected.
      Time advances only when you press a time button. Checkpoint reopen reconstructs this local world;
      this page does not claim server persistence, rock digging, overflowing water or a running air simulation.</p>
  </>;
}
createRoot(document.querySelector('#wet-clearing')).render(<WetClearing />);
