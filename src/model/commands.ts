// Alle Bearbeitungsbefehle (Erstellen, Löschen, Duplizieren, Anordnen, Layout …)
import { useEditor, pageOf, viewPage } from '../store';
import type { NodeType, Page, Pt, Rect, WDocument, WNode } from './types';
import { createDocument, createNode, createPage, findOrAddImage, makeLayout, uid } from './factory';
import { addVariant } from './library';
import { detachSubtree, instanceRootOf, isInstanceRoot, swapInstance, variantSetOf, variantsOf } from './components';
import type { ImageAsset } from './types';
import { absPos, absRect, bbox, boardAt, inLayout, isAncestor } from './geometry';
import { viewportCenterWorld, fitAll } from './viewport';
import { applyEdit, writeProps } from './resolve';
import { applyHoverEdit, applyScrollEdit } from './hover';
import { isFooter, slug } from './css';
import { askConfirm } from '../ui/ConfirmDialog';
import { allPages, isPageBoard, pageBoard as pageBoardOf } from './pageRules';

const S = () => useEditor.getState();
/** Seite im aktuellen Breakpoint – nur zum Lesen */
export const currentPage = () => viewPage(S());

export function containerOf(page: Page, parentId: string | null): string[] {
  return parentId ? page.nodes[parentId].children : page.rootIds;
}

/** Entfernt Einträge, deren Vorfahre ebenfalls ausgewählt ist */
export function topLevel(page: Page, ids: string[]): string[] {
  return ids.filter(id => page.nodes[id] && !ids.some(o => o !== id && isAncestor(page, o, id)));
}

/** Stelle „am Ende“ eines Boards: im Layout vor einer Fußzeile, die zuletzt steht (sie bleibt immer unten) */
export function endIndex(page: Page, parentId: string | null): number {
  const arr = containerOf(page, parentId);
  if (!parentId || !page.nodes[parentId]?.layout) return arr.length;
  // Frei positionierte Ebenen zählen nicht – entscheidend ist die letzte im Fluss
  let i = arr.length - 1;
  while (i >= 0 && page.nodes[arr[i]]?.absolute) i--;
  const last = page.nodes[arr[i]];
  return i >= 0 && isFooter(last) ? i : arr.length;
}

/** Hängt eine Ebene ans Ende eines Boards (im Layout vor die Fußzeile) */
export function appendChild(page: Page, parentId: string, id: string) {
  page.nodes[parentId].children.splice(endIndex(page, parentId), 0, id);
}

export function insertNode(page: Page, node: WNode, parentId: string | null, index?: number) {
  node.parentId = parentId;
  page.nodes[node.id] = node;
  const arr = containerOf(page, parentId);
  if (index === undefined || index > arr.length) arr.splice(endIndex(page, parentId), 0, node.id);
  else arr.splice(index, 0, node.id);
}

function removeSubtree(page: Page, id: string) {
  const n = page.nodes[id];
  if (!n) return;
  for (const c of [...n.children]) removeSubtree(page, c);
  delete page.nodes[id];
}

function detach(page: Page, id: string) {
  const n = page.nodes[id];
  const arr = containerOf(page, n.parentId);
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
}

/** Setzt die Position (Grundwert) und entfernt Breakpoint-Positionen, die nicht mehr passen */
function placeAt(n: WNode, x: number, y: number) {
  n.x = Math.round(x * 100) / 100;
  n.y = Math.round(y * 100) / 100;
  if (n.overrides) for (const o of Object.values(n.overrides)) { if (o) { delete o.x; delete o.y; } }
}

/** Verschiebt Ebenen in ein anderes Eltern-Element, die Position auf der Fläche bleibt gleich */
export function reparent(page: Page, ids: string[], parentId: string | null, index?: number) {
  const pp = parentId ? absPos(page, parentId) : { x: 0, y: 0 };
  let idx = index;
  for (const id of ids) {
    const n = page.nodes[id];
    if (!n) continue;
    if (parentId && (id === parentId || isAncestor(page, id, parentId))) continue;
    const a = absPos(page, id);
    const oldArr = containerOf(page, n.parentId);
    const oldIdx = oldArr.indexOf(id);
    if (oldIdx >= 0) oldArr.splice(oldIdx, 1);
    if (idx !== undefined && n.parentId === parentId && oldIdx >= 0 && oldIdx < idx) idx -= 1;
    if (n.parentId !== parentId) n.grid = null;
    n.parentId = parentId;
    placeAt(n, a.x - pp.x, a.y - pp.y);
    const arr = containerOf(page, parentId);
    if (idx === undefined || idx > arr.length) arr.splice(endIndex(page, parentId), 0, id);
    else { arr.splice(idx, 0, id); idx += 1; }
  }
}

/** Fügt Ebenen in ein Layout-Board ein, vor `anchorId` (null = ans Ende) */
export function insertIntoLayout(page: Page, ids: string[], targetId: string, anchorId: string | null) {
  const pp = absPos(page, targetId);
  const valid = ids.filter(id => page.nodes[id] && id !== targetId && !isAncestor(page, id, targetId));
  const positions = Object.fromEntries(valid.map(id => [id, absPos(page, id)]));
  for (const id of valid) detach(page, id);
  const arr = page.nodes[targetId].children;
  let idx = anchorId && !valid.includes(anchorId) ? arr.indexOf(anchorId) : -1;
  if (idx < 0) idx = endIndex(page, targetId);
  for (const id of valid) {
    const n = page.nodes[id];
    if (n.parentId !== targetId) n.grid = null;
    n.parentId = targetId;
    n.absolute = false;
    placeAt(n, positions[id].x - pp.x, positions[id].y - pp.y);
    arr.splice(idx++, 0, id);
  }
}

export function createShape(type: NodeType, abs: Rect, parentId: string | null, init: Partial<WNode> = {}): string {
  const node = createNode(type, init);
  const view = currentPage();
  const parentLayout = parentId ? view.nodes[parentId]?.layout : null;
  S().mutate(page => {
    const pp = parentId ? absPos(page, parentId) : { x: 0, y: 0 };
    node.x = Math.round(abs.x - pp.x);
    node.y = Math.round(abs.y - pp.y);
    node.w = Math.max(1, Math.round(abs.w));
    node.h = Math.max(1, Math.round(abs.h));
    if (parentLayout && parentId) {
      // Im Layout an der passenden Stelle einfügen
      node.parentId = parentId;
      page.nodes[node.id] = node;
      const anchor = layoutAnchor(view, parentId, [], { x: abs.x + abs.w / 2, y: abs.y + abs.h / 2 });
      const arr = page.nodes[parentId].children;
      const i = anchor.anchorId ? arr.indexOf(anchor.anchorId) : -1;
      arr.splice(i < 0 ? arr.length : i, 0, node.id);
    } else insertNode(page, node, parentId);
  });
  S().setSelection([node.id]);
  return node.id;
}

export function deleteNodes(ids: string[]) {
  const page = pageOf(S());
  const all = topLevel(page, ids).filter(id => !isPageBoard(page, id)); // Seiten-Board lässt sich nicht löschen
  // Teile einer Komponenten-Kopie werden nur ausgeblendet (sonst kämen sie beim nächsten Abgleich zurück)
  const inner = all.filter(id => !isInstanceRoot(page.nodes[id]) && instanceRootOf(page, id));
  const top = all.filter(id => !inner.includes(id));
  if (inner.length) updateNodes(inner, n => { n.visible = false; });
  if (!top.length) { S().setSelection([]); return; }
  // Gelöschte Hauptkomponenten: ihre Kopien werden zu normalen Ebenen
  const mains: string[] = [];
  const collect = (id: string) => { const n = page.nodes[id]; if (!n) return; if (n.isMain) mains.push(id); n.children.forEach(collect); };
  top.forEach(collect);
  S().mutate((pg, d) => {
    // Gelöschte Variante: ihre Kopien wechseln auf eine verbleibende Variante desselben Rahmens
    const gone = new Set<string>();
    const mark = (id: string) => { gone.add(id); pg.nodes[id]?.children.forEach(mark); };
    top.forEach(mark);
    for (const m of mains) {
      const set = variantSetOf(pg, m);
      const fallback = set && variantsOf(pg, set.id).find(v => !gone.has(v.id));
      if (!fallback) continue;
      for (const p of allPages(d)) for (const nid of Object.keys(p.nodes)) {
        if (p.nodes[nid]?.componentId === m && isInstanceRoot(p.nodes[nid]) && !gone.has(nid)) swapInstance(d, p, nid, fallback.id);
      }
    }
    for (const id of top) { detach(pg, id); removeSubtree(pg, id); }
    for (const m of mains) for (const p of allPages(d)) {
      for (const nid in p.nodes) if (p.nodes[nid].componentId === m && isInstanceRoot(p.nodes[nid])) detachSubtree(p, nid);
    }
  });
  S().setSelection([]);
}

export const deleteSelection = () => deleteNodes(S().selection);

/** Ändert Ebenen – im Tablet/Mobil-Modus nur für diesen Breakpoint */
export function updateNodes(ids: string[], fn: (n: WNode) => void, key?: string) {
  const bp = S().breakpoint;
  const it = S().interaction;
  const edit = it === 'hover' ? applyHoverEdit : it === 'scrolled' ? applyScrollEdit : applyEdit;
  S().mutate(pg => { for (const id of ids) { const n = pg.nodes[id]; if (n) edit(n, bp, fn); } }, { key });
}

/** Entfernt alle Abweichungen des aktuellen Breakpoints */
export function resetOverrides(ids: string[]) {
  const bp = S().breakpoint;
  if (bp === 'desktop') return;
  S().mutate(pg => { for (const id of ids) { const n = pg.nodes[id]; if (n?.overrides) delete n.overrides[bp]; } });
}

export function setText(id: string, text: string) {
  S().mutate(pg => { const n = pg.nodes[id]; if (n) n.text = text; }, { key: 'text-' + id });
}

export function nudge(dx: number, dy: number) {
  const page = currentPage();
  const ids = topLevel(page, S().selection).filter(id => !page.nodes[id].locked && !inLayout(page, id) && !isPageBoard(page, id));
  updateNodes(ids, n => { n.x += dx; n.y += dy; }, 'nudge');
}

export function selectAll() {
  const s = S();
  const page = currentPage();
  const first = s.selection[0] ? page.nodes[s.selection[0]] : undefined;
  const arr = containerOf(page, first ? first.parentId : null);
  s.setSelection(arr.filter(id => page.nodes[id].visible && !page.nodes[id].locked));
}

// ---------- Layout ----------

/** Wo im Layout-Board würde ein Element an Punkt p landen? */
export function layoutAnchor(page: Page, targetId: string, exclude: string[], p: Pt): { anchorId: string | null; line: Rect | null } {
  const t = page.nodes[targetId];
  const L = t.layout;
  if (!L) return { anchorId: null, line: null };
  const kids = t.children.filter(id => !exclude.includes(id) && page.nodes[id]?.visible && !page.nodes[id].absolute);
  const rects = kids.map(id => absRect(page, id));
  const row = L.type === 'grid' || L.direction === 'row';
  let idx = kids.length;
  for (let i = 0; i < kids.length; i++) {
    const r = rects[i];
    const before = L.type === 'grid'
      ? p.y < r.y || (p.y <= r.y + r.h && p.x < r.x + r.w / 2)
      : row
        ? (L.wrap ? p.y < r.y || (p.y <= r.y + r.h && p.x < r.x + r.w / 2) : p.x < r.x + r.w / 2)
        : p.y < r.y + r.h / 2;
    if (before) { idx = i; break; }
  }
  // Hinter die Fußzeile kommt nichts – sie bleibt unten
  if (idx === kids.length && kids.length && isFooter(page.nodes[kids[kids.length - 1]])) idx = kids.length - 1;
  const board = absRect(page, targetId);
  let line: Rect | null;
  const T = 2;
  if (!kids.length) {
    line = row
      ? { x: board.x + L.padding[3], y: board.y + L.padding[0], w: T, h: Math.max(20, board.h - L.padding[0] - L.padding[2]) }
      : { x: board.x + L.padding[3], y: board.y + L.padding[0], w: Math.max(20, board.w - L.padding[1] - L.padding[3]), h: T };
  } else if (idx < kids.length) {
    const r = rects[idx];
    line = row ? { x: r.x - T - 1, y: r.y, w: T, h: r.h } : { x: r.x, y: r.y - T - 1, w: r.w, h: T };
  } else {
    const r = rects[kids.length - 1];
    line = row ? { x: r.x + r.w + 1, y: r.y, w: T, h: r.h } : { x: r.x, y: r.y + r.h + 1, w: r.w, h: T };
  }
  return { anchorId: idx < kids.length ? kids[idx] : null, line };
}

/** Flex- oder Grid-Layout zu einem Board hinzufügen (vorhandene Inhalte werden nach Position sortiert) */
export function addLayout(boardId: string, type: 'flex' | 'grid') {
  const view = currentPage();
  const b = view.nodes[boardId];
  if (!b || (b.type !== 'board' && b.type !== 'rect')) return; // ein Rechteck wird dabei zum Behälter
  const kids = b.children.filter(id => !view.nodes[id].absolute);
  const rects = Object.fromEntries(kids.map(id => [id, absRect(view, id)]));
  const box = bbox(Object.values(rects));
  const direction: 'row' | 'column' = box && box.h > box.w ? 'column' : 'row';
  const sorted = [...kids].sort((a, c) => (direction === 'row'
    ? rects[a].x - rects[c].x || rects[a].y - rects[c].y
    : rects[a].y - rects[c].y || rects[a].x - rects[c].x));
  updateNodes([boardId], n => {
    if (n.layout) n.layout.type = type;
    else n.layout = makeLayout(type, direction);
  }, 'layout-add');
  if (S().breakpoint === 'desktop' && !b.layout) {
    S().mutate(pg => {
      const arr = pg.nodes[boardId].children;
      const abs = arr.filter(id => !sorted.includes(id));
      // Fußzeile ans Ende (sonst landet sie im Reihen-Layout links, weil sie bei x = 0 beginnt)
      const order = [...sorted.filter(id => !isFooter(pg.nodes[id])), ...sorted.filter(id => isFooter(pg.nodes[id]))];
      arr.splice(0, arr.length, ...order, ...abs);
    }, { key: 'layout-add' });
  }
}

/** ⇧A: Board mit Flex-Layout hinzufügen bzw. Auswahl in ein Flex-Board packen */
export function toggleFlexLayout() {
  const s = S();
  const page = currentPage();
  if (!s.selection.length) return;
  const one = s.selection.length === 1 ? page.nodes[s.selection[0]] : undefined;
  if (one?.type === 'board' || one?.type === 'rect') {
    if (one.layout) updateNodes([one.id], n => { n.layout = null; }, 'layout-del');
    else addLayout(one.id, 'flex');
    return;
  }
  wrapInBoard();
  const id = S().selection[0];
  if (id) addLayout(id, 'flex');
}

// ---------- Kopieren / Duplizieren ----------

interface ClipData { roots: string[]; nodes: Record<string, WNode>; abs: Record<string, Pt>; images: ImageAsset[] }
let clipboard: ClipData | null = null;

function serialize(page: Page, ids: string[]): ClipData {
  const view = currentPage();
  const nodes: Record<string, WNode> = {};
  const abs: Record<string, Pt> = {};
  const walk = (id: string) => {
    const n = page.nodes[id];
    nodes[id] = JSON.parse(JSON.stringify(n));
    n.children.forEach(walk);
  };
  const container = (id: string) => containerOf(page, page.nodes[id].parentId);
  const roots = topLevel(page, ids).sort((a, b) => container(a).indexOf(a) - container(b).indexOf(b));
  roots.forEach(id => { walk(id); abs[id] = absPos(view, id); });
  // Verwendete Bilder mitnehmen (für Einfügen in ein anderes Dokument)
  const refs = new Set(Object.values(nodes).map(n => n.imageRef).filter(Boolean));
  const images = S().doc.library.images.filter(i => refs.has(i.id));
  return { roots, nodes, abs, images };
}

function instantiate(page: Page, data: ClipData, rootId: string, parentId: string | null, pos: Pt, index?: number, doc?: WDocument): string {
  // Kopie einer Hauptkomponente = neue Komponenten-Kopie (Instanz)
  const build = (oldId: string, newParent: string | null, inMain: boolean, strip = false): string => {
    const src = data.nodes[oldId];
    const id = uid();
    const isMainRoot = !!src.isMain;
    const m = inMain || isMainRoot;
    // Ausschnitt aus einer Kopie (nicht die ganze Kopie) = normale Ebenen
    const fragment = strip || (oldId === rootId && !!src.mainId && !isInstanceRoot(src) && !m);
    const children = src.children.map(c => build(c, id, m, fragment));
    const n: WNode = { ...JSON.parse(JSON.stringify(src)), id, parentId: newParent, children };
    delete n.isMain;
    delete n.variantSet; delete n.variantName; delete n.vkey;
    if (fragment) { delete n.mainId; delete n.touched; delete n.componentId; }
    if (m) {
      n.mainId = oldId;
      n.touched = [];
      if (isMainRoot && !inMain) n.componentId = oldId; else delete n.componentId;
    }
    page.nodes[id] = n;
    return id;
  };
  if (doc) for (const img of data.images) if (!doc.library.images.some(i => i.id === img.id)) doc.library.images.push(img);
  const newId = build(rootId, parentId, false);
  const pp = parentId ? absPos(page, parentId) : { x: 0, y: 0 };
  placeAt(page.nodes[newId], pos.x - pp.x, pos.y - pp.y);
  const arr = containerOf(page, parentId);
  if (index === undefined || index > arr.length) arr.splice(endIndex(page, parentId), 0, newId);
  else arr.splice(index, 0, newId);
  return newId;
}

export function duplicateNodes(ids: string[], opts: { offset?: boolean; history?: boolean } = {}): string[] {
  const page = pageOf(S());
  ids = ids.filter(id => !isPageBoard(page, id)); // Seiten-Board nicht verdoppeln
  if (!ids.length) return [];
  // ⌘D auf eine Variante: neue Variante im selben Rahmen
  if (opts.offset && ids.length === 1 && variantSetOf(page, ids[0])) {
    const v = addVariant(ids[0]);
    return v ? [v] : [];
  }
  const data = serialize(page, ids);
  const out: string[] = [];
  S().mutate(pg => {
    for (const r of data.roots) {
      const src = data.nodes[r];
      const arr = containerOf(pg, src.parentId);
      let pos = data.abs[r];
      if (opts.offset) {
        pos = src.parentId === null && src.type === 'board'
          ? { x: pos.x + (absRect(currentPage(), r).w) + 40, y: pos.y }
          : { x: pos.x + 10, y: pos.y + 10 };
      }
      out.push(instantiate(pg, data, r, src.parentId, pos, arr.indexOf(r) + 1));
    }
  }, { history: opts.history, system: true });
  return out;
}

export function copySelection() {
  const s = S();
  const pg = pageOf(s);
  const sel = s.selection.filter(id => !isPageBoard(pg, id));
  if (sel.length) clipboard = serialize(pg, sel);
}

export function cutSelection() { copySelection(); deleteSelection(); }

export function hasClipboard() { return !!clipboard; }

export function paste() {
  const data = clipboard;
  if (!data) return;
  const s = S();
  const page = pageOf(s);
  let target: string | null | undefined;
  if (s.selection.length === 1 && page.nodes[s.selection[0]]?.type === 'board' && !data.roots.includes(s.selection[0])) target = s.selection[0];
  else if (s.selection.length) target = page.nodes[s.selection[0]]?.parentId ?? null;
  const out: string[] = [];
  s.mutate((pg, d) => {
    for (const r of data.roots) {
      const src = data.nodes[r];
      let parent = target !== undefined ? target : (src.parentId && pg.nodes[src.parentId] ? src.parentId : null);
      if (parent && !pg.nodes[parent]) parent = null;
      let pos = data.abs[r];
      if (parent && parent !== src.parentId) {
        const pp = absPos(pg, parent);
        pos = { x: pp.x + src.x, y: pp.y + src.y };
      }
      out.push(instantiate(pg, data, r, parent, pos, undefined, d));
    }
  }, { system: true });
  s.setSelection(out);
}

// ---------- Anordnen ----------

export type OrderDir = 'forward' | 'backward' | 'front' | 'back';

export function reorder(dir: OrderDir) {
  const s = S();
  const page = pageOf(s);
  const ids = topLevel(page, s.selection);
  if (!ids.length) return;
  s.mutate(pg => {
    const groups = new Map<string | null, Set<string>>();
    for (const id of ids) {
      const p = pg.nodes[id].parentId;
      if (!groups.has(p)) groups.set(p, new Set());
      groups.get(p)!.add(id);
    }
    for (const [parent, set] of groups) {
      const arr = containerOf(pg, parent);
      if (dir === 'front' || dir === 'back') {
        const rest = arr.filter(i => !set.has(i));
        const moved = arr.filter(i => set.has(i));
        arr.splice(0, arr.length, ...(dir === 'front' ? [...rest, ...moved] : [...moved, ...rest]));
      } else if (dir === 'forward') {
        for (let i = arr.length - 2; i >= 0; i--) {
          if (set.has(arr[i]) && !set.has(arr[i + 1])) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      } else {
        for (let i = 1; i < arr.length; i++) {
          if (set.has(arr[i]) && !set.has(arr[i - 1])) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
    }
  });
}

/** Packt die Auswahl in ein neues Board */
export function wrapInBoard() {
  const s = S();
  const view = currentPage();
  const ids = topLevel(view, s.selection).filter(id => !isPageBoard(view, id));
  if (!ids.length) return;
  const parentId = view.nodes[ids[0]].parentId;
  const arr0 = containerOf(view, parentId);
  const ordered = ids.filter(i => view.nodes[i].parentId === parentId).sort((a, b) => arr0.indexOf(a) - arr0.indexOf(b));
  const box = bbox(ordered.map(i => absRect(view, i)))!;
  const board = createNode('board', { fills: [] });
  const parentLayout = parentId ? view.nodes[parentId]?.layout : null;
  s.mutate(pg => {
    const pp = parentId ? absPos(pg, parentId) : { x: 0, y: 0 };
    board.x = box.x - pp.x; board.y = box.y - pp.y; board.w = Math.round(box.w); board.h = Math.round(box.h);
    if (parentLayout) board.sizingH = board.sizingV = 'fixed';
    const arr = containerOf(pg, parentId);
    insertNode(pg, board, parentId, Math.min(...ordered.map(i => arr.indexOf(i))));
    reparent(pg, ordered, board.id);
  });
  s.setSelection([board.id]);
}

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function align(kind: AlignKind) {
  const s = S();
  const view = currentPage();
  const ids = topLevel(view, s.selection).filter(i => !view.nodes[i].locked && !inLayout(view, i));
  if (!ids.length) return;
  let ref: Rect | null;
  if (ids.length === 1) {
    const p = view.nodes[ids[0]].parentId;
    if (!p) return;
    ref = absRect(view, p);
  } else ref = bbox(ids.map(i => absRect(view, i)));
  if (!ref) return;
  const R = ref;
  const bp = s.breakpoint;
  s.mutate(pg => {
    for (const id of ids) {
      const r = absRect(view, id);
      const cur = view.nodes[id];
      let dx = 0, dy = 0;
      if (kind === 'left') dx = R.x - r.x;
      if (kind === 'hcenter') dx = R.x + R.w / 2 - (r.x + r.w / 2);
      if (kind === 'right') dx = R.x + R.w - (r.x + r.w);
      if (kind === 'top') dy = R.y - r.y;
      if (kind === 'vcenter') dy = R.y + R.h / 2 - (r.y + r.h / 2);
      if (kind === 'bottom') dy = R.y + R.h - (r.y + r.h);
      writeProps(pg.nodes[id], bp, { x: Math.round((cur.x + dx) * 100) / 100, y: Math.round((cur.y + dy) * 100) / 100 });
    }
  });
}

/** Verteilt 3+ Ebenen mit gleichen Abständen */
export function distribute(axis: 'h' | 'v') {
  const s = S();
  const view = currentPage();
  const ids = topLevel(view, s.selection).filter(i => !view.nodes[i].locked && !inLayout(view, i));
  if (ids.length < 3) return;
  const items = ids.map(id => ({ id, r: absRect(view, id) }))
    .sort((a, b) => (axis === 'h' ? a.r.x - b.r.x : a.r.y - b.r.y));
  const first = items[0].r, last = items[items.length - 1].r;
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const total = items.reduce((t, i) => t + (axis === 'h' ? i.r.w : i.r.h), 0);
  const gap = (span - total) / (items.length - 1);
  const bp = s.breakpoint;
  s.mutate(pg => {
    let cur = axis === 'h' ? first.x : first.y;
    for (const it of items) {
      const n = view.nodes[it.id];
      const patch = axis === 'h' ? { x: n.x + cur - it.r.x } : { y: n.y + cur - it.r.y };
      cur += (axis === 'h' ? it.r.w : it.r.h) + gap;
      writeProps(pg.nodes[it.id], bp, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, Math.round(v * 100) / 100])));
    }
  });
}

// ---------- Seiten ----------

export function addPage() {
  const page = createPage(`Seite ${S().doc.pages.length + 1}`);
  const board = createNode('board', { name: 'Desktop', w: 1440, h: 1024, site: true });
  page.nodes[board.id] = board;
  page.rootIds.push(board.id);
  S().mutate((_, doc) => { doc.pages.push(page); });
  S().setPage(page.id);
}

export function renamePage(id: string, name: string) {
  S().mutate((_, doc) => { const p = doc.pages.find(x => x.id === id); if (p) p.name = name; });
}

/** Seite an eine andere Stelle der Liste verschieben (die oberste Seite ist die Startseite) */
export function movePage(id: string, toIndex: number) {
  const from = S().doc.pages.findIndex(p => p.id === id);
  if (from < 0) return;
  const to = Math.max(0, Math.min(toIndex, S().doc.pages.length - 1));
  if (from === to) return;
  S().mutate((_, doc) => { const [pg] = doc.pages.splice(from, 1); doc.pages.splice(to, 0, pg); });
}

/** Als Startseite festlegen = an die erste Stelle */
export const setHomePage = (id: string) => movePage(id, 0);

/** Vollständige, unabhängige Kopie einer Seite (neue ids). Komponenten-Kopien bleiben mit ihrer Komponente verknüpft. */
function clonePage(src: Page, name: string): Page {
  const copy = createPage(name);
  copy.background = src.background;
  if (src.seo) copy.seo = { ...src.seo, title: '' };
  const map = new Map<string, string>();
  for (const oid of Object.keys(src.nodes)) map.set(oid, uid());
  // Liegt ein Komponenten-Original auf der Seite, wird es in der Kopie zu einer verknüpften Kopie
  const mainOf = (oid: string): string | null => {
    for (let c: WNode | undefined = src.nodes[oid]; c; c = c.parentId ? src.nodes[c.parentId] : undefined) if (c.isMain) return c.id;
    return null;
  };
  for (const [oid, nid] of map) {
    const o = src.nodes[oid];
    const n = JSON.parse(JSON.stringify(o)) as WNode;
    n.id = nid;
    n.parentId = o.parentId ? map.get(o.parentId) ?? null : null;
    n.children = o.children.map(c => map.get(c)!).filter(Boolean);
    const main = mainOf(oid);
    if (main) {
      delete n.isMain; delete n.variantName; delete n.vkey;
      n.mainId = oid; n.touched = [];
      if (oid === main) n.componentId = oid; else delete n.componentId;
    }
    copy.nodes[nid] = n;
  }
  copy.rootIds = src.rootIds.map(r => map.get(r)!).filter(Boolean);
  return copy;
}

/** Seite kopieren (direkt darunter) */
export function duplicatePage(id: string) {
  const src = S().doc.pages.find(p => p.id === id);
  if (!src) return;
  const copy = clonePage(src, nextCopyName(src.name, S().doc.pages.map(p => p.name)));
  S().mutate((_, doc) => {
    const i = doc.pages.findIndex(p => p.id === id);
    doc.pages.splice(i + 1, 0, copy);
  });
  S().setPage(copy.id);
}

// ---------- Vorlagen-Seiten ----------

const templates = () => S().doc.templatePages ?? [];
const freeName = (base: string, taken: string[]) => {
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`;
};

/** Neue Seite aus einer Vorlage (unabhängige Kopie, keine Verknüpfung) */
export function addPageFromTemplate(templateId: string) {
  const t = templates().find(p => p.id === templateId);
  if (!t) return;
  const page = clonePage(t, freeName(`Seite ${S().doc.pages.length + 1}`, S().doc.pages.map(p => p.name)));
  page.seo = undefined;
  const board = pageBoardOf(page);
  if (board) board.site = true;
  S().mutate((_, doc) => { doc.pages.push(page); });
  S().setPage(page.id);
  requestAnimationFrame(fitAll);
}

/** Leere Vorlage anlegen und öffnen */
export function addTemplate() {
  const page = createPage(freeName('Vorlage', templates().map(p => p.name)));
  const board = createNode('board', { name: 'Desktop', w: 1440, h: 1024, site: true });
  page.nodes[board.id] = board;
  page.rootIds.push(board.id);
  S().mutate((_, doc) => { (doc.templatePages ??= []).push(page); });
  S().setPage(page.id);
  requestAnimationFrame(fitAll);
}

/** Seite als Vorlage speichern (unabhängige Kopie) */
export function saveAsTemplate(pageId: string) {
  const src = S().doc.pages.find(p => p.id === pageId);
  if (!src) return;
  const t = clonePage(src, freeName(src.name, templates().map(p => p.name)));
  t.seo = undefined;
  S().mutate((_, doc) => { (doc.templatePages ??= []).push(t); });
}

export function duplicateTemplate(id: string) {
  const src = templates().find(p => p.id === id);
  if (!src) return;
  const copy = clonePage(src, nextCopyName(src.name, templates().map(p => p.name)));
  copy.seo = undefined;
  S().mutate((_, doc) => { const arr = doc.templatePages!; arr.splice(arr.findIndex(p => p.id === id) + 1, 0, copy); });
}

export function renameTemplate(id: string, name: string) {
  S().mutate((_, doc) => { const p = doc.templatePages?.find(x => x.id === id); if (p) p.name = name; });
}

export function deleteTemplate(id: string) {
  const s = S();
  if (s.pageId === id) s.setPage(s.doc.pages[0].id);
  S().mutate((_, doc) => { const arr = doc.templatePages; const i = arr?.findIndex(p => p.id === id) ?? -1; if (i >= 0) arr!.splice(i, 1); });
}

function nextCopyName(name: string, taken: string[]): string {
  const base = `${name.replace(/ – Kopie( \d+)?$/, '')} – Kopie`;
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base} ${i}`)) return `${base} ${i}`;
}

export function deletePage(id: string) {
  const s = S();
  if (s.doc.pages.length <= 1) return;
  if (s.pageId === id) s.setPage(s.doc.pages.find(p => p.id !== id)!.id);
  S().mutate((_, doc) => { const i = doc.pages.findIndex(p => p.id === id); if (i >= 0) doc.pages.splice(i, 1); });
}

// ---------- Bilder ----------

export function readImage(file: File): Promise<{ src: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => resolve({ src, w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export async function placeImageFile(file: File, at?: Pt) {
  if (!file.type.startsWith('image/')) return;
  if (file.type === 'image/svg+xml') { const v = await import('./vector'); await v.importSvgFile(file, at); return; }
  const { src, w: nw, h: nh } = await readImage(file);
  const s = S();
  const page = currentPage();
  let w = nw, h = nh;
  let parentId: string | null;
  const sel = s.selection.length === 1 ? page.nodes[s.selection[0]] : undefined;
  if (at) parentId = boardAt(page, at, []);
  else if (sel?.type === 'board') parentId = sel.id;
  else parentId = boardAt(page, viewportCenterWorld(), []);
  let pos: Pt;
  if (parentId) {
    const pr = absRect(page, parentId);
    const max = pr.w * 0.8;
    if (w > max) { h = (h * max) / w; w = max; }
    pos = at ? { x: at.x - w / 2, y: at.y - h / 2 } : { x: pr.x + (pr.w - w) / 2, y: pr.y + (pr.h - h) / 2 };
  } else {
    const c = at ?? viewportCenterWorld();
    pos = { x: c.x - w / 2, y: c.y - h / 2 };
  }
  const name = file.name.replace(/\.[^.]+$/, '') || 'Bild';
  let imageRef = '';
  s.mutate((_, d) => { imageRef = findOrAddImage(d.library, src, name, nw, nh); }, { history: false, system: true });
  createShape('image', { x: pos.x, y: pos.y, w, h }, parentId, { imageRef, name });
}

export async function replaceImage(id: string, file: File) {
  const { src, w, h } = await readImage(file);
  let imageRef = '';
  S().mutate((_, d) => { imageRef = findOrAddImage(d.library, src, file.name.replace(/\.[^.]+$/, '') || 'Bild', w, h); }, { history: false, system: true });
  updateNodes([id], n => { n.imageRef = imageRef; delete n.src; });
}

export function originalImageSize(id: string) {
  const n = currentPage().nodes[id];
  const src = n && (n.imageRef ? S().doc.library.images.find(i => i.id === n.imageRef)?.src : n.src);
  if (!src) return;
  const img = new Image();
  img.onload = () => updateNodes([id], m => { m.w = img.naturalWidth; m.h = img.naturalHeight; m.sizingH = 'fixed'; m.sizingV = 'fixed'; });
  img.src = src;
}

export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export async function openImagePicker(at?: Pt) {
  const files = await pickFiles('image/*', true);
  for (const f of files) await placeImageFile(f, at);
}

// ---------- Dateien ----------

export function saveToFile() {
  const doc = S().doc;
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(doc.name)}.webster.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function openFromFile() {
  const [file] = await pickFiles('.json,application/json', false);
  if (!file) return;
  try {
    const d = JSON.parse(await file.text()) as WDocument;
    if (!d || d.version !== 1 || !Array.isArray(d.pages) || !d.pages.length) throw new Error();
    S().loadDocument(d);
    requestAnimationFrame(fitAll);
  } catch {
    alert('Die Datei konnte nicht geöffnet werden. Ist es eine Webster-Datei (.webster.json)?');
  }
}

export async function newDocument() {
  if (!(await askConfirm({ title: 'Neues Dokument anlegen?', message: 'Nicht als Datei gespeicherte Änderungen am aktuellen Dokument gehen verloren.', confirmLabel: 'Neu anlegen', danger: true }))) return;
  S().loadDocument(createDocument());
  requestAnimationFrame(fitAll);
}
