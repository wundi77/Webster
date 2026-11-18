// Zustände: Abweichungen beim Überfahren mit der Maus (hover) und nach dem Scrollen (scrolled).
// Beide gelten für alle Breakpoints.
import { current, isDraft } from 'immer';
import type { Breakpoint, WNode } from './types';
import { HOVER_KEYS, SCROLL_KEYS } from './types';
import { applyEdit, resolveNode } from './resolve';

const hoverCache = new WeakMap<WNode, WNode>();
const scrollCache = new WeakMap<WNode, WNode>();

/** Ebene mit Hover-Aussehen (n ist bereits für den Breakpoint aufgelöst) */
export function withHover(n: WNode): WNode {
  if (!n.hover || !Object.keys(n.hover).length) return n;
  let r = hoverCache.get(n);
  if (!r) { r = { ...n, ...n.hover }; hoverCache.set(n, r); }
  return r;
}

/** Ebene mit dem Aussehen nach dem Scrollen */
export function withScrolled(n: WNode): WNode {
  if (!n.scrolled || !Object.keys(n.scrolled).length) return n;
  let r = scrollCache.get(n);
  if (!r) { r = { ...n, ...n.scrolled }; scrollCache.set(n, r); }
  return r;
}

export const withState = (n: WNode, state: string): WNode =>
  (state === 'hover' ? withHover(n) : state === 'scrolled' ? withScrolled(n) : n);

function stateEdit(field: 'hover' | 'scrolled', keys: readonly string[], dropOthers: string[]) {
  return (n: WNode, bp: Breakpoint, fn: (n: WNode) => void) => {
    const plain = isDraft(n) ? current(n) : n;
    const eff: WNode = JSON.parse(JSON.stringify(withState(resolveNode(plain, bp), field)));
    const before = JSON.parse(JSON.stringify(eff)) as Record<string, unknown>;
    fn(eff);
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(eff)) {
      if (JSON.stringify(v) === JSON.stringify(before[k])) continue;
      if (keys.includes(k)) {
        n[field] ??= {};
        (n[field] as Record<string, unknown>)[k] = v;
      } else if (!dropOthers.includes(k)) rest[k] = v;
    }
    if (Object.keys(rest).length) applyEdit(n, bp, m => Object.assign(m, rest));
  };
}

/** Änderung im Hover-Modus: Aussehen landet in `hover`, alles andere wird normal geändert */
export const applyHoverEdit = stateEdit('hover', HOVER_KEYS, []);
/** Änderung im Scroll-Modus: Aussehen/Größe landet in `scrolled`; Position bleibt unverändert */
export const applyScrollEdit = stateEdit('scrolled', SCROLL_KEYS, ['x', 'y']);

export const HOVER_NAMES: Record<string, string> = {
  fills: 'Füllung/Farbe', strokes: 'Kontur', shadows: 'Schatten', opacity: 'Deckkraft', blur: 'Unschärfe',
  radius: 'Eckenradius', radii: 'Eckenradien', rotation: 'Drehung', textStyle: 'Text',
  lift: 'Anheben', scale: 'Größe',
  w: 'Breite', h: 'Höhe', layout: 'Layout/Abstände', visible: 'Sichtbarkeit',
};
