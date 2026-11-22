// Fenster „Bild bearbeiten“: Ausschnitt, Drehen, Spiegeln, Helligkeit, Kontrast, Farbe
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import { applyImageEdit, dataUrlBytes, loadImg, noEdit, orient, renderEdit, type ImageEdit } from '../model/imageEdit';

const useImageEditor = create<{ id: string | null }>(() => ({ id: null }));
export const openImageEditor = (imageId: string) => useImageEditor.setState({ id: imageId });

type Ratio = { label: string; r: number | null };
const RATIOS: Ratio[] = [{ label: 'Frei', r: null }, { label: '1:1', r: 1 }, { label: '4:3', r: 4 / 3 }, { label: '3:2', r: 3 / 2 }, { label: '16:9', r: 16 / 9 }, { label: '3:4', r: 3 / 4 }];
type Crop = ImageEdit['crop'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(n / 1024)} KB`);

/** Größter Ausschnitt mit Seitenverhältnis r (Breite/Höhe in Pixeln) in der Mitte */
function centered(r: number, W: number, H: number): Crop {
  const w = Math.min(1, (r * H) / W);
  const h = Math.min(1, W / r / H);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

export function ImageEditor() {
  const id = useImageEditor(s => s.id);
  const asset = useEditor(s => (id ? s.doc.library.images.find(i => i.id === id) : undefined));
  if (!id || !asset) return null;
  return <EditorBody key={id} src={asset.src} name={asset.name} id={id} />;
}

function EditorBody({ id, src, name }: { id: string; src: string; name: string }) {
  const [e, setE] = useState<ImageEdit>(noEdit);
  const [ratio, setRatio] = useState<number | null>(null);
  const [view, setView] = useState<{ url: string; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const close = () => useImageEditor.setState({ id: null });

  // gedrehtes Bild für die Ansicht
  useEffect(() => {
    let live = true;
    (async () => {
      const img = imgRef.current ?? await loadImg(src);
      imgRef.current = img;
      const c = orient(img, e.rotate, e.flip);
      // Ansicht verkleinert (schneller)
      const s = Math.min(1, 1400 / Math.max(c.width, c.height));
      const v = document.createElement('canvas');
      v.width = Math.round(c.width * s); v.height = Math.round(c.height * s);
      v.getContext('2d')!.drawImage(c, 0, 0, v.width, v.height);
      if (live) setView({ url: v.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height });
    })();
    return () => { live = false; };
  }, [src, e.rotate, e.flip]);

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);

  const setCrop = (crop: Crop) => setE(x => ({ ...x, crop }));
  const pickRatio = (r: number | null) => { setRatio(r); if (r && view) setCrop(centered(r, view.w, view.h)); };
  const rotate = (d: 90 | -90) => setE(x => ({ ...x, rotate: (((x.rotate + d) % 360 + 360) % 360) as ImageEdit['rotate'], crop: { x: 0, y: 0, w: 1, h: 1 } }));

  /** Ziehen: ganzer Ausschnitt verschieben oder an einer Ecke größer/kleiner */
  const drag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (ev: React.PointerEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !view) return;
    const start = { x: ev.clientX, y: ev.clientY, c: { ...e.crop } };
    const pr = ratio ? ratio * (view.h / view.w) : null; // Verhältnis in Anteilen
    const move = (m: PointerEvent) => {
      const dx = (m.clientX - start.x) / box.width, dy = (m.clientY - start.y) / box.height;
      const c0 = start.c;
      if (mode === 'move') { setCrop({ ...c0, x: clamp(c0.x + dx, 0, 1 - c0.w), y: clamp(c0.y + dy, 0, 1 - c0.h) }); return; }
      const left = mode === 'nw' || mode === 'sw', top = mode === 'nw' || mode === 'ne';
      let x1 = c0.x, y1 = c0.y, x2 = c0.x + c0.w, y2 = c0.y + c0.h;
      if (left) x1 = clamp(x1 + dx, 0, x2 - 0.05); else x2 = clamp(x2 + dx, x1 + 0.05, 1);
      if (top) y1 = clamp(y1 + dy, 0, y2 - 0.05); else y2 = clamp(y2 + dy, y1 + 0.05, 1);
      if (pr) {
        // Höhe folgt der Breite; passt es nicht, wird die Breite kleiner
        let w = x2 - x1, h = w / pr;
        const maxH = top ? y2 : 1 - y1;
        if (h > maxH) { h = maxH; w = h * pr; }
        if (left) x1 = x2 - w; else x2 = x1 + w;
        if (top) y1 = y2 - h; else y2 = y1 + h;
      }
      setCrop({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const filter = `brightness(${e.brightness}) contrast(${e.contrast}) saturate(${e.saturation})`;
  const changed = JSON.stringify(e) !== JSON.stringify(noEdit());
  const outW = view ? Math.round(e.crop.w * view.w) : 0, outH = view ? Math.round(e.crop.h * view.h) : 0;
  const size = useMemo(() => dataUrlBytes(src), [src]);

  const apply = async () => {
    setBusy(true);
    try { applyImageEdit(id, await renderEdit(src, e)); close(); }
    catch { setBusy(false); }
  };

  const slider = (key: 'brightness' | 'contrast' | 'saturation', label: string) => (
    <label className="ie-slider">
      <span>{label}</span>
      <input type="range" min={key === 'saturation' ? 0 : 0.5} max={key === 'saturation' ? 2 : 1.5} step={0.01} value={e[key]}
        onChange={ev => setE(x => ({ ...x, [key]: Number(ev.target.value) }))} onDoubleClick={() => setE(x => ({ ...x, [key]: 1 }))} />
      <b>{e[key] === 1 ? '0' : `${e[key] > 1 ? '+' : ''}${Math.round((e[key] - 1) * 100)}`}</b>
    </label>
  );

  return (
    <div className="dialog-backdrop" onMouseDown={ev => { if (ev.target === ev.currentTarget) close(); }}>
      <div className="dialog ie-dialog" role="dialog" aria-modal="true" aria-labelledby="ie-title" onKeyDown={ev => ev.stopPropagation()}>
        <header className="dialog-head"><h2 id="ie-title">Bild bearbeiten – {name}</h2></header>
        <div className="ie-body">
          <div className="ie-stage">
            {view && (
              <div className="ie-pic" ref={boxRef} style={{ width: Math.round(view.w * Math.min(680 / view.w, 500 / view.h)), height: Math.round(view.h * Math.min(680 / view.w, 500 / view.h)) }}>
                <img src={view.url} alt="" draggable={false} style={{ filter }} />
                <div className="ie-crop" style={{ left: `${e.crop.x * 100}%`, top: `${e.crop.y * 100}%`, width: `${e.crop.w * 100}%`, height: `${e.crop.h * 100}%` }}
                  onPointerDown={drag('move')}>
                  {(['nw', 'ne', 'sw', 'se'] as const).map(c => <span key={c} className={`ie-h ie-${c}`} onPointerDown={drag(c)} />)}
                </div>
              </div>
            )}
          </div>
          <div className="ie-side">
            <div className="field-label">Ausschnitt</div>
            <div className="ie-ratios">
              {RATIOS.map(r => <button key={r.label} type="button" className={`btn small${ratio === r.r ? ' on' : ''}`} onClick={() => pickRatio(r.r)}>{r.label}</button>)}
            </div>
            <p className="field-hint">Ziehe den hellen Rahmen oder seine Ecken.</p>
            <div className="field-label">Drehen und Spiegeln</div>
            <div className="ie-ratios">
              <button type="button" className="btn small" onClick={() => rotate(-90)}>↺ Links</button>
              <button type="button" className="btn small" onClick={() => rotate(90)}>↻ Rechts</button>
              <button type="button" className={`btn small${e.flip ? ' on' : ''}`} onClick={() => setE(x => ({ ...x, flip: !x.flip, crop: { x: 0, y: 0, w: 1, h: 1 } }))}>⇋ Spiegeln</button>
            </div>
            <div className="field-label">Licht und Farbe</div>
            {slider('brightness', 'Helligkeit')}
            {slider('contrast', 'Kontrast')}
            {slider('saturation', 'Farbe')}
            <p className="field-hint">Doppelklick auf einen Regler setzt ihn zurück.</p>
            <p className="field-hint ie-info">Ergebnis: {outW} × {outH} Pixel · Original {kb(size)}. Das Bild ändert sich überall, wo es vorkommt. Rückgängig mit ⌘Z.</p>
          </div>
        </div>
        <footer className="dialog-foot">
          <button type="button" className="btn" disabled={!changed} onClick={() => { setE(noEdit()); setRatio(null); }}>Zurücksetzen</button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={close}>Abbrechen</button>
          <button type="button" className="btn primary" disabled={!changed || busy} onClick={apply}>{busy ? 'Wird berechnet …' : 'Übernehmen'}</button>
        </footer>
      </div>
    </div>
  );
}
