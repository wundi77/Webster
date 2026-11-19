// Übersetzt eine Ebene in echtes CSS. Wird im Editor UND später für den Export genutzt,
// damit die Darstellung im Editor exakt der fertigen Webseite entspricht.
import type { AlignItems, Justify, Layout, Sizing, Track, WNode } from './types';
import { round } from './geometry';
import { gradientCss, svgGradientId } from './gradient';
import type { Fill } from './types';

/** Eine Füllung als CSS-Bildebene (Verlauf oder einfarbig) */
const fillLayer = (f: Fill) => (f.kind === 'grain' ? grainUrl(f) : f.gradient ? gradientCss(f.gradient, f.opacity) : `linear-gradient(${paintCss(f)}, ${paintCss(f)})`);

/** Körnung: feines Rauschen als SVG (wird gekachelt) */
export function grainUrl(f: Fill): string {
  const coarse = f.grain === 'coarse';
  const t = coarse ? 220 : 160;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${t}' height='${t}'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='${coarse ? 0.45 : 0.85}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23g)' opacity='${round(f.opacity, 3)}'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}
const grainSize = (f: Fill) => (f.grain === 'coarse' ? '220px 220px' : '160px 160px');
/** Hintergrund-Ebene, die als eigenes Element gezeichnet wird (Video) */
export const videoFillOf = (n: WNode) => n.fills.find(f => f.visible && f.kind === 'video' && f.videoRef);

type PaintLike = { color: string; opacity: number; colorRef?: string | null };
export function paintCss(p: PaintLike): string {
  return rgba(p.color, p.opacity);
}

export function rgba(hex: string, opacity = 1): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  h = h.slice(0, 6).padEnd(6, '0');
  if (opacity >= 1) return '#' + h.toUpperCase();
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${round(opacity, 3)})`;
}

const px = (v: number) => `${round(v)}px`;

const flexAlign = (a: AlignItems | Justify) =>
  a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : a;

export const trackCss = (t: Track) => (t.unit === 'auto' ? 'auto' : t.unit === 'fr' ? `${round(t.value)}fr` : px(t.value));

/** Welches Größenverhalten gilt tatsächlich? (Füllen nur im Layout, Anpassen nur bei Text/Layout-Boards) */
export function effectiveSizing(node: WNode, inFlow: boolean): { h: Sizing; v: Sizing } {
  const hugOk = node.type === 'text' || (node.type === 'board' && !!node.layout);
  const fix = (s: Sizing): Sizing => (s === 'fill' && !inFlow ? 'fixed' : s === 'auto' && !hugOk ? 'fixed' : s);
  return { h: fix(node.sizingH), v: fix(node.sizingV) };
}

export const FOOTER_NAME = 'Fußzeile';
export const isFooter = (n: WNode | undefined): boolean => !!n && (n.role === 'footer' || (n.type === 'board' && n.name === FOOTER_NAME && n.role !== 'header'));
/** Kopfzeile: eigene (Rolle) oder die fertige Kopfleiste mit Menü */
export const isHeader = (n: WNode | undefined): boolean => !!n && (n.role === 'header' || (!!n.nav && n.role !== 'footer'));

export function nodeCss(node: WNode, parent: Layout | null = null): Record<string, string> {
  const c: Record<string, string> = {};
  const ts = node.textStyle;
  const flow = !!parent && !node.absolute;
  const sz = effectiveSizing(node, flow);

  if (flow) c['position'] = 'relative';
  else {
    c['position'] = 'absolute';
    c['left'] = px(node.x);
    c['top'] = px(node.y);
  }

  if (sz.h === 'fixed') c['width'] = px(node.w);
  else if (sz.h === 'auto') c['width'] = node.type === 'text' ? 'max-content' : 'fit-content';
  if (sz.v === 'fixed') c['height'] = px(node.h);
  else if (sz.v === 'auto') c['height'] = 'auto';

  if (flow && parent) {
    if (parent.type === 'flex') {
      const row = parent.direction === 'row';
      const mainFill = row ? sz.h === 'fill' : sz.v === 'fill';
      const crossFill = row ? sz.v === 'fill' : sz.h === 'fill';
      if (mainFill) { c['flex'] = '1 1 0px'; c[row ? 'min-width' : 'min-height'] = '0px'; }
      else c['flex-shrink'] = '0';
      // Füllen mit Höchstbreite in einem mittig ausrichtenden Board: volle Breite bis zur Grenze, dann mittig
      if (crossFill && node.maxW !== null && !row && parent.align === 'center') { c['align-self'] = 'center'; c['width'] = '100%'; }
      else if (crossFill) c['align-self'] = 'stretch';
      else if (node.alignSelf !== 'auto') c['align-self'] = flexAlign(node.alignSelf);
    } else if (parent.masonry) {
      // Kachel im Mauerwerk: volle Spaltenbreite, nicht über zwei Spalten zerteilen
      c['width'] = '100%';
      c['break-inside'] = 'avoid';
      c['margin-bottom'] = px(parent.rowGap);
      c['display'] = c['display'] ?? 'block';
    } else {
      if (sz.h === 'fill') c['justify-self'] = 'stretch';
      if (sz.v === 'fill') c['align-self'] = 'stretch';
      else if (node.alignSelf !== 'auto') c['align-self'] = node.alignSelf;
      const g = node.grid;
      if (g) {
        if (g.col > 0) c['grid-column'] = `${g.col} / span ${Math.max(1, g.colSpan)}`;
        else if (g.colSpan > 1) c['grid-column'] = `span ${g.colSpan}`;
        if (g.row > 0) c['grid-row'] = `${g.row} / span ${Math.max(1, g.rowSpan)}`;
        else if (g.rowSpan > 1) c['grid-row'] = `span ${g.rowSpan}`;
      }
      // Fußzeile ohne eigene Platzierung: über alle Spalten, in einer eigenen Zeile
      if (isFooter(node) && !(g && (g.col > 0 || g.colSpan > 1))) c['grid-column'] = '1 / -1';
    }
    // Fußzeile untereinander: bei kurzem Inhalt ganz nach unten schieben
    if (parent.type === 'flex' && parent.direction === 'column' && isFooter(node)) c['margin-top'] = 'auto';
    // Fußzeile in einer umbrechenden Reihe: eigene Zeile über die ganze Breite
    if (parent.type === 'flex' && parent.direction === 'row' && parent.wrap && isFooter(node)) {
      c['flex'] = '1 0 100%';
      c['min-width'] = '0px';
    }
  }
  if (node.minW !== null) c['min-width'] = px(node.minW);
  if (node.maxW !== null) c['max-width'] = px(node.maxW);
  if (node.minH !== null) c['min-height'] = px(node.minH);
  if (node.maxH !== null) c['max-height'] = px(node.maxH);

  if (node.type === 'text') {
    if (sz.h === 'auto') c['white-space'] = 'pre';
    else { c['white-space'] = 'pre-wrap'; c['overflow-wrap'] = 'break-word'; }
  }

  c['box-sizing'] = 'border-box';
  if (!node.visible) c['display'] = 'none';
  {
    const t: string[] = [];
    if (node.lift) t.push(`translateY(${round(-node.lift)}px)`);
    if (node.rotation) t.push(`rotate(${round(node.rotation)}deg)`);
    if (node.scale && node.scale !== 1) t.push(`scale(${round(node.scale)})`);
    if (t.length) c['transform'] = t.join(' ');
  }
  if (node.opacity < 1) c['opacity'] = String(round(node.opacity, 3));
  if (node.blendMode !== 'normal') c['mix-blend-mode'] = node.blendMode;

  // Layout des Boards
  const L = node.layout;
  if (L && node.type === 'board' && node.visible) {
    c['display'] = L.type;
    if (L.padding.some(v => v)) c['padding'] = L.padding.map(px).join(' ');
    if (L.type === 'flex') {
      const row = L.direction === 'row';
      c['flex-direction'] = L.direction;
      if (L.wrap) { c['flex-wrap'] = 'wrap'; c['align-content'] = 'flex-start'; }
      c['row-gap'] = px(row ? L.rowGap : L.gap);
      c['column-gap'] = px(row ? L.gap : L.rowGap);
      c['justify-content'] = flexAlign(L.justify);
      c['align-items'] = flexAlign(L.align);
    } else if (L.masonry) {
      // Mauerwerk: Spalten wie in einer Zeitung, die Kacheln laufen von oben nach unten
      c['display'] = 'block';
      if (L.colMin) c['column-width'] = px(L.colMin);
      else c['column-count'] = String(Math.max(1, L.columns.length));
      c['column-gap'] = px(L.gap);
    } else {
      c['grid-template-columns'] = L.colMin
        ? `repeat(auto-fill, minmax(min(${px(L.colMin)}, 100%), 1fr))`
        : L.columns.length ? L.columns.map(trackCss).join(' ') : 'none';
      if (L.rows.length) c['grid-template-rows'] = L.rows.map(trackCss).join(' ');
      c['column-gap'] = px(L.gap);
      c['row-gap'] = px(L.rowGap);
      c['justify-items'] = L.justifyItems;
      c['align-items'] = L.align;
      c['align-content'] = 'start';
    }
  }

  if (node.type === 'ellipse') c['border-radius'] = '50%';
  else if (node.type !== 'text' && node.type !== 'vector') {
    if (node.radii) c['border-radius'] = node.radii.map(px).join(' ');
    else if (node.radius) c['border-radius'] = px(node.radius);
  }

  // Vorher-Nachher: die obere Ebene ab der Reglerstelle zeigen
  if (node.compareAfter) c['clip-path'] = 'inset(0 0 0 var(--cmp, 50%))';
  if (node.compare) { c['--cmp'] = `${node.compare.pos}%`; if (!c.position) c.position = 'relative'; }
  if (node.carousel && !c.position) c.position = 'relative';

  const fills = node.fills.filter(f => f.visible);
  const shape = node.type === 'vector' && (node.vector?.kind === 'polygon' || node.vector?.kind === 'star');
  if (node.type === 'vector') {
    // Icons/Linien: Farbe über „color“ (currentColor), Formen: SVG-Füllung und -Kontur (werden ans <svg> vererbt)
    // Verläufe: echte SVG-Verläufe (in vectorSvg als <defs>), hier nur der Verweis darauf
    const f = fills[0];
    const grad = f?.gradient ? `url(#${svgGradientId(node.id, f.gradient, f.opacity)})` : null;
    if (shape) c['fill'] = f ? grad ?? paintCss(f) : 'none';
    else if (f) {
      c['color'] = paintCss(f);
      if (grad) c['--wpaint'] = grad;
    }
    const st = node.strokes.find(s => s.visible && s.width > 0);
    if (shape && st) {
      c['stroke'] = paintCss(st);
      c['stroke-width'] = px(st.width);
      c['stroke-linejoin'] = 'round';
      if (st.style === 'dashed') c['stroke-dasharray'] = `${px(st.width * 3)} ${px(st.width * 2)}`;
      else if (st.style === 'dotted') { c['stroke-dasharray'] = `0 ${px(st.width * 2)}`; c['stroke-linecap'] = 'round'; }
    }
  } else if (node.type === 'text') {
    const f = fills[0];
    if (f) c['color'] = paintCss(f);
    if (f?.gradient) {
      // Verlauf in der Schrift: Hintergrund auf die Buchstaben zuschneiden
      c['background-image'] = gradientCss(f.gradient, f.opacity);
      c['-webkit-background-clip'] = 'text';
      c['background-clip'] = 'text';
      c['-webkit-text-fill-color'] = 'transparent';
    }
  } else {
    // Video ist eine eigene Ebene (im Element), Glas färbt nur leicht und macht dahinter unscharf
    const layers = fills.filter(f => f.kind !== 'video');
    const glass = fills.find(f => f.kind === 'glass');
    if (glass) {
      const b = `blur(${px(glass.blur ?? 16)})`;
      c['backdrop-filter'] = b; c['-webkit-backdrop-filter'] = b;
    }
    if (videoFillOf(node)) { c['isolation'] = 'isolate'; if (!c.position) c.position = 'relative'; }
    const special = layers.some(f => f.kind === 'grain' || f.move);
    if (layers.length === 1 && !layers[0].gradient && !special) {
      // nur Einzelangaben (keine „background“-Kurzform), damit Hover-Wechsel sauber zurückgesetzt werden
      c['background-color'] = paintCss(layers[0]);
    } else if (layers.length) {
      c['background-image'] = layers.map(fillLayer).join(', ');
      if (special) {
        c['background-size'] = layers.map(f => (f.kind === 'grain' ? grainSize(f) : f.move ? '300% 300%' : '100% 100%')).join(', ');
        c['background-position'] = layers.map(f => (f.move ? 'var(--bgx, 0%) 50%' : '0% 0%')).join(', ');
        const mv = layers.find(f => f.move && f.gradient);
        if (mv) c['animation'] = `w-bgmove ${mv.move}s ease-in-out infinite alternate`;
      }
    }
  }

  const st = node.strokes.find(s => s.visible);
  if (st && st.width > 0 && node.type !== 'text' && node.type !== 'vector') {
    c['outline'] = `${px(st.width)} ${st.style} ${paintCss(st)}`;
    c['outline-offset'] = st.position === 'inside' ? px(-st.width) : st.position === 'center' ? px(-st.width / 2) : '0px';
  }

  const sh = node.shadows.filter(s => s.visible);
  if (sh.length) {
    if (node.type === 'vector') {
      const v = sh.filter(s => s.kind === 'drop').map(s => `drop-shadow(${px(s.x)} ${px(s.y)} ${px(s.blur / 2)} ${paintCss(s)})`).join(' ');
      if (v) c['filter'] = v;
    } else if (node.type === 'text' && fills[0]?.gradient) {
      // Schatten würde über durchsichtiger Schrift liegen → als Filter
      const v = sh.filter(s => s.kind === 'drop').map(s => `drop-shadow(${px(s.x)} ${px(s.y)} ${px(s.blur / 2)} ${paintCss(s)})`).join(' ');
      if (v) c['filter'] = v;
    } else if (node.type === 'text') {
      const v = sh.filter(s => s.kind === 'drop').map(s => `${px(s.x)} ${px(s.y)} ${px(s.blur)} ${paintCss(s)}`).join(', ');
      if (v) c['text-shadow'] = v;
    } else {
      c['box-shadow'] = sh.map(s => `${s.kind === 'inner' ? 'inset ' : ''}${px(s.x)} ${px(s.y)} ${px(s.blur)} ${px(s.spread)} ${paintCss(s)}`).join(', ');
    }
  }
  if (node.blur > 0) c['filter'] = [`blur(${px(node.blur)})`, c['filter']].filter(Boolean).join(' ');
  if ((node.type === 'board' && node.clip) || node.type === 'image') c['overflow'] = 'hidden';

  if (node.type === 'text' && ts) {
    c['font-family'] = `"${ts.fontFamily}", sans-serif`;
    c['font-size'] = px(ts.fontSize);
    c['font-weight'] = String(ts.fontWeight);
    c['line-height'] = String(round(ts.lineHeight, 3));
    if (ts.letterSpacing) c['letter-spacing'] = px(ts.letterSpacing);
    c['text-align'] = ts.textAlign;
    if (ts.italic) c['font-style'] = 'italic';
    if (ts.decoration !== 'none') c['text-decoration'] = ts.decoration;
    if (ts.transform !== 'none') c['text-transform'] = ts.transform;
  }
  if (node.customCss) Object.assign(c, parseDecls(node.customCss));
  return c;
}

/** „a: b; c: d“ → { a: 'b', c: 'd' } (Semikolons in Klammern/Anführungszeichen bleiben erhalten) */
export function parseDecls(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0, quote = '', cur = '';
  const flush = () => {
    const i = cur.indexOf(':');
    if (i > 0) {
      const k = cur.slice(0, i).trim().toLowerCase();
      const v = cur.slice(i + 1).trim().replace(/\s*!important$/i, '');
      if (/^(--)?[a-z][a-z0-9-]*$/.test(k) && v && !/[{}<>]/.test(v)) out[k] = v;
    }
    cur = '';
  };
  for (const ch of clean) {
    if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ';' || ch === '\n') && depth === 0) { flush(); continue; }
    cur += ch;
  }
  flush();
  return out;
}

export function toReactStyle(css: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(css)) {
    if (k.startsWith('--')) out[k] = v;
    else out[k.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, l: string) => l.toUpperCase())] = v;
  }
  return out;
}

export function cssText(selector: string, css: Record<string, string>): string {
  return `${selector} {\n${Object.entries(css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'element';
