// Breakpoints: Desktop ist die Grundgestaltung. Tablet erbt von Desktop, Mobil erbt von Tablet.
// Abweichungen werden pro Ebene in `overrides` gespeichert.
import { current, isDraft } from 'immer';
import type { Breakpoint, Page, WNode } from './types';
import { BREAKPOINTS } from './factory';

type SmallBp = Exclude<Breakpoint, 'desktop'>;

/** Diese Eigenschaften gelten immer für alle Breakpoints */
export const SHARED = new Set<string>([
  'id', 'type', 'name', 'parentId', 'children', 'text', 'src', 'imageRef', 'locked', 'overrides', 'site',
  'isMain', 'componentId', 'mainId', 'touched', 'link', 'hover', 'hoverDuration', 'pin', 'scrolled', 'scrollAt', 'scrollDuration', 'contentWidth', 'fullscreen', 'role', 'textTag', 'contentAlign', 'reveal', 'motion', 'carousel', 'compare', 'compareAfter', 'lottie', 'anim', 'animation', 'nav', 'navLinks', 'form', 'formField', 'formLabel', 'formSubmit', 'embed', 'codeBlock', 'customCss', 'vector', 'guides', 'variantSet', 'variantName', 'vkey',
]);

const nodeCache: Record<SmallBp, WeakMap<WNode, WNode>> = { tablet: new WeakMap(), mobile: new WeakMap() };
const pageCache: Record<SmallBp, WeakMap<Page, Page>> = { tablet: new WeakMap(), mobile: new WeakMap() };

export const bpWidth = (bp: Breakpoint) => BREAKPOINTS.find(b => b.id === bp)?.width ?? null;

function compute(n: WNode, bp: SmallBp): WNode {
  const o = n.overrides;
  const site = n.site && n.parentId === null;
  if (!site && !o?.tablet && !(bp === 'mobile' && o?.mobile)) return n;
  let r: WNode = { ...n };
  if (o?.tablet) Object.assign(r, o.tablet);
  if (bp === 'mobile' && o?.mobile) Object.assign(r, o.mobile);
  if (site) r = { ...r, w: (o?.[bp]?.w as number | undefined) ?? bpWidth(bp)! };
  return r;
}

export function resolveNode(n: WNode, bp: Breakpoint): WNode {
  if (bp === 'desktop' || !n) return n;
  const c = nodeCache[bp];
  let r = c.get(n);
  if (!r) { r = compute(n, bp); c.set(n, r); }
  return r;
}

/** Seite, wie sie im aktuellen Breakpoint aussieht */
export function resolvePage(page: Page, bp: Breakpoint): Page {
  if (bp === 'desktop') return page;
  const c = pageCache[bp];
  let r = c.get(page);
  if (!r) {
    const nodes: Record<string, WNode> = {};
    for (const id in page.nodes) nodes[id] = resolveNode(page.nodes[id], bp);
    r = { ...page, nodes };
    c.set(page, r);
  }
  return r;
}

/** Schreibt Eigenschaften in den passenden Breakpoint (n ist ein Entwurf im Store) */
export function writeProps(n: WNode, bp: Breakpoint, patch: Partial<WNode>) {
  for (const [k, v] of Object.entries(patch)) {
    if (bp === 'desktop' || SHARED.has(k)) (n as unknown as Record<string, unknown>)[k] = v;
    else {
      n.overrides ??= {};
      n.overrides[bp] ??= {};
      (n.overrides[bp] as Record<string, unknown>)[k] = v;
    }
  }
}

/** Führt eine Änderung aus und speichert im Tablet/Mobil-Modus nur die Abweichungen */
export function applyEdit(n: WNode, bp: Breakpoint, fn: (n: WNode) => void) {
  if (bp === 'desktop') { fn(n); return; }
  const plain = isDraft(n) ? current(n) : n;
  const eff: WNode = JSON.parse(JSON.stringify(compute(plain, bp)));
  const before = JSON.parse(JSON.stringify(eff)) as Record<string, unknown>;
  fn(eff);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(eff)) {
    if (JSON.stringify(v) !== JSON.stringify(before[k])) patch[k] = v;
  }
  writeProps(n, bp, patch as Partial<WNode>);
}

export function overrideKeys(n: WNode, bp: Breakpoint): string[] {
  if (bp === 'desktop') return [];
  return Object.keys(n.overrides?.[bp] ?? {});
}

export const PROP_NAMES: Record<string, string> = {
  x: 'Position X', y: 'Position Y', w: 'Breite', h: 'Höhe', sizingH: 'Breitenverhalten', sizingV: 'Höhenverhalten',
  visible: 'Sichtbarkeit', fills: 'Füllung', strokes: 'Kontur', shadows: 'Schatten', textStyle: 'Text',
  layout: 'Layout', radius: 'Eckenradius', radii: 'Eckenradien', opacity: 'Deckkraft', rotation: 'Drehung',
  absolute: 'Absolute Position', alignSelf: 'Eigene Ausrichtung', grid: 'Grid-Zelle', blur: 'Unschärfe',
  minW: 'Min. Breite', maxW: 'Max. Breite', minH: 'Min. Höhe', maxH: 'Max. Höhe', clip: 'Beschneiden', colGrid: 'Spaltenraster',
  blendMode: 'Mischmodus', objectFit: 'Bildanpassung',
};
