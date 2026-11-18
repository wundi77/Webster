// Abstands-Stufen der Website (S, M, L, XL): einmal festlegen, überall verwenden.
// Layouts merken sich die Stufe (gapRef/padRef); ändert sich eine Stufe, ändern sich alle verknüpften Abstände mit.
import { useEditor } from '../store';
import { allPages } from './pageRules';
import type { Layout, SpaceScale, SpaceToken, WDocument, WNode } from './types';

export const DEFAULT_SPACE: SpaceScale = { s: 8, m: 16, l: 32, xl: 64 };
export const SPACE_TOKENS: SpaceToken[] = ['s', 'm', 'l', 'xl'];
export const SPACE_NAMES: Record<SpaceToken, string> = { s: 'S', m: 'M', l: 'L', xl: 'XL' };
export const spaceOf = (doc: WDocument): SpaceScale => ({ ...DEFAULT_SPACE, ...doc.site?.space });

const layoutsOf = (n: WNode): Layout[] => {
  const out: Layout[] = [];
  if (n.layout) out.push(n.layout);
  for (const bp of ['tablet', 'mobile'] as const) { const l = n.overrides?.[bp]?.layout; if (l) out.push(l as Layout); }
  return out;
};

/** Stufe ändern – alle verknüpften Abstände ziehen mit */
export function setSpaceStep(token: SpaceToken, px: number) {
  const v = Math.max(0, Math.round(px));
  useEditor.getState().mutate((_, d) => {
    d.site = { ...(d.site ?? { name: d.name, lang: 'de', url: '', favicon: null, selfHostFonts: false }), space: { ...spaceOf(d), [token]: v } };
    for (const p of allPages(d)) for (const id in p.nodes) for (const l of layoutsOf(p.nodes[id])) {
      if (l.gapRef === token) { l.gap = v; l.rowGap = v; }
      if (l.padRef === token) l.padding = [v, v, v, v];
    }
  }, { key: 'space-' + token });
}

/** Abstand (zwischen den Elementen) bzw. Innenabstand auf eine Stufe setzen */
export function applySpace(ids: string[], kind: 'gap' | 'pad', token: SpaceToken) {
  const s = useEditor.getState();
  const v = spaceOf(s.doc)[token];
  s.mutate(pg => {
    for (const id of ids) {
      const l = pg.nodes[id]?.layout;
      if (!l) continue;
      if (kind === 'gap') { l.gap = v; l.rowGap = v; l.gapRef = token; } else { l.padding = [v, v, v, v]; l.padRef = token; }
    }
  }, { key: 'space-apply-' + kind });
}
