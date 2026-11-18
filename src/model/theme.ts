// Farbschema und Dunkel-Modus
import { useEditor } from '../store';
import { uid } from './factory';
import type { ColorAsset, WNode } from './types';

const cache = new WeakMap<WNode, { cs: ColorAsset[]; r: WNode }>();
/** Ebene mit den Dunkel-Farben (nur verknüpfte Farben mit Dunkel-Variante) – für die Ansicht auf der Arbeitsfläche */
export function withDark(n: WNode, cs: ColorAsset[]): WNode {
  const c = cache.get(n);
  if (c && c.cs === cs) return c.r;
  const dark = new Map(cs.filter(x => x.dark).map(x => [x.id, x.dark!]));
  const sw = <T extends { colorRef?: string | null; color: string; opacity: number }>(p: T): T => {
    const d = p.colorRef ? dark.get(p.colorRef) : undefined;
    return d ? { ...p, color: d.color, opacity: d.opacity } : p;
  };
  const touches = [...n.fills, ...n.strokes, ...n.shadows].some(p => p.colorRef && dark.has(p.colorRef));
  const r = touches ? { ...n, fills: n.fills.map(sw), strokes: n.strokes.map(sw), shadows: n.shadows.map(sw) } : n;
  cache.set(n, { cs, r });
  return r;
}

/** Farbrollen eines Farbschemas: Name, hell, dunkel */
type Role = [string, string, string];
export interface Palette { id: string; name: string; roles: Role[] }
export const PALETTES: Palette[] = [
  { id: 'violett', name: 'Violett & Koralle', roles: [['Hauptfarbe', '#6A55F5', '#8B7BFF'], ['Akzent', '#FF7A59', '#FF9478'], ['Hintergrund', '#FFFFFF', '#121216'], ['Fläche', '#F4F2FF', '#1E1D26'], ['Text', '#1C1B22', '#F2F1F7'], ['Text leise', '#5E5C6B', '#A9A7B5']] },
  { id: 'wald', name: 'Wald & Sand', roles: [['Hauptfarbe', '#2F6B4F', '#5FAF86'], ['Akzent', '#D9A441', '#E8B95A'], ['Hintergrund', '#FBF8F2', '#111613'], ['Fläche', '#EFE9DC', '#1B221E'], ['Text', '#1F2A24', '#EEF2EE'], ['Text leise', '#5D6B62', '#9FB0A6']] },
  { id: 'ozean', name: 'Ozean', roles: [['Hauptfarbe', '#0A66C2', '#4C9BEB'], ['Akzent', '#00B3A4', '#2DD4C4'], ['Hintergrund', '#FFFFFF', '#0B1220'], ['Fläche', '#EEF4FB', '#141D2E'], ['Text', '#0F1A2A', '#E8EEF7'], ['Text leise', '#526079', '#98A6BD']] },
  { id: 'kaffee', name: 'Kaffee & Creme', roles: [['Hauptfarbe', '#8B5A2B', '#C08A55'], ['Akzent', '#E07A3F', '#F0955E'], ['Hintergrund', '#FFFBF2', '#16120E'], ['Fläche', '#F3EADB', '#211B15'], ['Text', '#2B2118', '#F3ECE2'], ['Text leise', '#6E5F50', '#B3A492']] },
  { id: 'mono', name: 'Schwarz-Weiß', roles: [['Hauptfarbe', '#111111', '#F5F5F5'], ['Akzent', '#FF3B30', '#FF6259'], ['Hintergrund', '#FFFFFF', '#0E0E0E'], ['Fläche', '#F2F2F2', '#1C1C1C'], ['Text', '#111111', '#F2F2F2'], ['Text leise', '#666666', '#A0A0A0']] },
  { id: 'pastell', name: 'Pastell', roles: [['Hauptfarbe', '#E46F9C', '#F094B8'], ['Akzent', '#6CC4B0', '#86D6C4'], ['Hintergrund', '#FFF9FB', '#16121A'], ['Fläche', '#F6EEF8', '#211A26'], ['Text', '#2A2233', '#F4EEF7'], ['Text leise', '#6F6578', '#B1A6BA']] },
];

/** Farbschema anlegen bzw. die gleichnamigen Farben aktualisieren (verknüpfte Stellen ziehen mit) */
export function applyPalette(p: Palette) {
  useEditor.getState().mutate((_, d) => {
    for (const [name, light, dark] of p.roles) {
      const ex = d.library.colors.find(c => c.name === name);
      if (ex) { ex.color = light; ex.opacity = 1; ex.dark = { color: dark, opacity: 1 }; }
      else d.library.colors.push({ id: uid(), name, color: light, opacity: 1, dark: { color: dark, opacity: 1 } });
    }
    // verknüpfte Stellen aktualisieren
    const byId = new Map(d.library.colors.map(c => [c.id, c]));
    const all = [...d.pages, ...(d.componentPages ?? [])];
    for (const pg of all) for (const id in pg.nodes) {
      const n = pg.nodes[id];
      for (const x of [...n.fills, ...n.strokes, ...n.shadows]) { const c = x.colorRef ? byId.get(x.colorRef) : undefined; if (c) { x.color = c.color; x.opacity = c.opacity; } }
    }
    d.site = { ...(d.site ?? { name: d.name, lang: 'de', url: '', favicon: null, selfHostFonts: false }), darkMode: d.site?.darkMode ?? 'auto' };
  }, { key: 'palette' });
}

export function setColorDark(id: string, dark: { color: string; opacity: number } | null) {
  useEditor.getState().mutate((_, d) => { const c = d.library.colors.find(x => x.id === id); if (c) c.dark = dark; }, { key: 'color-dark-' + id });
}
