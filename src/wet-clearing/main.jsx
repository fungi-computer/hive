import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@fungi.computer/caps/components/button';
import { Card, CardContent } from '@fungi.computer/caps/components/card';
import '@fungi.computer/caps/styles.css';
import { createWetView } from './view.js';
import './style.css';

function WetClearing() {
  const host = useRef(null), view = useRef(null), worker = useRef(null), sequence = useRef(0);
  const [scene, setScene] = useState(null), [selection, setSelection] = useState(null);
  const [target, setTarget] = useState(null), [turn, setTurn] = useState(0);
  const [busy, setBusy] = useState(true), [notice, setNotice] = useState('Opening the clearing…');
  const checkpoint = useRef(null);
  const send = action => {
    if (!worker.current || busy) return;
    setBusy(true); worker.current.postMessage({ id: ++sequence.current, action, at: selection });
  };
  useEffect(() => {
    let disposed = false;
    const runtime = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.current = runtime;
    runtime.onmessage = ({ data }) => {
      if (disposed || data.id !== sequence.current) return;
      setBusy(false);
      if (!data.ok) { setNotice(data.error); return; }
      checkpoint.current = data.checkpoint;
      setScene(data.scene); setTarget(data.target);
      if (data.action === 'dig') setSelection(null);
      setNotice(data.scene.water.length ? 'Groundwater seeps through the exposed soil into the pit.'
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
  useEffect(() => { if (scene && view.current) view.current.draw(scene, selection ?? (scene.water.length ? null : target), turn); }, [scene, selection, target, turn]);
  const canDig = scene && !scene.water.length && selection?.every((n, i) => n === target[i]);
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
          <Button size="sm" disabled={busy || !canDig} onClick={() => send('dig')}>Dig selected block</Button>
          <Button size="sm" disabled={busy || !scene?.water.length} onClick={() => send('advance')}>Wait ten minutes</Button>
          <Button size="sm" variant="outline" disabled={busy || !scene} onClick={() => setTurn((turn + 1) % 4)}>Turn view</Button>
          <Button size="sm" variant="outline" disabled={busy || !scene} onClick={() => send('reopen')}>Reopen checkpoint</Button>
          <Button size="sm" variant="outline" disabled={!scene} onClick={download}>Download world</Button>
          <Button size="sm" variant="outline" disabled={busy || !scene} onClick={() => { setSelection(null); send('reset'); }}>New clearing</Button>
        </div>
        {scene && <dl className="wet-facts" data-wet-facts>
          <dt>Time</dt><dd>{scene.timeS} seconds</dd>
          <dt>Water in the holes</dt><dd>{scene.balance.pitWaterKg.toFixed(2)} litres</dd>
          <dt>Deepest water</dt><dd>{(Math.max(0, ...scene.water.map(column => column.depthM)) * 100).toFixed(2)} cm</dd>
          <dt>Water in removed soil</dt><dd>{scene.balance.exportWaterKg.toFixed(2)} litres</dd>
          <dt>Total water accounted for</dt><dd>{scene.balance.totalWaterKg.toFixed(2)} litres</dd>
        </dl>}
      </CardContent></Card>
    </div>
    <p className="wet-scope">Live local world, with one supported pit and a fixed initial water supply.
      Darker modeled soil contains more water. Water height is drawn at its actual scale.
      Time advances only when you press Wait. Checkpoint reopen reconstructs this local world;
      this page does not claim server persistence, overflowing water or a running air simulation.</p>
  </>;
}
createRoot(document.querySelector('#wet-clearing')).render(<WetClearing />);
