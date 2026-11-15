// Einstellungen für Icons, eigene Grafiken und Formen
import { useRef, useState } from 'react';
import { useEditor, viewPage } from '../store';
import type { WNode } from '../model/types';
import { fitVectorRatio, importSvgFile, setVector } from '../model/vector';
import { VECTOR_LABEL } from '../model/vectorCore';
import { NumberField, Section } from '../ui/controls';
import { Icons } from '../ui/icons';
import { useDialog } from './SiteSettings';

export function VectorSection({ node }: { node: WNode }) {
  const v = node.vector!;
  const ids = [node.id];
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const title = v.kind === 'line' ? (v.arrowStart || v.arrowEnd ? 'Pfeil' : 'Linie') : VECTOR_LABEL[v.kind];

  return (
    <Section title={title}>
      {v.kind === 'icon' && (
        <div className="row">
          <button type="button" className="btn grow" onClick={() => useDialog.getState().show('icons', node.id)}><Icons.smile /> Anderes Icon …</button>
        </div>
      )}
      {v.kind === 'svg' && (
        <>
          <label className="check"><input type="checkbox" checked={v.paint === 'fill'} onChange={e => setVector(ids, { paint: e.target.checked ? 'fill' : 'original' }, 'vec-paint')} />
            <span>Einfarbig einfärben <span className="muted">(Farbe unter „Farbe“)</span></span></label>
          {v.paint !== 'fill' && <div className="field-hint">Die Grafik behält ihre Originalfarben.</div>}
          <div className="row">
            <button type="button" className="btn grow" onClick={() => fileRef.current?.click()}>Andere Datei …</button>
            <button type="button" className="btn grow" title="Höhe an das Seitenverhältnis der Grafik anpassen"
              onClick={() => fitVectorRatio(viewPage(useEditor.getState()), node.id)}>Seitenverhältnis</button>
          </div>
          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setErr(await importSvgFile(f, undefined, node.id));
          }} />
          {err && <p className="notice warn">{err}</p>}
        </>
      )}
      {((v.kind === 'icon' && v.paint === 'line') || v.kind === 'line') && (
        <div className="row">
          <NumberField label="Strichstärke" title={v.kind === 'icon' ? 'Strichstärke (Standard 2)' : 'Strichstärke in Pixeln'}
            min={v.kind === 'icon' ? 0.5 : 0.5} max={v.kind === 'icon' ? 4 : 80} step={v.kind === 'icon' ? 0.25 : 1} precision={2} value={v.strokeWidth}
            onChange={x => setVector(ids, { strokeWidth: x }, 'vec-sw')} />
        </div>
      )}
      {v.kind === 'line' && (
        <>
          <label className="check"><input type="checkbox" checked={v.arrowEnd} onChange={e => setVector(ids, { arrowEnd: e.target.checked }, 'vec-ae')} /><span>Pfeilspitze am Ende</span></label>
          <label className="check"><input type="checkbox" checked={v.arrowStart} onChange={e => setVector(ids, { arrowStart: e.target.checked }, 'vec-as')} /><span>Pfeilspitze am Anfang</span></label>
          <div className="field-hint">Länge = Breite (B). Schräg stellen über „Drehung“.</div>
        </>
      )}
      {v.kind === 'polygon' && (
        <div className="row">
          <NumberField label="Ecken" min={3} max={12} step={1} precision={0} value={v.sides} onChange={x => setVector(ids, { sides: x }, 'vec-sides')} />
        </div>
      )}
      {v.kind === 'star' && (
        <div className="row">
          <NumberField label="Zacken" min={3} max={24} step={1} precision={0} value={v.sides} onChange={x => setVector(ids, { sides: x }, 'vec-sides')} />
          <NumberField label="Tiefe" title="Innenradius in Prozent – kleiner = spitzere Zacken" suffix="%" min={10} max={95} step={5} precision={0}
            value={Math.round(v.innerRatio * 100)} onChange={x => setVector(ids, { innerRatio: x / 100 }, 'vec-inner')} />
        </div>
      )}
      {(v.kind === 'icon' || v.kind === 'svg') && (
        <div className="field-hint">Tipp: Als Link klickbar machen im Reiter „Elemente“. Der Ebenenname wird dann für Screenreader vorgelesen.</div>
      )}
    </Section>
  );
}
