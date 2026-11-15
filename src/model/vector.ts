// Icons & Formen: Einfügen, Austauschen, eigene SVG-Dateien
import type { Page, Pt, VectorSpec, WNode } from './types';
import { createNode, makeFill } from './factory';
import { useEditor, viewPage } from '../store';
import { boardAt } from './geometry';
import { viewportCenterWorld } from './viewport';
import { appendChild, createShape, updateNodes } from './commands';
import { defaultVector, MAX_SVG_KB, sanitizeSvg, vectorName } from './vectorCore';

export * from './vectorCore';

/** Eintrag der Icon-Sammlung */
export interface IconEntry { name: string; markup: string; tags: string; brand?: string; label?: string }

let cache: Promise<{ lucide: IconEntry[]; brands: IconEntry[] }> | null = null;
/** Icon-Sammlung erst bei Bedarf laden (eigene Datei, ca. 140 KB) */
export function loadIcons() {
  cache ??= import('../data/icons.json').then(m => {
    const d = (m.default ?? m) as unknown as { lucide: [string, string, string, string?][]; brands: [string, string, string, string][] };
    return {
      lucide: d.lucide.map(([name, markup, tags, label]) => ({ name, markup, label, tags: `${name.replace(/-/g, ' ')} ${tags}`.toLowerCase() })),
      brands: d.brands.map(([name, markup, tags, brand]) => ({ name, markup, tags: `${name} ${tags}`.toLowerCase(), brand })),
    };
  });
  return cache;
}

/** Deutsche Namen fürs Ebenen-Panel */
export const iconLabel = (e: IconEntry) => e.brand ?? e.label ?? e.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const iconSpec = (e: IconEntry): VectorSpec => defaultVector('icon', {
  markup: e.markup, viewBox: '0 0 24 24', iconName: e.name, paint: e.brand ? 'fill' : 'line',
});

/** Neue Ebene passend platzieren: in ein ausgewähltes Board, vor eine ausgewählte Ebene im Layout oder in die Bildmitte */
function placeNode(n: WNode, size: number) {
  const s = useEditor.getState();
  const page = viewPage(s);
  const sel = s.selection.length === 1 ? page.nodes[s.selection[0]] : undefined;
  let done = false;
  if (sel) {
    const selParent = sel.parentId ? page.nodes[sel.parentId] : undefined;
    if (sel.type === 'board' && !sel.embed && !sel.form) {
      // ins ausgewählte Board
      s.mutate(pg => {
        const b = pg.nodes[sel.id];
        n.parentId = b.id; pg.nodes[n.id] = n;
        if (b.layout) { n.w = n.h = Math.min(size, 24); appendChild(pg, b.id, n.id); }
        else { n.x = Math.round((b.w - n.w) / 2); n.y = Math.round((b.h - n.h) / 2); b.children.push(n.id); }
      });
      done = true;
    } else if (selParent?.layout) {
      // im Layout direkt vor die ausgewählte Ebene (z. B. Telefon-Icon vor die Nummer)
      s.mutate(pg => {
        const p = pg.nodes[selParent.id];
        n.parentId = p.id; pg.nodes[n.id] = n;
        n.w = n.h = sel.type === 'text' && sel.textStyle ? Math.round(sel.textStyle.fontSize * 1.25) : 24;
        p.children.splice(Math.max(0, p.children.indexOf(sel.id)), 0, n.id);
      });
      done = true;
    }
  }
  if (!done) {
    const c = viewportCenterWorld();
    const parentId = boardAt(page, c, []);
    createShape('vector', { x: c.x - n.w / 2, y: c.y - n.h / 2, w: n.w, h: n.h }, parentId, n);
    return;
  }
  s.setSelection([n.id]);
}

export function insertIcon(e: IconEntry) {
  const size = 48;
  const n = createNode('vector', { name: iconLabel(e), w: size, h: size, fills: [makeFill('#1A1A1A')], vector: iconSpec(e) });
  placeNode(n, size);
}

/** Icon einer vorhandenen Ebene austauschen (Farbe, Größe usw. bleiben) */
export async function replaceIcon(id: string, e: IconEntry) {
  const data = await loadIcons();
  const page = viewPage(useEditor.getState());
  const old = page.nodes[id];
  const prev = old?.vector?.iconName ? [...data.lucide, ...data.brands].find(x => x.name === old.vector!.iconName) : undefined;
  const autoName = !!prev && old.name === iconLabel(prev);
  const wasIcon = old?.vector?.kind === 'icon';
  updateNodes([id], n => {
    if (!n.vector) return;
    n.vector = { ...n.vector, ...iconSpec(e), strokeWidth: n.vector.strokeWidth };
    if (autoName || !wasIcon) n.name = iconLabel(e);
  }, 'icon-replace');
}

export function setVector(ids: string[], patch: Partial<VectorSpec>, key = 'vector') {
  updateNodes(ids, n => {
    if (!n.vector) return;
    const wasAuto = n.name === vectorName(n.vector);
    n.vector = { ...n.vector, ...patch };
    if (wasAuto && (n.vector.kind === 'line' || n.vector.kind === 'polygon')) n.name = vectorName(n.vector);
  }, key);
}

/** Form aus dem Zeichenwerkzeug */
export type ShapeTool = 'line' | 'arrow' | 'triangle' | 'polygon' | 'star';
export function shapeSpec(tool: ShapeTool): VectorSpec {
  if (tool === 'line') return defaultVector('line');
  if (tool === 'arrow') return defaultVector('line', { arrowEnd: true });
  if (tool === 'triangle') return defaultVector('polygon', { sides: 3 });
  if (tool === 'polygon') return defaultVector('polygon', { sides: 6 });
  return defaultVector('star', { sides: 5 });
}

export function drawShape(tool: ShapeTool, r: { x: number; y: number; w: number; h: number }, parentId: string | null) {
  const vector = shapeSpec(tool);
  createShape('vector', r, parentId, { name: vectorName(vector), vector, fills: [makeFill('#B1B2B5')] });
}

/** Linie/Pfeil von Punkt a nach b (wird gedreht, damit die Ebene der Linie folgt) */
export function drawLine(tool: 'line' | 'arrow', a: Pt, b: Pt, parentId: string | null) {
  const vector = shapeSpec(tool);
  const len = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
  let rot = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI * 100) / 100;
  if (rot <= -180) rot += 360;
  const h = 16;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  createShape('vector', { x: mid.x - len / 2, y: mid.y - h / 2, w: len, h }, parentId, {
    name: vectorName(vector), vector, rotation: rot, fills: [makeFill('#1A1A1A')],
  });
}

// ---------- Eigene SVG-Dateien ----------

export const isSvgFile = (f: File) => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);

/** SVG-Datei als einfärbbare Grafik einfügen; gibt eine Fehlermeldung zurück oder null */
export async function importSvgFile(file: File, at?: Pt, replaceId?: string): Promise<string | null> {
  if (file.size > MAX_SVG_KB * 1024) return `Die Datei ist ${Math.round(file.size / 1024)} KB groß. Erlaubt sind bis ${MAX_SVG_KB} KB – sehr große SVGs sind meist Fotos und besser als Bild eingefügt.`;
  const r = sanitizeSvg(await file.text());
  if (!r) return 'Diese Datei konnte nicht als SVG gelesen werden.';
  const name = file.name.replace(/\.[^.]+$/, '') || 'Grafik';
  const spec = defaultVector('svg', { markup: r.markup, viewBox: r.viewBox, paint: r.colors <= 1 ? 'fill' : 'original', recolorable: true });
  if (replaceId) {
    updateNodes([replaceId], n => { if (n.vector) { n.vector = spec; n.name = name; } }, 'svg-replace');
    return null;
  }
  const max = 160;
  const scale = Math.min(1, max / Math.max(r.w, r.h));
  const w = Math.max(8, Math.round(r.w * scale)), h = Math.max(8, Math.round(r.h * scale));
  const n = createNode('vector', { name, w, h, fills: [makeFill('#1A1A1A')], vector: spec });
  if (at) {
    const page = viewPage(useEditor.getState());
    createShape('vector', { x: at.x - w / 2, y: at.y - h / 2, w, h }, boardAt(page, at, []), n);
  } else placeNode(n, Math.max(w, h));
  return null;
}

/** Größe passend zum Seitenverhältnis der Grafik */
export function fitVectorRatio(page: Page, id: string) {
  const n = page.nodes[id];
  const vb = n?.vector?.viewBox?.split(' ').map(Number);
  if (!n || !vb || vb.length !== 4) return;
  updateNodes([id], m => { m.h = Math.round(m.w * vb[3] / vb[2]); }, 'vector-ratio');
}

