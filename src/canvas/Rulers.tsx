// Lineale am Rand, Hilfslinien (ziehen, verschieben, genau eingeben) und Spaltenraster
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { useEditor, viewPage } from '../store';
import type { Page, Pt, Rect } from '../model/types';
import { absRect, bbox, boardAt } from '../model/geometry';
import {
  RULER, addGuide, deleteGuide, moveGuide, pageGrids, pageGuides, rehomeGuide, rulerBoard, useView, type AbsGuide,
} from '../model/guides';

const fmt = (v: number) => String(Math.round(v));
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** Ein Hilfslinien-Zug: neu aus dem Lineal oder eine vorhandene Linie */
interface Drag { axis: 'x' | 'y'; world: number; screen: Pt; existing: AbsGuide | null; board: string | null; overRuler: boolean }

export function RulersAndGuides({ vp }: { vp: React.RefObject<HTMLDivElement | null> }) {
  const view = useView();
  const zoom = useEditor(s => s.zoom);
  const pan = useEditor(s => s.pan);
  const page = useEditor(viewPage);
  const selection = useEditor(s => s.selection);
  const tool = useEditor(s => s.tool);
  useEditor(s => s.geom); // nach dem Nachmessen neu zeichnen
  const [drag, setDrag] = useState<Drag | null>(null);
  const [edit, setEdit] = useState<{ g: AbsGuide; at: Pt } | null>(null);

  const guides = view.guides ? pageGuides(page) : [];
  const grids = view.grids ? pageGrids(page) : [];
  const originId = rulerBoard(page, selection);
  const origin = originId ? absRect(page, originId) : { x: 0, y: 0, w: 0, h: 0 };
  const selBox = bbox(selection.filter(id => page.nodes[id]).map(id => absRect(page, id)));

  /** Hilfslinie ziehen (neu oder vorhanden) – erst beim Loslassen wird gespeichert (ein Rückgängig-Schritt) */
  const startDrag = (e: RPE, axis: 'x' | 'y', existing: AbsGuide | null) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (!useView.getState().guides) useView.getState().toggle('guides');
    const el = vp.current!;
    const calc = (cx: number, cy: number, free: boolean): Drag => {
      const r = el.getBoundingClientRect();
      const s = useEditor.getState();
      const pg = viewPage(s);
      const sp = { x: cx - r.left, y: cy - r.top };
      const w = { x: (sp.x - s.pan.x) / s.zoom, y: (sp.y - s.pan.y) / s.zoom };
      // Board unter dem Mauszeiger; bei einer vorhandenen Linie bevorzugt ihr eigenes Board
      const own = existing && contains(absRect(pg, existing.boardId), w) ? existing.boardId : null;
      const board = own ?? boardAt(pg, w, []);
      let world = Math.round(axis === 'x' ? w.x : w.y);
      if (!free && board) world = snapGuide(pg, board, axis, world, 6 / s.zoom, s.selection);
      const overRuler = useView.getState().rulers && (axis === 'x' ? sp.x < RULER : sp.y < RULER);
      return { axis, world, screen: sp, existing, board, overRuler };
    };
    // erst nach einer echten Bewegung als Zug werten (sonst bleibt der Doppelklick möglich)
    const sx0 = e.clientX, sy0 = e.clientY;
    let cur: Drag | null = null;
    const move = (ev: PointerEvent) => {
      if (!cur && Math.hypot(ev.clientX - sx0, ev.clientY - sy0) < 3) return;
      cur = calc(ev.clientX, ev.clientY, ev.altKey);
      setDrag(cur);
    };
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key, true);
      setDrag(null);
      if (!commit || !cur) return;
      const d: Drag = cur;
      const pg = viewPage(useEditor.getState());
      if (d.overRuler) { if (d.existing) deleteGuide(d.existing.boardId, d.existing.id); return; }
      if (!d.board) return; // nur auf Boards
      const br = absRect(pg, d.board);
      const pos = d.world - (axis === 'x' ? br.x : br.y);
      if (!d.existing) addGuide(d.board, axis, pos);
      else if (d.existing.boardId === d.board) moveGuide(d.board, d.existing.id, pos);
      else rehomeGuide(d.existing.boardId, d.board, d.existing.id, axis, pos);
    };
    const up = () => end(true);
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key, true);
  };

  const sx = (x: number) => x * zoom + pan.x, sy = (y: number) => y * zoom + pan.y;
  const interactive = !view.guidesLocked && (tool === 'move' || tool === 'hand') && !drag;
  const dragBoard = drag?.board ? absRect(page, drag.board) : null;

  return (
    <>
      {/* Spaltenraster */}
      {grids.length > 0 && (
        <div className="grid-layer" aria-hidden="true">
          {grids.flatMap(gr => gr.cols.map((c, i) => (
            <div key={gr.boardId + i} className="grid-col"
              style={{ left: sx(c.x), top: sy(c.y), width: c.w * zoom, height: c.h * zoom, background: gr.grid.color, opacity: gr.grid.opacity }} />
          )))}
        </div>
      )}

      {/* Hilfslinien */}
      <div className="guide-layer">
        {guides.map(g => {
          if (drag?.existing?.id === g.id && drag.existing.boardId === g.boardId) return null;
          const style = g.axis === 'x'
            ? { left: sx(g.pos), top: sy(g.board.y), height: g.board.h * zoom }
            : { top: sy(g.pos), left: sx(g.board.x), width: g.board.w * zoom };
          return (
            <div key={`${g.boardId}-${g.id}`} className={`uguide ${g.axis}${interactive ? ' live' : ''}`} style={style}
              title={interactive ? 'Ziehen zum Verschieben, aufs Lineal ziehen zum Löschen, Doppelklick für genaue Position' : undefined}
              onPointerDown={interactive ? e => startDrag(e, g.axis, g) : undefined}
              onDoubleClick={interactive ? e => { e.stopPropagation(); setEdit({ g, at: { x: e.clientX, y: e.clientY } }); } : undefined} />
          );
        })}
        {drag && (
          <>
            <div className={`uguide ${drag.axis} dragging${drag.board && !drag.overRuler ? '' : ' invalid'}`}
              style={drag.axis === 'x' ? { left: sx(drag.world), top: 0, bottom: 0 } : { top: sy(drag.world), left: 0, right: 0 }} />
            <div className="guide-tag" style={{ left: drag.screen.x + 12, top: drag.screen.y + 14 }}>
              {drag.overRuler ? (drag.existing ? 'Loslassen zum Löschen' : 'Abbrechen')
                : dragBoard ? `${fmt(drag.world - (drag.axis === 'x' ? dragBoard.x : dragBoard.y))} px` : 'Nur auf einem Board'}
            </div>
          </>
        )}
      </div>

      {view.rulers && (
        <>
          <Ruler axis="x" zoom={zoom} offset={pan.x} origin={origin.x} sel={selBox ? [selBox.x, selBox.x + selBox.w] : null}
            onPointerDown={e => startDrag(e, 'y', null)} />
          <Ruler axis="y" zoom={zoom} offset={pan.y} origin={origin.y} sel={selBox ? [selBox.y, selBox.y + selBox.h] : null}
            onPointerDown={e => startDrag(e, 'x', null)} />
          <div className="ruler-corner" title={originId ? `Lineale messen ab „${page.nodes[originId]?.name}“` : 'Lineale'} />
        </>
      )}

      {edit && <GuideEditor g={edit.g} at={edit.at} onClose={() => setEdit(null)} />}
    </>
  );
}

const contains = (r: Rect, p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Neue/verschobene Linie rastet an Board-Kanten und -Mitte sowie an der Auswahl ein */
function snapGuide(page: Page, board: string, axis: 'x' | 'y', v: number, th: number, selection: string[]): number {
  const rects = [absRect(page, board), ...selection.filter(id => page.nodes[id]).map(id => absRect(page, id))];
  let best: number | null = null;
  for (const r of rects) {
    const a = axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h];
    for (const t of a) if (Math.abs(t - v) <= th && (best === null || Math.abs(t - v) < Math.abs(best - v))) best = t;
  }
  return best === null ? v : Math.round(best);
}

/** Lineal oben (x) bzw. links (y), gezeichnet auf ein <canvas> */
function Ruler({ axis, zoom, offset, origin, sel, onPointerDown }: {
  axis: 'x' | 'y'; zoom: number; offset: number; origin: number; sel: [number, number] | null; onPointerDown: (e: RPE) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useEditor(s => s.theme);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize(axis === 'x' ? el.clientWidth : el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [axis]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !size) return;
    const dpr = window.devicePixelRatio || 1;
    const W = axis === 'x' ? size : RULER, H = axis === 'x' ? RULER : size;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(c);
    const bg = cs.getPropertyValue('--ruler-bg').trim() || '#1b1b1e';
    const fg = cs.getPropertyValue('--ruler-fg').trim() || '#70707a';
    const band = cs.getPropertyValue('--ruler-sel').trim() || 'rgba(139,123,255,.25)';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Bildschirmposition (innerhalb des Lineals) ↔ Wert
    const start = RULER; // das Lineal beginnt hinter der Ecke
    const toScreen = (world: number) => world * zoom + offset - start;
    if (sel) {
      ctx.fillStyle = band;
      const a = toScreen(sel[0]), b = toScreen(sel[1]);
      if (axis === 'x') ctx.fillRect(a, 0, b - a, H); else ctx.fillRect(0, a, W, b - a);
    }
    const step = STEPS.find(s => s * zoom >= 64) ?? STEPS[STEPS.length - 1];
    const minor = step / (step % 5 === 0 && step >= 5 ? 5 : 2);
    const firstVal = Math.floor(((start - offset) / zoom - origin) / minor) * minor;
    const lastVal = (size + start - offset) / zoom - origin;
    ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.lineWidth = 1;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.beginPath();
    for (let v = firstVal; v <= lastVal; v += minor) {
      const p = Math.round(toScreen(v + origin)) + 0.5;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      const len = major ? RULER : 5;
      if (axis === 'x') { ctx.moveTo(p, RULER); ctx.lineTo(p, RULER - len); } else { ctx.moveTo(RULER, p); ctx.lineTo(RULER - len, p); }
      if (major) {
        const label = fmt(v);
        if (axis === 'x') ctx.fillText(label, p + 3, 10);
        else { ctx.save(); ctx.translate(10, p - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
      }
    }
    ctx.stroke();
    // Trennlinie zur Arbeitsfläche
    ctx.strokeStyle = cs.getPropertyValue('--ruler-line').trim() || '#2c2c31';
    ctx.beginPath();
    if (axis === 'x') { ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); } else { ctx.moveTo(W - 0.5, 0); ctx.lineTo(W - 0.5, H); }
    ctx.stroke();
  }, [axis, zoom, offset, origin, sel?.[0], sel?.[1], size, theme]);
  return (
    <canvas ref={ref} className={`ruler ruler-${axis}`} onPointerDown={onPointerDown}
      title={axis === 'x' ? 'Nach unten ziehen: waagerechte Hilfslinie' : 'Nach rechts ziehen: senkrechte Hilfslinie'} />
  );
}

/** Kleines Fenster zum genauen Eingeben der Position */
function GuideEditor({ g, at, onClose }: { g: AbsGuide; at: Pt; onClose: () => void }) {
  const base = g.axis === 'x' ? g.board.x : g.board.y;
  const [text, setText] = useState(fmt(g.pos - base));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [onClose]);
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'));
    if (!isNaN(v)) moveGuide(g.boardId, g.id, v);
    onClose();
  };
  return (
    <div ref={box} className="guide-edit" style={{ left: Math.min(at.x + 8, window.innerWidth - 220), top: Math.min(at.y + 8, window.innerHeight - 90) }}
      role="dialog" aria-label="Hilfslinie" onKeyDown={e => e.stopPropagation()}>
      <label>{g.axis === 'x' ? 'Abstand von links' : 'Abstand von oben'}
        <span className="row">
          <input className="textinput" autoFocus value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onClose(); }} aria-label="Position in px" />
          <span className="muted">px</span>
        </span>
      </label>
      <div className="row">
        <button type="button" className="btn primary small" onClick={commit}>Übernehmen</button>
        <button type="button" className="btn ghost small" onClick={() => { deleteGuide(g.boardId, g.id); onClose(); }}>Löschen</button>
      </div>
    </div>
  );
}
