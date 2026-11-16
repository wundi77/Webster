import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isPageBoard } from '../model/pageRules';
import { useEditor, viewPage, pageOf } from '../store';
import { create } from 'zustand';
import type { NodeType, Page, Pt, Rect, WNode } from '../model/types';
import { absPos, absRect, bbox, boardAt, inLayout, intersects, normRect, round } from '../model/geometry';
import {
  containerOf, createShape, duplicateNodes, insertIntoLayout, layoutAnchor, openImagePicker, placeImageFile, reparent, topLevel,
  updateNodes,
} from '../model/commands';
import { writeProps } from '../model/resolve';
import { BREAKPOINTS } from '../model/factory';
import { Icons } from '../ui/icons';
import { openPreview } from '../preview/bridge';
import { fitAll, zoomAt } from '../model/viewport';
import { NodeView } from './NodeView';
import { RulersAndGuides } from './Rulers';
import { boardChain, snapLines } from '../model/guides';
import { equalSnap, measureContext, measureGaps, type Measure } from './measure';
import { setEditCaret } from './textCaret';
import { MeasureLayer } from './MeasureLayer';
import { editorSafeCss } from '../model/code';
import { ClaudeFlash } from '../claude/ClaudeUI';
import { ContextMenu } from '../ui/ContextMenu';
import { insertInstance, placeImageAsset, renameComponent } from '../model/library';
import { ASSET_MIME } from '../panels/AssetsPanel';
import { drawLine, drawShape, importSvgFile, isSvgFile, type ShapeTool } from '../model/vector';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const DRAW_TOOLS = ['board', 'rect', 'ellipse', 'text', 'triangle', 'polygon', 'star'];
const SHAPE_TOOLS = ['triangle', 'polygon', 'star'];
const LINE_TOOLS = ['line', 'arrow'];

/** Linie mit ⇧ auf 45°-Schritte einrasten */
function snapAngle(a: Pt, b: Pt, on: boolean): Pt {
  if (!on) return b;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

interface Guide { axis: 'x' | 'y'; pos: number; from: number; to: number }

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; pan: Pt }
  | { kind: 'draw'; type: NodeType; start: Pt; parentId: string | null; rect: Rect | null }
  | { kind: 'line'; tool: 'line' | 'arrow'; start: Pt; end: Pt | null; parentId: string | null }
  | {
    kind: 'move'; startClient: Pt; start: Pt; ids: string[]; origin: Record<string, Pt>; startAbs: Record<string, Pt>;
    box: Rect; moved: boolean; alt: boolean; delta: Pt; layoutDrop: { target: string; anchorId: string | null } | null;
  }
  | { kind: 'resize'; handle: Handle; start: Pt; ids: string[]; box: Rect; rects: Record<string, Rect> }
  | { kind: 'marquee'; start: Pt; container: string | null; base: string[] }
  /** Druck auf die leere Fläche eines Boards mit Inhalt: Ziehen = Auswahlrahmen, Klick = Board auswählen */
  | { kind: 'press'; id: string; start: Pt; startClient: Pt; base: string[] };

/** Board mit Inhalt (kein Komponenten-Kopie-Rahmen): wird beim Auswahlrahmen durchsucht statt selbst gewählt */
const isContainer = (n: WNode | undefined) => !!n && n.type === 'board' && n.children.length > 0 && !n.componentId && !n.isMain;

/** Ebenen, die ein Auswahlrahmen trifft: Boards mit Inhalt nur, wenn sie ganz im Rahmen liegen – sonst deren Inhalt */
function marqueeHits(page: Page, containerId: string | null, r: Rect): string[] {
  const out: string[] = [];
  const walk = (ids: string[]) => {
    for (const i of ids) {
      const n = page.nodes[i];
      if (!n || !n.visible || n.locked) continue;
      const a = absRect(page, i);
      if (!intersects(a, r)) continue;
      const inside = a.x >= r.x && a.y >= r.y && a.x + a.w <= r.x + r.w && a.y + a.h <= r.y + r.h;
      if (isContainer(n) && !inside) walk(n.children);
      else out.push(i);
    }
  };
  walk(containerId ? page.nodes[containerId]?.children ?? [] : page.rootIds);
  return out;
}

/** Welche Ebene wird bei einem Klick ausgewählt? */
function pickNode(page: Page, target: HTMLElement): string | null {
  const title = target.closest<HTMLElement>('[data-board-title]');
  if (title) return title.dataset.boardTitle ?? null;
  const el = target.closest<HTMLElement>('[data-node-id]');
  if (!el) return null;
  const n = page.nodes[el.dataset.nodeId!];
  if (!n) return null;
  // Oberste Boards mit Inhalt werden über ihren Titel ausgewählt (wie in Penpot)
  if (n.type === 'board' && n.parentId === null && n.children.length > 0) return null;
  return n.id;
}

/** Text-Ebene direkt unter dem Mauszeiger (e.target ist nach Pointer-Capture die Arbeitsfläche, daher über die Position) */
function textAt(page: Page, clientX: number, clientY: number): string | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = (el as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
    if (!id) continue;
    const n = page.nodes[id];
    return n?.type === 'text' && !n.locked ? id : null;
  }
  return null;
}

/** Text zum Bearbeiten öffnen, Schreibmarke an die Klickstelle */
function editTextAt(id: string, clientX: number, clientY: number) {
  const s = useEditor.getState();
  s.setTool('move');
  s.setSelection([id]);
  setEditCaret({ x: clientX, y: clientY });
  s.setEditing(id);
}

function rootBoardOf(page: Page, target: HTMLElement): string | null {
  const el = target.closest<HTMLElement>('[data-node-id]');
  if (!el) return null;
  let n: WNode | undefined = page.nodes[el.dataset.nodeId!];
  while (n && n.parentId) n = page.nodes[n.parentId];
  return n && n.type === 'board' ? n.id : null;
}

/** Magnetische Ausrichtung an Kanten und Mitten benachbarter Ebenen */
function snapMove(page: Page, ids: string[], box: Rect, th: number, board: string | null, free = false) {
  const ctx = measureContext(page, ids);
  if (free) return { dx: 0, dy: 0, guides: [] as Guide[], measures: measureGaps(box, ctx.others, ctx.container) };
  const parentId = page.nodes[ids[0]].parentId;
  const targets = containerOf(page, parentId)
    .filter(i => !ids.includes(i) && page.nodes[i].visible)
    .slice(0, 300)
    .map(i => absRect(page, i));
  if (parentId) targets.push(absRect(page, parentId));
  const bx = [box.x, box.x + box.w / 2, box.x + box.w];
  const by = [box.y, box.y + box.h / 2, box.y + box.h];
  type Snap = { d: number; delta: number; pos: number; r: Rect };
  let sx = null as Snap | null;
  let sy = null as Snap | null;
  for (const r of targets) {
    const tx = [r.x, r.x + r.w / 2, r.x + r.w];
    const ty = [r.y, r.y + r.h / 2, r.y + r.h];
    for (const b of bx) for (const t of tx) { const d = Math.abs(t - b); if (d <= th && (!sx || d < sx.d)) sx = { d, delta: t - b, pos: t, r }; }
    for (const b of by) for (const t of ty) { const d = Math.abs(t - b); if (d <= th && (!sy || d < sy.d)) sy = { d, delta: t - b, pos: t, r }; }
  }
  // Hilfslinien und Spaltenkanten (Linie über die ganze Höhe/Breite der Ebene)
  const lines = snapLines(page, boardChain(page, board));
  for (const t of lines.x) for (const b of bx) { const d = Math.abs(t - b); if (d <= th && (!sx || d < sx.d)) sx = { d, delta: t - b, pos: t, r: { x: t, y: box.y, w: 0, h: box.h } }; }
  for (const t of lines.y) for (const b of by) { const d = Math.abs(t - b); if (d <= th && (!sy || d < sy.d)) sy = { d, delta: t - b, pos: t, r: { x: box.x, y: t, w: box.w, h: 0 } }; }
  // Gleiche Abstände wie zwischen anderen Ebenen: gewinnen, wenn sie näher liegen
  const eq = equalSnap(box, ctx.others, th);
  let dx = sx?.delta ?? 0, dy = sy?.delta ?? 0;
  if (eq.dx !== null && (!sx || Math.abs(eq.dx) < sx.d)) { sx = null; dx = eq.dx; }
  if (eq.dy !== null && (!sy || Math.abs(eq.dy) < sy.d)) { sy = null; dy = eq.dy; }
  const nb = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: 'x', pos: sx.pos, from: Math.min(nb.y, sx.r.y), to: Math.max(nb.y + nb.h, sx.r.y + sx.r.h) });
  if (sy) guides.push({ axis: 'y', pos: sy.pos, from: Math.min(nb.x, sy.r.x), to: Math.max(nb.x + nb.w, sy.r.x + sy.r.w) });
  return { dx, dy, guides, measures: measureGaps(nb, ctx.others, ctx.container) };
}

/** Misst nach jeder Änderung die tatsächliche Darstellung (Layout, Auto-Größen, Breakpoints) */
function useGeometrySync(world: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = world.current;
      if (!el) return;
      const out: Record<string, Rect> = {};
      el.querySelectorAll<HTMLElement>('[data-node-id]').forEach(n => {
        ro.observe(n);
        if (!n.offsetParent) return;
        out[n.dataset.nodeId!] = { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight };
      });
      const prev = useEditor.getState().geom;
      const keys = Object.keys(out);
      const same = keys.length === Object.keys(prev).length && keys.every(k => {
        const a = out[k], b = prev[k];
        return b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
      });
      if (!same) useEditor.getState().setGeom(out);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    // Größenänderungen einzelner Ebenen (z. B. beim Tippen) sofort nachmessen
    const ro = new ResizeObserver(schedule);
    schedule();
    const unsub = useEditor.subscribe((s, p) => {
      if (s.doc !== p.doc || s.breakpoint !== p.breakpoint || s.pageId !== p.pageId || s.editingTextId !== p.editingTextId) schedule();
    });
    document.fonts?.addEventListener('loadingdone', schedule);
    if (world.current) ro.observe(world.current);
    world.current?.addEventListener('input', schedule);
    const w = world.current;
    return () => { unsub(); w?.removeEventListener('input', schedule); document.fonts?.removeEventListener('loadingdone', schedule); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [world]);
}

export function Canvas() {
  const vp = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const page = useEditor(viewPage);
  const pageId = useEditor(s => s.pageId);
  const zoom = useEditor(s => s.zoom);
  const pan = useEditor(s => s.pan);
  const tool = useEditor(s => s.tool);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [draftLine, setDraftLine] = useState<{ a: Pt; b: Pt } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const [dropLine, setDropLine] = useState<Rect | null>(null);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [menu, setMenu] = useState<Pt | null>(null);
  const g = useRef<Gesture | null>(null);
  const fitted = useRef(false);

  useGeometrySync(worldRef);

  // Größe der Arbeitsfläche beobachten, beim ersten Mal alles einpassen
  useEffect(() => {
    const el = vp.current!;
    const ro = new ResizeObserver(() => {
      useEditor.getState().setViewport(el.clientWidth, el.clientHeight);
      if (!fitted.current && el.clientWidth > 0) { fitted.current = true; requestAnimationFrame(fitAll); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Beim Seitenwechsel einpassen
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    requestAnimationFrame(() => requestAnimationFrame(fitAll));
  }, [pageId]);

  // Leertaste = Hand-Werkzeug
  useEffect(() => {
    const isField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isField(e.target)) { e.preventDefault(); setSpace(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // Mausrad / Trackpad: verschieben, mit ⌘/Strg oder Pinch zoomen
  useEffect(() => {
    const el = vp.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const s = useEditor.getState();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
        zoomAt(f, e.clientX - r.left, e.clientY - r.top);
      } else {
        let dx = e.deltaX, dy = e.deltaY;
        if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
        if (e.shiftKey && !dx) { dx = dy; dy = 0; }
        s.setView(s.zoom, { x: s.pan.x - dx, y: s.pan.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (cx: number, cy: number): Pt => {
    const r = vp.current!.getBoundingClientRect();
    const s = useEditor.getState();
    return { x: (cx - r.left - s.pan.x) / s.zoom, y: (cy - r.top - s.pan.y) / s.zoom };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setMenu(null);
    const s = useEditor.getState();
    const target = e.target as HTMLElement;
    if (s.editingTextId) {
      if (target.closest('[contenteditable]')) return;
      (document.activeElement as HTMLElement | null)?.blur();
    }
    vp.current!.setPointerCapture(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    const pg = viewPage(s);

    if (e.button === 1 || space || s.tool === 'hand') {
      g.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, pan: s.pan };
      setPanning(true);
      return;
    }
    if (LINE_TOOLS.includes(s.tool)) {
      g.current = { kind: 'line', tool: s.tool as 'line' | 'arrow', start: p, end: null, parentId: boardAt(pg, p, []) };
      return;
    }
    if (s.tool === 'text') {
      // Klick mit dem Textwerkzeug auf einen vorhandenen Text: diesen bearbeiten statt einen neuen anzulegen
      const tid = textAt(pg, e.clientX, e.clientY);
      if (tid) {
        // preventDefault: sonst nimmt der Browser dem geöffneten Text beim Mausklick gleich wieder den Fokus
        e.preventDefault();
        vp.current!.releasePointerCapture(e.pointerId);
        editTextAt(tid, e.clientX, e.clientY);
        return;
      }
    }
    if (DRAW_TOOLS.includes(s.tool)) {
      g.current = { kind: 'draw', type: s.tool as NodeType, start: p, parentId: boardAt(pg, p, []), rect: null };
      return;
    }
    if (s.tool === 'image') { s.setTool('move'); openImagePicker(p); return; }

    // Verschieben-Werkzeug
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined;
    if (handle && s.selection.length) {
      const ids = topLevel(pg, s.selection);
      const rects = Object.fromEntries(ids.map(i => [i, absRect(pg, i)]));
      g.current = { kind: 'resize', handle, start: p, ids, box: bbox(Object.values(rects))!, rects };
      s.beginGesture();
      return;
    }
    const id = pickNode(pg, target);
    // Leere Fläche eines Boards mit Inhalt: erst beim Loslassen ohne Ziehen auswählen, beim Ziehen Auswahlrahmen
    if (id && !target.closest('[data-board-title]') && isContainer(pg.nodes[id]) && !s.selection.includes(id) && !e.metaKey && !e.ctrlKey) {
      g.current = { kind: 'press', id, start: p, startClient: { x: e.clientX, y: e.clientY }, base: e.shiftKey ? s.selection : [] };
      return;
    }
    if (id) {
      let sel = s.selection;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
        s.setSelection(sel);
        if (!sel.includes(id)) return;
      } else if (!sel.includes(id)) {
        sel = [id];
        s.setSelection(sel);
      }
      const ids = topLevel(pg, sel).filter(i => !pg.nodes[i].locked && !isPageBoard(pg, i)); // das Seiten-Board bleibt fest
      if (!ids.length) return;
      g.current = {
        kind: 'move', startClient: { x: e.clientX, y: e.clientY }, start: p, ids,
        origin: Object.fromEntries(ids.map(i => [i, { x: pg.nodes[i].x, y: pg.nodes[i].y }])),
        startAbs: Object.fromEntries(ids.map(i => [i, absPos(pg, i)])),
        box: bbox(ids.map(i => absRect(pg, i)))!, moved: false, alt: e.altKey, delta: { x: 0, y: 0 }, layoutDrop: null,
      };
      return;
    }
    // Auswahlrahmen aufziehen
    const container = rootBoardOf(pg, target);
    const base = e.shiftKey ? s.selection : [];
    if (!e.shiftKey) s.setSelection([]);
    g.current = { kind: 'marquee', start: p, container, base };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const gs = g.current;
    const s = useEditor.getState();
    if (!gs) {
      if (s.tool === 'move' && !space && !s.editingTextId) {
        const t = e.target as HTMLElement;
        const id = t.closest('[data-handle]') ? null : pickNode(viewPage(s), t);
        if (id !== s.hoverId) s.setHover(id);
      }
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    const bp = s.breakpoint;
    switch (gs.kind) {
      case 'pan':
        s.setView(s.zoom, { x: gs.pan.x + e.clientX - gs.sx, y: gs.pan.y + e.clientY - gs.sy });
        break;
      case 'line': {
        const b = snapAngle(gs.start, p, e.shiftKey);
        gs.end = { x: Math.round(b.x), y: Math.round(b.y) };
        setDraftLine({ a: gs.start, b: gs.end });
        break;
      }
      case 'draw': {
        let w = p.x - gs.start.x, h = p.y - gs.start.y;
        if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        const r = normRect(Math.round(gs.start.x), Math.round(gs.start.y), Math.round(gs.start.x + w), Math.round(gs.start.y + h));
        gs.rect = r;
        setDraft(r);
        break;
      }
      case 'move': {
        if (!gs.moved) {
          if (Math.hypot(e.clientX - gs.startClient.x, e.clientY - gs.startClient.y) < 3) return;
          gs.moved = true;
          s.beginGesture();
          s.setHover(null);
          if (gs.alt) {
            // ⌥ beim Ziehen: Kopie verschieben
            const copies = duplicateNodes(gs.ids, { history: false });
            const pg = viewPage(useEditor.getState());
            gs.origin = Object.fromEntries(copies.map((c, i) => [c, gs.origin[gs.ids[i]] ?? { x: pg.nodes[c].x, y: pg.nodes[c].y }]));
            gs.startAbs = Object.fromEntries(copies.map((c, i) => [c, gs.startAbs[gs.ids[i]]]));
            gs.ids = copies;
            s.setSelection(copies);
          }
        }
        let dx = p.x - gs.start.x, dy = p.y - gs.start.y;
        // in ganzen Pixeln verschieben: die Box landet immer auf ganzzahligen Koordinaten
        const whole = () => { dx = Math.round(gs.box.x + dx) - gs.box.x; dy = Math.round(gs.box.y + dy) - gs.box.y; };
        whole();
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const pg = viewPage(useEditor.getState());
        const target = boardAt(pg, p, gs.ids);
        const tNode = target ? pg.nodes[target] : undefined;
        const stayAbsolute = gs.ids.every(i => pg.nodes[i]?.absolute && pg.nodes[i].parentId === target);
        if (tNode?.layout && !stayAbsolute) {
          // In ein Layout ablegen: Einfügemarke zeigen
          const a = layoutAnchor(pg, target!, gs.ids, p);
          gs.layoutDrop = { target: target!, anchorId: a.anchorId };
          setDropLine(a.line);
          setGuides([]); setMeasures([]);
          gs.delta = { x: dx, y: dy };
          setGhost({ ...gs.box, x: gs.box.x + dx, y: gs.box.y + dy });
          s.mutate(page => {
            for (const id of gs.ids) if (!inLayout(pg, id)) writeProps(page.nodes[id], bp, gs.origin[id]);
          }, { history: false });
          break;
        }
        gs.layoutDrop = null;
        setDropLine(null);
        const snap = snapMove(pg, gs.ids, { ...gs.box, x: gs.box.x + dx, y: gs.box.y + dy }, 6 / s.zoom, target, e.metaKey || e.ctrlKey);
        dx += snap.dx; dy += snap.dy;
        whole();
        gs.delta = { x: dx, y: dy };
        setGuides(snap.guides);
        const flow = gs.ids.some(id => inLayout(pg, id));
        if (flow) setMeasures([]);
        else { const mc = measureContext(pg, gs.ids); setMeasures(measureGaps({ ...gs.box, x: gs.box.x + dx, y: gs.box.y + dy }, mc.others, mc.container)); }
        setGhost(flow ? { ...gs.box, x: gs.box.x + dx, y: gs.box.y + dy } : null);
        s.mutate(page => {
          for (const id of gs.ids) {
            if (!page.nodes[id] || inLayout(pg, id)) continue;
            writeProps(page.nodes[id], bp, { x: Math.round(gs.origin[id].x + dx), y: Math.round(gs.origin[id].y + dy) });
          }
        }, { history: false });
        break;
      }
      case 'resize': {
        const b = gs.box;
        const h = gs.handle;
        const dx = p.x - gs.start.x, dy = p.y - gs.start.y;
        let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
        if (h.includes('w')) x1 += dx;
        if (h.includes('e')) x2 += dx;
        if (h.includes('n')) y1 += dy;
        if (h.includes('s')) y2 += dy;
        if (e.altKey) { // vom Mittelpunkt aus
          if (h.includes('e')) x1 = b.x - (x2 - (b.x + b.w));
          if (h.includes('w')) x2 = b.x + b.w - (x1 - b.x);
          if (h.includes('s')) y1 = b.y - (y2 - (b.y + b.h));
          if (h.includes('n')) y2 = b.y + b.h - (y1 - b.y);
        }
        if (e.shiftKey && b.w > 0 && b.h > 0) { // Proportionen beibehalten
          const ratio = b.w / b.h;
          let w = x2 - x1, hh = y2 - y1;
          if (h === 'e' || h === 'w') { hh = Math.abs(w) / ratio; const cy = b.y + b.h / 2; y1 = cy - hh / 2; y2 = cy + hh / 2; }
          else if (h === 'n' || h === 's') { w = Math.abs(hh) * ratio; const cx = b.x + b.w / 2; x1 = cx - w / 2; x2 = cx + w / 2; }
          else {
            if (Math.abs(w) / b.w > Math.abs(hh) / b.h) hh = Math.sign(hh || 1) * Math.abs(w) / ratio;
            else w = Math.sign(w || 1) * Math.abs(hh) * ratio;
            if (h.includes('w')) x1 = x2 - w; else x2 = x1 + w;
            if (h.includes('n')) y1 = y2 - hh; else y2 = y1 + hh;
          }
        }
        // bewegte Kanten an Hilfslinien und Spalten einrasten (nicht bei ⇧/⌥)
        if (!e.shiftKey && !e.altKey) {
          const vpg = viewPage(s);
          const lines = snapLines(vpg, [...new Set(gs.ids.flatMap(id => boardChain(vpg, vpg.nodes[id]?.parentId ?? null)))]);
          const th = 6 / s.zoom;
          const near = (v: number, list: number[]) => list.reduce<number | null>((best, t) => (Math.abs(t - v) <= th && (best === null || Math.abs(t - v) < Math.abs(best - v)) ? t : best), null);
          const rg: Guide[] = [];
          const fix = (v: number, axis: 'x' | 'y') => {
            const t = near(v, axis === 'x' ? lines.x : lines.y);
            if (t === null) return v;
            rg.push(axis === 'x' ? { axis, pos: t, from: Math.min(y1, y2), to: Math.max(y1, y2) } : { axis, pos: t, from: Math.min(x1, x2), to: Math.max(x1, x2) });
            return t;
          };
          if (h.includes('w')) x1 = fix(x1, 'x');
          if (h.includes('e')) x2 = fix(x2, 'x');
          if (h.includes('n')) y1 = fix(y1, 'y');
          if (h.includes('s')) y2 = fix(y2, 'y');
          setGuides(rg);
        } else setGuides([]);
        x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2); // ganze Pixel
        const nb = normRect(x1, y1, x2, y2);
        nb.w = Math.max(1, nb.w); nb.h = Math.max(1, nb.h);
        {
          const mc = measureContext(viewPage(s), gs.ids);
          setMeasures(gs.ids.some(id => inLayout(viewPage(s), id)) ? [] : measureGaps(nb, mc.others, mc.container));
        }
        const sx = b.w ? nb.w / b.w : 1, sy = b.h ? nb.h / b.h : 1;
        const widthChanged = h.includes('e') || h.includes('w') || e.shiftKey;
        const heightChanged = h.includes('n') || h.includes('s') || e.shiftKey;
        const pg = viewPage(s);
        s.mutate(page => {
          for (const id of gs.ids) {
            const r = gs.rects[id];
            const cur = pg.nodes[id];
            if (!page.nodes[id] || !r || !cur) continue;
            const patch: Partial<WNode> = {};
            if (widthChanged) { patch.w = Math.max(1, Math.round(r.w * sx)); if (cur.sizingH !== 'fixed') patch.sizingH = 'fixed'; }
            if (heightChanged) { patch.h = Math.max(1, Math.round(r.h * sy)); if (cur.sizingV !== 'fixed') patch.sizingV = 'fixed'; }
            if (!inLayout(pg, id)) {
              const pp = cur.parentId ? absRect(pg, cur.parentId) : { x: 0, y: 0 };
              patch.x = Math.round(nb.x + (r.x - b.x) * sx - pp.x);
              patch.y = Math.round(nb.y + (r.y - b.y) * sy - pp.y);
            }
            writeProps(page.nodes[id], s.breakpoint, patch);
          }
        }, { history: false });
        break;
      }
      case 'press': {
        if (Math.hypot(e.clientX - gs.startClient.x, e.clientY - gs.startClient.y) < 4) break;
        g.current = { kind: 'marquee', start: gs.start, container: gs.id, base: gs.base };
        if (!gs.base.length) s.setSelection([]);
        break;
      }
      case 'marquee': {
        const r = normRect(gs.start.x, gs.start.y, p.x, p.y);
        setMarquee(r);
        const hit = marqueeHits(viewPage(s), gs.container, r);
        s.setSelection([...new Set([...gs.base, ...hit])]);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const gs = g.current;
    g.current = null;
    setPanning(false);
    if (vp.current?.hasPointerCapture(e.pointerId)) vp.current.releasePointerCapture(e.pointerId);
    if (!gs) return;
    const s = useEditor.getState();
    switch (gs.kind) {
      case 'line': {
        setDraftLine(null);
        const a = { x: Math.round(gs.start.x), y: Math.round(gs.start.y) };
        const b = gs.end && Math.hypot(gs.end.x - a.x, gs.end.y - a.y) >= 4 ? gs.end : { x: a.x + 160, y: a.y };
        drawLine(gs.tool, a, b, gs.parentId);
        s.setTool('move');
        break;
      }
      case 'draw': {
        setDraft(null);
        const r = gs.rect && (gs.rect.w >= 2 || gs.rect.h >= 2) ? gs.rect : null;
        const at = { x: Math.round(gs.start.x), y: Math.round(gs.start.y) };
        if (SHAPE_TOOLS.includes(gs.type)) {
          drawShape(gs.type as unknown as ShapeTool, r ?? { ...at, w: 100, h: 100 }, gs.parentId);
        } else if (gs.type === 'text') {
          const id = r
            ? createShape('text', { ...r, h: Math.max(r.h, 20) }, gs.parentId, { sizingH: 'fixed', sizingV: 'auto' })
            : createShape('text', { ...at, w: 1, h: 1 }, gs.parentId);
          s.setEditing(id);
        } else {
          createShape(gs.type, r ?? { ...at, w: 100, h: 100 }, gs.parentId);
        }
        s.setTool('move');
        break;
      }
      case 'move': {
        setGuides([]); setMeasures([]); setGhost(null); setDropLine(null);
        if (!gs.moved) {
          // Klick ohne Ziehen auf eine Mehrfachauswahl wählt nur dieses Element
          if (!e.shiftKey && !e.metaKey && !e.ctrlKey && s.selection.length > 1) {
            const id = pickNode(viewPage(s), e.target as HTMLElement);
            if (id) s.setSelection([id]);
          }
          break;
        }
        const pg = viewPage(s);
        if (gs.layoutDrop) {
          const { target, anchorId } = gs.layoutDrop;
          s.mutate(page => insertIntoLayout(page, gs.ids, target, anchorId), { history: false });
        } else {
          // Frei ablegen – ggf. in ein anderes Board (oder aus einem Layout heraus)
          const target = boardAt(pg, toWorld(e.clientX, e.clientY), gs.ids);
          const changed = gs.ids.filter(i => pg.nodes[i] && (pg.nodes[i].parentId !== target || inLayout(pg, i)));
          if (changed.length) {
            s.mutate(page => {
              reparent(page, changed.filter(i => page.nodes[i].parentId !== target), target);
              const tp = target ? absPos(pg, target) : { x: 0, y: 0 };
              for (const id of changed) {
                const n = page.nodes[id];
                const a = gs.startAbs[id];
                if (inLayout(pg, id) && n.parentId === target) n.absolute = true;
                n.x = Math.round(a.x + gs.delta.x - tp.x);
                n.y = Math.round(a.y + gs.delta.y - tp.y);
              }
            }, { history: false });
          }
        }
        s.endGesture();
        break;
      }
      case 'resize':
        setGuides([]); setMeasures([]);
        s.endGesture();
        break;
      case 'marquee':
        setMarquee(null);
        break;
      case 'press': {
        // Nur geklickt: Board auswählen (mit ⇧ dazunehmen)
        const s = useEditor.getState();
        s.setSelection(gs.base.length ? [...new Set([...gs.base, gs.id])] : [gs.id]);
        break;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = useEditor.getState();
    if (s.tool !== 'move' || s.editingTextId) return;
    const title = (e.target as HTMLElement).closest<HTMLElement>('[data-board-title]');
    if (title) { useTitleRename.setState({ id: title.dataset.boardTitle! }); return; }
    const id = textAt(viewPage(s), e.clientX, e.clientY);
    if (id) editTextAt(id, e.clientX, e.clientY);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const s = useEditor.getState();
    const id = pickNode(viewPage(s), e.target as HTMLElement);
    if (id && !s.selection.includes(id)) s.setSelection([id]);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const all = Array.from(e.dataTransfer.files);
    const files = all.filter(f => f.type.startsWith('image/') && !isSvgFile(f));
    const p = toWorld(e.clientX, e.clientY);
    const asset = e.dataTransfer.getData(ASSET_MIME);
    if (asset) {
      try {
        const a = JSON.parse(asset) as { kind: string; id: string };
        if (a.kind === 'component') insertInstance(a.id, p);
        if (a.kind === 'image') placeImageAsset(a.id, p);
      } catch { /* ungültig */ }
      return;
    }
    files.forEach((f, i) => placeImageFile(f, { x: p.x + i * 20, y: p.y + i * 20 }));
    // SVG-Dateien werden zu einfärbbaren Grafiken
    all.filter(isSvgFile).forEach((f, i) => importSvgFile(f, { x: p.x + (files.length + i) * 20, y: p.y + (files.length + i) * 20 }));
  };

  const closeMenu = useCallback(() => setMenu(null), []);
  const panMode = space || tool === 'hand';

  return (
    <>
      <div ref={vp}
        className={`viewport tool-${tool}${panMode ? ' panmode' : ''}${panning ? ' panning' : ''}`}
        style={{ background: page.background }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => { if (!g.current) useEditor.getState().setHover(null); }}
        onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
        onDragOver={e => e.preventDefault()} onDrop={onDrop}>
        <div ref={worldRef} className="world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {page.rootIds.map(id => <NodeView key={id} id={id} parentLayout={null} />)}
        </div>
        <RulersAndGuides vp={vp} />
        <Overlay page={page} zoom={zoom} pan={pan} draft={draft} draftLine={draftLine} marquee={marquee} guides={guides} ghost={ghost} dropLine={dropLine} />
        <MeasureLayer page={page} zoom={zoom} pan={pan} live={measures} />
        <SiteKeyframes />
        <ClaudeFlash zoom={zoom} pan={pan} />
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu} />}
    </>
  );
}

const fmt = (v: number) => String(round(v, 2)).replace('.', ',');

/** Board-Name auf der Fläche umbenennen (Doppelklick auf den Titel) */
const useTitleRename = create<{ id: string | null }>(() => ({ id: null }));
function commitTitle(id: string, value: string) {
  useTitleRename.setState({ id: null });
  const name = value.trim();
  const n = pageOf(useEditor.getState()).nodes[id];
  if (!name || !n || name === n.name) return;
  if (n.isMain || n.variantSet) renameComponent(id, name);
  else updateNodes([id], x => { x.name = name; }, 'rename');
}

function Overlay({ page, zoom, pan, draft, draftLine, marquee, guides, ghost, dropLine }: {
  page: Page; zoom: number; pan: Pt; draft: Rect | null; draftLine: { a: Pt; b: Pt } | null; marquee: Rect | null; guides: Guide[]; ghost: Rect | null; dropLine: Rect | null;
}) {
  const selection = useEditor(s => s.selection);
  const hover = useEditor(s => s.hoverId);
  const editing = useEditor(s => s.editingTextId);
  const bp = useEditor(s => s.breakpoint);
  const renaming = useTitleRename(s => s.id);
  useEditor(s => s.geom); // neu zeichnen, sobald neu gemessen wurde
  const sr = (r: Rect) => ({ left: r.x * zoom + pan.x, top: r.y * zoom + pan.y, width: r.w * zoom, height: r.h * zoom });
  const sel = selection.filter(id => page.nodes[id]);
  const rects = sel.map(id => absRect(page, id));
  const box = bbox(rects);
  const single = sel.length === 1 ? page.nodes[sel[0]] : null;
  const rotated = !!single && single.rotation !== 0;
  const locked = sel.some(id => page.nodes[id].locked);
  const hoverNode = hover && !selection.includes(hover) ? page.nodes[hover] : undefined;
  const bpInfo = BREAKPOINTS.find(b => b.id === bp)!;

  return (
    <div className="overlay">
      {page.rootIds.map(id => {
        const n = page.nodes[id];
        if (!n || n.type !== 'board' || !n.visible) return null;
        const r = sr(absRect(page, id));
        const title = (
          <div key={id} className={`board-title${selection.includes(id) ? ' sel' : ''}`} data-board-title={id}
            style={{ left: r.left, top: r.top - 19, maxWidth: Math.max(n.site && r.width > 150 ? r.width - 110 : r.width, n.site ? 170 : 40) }}
            title="Doppelklick zum Umbenennen">
            {renaming === id ? (
              <input className="board-title-input" autoFocus defaultValue={n.name} aria-label="Board umbenennen"
                onFocus={e => e.currentTarget.select()}
                onPointerDown={e => e.stopPropagation()}
                onBlur={e => commitTitle(id, e.currentTarget.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') useTitleRename.setState({ id: null });
                }} />
            ) : n.name}
            {n.site && <span className="bp-tag">{bpInfo.label} · {fmt(absRect(page, id).w)} px</span>}
          </div>
        );
        // Webseiten-Board: Leiste mit Bildschirmgröße und Vorschau (wie eine Fensterleiste)
        const bar = n.site && renaming !== id && r.width > 150 && (
          <div key={`${id}-bar`} className="board-bar" style={{ left: r.left + r.width, top: r.top - 22 }}
            onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
            {BREAKPOINTS.map(b => {
              const I = Icons[b.id];
              return (
                <button key={b.id} type="button" className={`board-bar-btn${bp === b.id ? ' on' : ''}`} aria-pressed={bp === b.id}
                  title={`${b.label} – ${b.hint}`} onClick={() => useEditor.getState().setBreakpoint(b.id)}><I /></button>
              );
            })}
            <span className="board-bar-sep" />
            <button type="button" className="board-bar-btn" title="Vorschau dieser Seite öffnen" aria-label="Vorschau"
              onClick={() => openPreview(page.id)}><Icons.play /></button>
          </div>
        );
        return bar ? [title, bar] : title;
      })}
      {hoverNode && (
        <div className="hover-box" style={{ ...sr(absRect(page, hoverNode.id)), transform: hoverNode.rotation ? `rotate(${hoverNode.rotation}deg)` : undefined }} />
      )}
      {sel.length > 1 && rects.map((r, i) => <div key={sel[i]} className="sel-outline" style={sr(r)} />)}
      {box && !editing && !ghost && (
        <div className="sel-box" style={{ ...sr(box), transform: rotated ? `rotate(${single!.rotation}deg)` : undefined }}>
          {!rotated && !locked && HANDLES.map(h => <div key={h} className={`handle h-${h}`} data-handle={h} />)}
          <div className="size-label">{fmt(box.w)} × {fmt(box.h)}</div>
        </div>
      )}
      {ghost && <div className="ghost-box" style={sr(ghost)} />}
      {dropLine && <div className="drop-line" style={sr(dropLine)} />}
      {draft && (
        <div className="draft-box" style={sr(draft)}><div className="size-label">{fmt(draft.w)} × {fmt(draft.h)}</div></div>
      )}
      {draftLine && (
        <svg className="draft-line" width="100%" height="100%">
          <line x1={draftLine.a.x * zoom + pan.x} y1={draftLine.a.y * zoom + pan.y} x2={draftLine.b.x * zoom + pan.x} y2={draftLine.b.y * zoom + pan.y} />
        </svg>
      )}
      {marquee && <div className="marquee" style={sr(marquee)} />}
      {guides.map((gd, i) => gd.axis === 'x'
        ? <div key={i} className="guide" style={{ left: gd.pos * zoom + pan.x, top: gd.from * zoom + pan.y, width: 1, height: (gd.to - gd.from) * zoom }} />
        : <div key={i} className="guide" style={{ top: gd.pos * zoom + pan.y, left: gd.from * zoom + pan.x, height: 1, width: (gd.to - gd.from) * zoom }} />)}
    </div>
  );
}

/** @keyframes und @font-face aus dem Website-CSS, damit eigene Animationen auch im Editor laufen */
function SiteKeyframes() {
  const css = useEditor(s => s.doc.site?.css ?? '');
  const safe = useMemo(() => editorSafeCss(css), [css]);
  return safe ? <style>{safe}</style> : null;
}
