// Icons, eigene SVG-Grafiken und Formen (Linie, Pfeil, Vieleck, Stern).
// Reine Funktionen ohne Store – werden vom Editor UND vom Export genutzt.
// Farben kommen als vererbte CSS-Eigenschaften (color, fill, stroke) vom umgebenden Element,
// damit Hover-Farben und Breakpoints ohne Sonderfälle funktionieren.
import type { VectorKind, VectorSpec, WNode } from './types';
import { svgGradientDef, svgGradientId } from './gradient';

export const VECTOR_LABEL: Record<VectorKind, string> = {
  icon: 'Icon', svg: 'Grafik', line: 'Linie', polygon: 'Vieleck', star: 'Stern',
};

export function defaultVector(kind: VectorKind, init: Partial<VectorSpec> = {}): VectorSpec {
  return {
    kind, strokeWidth: 2, sides: kind === 'star' ? 5 : kind === 'polygon' ? 6 : 0,
    innerRatio: 0.45, arrowStart: false, arrowEnd: false, ...init,
  };
}

/** Formen mit Fläche und Kontur (Füllung = fill, Kontur = stroke) – alles andere wird über „color“ eingefärbt */
export const isShape = (v: VectorSpec | undefined) => v?.kind === 'polygon' || v?.kind === 'star';

export function vectorName(v: VectorSpec): string {
  if (v.kind === 'line') return v.arrowEnd || v.arrowStart ? 'Pfeil' : 'Linie';
  if (v.kind === 'polygon') return v.sides === 3 ? 'Dreieck' : v.sides === 4 ? 'Raute' : `${v.sides}-Eck`;
  return VECTOR_LABEL[v.kind];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Punkte eines Vielecks/Sterns, auf das Feld 0–100 gestreckt */
export function shapePoints(v: Pick<VectorSpec, 'kind' | 'sides' | 'innerRatio'>): [number, number][] {
  const n = Math.max(3, Math.round(v.sides || 3));
  const pts: [number, number][] = [];
  const star = v.kind === 'star';
  const count = star ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const r = star && i % 2 ? Math.min(0.95, Math.max(0.1, v.innerRatio)) : 1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return pts.map(([x, y]) => [r2(((x - x0) / (x1 - x0)) * 100), r2(((y - y0) / (y1 - y0)) * 100)]);
}

export function shapePath(v: VectorSpec): string {
  return 'M' + shapePoints(v).map(p => p.join(' ')).join('L') + 'Z';
}

/** Farben einer eigenen SVG durch die eingestellte Farbe ersetzen */
export function recolor(markup: string): string {
  return markup
    .replace(/\b(fill|stroke|stop-color)="(?!none"|currentColor"|url\()[^"]*"/gi, '$1="currentColor"')
    .replace(/\b(fill|stroke|stop-color)\s*:\s*(?!none|currentColor|url\()[^;"]+/gi, '$1:currentColor');
}

/** IDs (Verläufe, Masken …) pro Ebene eindeutig machen, damit Kopien sich nicht stören */
function scopeIds(markup: string, prefix: string): string {
  if (!/\sid="/.test(markup)) return markup;
  const ids = new Set<string>();
  markup.replace(/\sid="([^"]+)"/g, (_, id: string) => { ids.add(id); return ''; });
  let out = markup.replace(/\sid="([^"]+)"/g, (_, id: string) => ` id="${prefix}-${id}"`);
  out = out.replace(/url\(#([^)]+)\)/g, (m, id: string) => (ids.has(id) ? `url(#${prefix}-${id})` : m));
  out = out.replace(/(href)="#([^"]+)"/g, (m, a: string, id: string) => (ids.has(id) ? `${a}="#${prefix}-${id}"` : m));
  return out;
}

/** Regel für Editor und Export: eingefärbte SVG-Teile übernehmen einen Verlauf (sonst unverändert die Farbe) */
export const VECTOR_PAINT_CSS = 'svg [fill="currentColor"] { fill: var(--wpaint, currentColor); } svg [stroke="currentColor"] { stroke: var(--wpaint, currentColor); }';

const SVG_BASE = 'aria-hidden="true" focusable="false" style="display:block;width:100%;height:100%;overflow:visible"';

/** Fertiges <svg> für eine Vektor-Ebene */
/** Alle Verläufe, die eine Ebene braucht (normal, Hover, Tablet, Mobil) als SVG-<defs> */
function gradientDefs(n: Partial<Pick<WNode, 'id' | 'fills' | 'hover' | 'scrolled' | 'overrides'>>): string {
  const lists = [n.fills, n.hover?.fills, n.scrolled?.fills, n.overrides?.tablet?.fills, n.overrides?.mobile?.fills];
  const seen = new Map<string, string>();
  for (const l of lists) {
    const f = l?.find(x => x.visible);
    if (!f?.gradient || !n.id) continue;
    const id = svgGradientId(n.id, f.gradient, f.opacity);
    if (!seen.has(id)) seen.set(id, svgGradientDef(id, f.gradient, f.opacity));
  }
  return seen.size ? `<defs>${[...seen.values()].join('')}</defs>` : '';
}

/** Farbe der Linien/Flächen: Verlauf (über --wpaint aus dem CSS) oder Textfarbe */
const PAINT = 'var(--wpaint, currentColor)';

export function vectorSvg(n: Pick<WNode, 'id' | 'vector'> & Partial<Pick<WNode, 'fills' | 'hover' | 'overrides'>>): string {
  const v = n.vector;
  if (!v) return '';
  const defs = gradientDefs(n);
  if (v.kind === 'polygon' || v.kind === 'star') {
    return `<svg ${SVG_BASE} viewBox="0 0 100 100" preserveAspectRatio="none">${defs}<path d="${v.path ?? shapePath(v)}" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const sw = r2(Math.max(0.25, v.strokeWidth));
  if (v.kind === 'line') {
    const a = r2(Math.max(7, sw * 3)), b = r2(a * 0.7);
    const head = (end: boolean) => `<svg x="${end ? '100%' : '0'}" y="50%" overflow="visible"><path d="M${end ? -a : a} ${-b}L0 0L${end ? -a : a} ${b}"/></svg>`;
    return `<svg ${SVG_BASE}>${defs}<g fill="none" style="stroke:${PAINT}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`
      + `<line x1="0" y1="50%" x2="100%" y2="50%"/>${v.arrowStart ? head(false) : ''}${v.arrowEnd ? head(true) : ''}</g></svg>`;
  }
  const vb = /^-?[\d.]+(?: -?[\d.]+){3}$/.test(v.viewBox ?? '') ? v.viewBox! : '0 0 24 24';
  let inner = scopeIds(v.markup ?? '', `v${n.id}`);
  if (v.paint === 'line') inner = `<g fill="none" style="stroke:${PAINT}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  else if (v.paint === 'fill') {
    // eingefärbte Teile: fill="currentColor" bekommt per CSS-Regel (VECTOR_PAINT_CSS) ggf. den Verlauf
    const body = v.kind === 'svg' ? recolor(inner).replace(/(fill|stroke):currentColor/g, `$1:${PAINT}`) : inner;
    inner = `<g style="fill:${PAINT}">${body}</g>`;
  }
  return `<svg ${SVG_BASE} viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${defs}${inner}</svg>`;
}

// ---------- Eigene SVG-Dateien bereinigen ----------

const ALLOWED = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient',
  'stop', 'clippath', 'mask', 'use', 'symbol', 'title', 'desc', 'text', 'tspan', 'pattern']);
const ROOT_PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'color'];
export const MAX_SVG_KB = 300;

/** Liest eine SVG-Datei sicher ein: nur Zeichen-Elemente, keine Skripte, keine externen Verweise */
export function sanitizeSvg(text: string): { markup: string; viewBox: string; w: number; h: number; colors: number } | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  const clean = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED.has(child.localName.toLowerCase())) { child.remove(); continue; }
      for (const at of Array.from(child.attributes)) {
        const name = at.name.toLowerCase(), val = at.value.trim();
        const bad = name.startsWith('on')
          || ((name === 'href' || name === 'xlink:href') && !val.startsWith('#'))
          || /javascript:|expression\(|@import/i.test(val)
          || (/url\(/i.test(val) && !/^[^]*url\(\s*['"]?#/i.test(val))
          || name === 'class';
        if (bad) child.removeAttribute(at.name);
        else if (name === 'xlink:href') { child.removeAttribute(at.name); child.setAttribute('href', val); }
      }
      clean(child);
    }
  };
  clean(root);
  const num = (s: string | null) => { const m = s?.match(/^\s*([\d.]+)\s*(px)?\s*$/); return m ? parseFloat(m[1]) : NaN; };
  let viewBox = root.getAttribute('viewBox')?.trim().replace(/[\s,]+/g, ' ') ?? '';
  const vbParts = viewBox.split(' ').map(Number);
  if (vbParts.length !== 4 || vbParts.some(x => !isFinite(x)) || vbParts[2] <= 0 || vbParts[3] <= 0) {
    const w = num(root.getAttribute('width')), h = num(root.getAttribute('height'));
    viewBox = isFinite(w) && isFinite(h) && w > 0 && h > 0 ? `0 0 ${w} ${h}` : '0 0 100 100';
  }
  const [, , vw, vh] = viewBox.split(' ').map(Number);
  const rootAttrs = ROOT_PAINT.filter(a => root.hasAttribute(a)).map(a => `${a}="${root.getAttribute(a)!.replace(/"/g, '&quot;')}"`);
  const body = Array.from(root.childNodes).map(c => (c.nodeType === 1 ? new XMLSerializer().serializeToString(c) : ''))
    .join('').replace(/\sxmlns(:\w+)?="[^"]*"/g, '');
  const markup = rootAttrs.length ? `<g ${rootAttrs.join(' ')}>${body}</g>` : body;
  if (!markup.trim()) return null;
  const colors = new Set<string>();
  markup.replace(/\b(?:fill|stroke|stop-color)\s*(?:=\s*"|:\s*)([^";]+)/gi, (_, c: string) => {
    const k = c.trim().toLowerCase();
    if (k !== 'none' && k !== 'currentcolor' && !k.startsWith('url(')) colors.add(k);
    return '';
  });
  if (!/\bfill\s*[=:]/.test(markup)) colors.add('#000');
  return { markup, viewBox, w: vw, h: vh, colors: colors.size };
}
