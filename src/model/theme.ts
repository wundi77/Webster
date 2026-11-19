// Farbschemata
import { useEditor } from '../store';
import { uid } from './factory';

/** Farbrollen eines Farbschemas: Name, Farbe (der dritte Wert ist ein früherer Dunkel-Wert und wird nicht mehr benutzt) */
type Role = [string, string, string];
export interface Palette { id: string; name: string; roles: Role[] }
export const PALETTES: Palette[] = [
  { id: 'violett', name: 'Violett & Koralle', roles: [['Hauptfarbe', '#6853F0', '#8B7BFF'], ['Akzent', '#D9684C', '#FF9478'], ['Hintergrund', '#FFFFFF', '#121216'], ['Fläche', '#F4F2FF', '#1E1D26'], ['Text', '#1C1B22', '#F2F1F7'], ['Text leise', '#5E5C6B', '#A9A7B5'], ['Auf Hauptfarbe', '#FFFFFF', '#121216']] },
  { id: 'wald', name: 'Wald & Sand', roles: [['Hauptfarbe', '#2F6B4F', '#5FAF86'], ['Akzent', '#A57D31', '#E8B95A'], ['Hintergrund', '#FBF8F2', '#111613'], ['Fläche', '#EFE9DC', '#1B221E'], ['Text', '#1F2A24', '#EEF2EE'], ['Text leise', '#5C6A61', '#9FB0A6'], ['Auf Hauptfarbe', '#FFFFFF', '#111613']] },
  { id: 'ozean', name: 'Ozean', roles: [['Hauptfarbe', '#0A66C2', '#4C9BEB'], ['Akzent', '#009A8D', '#2DD4C4'], ['Hintergrund', '#FFFFFF', '#0B1220'], ['Fläche', '#EEF4FB', '#141D2E'], ['Text', '#0F1A2A', '#E8EEF7'], ['Text leise', '#526079', '#98A6BD'], ['Auf Hauptfarbe', '#FFFFFF', '#0B1220']] },
  { id: 'kaffee', name: 'Kaffee & Creme', roles: [['Hauptfarbe', '#8B5A2B', '#C08A55'], ['Akzent', '#C76D38', '#F0955E'], ['Hintergrund', '#FFFBF2', '#16120E'], ['Fläche', '#F3EADB', '#211B15'], ['Text', '#2B2118', '#F3ECE2'], ['Text leise', '#6E5F50', '#B3A492'], ['Auf Hauptfarbe', '#FFFFFF', '#16120E']] },
  { id: 'mono', name: 'Schwarz-Weiß', roles: [['Hauptfarbe', '#111111', '#F5F5F5'], ['Akzent', '#FF3B30', '#FF6259'], ['Hintergrund', '#FFFFFF', '#0E0E0E'], ['Fläche', '#F2F2F2', '#1C1C1C'], ['Text', '#111111', '#F2F2F2'], ['Text leise', '#666666', '#A0A0A0'], ['Auf Hauptfarbe', '#FFFFFF', '#0E0E0E']] },
  { id: 'pastell', name: 'Pastell', roles: [['Hauptfarbe', '#A45070', '#F094B8'], ['Akzent', '#519384', '#86D6C4'], ['Hintergrund', '#FFF9FB', '#16121A'], ['Fläche', '#F6EEF8', '#211A26'], ['Text', '#2A2233', '#F4EEF7'], ['Text leise', '#6F6578', '#B1A6BA'], ['Auf Hauptfarbe', '#FFFFFF', '#16121A']] },
];

/** Farbschema anlegen bzw. die gleichnamigen Farben aktualisieren (verknüpfte Stellen ziehen mit) */
export function applyPalette(p: Palette) {
  useEditor.getState().mutate((_, d) => {
    for (const [name, light] of p.roles) {
      const ex = d.library.colors.find(c => c.name === name);
      if (ex) { ex.color = light; ex.opacity = 1; delete ex.dark; }
      else d.library.colors.push({ id: uid(), name, color: light, opacity: 1 });
    }
    // Weißer Seitenhintergrund und fast schwarze Texte an die Rollen hängen – so ziehen sie beim nächsten Farbschema mit
    const role = (n: string) => d.library.colors.find(c => c.name === n)!;
    const lum = (hex: string) => { const h = hex.replace('#', ''); const v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const all = [...d.pages, ...(d.componentPages ?? [])];
    for (const pg of all) for (const id in pg.nodes) {
      const n = pg.nodes[id];
      const f = n.fills[0];
      if (!f || f.colorRef || f.gradient || f.kind || f.opacity < 1) continue;
      if (n.site && lum(f.color) > 0.94) { f.colorRef = role('Hintergrund').id; }
      else if (n.type === 'text' && lum(f.color) < 0.25) { f.colorRef = role('Text').id; }
    }
    // verknüpfte Stellen aktualisieren
    const byId = new Map(d.library.colors.map(c => [c.id, c]));
    for (const pg of all) for (const id in pg.nodes) {
      const n = pg.nodes[id];
      for (const x of [...n.fills, ...n.strokes, ...n.shadows]) { const c = x.colorRef ? byId.get(x.colorRef) : undefined; if (c) { x.color = c.color; x.opacity = c.opacity; } }
    }
    if (d.site) delete d.site.darkMode;
  }, { key: 'palette' });
}
