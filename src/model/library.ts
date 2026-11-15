// Bibliothek eines Dokuments: Farben, Textstile, Bilder und Komponenten.
// Farben und Textstile werden "durchgeschrieben": Die Werte stehen weiterhin an jeder Ebene,
// zusätzlich merkt sich die Ebene, mit welchem Bibliothekseintrag sie verknüpft ist.
import { useEditor, pageOf, viewPage } from '../store';
import type { ColorAsset, Fill, Gradient, GradientAsset, Page, Pt, Shadow, Stroke, TextStyle, TextStyleAsset, TypoKey, WDocument, WNode } from './types';
import { TYPO_KEYS } from './types';
import { createNode, createPage, defaultTextStyle, findOrAddImage, makeFill, makeLayout, makeStroke, uid } from './factory';
import { absPos, absRect, boardAt } from './geometry';
import { viewportCenterWorld } from './viewport';
import { allPages } from './pageRules';
import { cloneFromMain, detachSubtree, insideMain, instanceRootOf, instancesOf, isInstanceRoot, swapInstance, syncComponent, variantSetOf, variantsOf } from './components';
import { createShape, layoutAnchor, readImage, topLevel, updateNodes, wrapInBoard } from './commands';
import { ensureFont } from './fonts';

const S = () => useEditor.getState();
const lib = () => S().doc.library;

/** Alle Ebenen aller Seiten durchgehen (d ist ein Entwurf) */
function eachNode(d: WDocument, fn: (n: WNode) => void) {
  for (const p of allPages(d)) for (const id in p.nodes) fn(p.nodes[id]);
}

type Paint = Fill | Stroke | Shadow;
function eachPaint(n: WNode, fn: (p: Paint) => void) {
  // Grundwerte, Hover und Breakpoints
  const layers: Partial<WNode>[] = [n, ...(n.hover ? [n.hover as Partial<WNode>] : []), ...(n.scrolled ? [n.scrolled as Partial<WNode>] : []), ...(n.overrides ? Object.values(n.overrides).filter(Boolean) as Partial<WNode>[] : [])];
  for (const l of layers) {
    l.fills?.forEach(fn);
    l.strokes?.forEach(fn);
    l.shadows?.forEach(fn);
  }
}

// ---------- Farben ----------

export function addColor(color = '#6A55F5', opacity = 1, name?: string): string {
  const id = uid();
  const n = lib().colors.length + 1;
  S().mutate((_, d) => { d.library.colors.push({ id, name: name ?? `Farbe ${n}`, color, opacity }); }, { system: true });
  return id;
}

/** Farbe aus der aktuellen Auswahl übernehmen (oder Standard) */
export function addColorFromSelection(): string {
  const page = viewPage(S());
  const n = S().selection.map(id => page.nodes[id]).find(Boolean);
  const f = n?.fills[0] ?? n?.strokes[0];
  return addColor(f?.color, f?.opacity ?? 1);
}

export function updateColor(id: string, patch: Partial<Omit<ColorAsset, 'id'>>) {
  S().mutate((_, d) => {
    const c = d.library.colors.find(x => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    if (patch.color === undefined && patch.opacity === undefined) return;
    eachNode(d, n => eachPaint(n, p => { if (p.colorRef === id) { p.color = c.color; p.opacity = c.opacity; } }));
  }, { key: 'color-' + id, system: true });
}

export function deleteColor(id: string) {
  S().mutate((_, d) => {
    d.library.colors = d.library.colors.filter(c => c.id !== id);
    eachNode(d, n => eachPaint(n, p => { if (p.colorRef === id) p.colorRef = null; }));
  }, { system: true });
}

export function colorUsage(doc: WDocument, id: string): number {
  let c = 0;
  for (const p of allPages(doc)) for (const nid in p.nodes) eachPaint(p.nodes[nid], x => { if (x.colorRef === id) c++; });
  return c;
}

/** Bibliotheksfarbe als Füllung (oder Kontur) auf die Auswahl anwenden */
export function applyColor(id: string, target: 'fill' | 'stroke' = 'fill', index = 0) {
  const c = lib().colors.find(x => x.id === id);
  const ids = S().selection;
  if (!c || !ids.length) return;
  updateNodes(ids, n => {
    const arr = target === 'fill' ? n.fills : n.strokes;
    const item = arr[index];
    if (item) Object.assign(item, { color: c.color, opacity: c.opacity, colorRef: id }, target === 'fill' ? { gradient: null, gradientRef: null } : {});
    else if (target === 'fill') n.fills.unshift({ id: uid(), color: c.color, opacity: c.opacity, visible: true, colorRef: id });
    else n.strokes.push({ id: uid(), color: c.color, opacity: c.opacity, width: 1, position: 'inside', style: 'solid', visible: true, colorRef: id });
  }, 'apply-color');
}

// ---------- Verläufe ----------

const firstStop = (g: Gradient) => [...g.stops].sort((a, b) => a.pos - b.pos)[0]?.color ?? '#000000';

export function addGradient(gradient: Gradient, name?: string): string {
  const id = uid();
  const n = lib().gradients.length + 1;
  S().mutate((_, d) => { d.library.gradients.push({ id, name: name ?? `Verlauf ${n}`, gradient: structuredClone(gradient) }); }, { system: true });
  return id;
}

export function updateGradient(id: string, patch: Partial<Omit<GradientAsset, 'id'>>) {
  S().mutate((_, d) => {
    const a = d.library.gradients.find(x => x.id === id);
    if (!a) return;
    if (patch.name !== undefined) a.name = patch.name;
    if (!patch.gradient) return;
    a.gradient = structuredClone(patch.gradient);
    eachNode(d, n => eachPaint(n, p => {
      const f = p as Fill;
      if (f.gradientRef === id) { f.gradient = structuredClone(a.gradient); f.color = firstStop(a.gradient); }
    }));
  }, { key: 'gradient-' + id, system: true });
}

export function deleteGradient(id: string) {
  S().mutate((_, d) => {
    d.library.gradients = d.library.gradients.filter(c => c.id !== id);
    eachNode(d, n => eachPaint(n, p => { if ((p as Fill).gradientRef === id) (p as Fill).gradientRef = null; }));
  }, { system: true });
}

export function gradientUsage(doc: WDocument, id: string): number {
  let c = 0;
  for (const p of allPages(doc)) for (const nid in p.nodes) eachPaint(p.nodes[nid], x => { if ((x as Fill).gradientRef === id) c++; });
  return c;
}

/** Bibliotheksverlauf als oberste Füllung auf die Auswahl anwenden */
export function applyGradient(id: string) {
  const a = lib().gradients.find(x => x.id === id);
  const ids = S().selection;
  if (!a || !ids.length) return;
  updateNodes(ids, n => {
    const g = structuredClone(a.gradient);
    const item = n.fills[0];
    const patch = { gradient: g, gradientRef: id, colorRef: null, color: firstStop(g) };
    if (item) Object.assign(item, patch);
    else n.fills.unshift({ id: uid(), opacity: 1, visible: true, ...patch });
  }, 'apply-gradient');
}

/** Änderung an einer Füllung: Farbe, Verlauf und Verknüpfungen schließen sich gegenseitig aus */
export function patchFill(f: Fill, p: Partial<Fill>) {
  Object.assign(f, p);
  if (p.gradient) {
    f.color = firstStop(p.gradient);
    f.colorRef = null;
    if (p.gradientRef === undefined) f.gradientRef = null;
  }
  if (p.gradient === null) f.gradientRef = null;
  if (p.colorRef) { f.gradient = null; f.gradientRef = null; }
}

// ---------- Textstile ----------

const pickTypo = (ts: TextStyle): Pick<TextStyle, TypoKey> =>
  Object.fromEntries(TYPO_KEYS.map(k => [k, ts[k]])) as Pick<TextStyle, TypoKey>;

export function addTextStyle(): string {
  const page = viewPage(S());
  const sel = S().selection.map(id => page.nodes[id]).find(n => n?.type === 'text');
  const id = uid();
  const n = lib().textStyles.length + 1;
  const style = pickTypo(sel?.textStyle ?? defaultTextStyle());
  S().mutate((_, d) => { d.library.textStyles.push({ id, name: `Textstil ${n}`, style }); }, { system: true });
  if (sel) applyTextStyle(id, [sel.id]);
  return id;
}

export function updateTextStyle(id: string, patch: { name?: string; style?: Partial<TextStyleAsset['style']> }) {
  if (patch.style?.fontFamily) ensureFont(patch.style.fontFamily);
  S().mutate((_, d) => {
    const a = d.library.textStyles.find(x => x.id === id);
    if (!a) return;
    if (patch.name !== undefined) a.name = patch.name;
    if (!patch.style) return;
    const old = { ...a.style };
    Object.assign(a.style, patch.style);
    eachNode(d, n => {
      if (n.type !== 'text') return;
      // Grundwert und Breakpoints: der jeweils gültige Textstil (erbt von der größeren Ansicht)
      let ref = n.textStyleRef ?? null;
      if (ref === id && n.textStyle) Object.assign(n.textStyle, a.style);
      for (const bp of ['tablet', 'mobile'] as const) {
        const o = n.overrides?.[bp];
        if (!o) continue;
        if (o.textStyleRef !== undefined) ref = o.textStyleRef ?? null;
        if (ref !== id || !o.textStyle) continue;
        // Nur Werte nachziehen, die nicht bewusst für diesen Breakpoint angepasst wurden
        for (const k of TYPO_KEYS) {
          if (o.textStyle[k] === old[k] || o.textStyleRef === id) (o.textStyle as unknown as Record<string, unknown>)[k] = a.style[k];
        }
      }
    });
  }, { key: 'ts-' + id, system: true });
}

export function deleteTextStyle(id: string) {
  S().mutate((_, d) => {
    d.library.textStyles = d.library.textStyles.filter(t => t.id !== id);
    eachNode(d, n => {
      if (n.textStyleRef === id) n.textStyleRef = null;
      for (const o of Object.values(n.overrides ?? {})) if (o?.textStyleRef === id) o.textStyleRef = null;
    });
  }, { system: true });
}

export function applyTextStyle(id: string | null, ids = S().selection) {
  const a = id ? lib().textStyles.find(x => x.id === id) : undefined;
  if (a) ensureFont(a.style.fontFamily);
  const page = viewPage(S());
  const texts = ids.filter(i => page.nodes[i]?.type === 'text');
  updateNodes(texts, n => {
    n.textStyleRef = a ? a.id : null;
    if (a && n.textStyle) Object.assign(n.textStyle, a.style);
  }, 'apply-ts');
}

// ---------- Bilder ----------

export async function addImageFiles(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const { src, w, h } = await readImage(f);
    let id = '';
    S().mutate((_, d) => { id = findOrAddImage(d.library, src, f.name.replace(/\.[^.]+$/, '') || 'Bild', w, h); }, { system: true });
    out.push(id);
  }
  return out;
}

export function renameImage(id: string, name: string) {
  S().mutate((_, d) => { const i = d.library.images.find(x => x.id === id); if (i) i.name = name; }, { system: true });
}

export function imageUsage(doc: WDocument, id: string): number {
  let c = 0;
  for (const p of allPages(doc)) for (const nid in p.nodes) if (p.nodes[nid].imageRef === id) c++;
  return c;
}

/** Bild aus der Bibliothek entfernen – verwendete Bilder bleiben in den Ebenen erhalten */
export function deleteImage(id: string) {
  S().mutate((_, d) => {
    const img = d.library.images.find(x => x.id === id);
    if (!img) return;
    eachNode(d, n => { if (n.imageRef === id) { n.src = img.src; delete n.imageRef; } });
    d.library.images = d.library.images.filter(x => x.id !== id);
  }, { system: true });
}

/** Bild aus der Bibliothek auf der Fläche platzieren */
export function placeImageAsset(id: string, at?: Pt) {
  const img = lib().images.find(x => x.id === id);
  if (!img) return;
  const s = S();
  const page = viewPage(s);
  let w = img.w, h = img.h;
  const sel = s.selection.length === 1 ? page.nodes[s.selection[0]] : undefined;
  const parentId = at ? boardAt(page, at, []) : sel?.type === 'board' ? sel.id : boardAt(page, viewportCenterWorld(), []);
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
  createShape('image', { x: pos.x, y: pos.y, w, h }, parentId, { imageRef: id, name: img.name });
}

/** Quelle eines Bildes (Bibliothek oder eingebettet) */
export const imageSrc = (doc: WDocument, n: WNode): string | undefined =>
  n.imageRef ? doc.library.images.find(i => i.id === n.imageRef)?.src : n.src;

// ---------- Komponenten ----------

/** id = Hauptkomponente bzw. Varianten-Rahmen; variants = Varianten (nur bei Rahmen) */
export interface ComponentInfo { id: string; pageId: string; name: string; variants?: { id: string; name: string }[] }

export function listComponents(doc: WDocument): ComponentInfo[] {
  const out: ComponentInfo[] = [];
  for (const p of allPages(doc)) for (const id in p.nodes) {
    const n = p.nodes[id];
    if (n.variantSet) {
      const variants = variantsOf(p, id).map(v => ({ id: v.id, name: v.variantName ?? v.name }));
      if (variants.length) out.push({ id, pageId: p.id, name: n.name, variants });
    } else if (n.isMain && !variantSetOf(p, id)) out.push({ id, pageId: p.id, name: n.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ---------- Varianten ----------

/** Teilbaum einer Variante als neue Variante kopieren (nicht eingehängt) */
function cloneVariant(pg: Page, srcId: string, parentId: string, name: string): string {
  const build = (oldId: string, parent: string, root: boolean): string => {
    const src = pg.nodes[oldId];
    const id = uid();
    const n: WNode = { ...JSON.parse(JSON.stringify(src)), id, parentId: parent, vkey: src.vkey ?? src.id };
    n.children = src.children.filter(c => pg.nodes[c]).map(c => build(c, id, false));
    if (root) { n.isMain = true; n.variantName = name; n.name = name; delete n.vkey; n.vkey = src.vkey ?? src.id; }
    pg.nodes[id] = n;
    return id;
  };
  return build(srcId, parentId, true);
}

/** Hauptkomponente in einen Varianten-Rahmen packen (pg ist ein Entwurf) */
function makeVariantSet(pg: Page, view: Page, mainId: string): WNode {
  const m = pg.nodes[mainId];
  const r = absRect(view, mainId);
  let top = m;
  while (top.parentId && pg.nodes[top.parentId]) top = pg.nodes[top.parentId];
  const inSite = top.id !== mainId && !!top.site;
  const set = createNode('board', {
    name: m.name, variantSet: true, fills: [], radius: 8, clip: false,
    strokes: [{ ...makeStroke(), color: '#8B7BFF', style: 'dashed' }],
    layout: { ...makeLayout('flex', 'row'), gap: 24, padding: [24, 24, 24, 24], align: 'start' },
    sizingH: 'auto', sizingV: 'auto', w: r.w + 48, h: r.h + 48,
  });
  const container = m.parentId ? pg.nodes[m.parentId].children : pg.rootIds;
  const idx = container.indexOf(mainId);
  if (inSite) {
    // Auf der Webseite bleibt an dieser Stelle eine Kopie; die Varianten liegen neben dem Seiten-Board
    const instId = cloneFromMain(pg, pg, mainId, m.parentId, true);
    container.splice(idx, 1, instId);
    const tr = absRect(view, top.id);
    set.parentId = null; set.x = Math.round(tr.x + tr.w + 120); set.y = Math.round(tr.y);
    pg.rootIds.push(set.id);
  } else {
    set.parentId = m.parentId; set.x = m.x - 24; set.y = m.y - 24;
    set.absolute = m.absolute; set.alignSelf = m.alignSelf; set.grid = m.grid;
    container.splice(idx, 1, set.id);
  }
  pg.nodes[set.id] = set;
  set.children = [mainId];
  m.parentId = set.id; m.x = 0; m.y = 0; m.absolute = false; m.alignSelf = 'auto'; m.grid = null;
  m.variantName ??= 'Standard';
  m.name = m.variantName;
  return set;
}

/** Neue Variante aus einer Hauptkomponente (beim ersten Mal entsteht der Varianten-Rahmen) */
export function addVariant(mainId = S().selection[0]): string | null {
  const s = S();
  const view = viewPage(s);
  if (!view.nodes[mainId]?.isMain) return null;
  let newId = '';
  let moved = false;
  s.mutate(pg => {
    let set = variantSetOf(pg, mainId);
    if (!set) {
      let top = pg.nodes[mainId];
      while (top.parentId && pg.nodes[top.parentId]) top = pg.nodes[top.parentId];
      moved = top.id !== mainId && !!top.site;
      set = makeVariantSet(pg, view, mainId);
    }
    const names = variantsOf(pg, set.id).map(v => v.variantName ?? '');
    let k = names.length + 1;
    while (names.includes(`Variante ${k}`)) k++;
    newId = cloneVariant(pg, mainId, set.id, `Variante ${k}`);
    set.children.splice(set.children.indexOf(mainId) + 1, 0, newId);
  }, { system: true });
  s.setSelection([newId]);
  if (moved) requestAnimationFrame(() => requestAnimationFrame(() => import('./viewport').then(v => v.fitSelection())));
  return newId;
}

export function renameVariant(id: string, name: string) {
  S().mutate(pg => { const n = pg.nodes[id]; if (n?.isMain) { n.variantName = name; n.name = name; } }, { system: true });
}

/** Kopie auf eine andere Variante umstellen */
export function setInstanceVariant(rootId: string, mainId: string) {
  let newId: string | null = null;
  S().mutate((pg, d) => { newId = swapInstance(d, pg, rootId, mainId); }, { system: true });
  if (newId) S().setSelection([newId]);
}

/** Seite, auf der die Komponente (Original bzw. Varianten-Rahmen) liegt */
export const componentPageOf = (doc: WDocument, componentId: string) =>
  allPages(doc).find(p => p.nodes[componentId]?.isMain || p.nodes[componentId]?.variantSet);

/** Ist die gerade geöffnete Seite eine Komponenten-Seite? */
export const isComponentPage = (doc: WDocument, pageId: string) => !!doc.componentPages?.some(p => p.id === pageId);

let returnPageId: string | null = null;

/** Komponenten-Board öffnen (merkt sich die Seite, zu der „Fertig“ zurückführt) */
export function openComponent(componentId: string) {
  const s = S();
  const pm = componentPageOf(s.doc, componentId);
  if (!pm) return;
  if (!isComponentPage(s.doc, s.pageId)) returnPageId = s.pageId;
  if (pm.id !== s.pageId) s.setPage(pm.id);
  s.setSelection([]);
  requestAnimationFrame(() => requestAnimationFrame(() => import('./viewport').then(v => v.fitAll())));
}

/** Zurück zur zuletzt bearbeiteten Seite */
export function closeComponent() {
  const s = S();
  const back = returnPageId && s.doc.pages.some(p => p.id === returnPageId) ? returnPageId : s.doc.pages[0].id;
  s.setPage(back);
  requestAnimationFrame(() => requestAnimationFrame(() => import('./viewport').then(v => v.fitAll())));
}

const nextComponentName = (doc: WDocument) => {
  const names = new Set(listComponents(doc).map(c => c.name));
  let k = names.size + 1;
  while (names.has(`Komponente ${k}`)) k++;
  return `Komponente ${k}`;
};

/** „+“ ohne Auswahl: leere Komponente mit eigenem Board anlegen und öffnen */
export function newComponent() {
  const s = S();
  const name = nextComponentName(s.doc);
  const page = createPage(name);
  const board = createNode('board', { name, isMain: true, x: 0, y: 0, w: 320, h: 160, fills: [makeFill('#FFFFFF')] });
  page.nodes[board.id] = board;
  page.rootIds = [board.id];
  s.mutate((_, d) => { (d.componentPages ??= []).push(page); }, { system: true });
  openComponent(board.id);
  S().setSelection([board.id]);
}

/** ⌘K bzw. „+“ mit Auswahl: Auswahl wird zur Komponente. Sie zieht auf ein eigenes Board um,
 *  an ihrer bisherigen Stelle bleibt eine verknüpfte Kopie. */
export function createComponent() {
  const s = S();
  const page = pageOf(s);
  let ids = topLevel(page, s.selection);
  if (!ids.length) return;
  if (ids.some(id => page.nodes[id].variantSet)) {
    alert('Das ist schon eine Komponente mit Varianten. Wähle eine einzelne Variante, um eine weitere hinzuzufügen.');
    return;
  }
  if (ids.some(id => page.nodes[id].mainId || page.nodes[id].isMain)) {
    alert('Kopien und Komponenten-Boards können nicht noch einmal zur Komponente gemacht werden. Löse die Kopie vorher (⇧⌘K).');
    return;
  }
  // Mehrere Ebenen oder eine einzelne Form/Text: zuerst in ein Board packen
  if (ids.length > 1 || page.nodes[ids[0]].type !== 'board') { wrapInBoard(); ids = S().selection; }
  const id = ids[0];
  const view = viewPage(S());
  const r = absRect(view, id);
  const name = /^(Board|Rechteck|Ellipse|Text|Bild)( \d+)?$/.test(page.nodes[id]?.name ?? '') || !page.nodes[id]?.name
    ? nextComponentName(S().doc) : page.nodes[id].name;
  let instId = '';
  S().mutate((pg, d) => {
    const n = pg.nodes[id];
    if (!n) return;
    const cp = createPage(name);
    // Teilbaum umziehen
    const move = (nid: string) => { const x = pg.nodes[nid]; if (!x) return; cp.nodes[nid] = x; delete pg.nodes[nid]; x.children.forEach(move); };
    const parentId = n.parentId;
    const container = parentId ? pg.nodes[parentId].children : pg.rootIds;
    const idx = container.indexOf(id);
    const place = { x: n.x, y: n.y, absolute: n.absolute, alignSelf: n.alignSelf, grid: n.grid, sizingH: n.sizingH, sizingV: n.sizingV };
    move(id);
    const m = cp.nodes[id];
    m.parentId = null; m.x = 0; m.y = 0; m.absolute = false; m.alignSelf = 'auto'; m.grid = null;
    if (m.sizingH === 'fill') { m.sizingH = 'fixed'; m.w = Math.round(r.w); }
    if (m.sizingV === 'fill') { m.sizingV = 'fixed'; m.h = Math.round(r.h); }
    m.isMain = true; m.name = name; m.site = false;
    cp.rootIds = [id];
    (d.componentPages ??= []).push(cp);
    // Verknüpfte Kopie an der alten Stelle
    instId = cloneFromMain(pg, cp, id, parentId, true);
    container.splice(idx, 1, instId);
    const inst = pg.nodes[instId];
    Object.assign(inst, place);
    const t = ['x', 'y'];
    if (place.sizingH === 'fill') t.push('sizingH');
    if (place.sizingV === 'fill') t.push('sizingV');
    inst.touched = t;
  }, { system: true });
  if (instId) S().setSelection([instId]);
}

/** Kopie einer Komponente einfügen – am Punkt `at` oder mittig im ausgewählten/sichtbaren Board */
export function insertInstance(componentId: string, at?: Pt) {
  const s = S();
  const doc = s.doc;
  // Varianten-Rahmen: erste Variante einfügen
  const setPage = allPages(doc).find(p => p.nodes[componentId]?.variantSet);
  if (setPage) { const v = variantsOf(setPage, componentId)[0]; if (!v) return; componentId = v.id; }
  const pm = allPages(doc).find(p => p.nodes[componentId]?.isMain);
  if (!pm) return;
  const view = viewPage(s);
  const main = pm.id === s.pageId ? view.nodes[componentId] : pm.nodes[componentId];
  const size = pm.id === s.pageId ? absRect(view, componentId) : { x: 0, y: 0, w: main.w, h: main.h };
  const sel = s.selection.length === 1 ? view.nodes[s.selection[0]] : undefined;
  let parentId = at ? boardAt(view, at, []) : sel?.type === 'board' ? sel.id : boardAt(view, viewportCenterWorld(), []);
  // Nicht in sich selbst einfügen
  if (parentId && pm.id === s.pageId && insideMain(view, parentId, componentId)) parentId = view.nodes[componentId].parentId;
  while (parentId && pm.id === s.pageId && insideMain(view, parentId, componentId)) parentId = view.nodes[parentId].parentId;
  let pos: Pt;
  if (at) pos = { x: at.x - size.w / 2, y: at.y - size.h / 2 };
  else if (parentId) { const pr = absRect(view, parentId); pos = { x: pr.x + (pr.w - size.w) / 2, y: pr.y + (pr.h - size.h) / 2 }; }
  else if (pm.id === s.pageId) pos = { x: size.x + size.w + 40, y: size.y };
  else { const c = viewportCenterWorld(); pos = { x: c.x - size.w / 2, y: c.y - size.h / 2 }; }
  let newId = '';
  s.mutate((pg, d) => {
    const pmD = allPages(d).find(p => p.id === pm.id)!;
    newId = cloneFromMain(pg, pmD, componentId, parentId, true);
    const n = pg.nodes[newId];
    const pp = parentId ? absPos(pg, parentId) : { x: 0, y: 0 };
    n.x = Math.round(pos.x - pp.x);
    n.y = Math.round(pos.y - pp.y);
    n.absolute = false; n.grid = null; n.alignSelf = 'auto'; n.site = false;
    if (parentId && pg.nodes[parentId].layout) {
      const anchor = layoutAnchor(view, parentId, [], { x: pos.x + size.w / 2, y: pos.y + size.h / 2 });
      const arr = pg.nodes[parentId].children;
      const i = anchor.anchorId ? arr.indexOf(anchor.anchorId) : -1;
      arr.splice(i < 0 ? arr.length : i, 0, newId);
    } else (parentId ? pg.nodes[parentId].children : pg.rootIds).push(newId);
  }, { system: true });
  s.setSelection([newId]);
}

/** Kopie von der Komponente lösen (⇧⌘K) */
export function detachInstances(ids = S().selection) {
  const page = pageOf(S());
  const roots = [...new Set(ids.map(id => instanceRootOf(page, id)).filter(Boolean) as string[])];
  if (!roots.length) return;
  S().mutate(pg => { roots.forEach(r => detachSubtree(pg, r)); }, { system: true });
}

/** Alle Abweichungen einer Kopie verwerfen */
export function resetInstances(ids = S().selection) {
  const page = pageOf(S());
  const roots = [...new Set(ids.map(id => instanceRootOf(page, id)).filter(Boolean) as string[])];
  if (!roots.length) return;
  S().mutate((pg, d) => {
    const clear = (id: string) => { const n = pg.nodes[id]; if (!n) return; n.touched = []; n.children.forEach(clear); };
    roots.forEach(clear);
    const comps = new Set(roots.map(r => pg.nodes[r].componentId!));
    comps.forEach(c => syncComponent(d, c, roots));
  }, { system: true });
}

export function hasOverrides(page: Page, rootId: string): boolean {
  const n = page.nodes[rootId];
  if (!n) return false;
  return (n.touched ?? []).some(k => !['x', 'y', 'name'].includes(k) || n.id !== rootId) || n.children.some(c => hasOverridesDeep(page, c));
}
function hasOverridesDeep(page: Page, id: string): boolean {
  const n = page.nodes[id];
  return !!n && ((n.touched?.length ?? 0) > 0 || n.children.some(c => hasOverridesDeep(page, c)));
}

/** Zur Komponente springen (öffnet ihr Board) */
export function showMain(componentId: string) {
  const s = S();
  const pm = componentPageOf(s.doc, componentId);
  if (!pm) return;
  if (isComponentPage(s.doc, pm.id)) {
    // Bei Varianten die gewählte Variante markieren
    openComponent(componentId);
    if (pm.nodes[componentId]?.parentId) requestAnimationFrame(() => S().setSelection([componentId]));
    return;
  }
  if (pm.id !== s.pageId) s.setPage(pm.id);
  s.setSelection([componentId]);
  requestAnimationFrame(() => requestAnimationFrame(() => import('./viewport').then(v => v.fitSelection())));
}

export function renameComponent(id: string, name: string) {
  S().mutate((_, d) => {
    for (const p of allPages(d)) {
      const n = p.nodes[id];
      if (!n?.isMain && !n?.variantSet) continue;
      // Die Komponenten-Seite heißt wie die Komponente
      if (!n.parentId && d.componentPages?.includes(p)) p.name = name;
      if (n.variantSet) {
        // Kopien, die noch den alten Namen tragen, mit umbenennen
        const vs = new Set(variantsOf(p, id).map(v => v.id));
        for (const q of allPages(d)) for (const nid in q.nodes) {
          const x = q.nodes[nid];
          if (isInstanceRoot(x) && vs.has(x.componentId!) && x.name === n.name) x.name = name;
        }
      }
      n.name = name;
    }
  }, { system: true });
}

/** Komponente entfernen: Alle Kopien werden gelöst und bleiben als normale Ebenen erhalten,
 *  das Komponenten-Board wird gelöscht. (Ältere Originale auf einer Webseite bleiben als normale Ebene.) */
export function unmakeComponent(id: string) {
  const s = S();
  const pm = componentPageOf(s.doc, id);
  if (pm && s.pageId === pm.id) closeComponent();
  S().mutate((_, d) => {
    const all = allPages(d);
    const set = all.map(p => p.nodes[id]).find(n => n?.variantSet);
    const mains = set ? [...set.children] : [id];
    for (const m of mains) for (const p of all) {
      for (const nid in p.nodes) if (p.nodes[nid].componentId === m && isInstanceRoot(p.nodes[nid])) detachSubtree(p, nid);
    }
    const ci = d.componentPages?.findIndex(p => p.id === pm?.id) ?? -1;
    if (ci >= 0) { d.componentPages!.splice(ci, 1); return; }
    if (set) delete set.variantSet;
    for (const m of mains) for (const p of all) { const n = p.nodes[m]; if (n?.isMain) { delete n.isMain; delete n.variantName; } }
  }, { system: true });
}

/** Anzahl der Kopien (bei Varianten-Rahmen: aller Varianten) */
export function instanceCount(doc: WDocument, id: string): number {
  const p = allPages(doc).find(x => x.nodes[id]?.variantSet);
  if (p) return variantsOf(p, id).reduce((a, v) => a + instancesOf(doc, v.id).length, 0);
  return instancesOf(doc, id).length;
}

