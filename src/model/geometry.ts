import type { Page, Pt, Rect } from './types';

// Tatsächlich gemessene Positionen/Größen aus der Darstellung (Layout, Auto-Größen, Breakpoints).
// Relativ zum Eltern-Element. Fehlt ein Eintrag, gelten die gespeicherten Werte.
let measured: Record<string, Rect> = {};
export const setMeasured = (m: Record<string, Rect>) => { measured = m; };
export const getMeasured = (id: string): Rect | undefined => measured[id];

export function relRect(page: Page, id: string): Rect {
  const m = measured[id];
  if (m) return m;
  const n = page.nodes[id];
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

export function absPos(page: Page, id: string): Pt {
  let x = 0, y = 0;
  let cur: string | null = id;
  while (cur && page.nodes[cur]) {
    const r = relRect(page, cur);
    x += r.x; y += r.y;
    cur = page.nodes[cur].parentId;
  }
  return { x, y };
}

export function absRect(page: Page, id: string): Rect {
  const r = relRect(page, id);
  const p = absPos(page, id);
  return { x: p.x, y: p.y, w: r.w, h: r.h };
}

export function bbox(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const containsPt = (r: Rect, p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function normRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** true, wenn `ancestor` ein (echter) Vorfahre von `id` ist */
export function isAncestor(page: Page, ancestor: string, id: string): boolean {
  let n = page.nodes[id];
  while (n && n.parentId) {
    if (n.parentId === ancestor) return true;
    n = page.nodes[n.parentId];
  }
  return false;
}

/** Oberstes (tiefstes) sichtbares Board unter dem Punkt, ausgenommen `exclude` samt Inhalt */
export function boardAt(page: Page, p: Pt, exclude: string[]): string | null {
  let result: string | null = null;
  const visit = (ids: string[]) => {
    for (const id of ids) {
      const n = page.nodes[id];
      if (!n || !n.visible || (n.type !== 'board' && n.type !== 'rect')) continue; // Rechtecke können Inhalt aufnehmen
      if (exclude.some(e => e === id || isAncestor(page, e, id))) continue;
      if (containsPt(absRect(page, id), p)) { result = id; visit(n.children); }
    }
  };
  visit(page.rootIds);
  return result;
}

/** Ist die Ebene Teil eines Layouts (wird also automatisch angeordnet)? */
export function inLayout(page: Page, id: string): boolean {
  const n = page.nodes[id];
  if (!n || !n.parentId || n.absolute) return false;
  return !!page.nodes[n.parentId]?.layout;
}

export const round = (v: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
