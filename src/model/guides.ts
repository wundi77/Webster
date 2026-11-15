// Lineale, Hilfslinien und Spaltenraster (nur im Editor, nicht auf der fertigen Website)
import { create } from 'zustand';
import { useEditor, viewPage } from '../store';
import type { BoardGuide, ColumnGrid, Page, Rect } from './types';
import { absRect } from './geometry';
import { writeProps } from './resolve';
import { uid } from './factory';

// ---------- Ansicht (pro Browser gemerkt) ----------

interface ViewState { rulers: boolean; guides: boolean; guidesLocked: boolean; grids: boolean }
const VIEW_KEY = 'webster.view';
function loadView(): ViewState {
  const d: ViewState = { rulers: true, guides: true, guidesLocked: false, grids: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') }; } catch { return d; }
}
export const useView = create<ViewState & { toggle: (k: keyof ViewState) => void }>((set, get) => ({
  ...loadView(),
  toggle: k => {
    set({ [k]: !get()[k] } as Partial<ViewState>);
    const { rulers, guides, guidesLocked, grids } = get();
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ rulers, guides, guidesLocked, grids })); } catch { /* egal */ }
  },
}));

export const RULER = 20; // Breite des Lineals in px

// ---------- Hilfslinien ----------

/** Alle Hilfslinien der Seite in Weltkoordinaten (nur sichtbare Boards, nur innerhalb des Boards) */
export interface AbsGuide { id: string; boardId: string; axis: 'x' | 'y'; pos: number; board: Rect }
export function pageGuides(page: Page): AbsGuide[] {
  const out: AbsGuide[] = [];
  for (const id in page.nodes) {
    const n = page.nodes[id];
    if (n.type !== 'board' || !n.guides?.length || !isShown(page, id)) continue;
    const r = absRect(page, id);
    for (const g of n.guides) {
      const len = g.axis === 'x' ? r.w : r.h;
      if (g.pos < 0 || g.pos > len) continue; // z. B. auf schmaleren Breakpoints außerhalb
      out.push({ id: g.id, boardId: id, axis: g.axis, pos: (g.axis === 'x' ? r.x : r.y) + g.pos, board: r });
    }
  }
  return out;
}

/** Ebene und alle Eltern sichtbar? */
function isShown(page: Page, id: string): boolean {
  for (let n = page.nodes[id]; n; n = n.parentId ? page.nodes[n.parentId] : undefined!) if (!n.visible) return false;
  return true;
}

const S = () => useEditor.getState();
const mut = (fn: (guides: BoardGuide[]) => BoardGuide[], boardId: string, key?: string) =>
  S().mutate(p => {
    const n = p.nodes[boardId];
    if (n) n.guides = fn(n.guides ?? []);
  }, key ? { key } : {});

export function addGuide(boardId: string, axis: 'x' | 'y', pos: number) {
  mut(g => [...g, { id: uid(), axis, pos: Math.round(pos) }], boardId);
}
export function moveGuide(boardId: string, id: string, pos: number) {
  mut(g => g.map(x => (x.id === id ? { ...x, pos: Math.round(pos) } : x)), boardId, 'guide-' + id);
}
export function deleteGuide(boardId: string, id: string) {
  mut(g => g.filter(x => x.id !== id), boardId);
}
export function clearGuides(boardIds?: string[]) {
  S().mutate(p => {
    for (const id of boardIds ?? Object.keys(p.nodes)) if (p.nodes[id]?.guides?.length) p.nodes[id].guides = [];
  });
}
/** Hilfslinie in ein anderes Board verschieben (beim Ziehen über die Boardgrenze) */
export function rehomeGuide(fromId: string, toId: string, id: string, axis: 'x' | 'y', pos: number) {
  S().mutate(p => {
    const a = p.nodes[fromId], b = p.nodes[toId];
    if (!a || !b) return;
    a.guides = (a.guides ?? []).filter(x => x.id !== id);
    b.guides = [...(b.guides ?? []), { id: uid(), axis, pos: Math.round(pos) }];
  });
}

// ---------- Spaltenraster ----------

export const defaultGrid = (): ColumnGrid => ({ count: 12, gutter: 24, margin: 40, color: '#FF3B6B', opacity: 0.1, visible: true });

/** Spalten eines Boards in Weltkoordinaten */
export function gridColumns(r: Rect, g: ColumnGrid): Rect[] {
  const cols = g.cols?.length ? g.cols : Array.from({ length: Math.max(1, Math.round(g.count)) }, () => ({ unit: 'fr' as const, value: 1 }));
  const mr = g.marginRight ?? g.margin;
  const inner = r.w - g.margin - mr - (cols.length - 1) * g.gutter;
  if (inner <= 0) return [];
  // Pixel-Spalten zuerst, der Rest wird nach Anteilen verteilt
  const pxSum = cols.reduce((a, c) => a + (c.unit === 'px' ? Math.max(0, c.value) : 0), 0);
  const frSum = cols.reduce((a, c) => a + (c.unit === 'fr' ? Math.max(0, c.value) : 0), 0);
  const fr = frSum > 0 ? Math.max(0, inner - pxSum) / frSum : 0;
  const out: Rect[] = [];
  let x = r.x + g.margin;
  for (const c of cols) {
    const w = c.unit === 'px' ? Math.max(0, c.value) : Math.max(0, c.value) * fr;
    out.push({ x, y: r.y, w, h: r.h });
    x += w + g.gutter;
  }
  return out;
}

/** Spaltenbreiten des Rasters als Liste (für die Eingabe pro Spalte) */
export const gridCols = (g: ColumnGrid) => g.cols?.length ? g.cols : Array.from({ length: Math.max(1, Math.round(g.count)) }, () => ({ unit: 'fr' as const, value: 1 }));

export function pageGrids(page: Page): { boardId: string; grid: ColumnGrid; cols: Rect[] }[] {
  const out: { boardId: string; grid: ColumnGrid; cols: Rect[] }[] = [];
  for (const id in page.nodes) {
    const n = page.nodes[id];
    if (n.type !== 'board' || !n.colGrid?.visible || !isShown(page, id)) continue;
    out.push({ boardId: id, grid: n.colGrid, cols: gridColumns(absRect(page, id), n.colGrid) });
  }
  return out;
}

export function setGrid(boardIds: string[], grid: ColumnGrid | null, key = 'colgrid') {
  const bp = S().breakpoint;
  S().mutate(p => { for (const id of boardIds) if (p.nodes[id]) writeProps(p.nodes[id], bp, { colGrid: grid }); }, { key });
}

// ---------- Einrasten ----------

/** Board und alle umgebenden Boards (von einer Ebene aus) */
export function boardChain(page: Page, id: string | null): string[] {
  const out: string[] = [];
  for (let n = id ? page.nodes[id] : undefined; n; n = n.parentId ? page.nodes[n.parentId] : undefined) if (n.type === 'board') out.push(n.id);
  return out;
}

/** Positionen, an denen Ebenen einrasten: Hilfslinien und Spaltenkanten der angegebenen Boards */
export function snapLines(page: Page, boards: string[]): { x: number[]; y: number[] } {
  const v = useView.getState();
  const set = new Set(boards);
  const x: number[] = [], y: number[] = [];
  if (!set.size) return { x, y };
  if (v.guides) for (const g of pageGuides(page)) if (set.has(g.boardId)) (g.axis === 'x' ? x : y).push(g.pos);
  if (v.grids) for (const g of pageGrids(page)) if (set.has(g.boardId)) for (const c of g.cols) x.push(c.x, c.x + c.w);
  return { x, y };
}

// ---------- Nullpunkt der Lineale ----------

/** Board, auf das sich die Lineale beziehen: das Board der Auswahl, sonst das Webseiten-Board */
export function rulerBoard(page: Page, selection: string[]): string | null {
  for (const id of selection) {
    for (let n = page.nodes[id]; n; n = n.parentId ? page.nodes[n.parentId] : undefined!) if (n.type === 'board') return n.id;
  }
  const roots = page.rootIds.map(id => page.nodes[id]).filter(n => n?.type === 'board' && n.visible);
  return (roots.find(n => n.site) ?? roots[0])?.id ?? null;
}

export const currentPage = () => viewPage(S());
