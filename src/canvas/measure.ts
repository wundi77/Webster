// Abstände messen (rote Linien mit Pixelzahl) und gleiche Abstände erkennen
import { create } from 'zustand';
import type { Page, Rect } from '../model/types';
import { absRect } from '../model/geometry';
import { containerOf } from '../model/commands';

/** Eine Abstandslinie: axis 'x' = waagerecht von a bis b auf Höhe at; 'y' = senkrecht */
export interface Measure { axis: 'x' | 'y'; a: number; b: number; at: number; eq?: boolean }

const EPS = 0.5;
const overlapY = (p: Rect, q: Rect) => Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
const overlapX = (p: Rect, q: Rect) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
const midY = (p: Rect, q: Rect) => (Math.max(p.y, q.y) + Math.min(p.y + p.h, q.y + q.h)) / 2;
const midX = (p: Rect, q: Rect) => (Math.max(p.x, q.x) + Math.min(p.x + p.w, q.x + q.w)) / 2;

/** Sichtbare Geschwister (ohne die bewegten Ebenen) und das Eltern-Board */
export function measureContext(page: Page, ids: string[]): { others: Rect[]; container: Rect | null } {
  const first = page.nodes[ids[0]];
  if (!first) return { others: [], container: null };
  const parentId = first.parentId;
  const others = containerOf(page, parentId)
    .filter(i => !ids.includes(i) && page.nodes[i]?.visible)
    .slice(0, 300)
    .map(i => absRect(page, i));
  return { others, container: parentId ? absRect(page, parentId) : null };
}

/** Abstände zwischen benachbarten Ebenen in einer Reihe (waagerecht) bzw. Spalte (senkrecht) */
function pairGaps(rects: Rect[], axis: 'x' | 'y'): { p: Rect; q: Rect; gap: number }[] {
  const out: { p: Rect; q: Rect; gap: number }[] = [];
  for (const p of rects) {
    let best: { q: Rect; gap: number } | null = null;
    for (const q of rects) {
      if (q === p) continue;
      const gap = axis === 'x' ? q.x - (p.x + p.w) : q.y - (p.y + p.h);
      const ov = axis === 'x' ? overlapY(p, q) : overlapX(p, q);
      if (gap > EPS && ov > 0 && (!best || gap < best.gap)) best = { q, gap };
    }
    if (best) out.push({ p, ...best });
  }
  return out;
}

/** Gleiche Abstände: Verschiebung, mit der die Box denselben Abstand wie ein vorhandenes Paar bekommt */
export function equalSnap(box: Rect, others: Rect[], th: number): { dx: number | null; dy: number | null } {
  const solve = (axis: 'x' | 'y') => {
    const row = others.filter(r => (axis === 'x' ? overlapY(r, box) : overlapX(r, box)) > 0);
    if (!row.length) return null;
    const pos = axis === 'x' ? box.x : box.y;
    const size = axis === 'x' ? box.w : box.h;
    const lo = (r: Rect) => (axis === 'x' ? r.x : r.y);
    const hi = (r: Rect) => (axis === 'x' ? r.x + r.w : r.y + r.h);
    const cands: number[] = [];
    for (const { gap } of pairGaps(row, axis)) for (const r of row) cands.push(hi(r) + gap, lo(r) - gap - size);
    // genau in die Mitte zwischen zwei Nachbarn
    for (const l of row) for (const r of row) {
      const space = lo(r) - hi(l);
      if (space > size) cands.push(hi(l) + (space - size) / 2);
    }
    let best: number | null = null;
    for (const c of cands) if (Math.abs(c - pos) <= th && (best === null || Math.abs(c - pos) < Math.abs(best))) best = c - pos;
    return best;
  };
  return { dx: solve('x'), dy: solve('y') };
}

/** Abstände der Box zu den nächsten Nachbarn in alle vier Richtungen (sonst zum Rand des Boards) */
export function measureGaps(box: Rect, others: Rect[], container: Rect | null): Measure[] {
  const out: Measure[] = [];
  const near = { l: null as Rect | null, r: null as Rect | null, t: null as Rect | null, b: null as Rect | null };
  const dist = { l: Infinity, r: Infinity, t: Infinity, b: Infinity };
  for (const o of others) {
    if (overlapY(o, box) > 0) {
      const dl = box.x - (o.x + o.w), dr = o.x - (box.x + box.w);
      if (dl >= -EPS && dl < dist.l) { dist.l = dl; near.l = o; }
      if (dr >= -EPS && dr < dist.r) { dist.r = dr; near.r = o; }
    }
    if (overlapX(o, box) > 0) {
      const dt = box.y - (o.y + o.h), db = o.y - (box.y + box.h);
      if (dt >= -EPS && dt < dist.t) { dist.t = dt; near.t = o; }
      if (db >= -EPS && db < dist.b) { dist.b = db; near.b = o; }
    }
  }
  const c = container;
  const inside = !!c && box.x >= c.x - EPS && box.y >= c.y - EPS && box.x + box.w <= c.x + c.w + EPS && box.y + box.h <= c.y + c.h + EPS;
  const cy = box.y + box.h / 2, cx = box.x + box.w / 2;
  // [Abstand, zu einer Nachbar-Ebene?] je Richtung
  const side: [Measure | null, boolean][] = [
    near.l ? [{ axis: 'x', a: near.l.x + near.l.w, b: box.x, at: midY(near.l, box) }, true] : [inside ? { axis: 'x', a: c!.x, b: box.x, at: cy } : null, false],
    near.r ? [{ axis: 'x', a: box.x + box.w, b: near.r.x, at: midY(near.r, box) }, true] : [inside ? { axis: 'x', a: box.x + box.w, b: c!.x + c!.w, at: cy } : null, false],
    near.t ? [{ axis: 'y', a: near.t.y + near.t.h, b: box.y, at: midX(near.t, box) }, true] : [inside ? { axis: 'y', a: c!.y, b: box.y, at: cx } : null, false],
    near.b ? [{ axis: 'y', a: box.y + box.h, b: near.b.y, at: midX(near.b, box) }, true] : [inside ? { axis: 'y', a: box.y + box.h, b: c!.y + c!.h, at: cx } : null, false],
  ];
  for (const [m] of side) if (m) out.push(m);

  // Gleiche Abstände markieren (nur zwischen Ebenen, nicht zum Rand)
  for (const axis of ['x', 'y'] as const) {
    const mine = side.filter(([m, isNb]) => m && isNb && m.axis === axis).map(([m]) => m!);
    if (!mine.length) continue;
    const row = others.filter(r => (axis === 'x' ? overlapY(r, box) : overlapX(r, box)) > 0);
    const pairs = pairGaps(row, axis);
    for (const m of mine) {
      const g = m.b - m.a;
      if (g <= EPS) continue;
      const same = pairs.filter(pq => Math.abs(pq.gap - g) <= EPS);
      const twin = mine.some(o => o !== m && Math.abs(o.b - o.a - g) <= EPS);
      if (!same.length && !twin) continue;
      m.eq = true;
      for (const { p, q } of same) {
        out.push(axis === 'x'
          ? { axis, a: p.x + p.w, b: q.x, at: midY(p, q), eq: true }
          : { axis, a: p.y + p.h, b: q.y, at: midX(p, q), eq: true });
      }
    }
  }
  return out.filter(m => m.b - m.a > EPS);
}

/** Abstände zwischen zwei Ebenen (⌥ + Darüberfahren): innen = zu den Rändern, sonst die Lücke dazwischen */
export function measureBetween(a: Rect, b: Rect): Measure[] {
  const contains = (o: Rect, i: Rect) => i.x >= o.x - EPS && i.y >= o.y - EPS && i.x + i.w <= o.x + o.w + EPS && i.y + i.h <= o.y + o.h + EPS;
  if (contains(b, a)) return measureGaps(a, [], b);
  if (contains(a, b)) return measureGaps(b, [], a);
  const out: Measure[] = [];
  const cy = a.y + a.h / 2, cx = a.x + a.w / 2;
  const atY = overlapY(a, b) > 0 ? midY(a, b) : cy;
  const atX = overlapX(a, b) > 0 ? midX(a, b) : cx;
  if (b.x >= a.x + a.w) out.push({ axis: 'x', a: a.x + a.w, b: b.x, at: atY });
  else if (b.x + b.w <= a.x) out.push({ axis: 'x', a: b.x + b.w, b: a.x, at: atY });
  if (b.y >= a.y + a.h) out.push({ axis: 'y', a: a.y + a.h, b: b.y, at: atX });
  else if (b.y + b.h <= a.y) out.push({ axis: 'y', a: b.y + b.h, b: a.y, at: atX });
  return out.filter(m => m.b - m.a > EPS);
}

// ---------- kurz einblenden nach Pfeiltasten ----------
export const useMeasureFlash = create<{ until: number }>(() => ({ until: 0 }));
let flashTimer = 0;
export function flashMeasures(ms = 900) {
  useMeasureFlash.setState({ until: Date.now() + ms });
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => useMeasureFlash.setState({ until: 0 }), ms);
}

// ---------- ⌥ gedrückt? ----------
export const useAltKey = create<{ alt: boolean }>(() => ({ alt: false }));
if (typeof window !== 'undefined') {
  const upd = (e: KeyboardEvent) => { if (useAltKey.getState().alt !== e.altKey) useAltKey.setState({ alt: e.altKey }); };
  window.addEventListener('keydown', upd);
  window.addEventListener('keyup', upd);
  window.addEventListener('blur', () => useAltKey.setState({ alt: false }));
}
