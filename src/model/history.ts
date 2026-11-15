// Beschreibt, was sich zwischen zwei Verlaufsschritten geändert hat („Füllung von „Stern“ geändert“)
import type { Page, WDocument, WNode } from './types';
import { PROP_NAMES } from './resolve';

const cache = new WeakMap<WDocument, string>();

const EXTRA: Record<string, string> = {
  text: 'Text', name: 'Name', link: 'Link', hover: 'Hover', hoverDuration: 'Hover-Dauer', pin: 'Fixieren', scrolled: 'Nach dem Scrollen', scrollAt: 'Umschalten ab', scrollDuration: 'Scroll-Übergang', contentWidth: 'Inhaltsbreite', reveal: 'Einblenden', nav: 'Menü',
  navLinks: 'Menüpunkte', form: 'Formular', embed: 'Video/Karte', vector: 'Form', guides: 'Hilfslinien', imageRef: 'Bild', locked: 'Sperre',
  textStyleRef: 'Textstil', overrides: 'Breakpoint-Abweichung', touched: 'Abweichung', layout: 'Layout',
};
const propName = (k: string) => PROP_NAMES[k] ?? EXTRA[k] ?? k;
const q = (n: WNode | undefined) => (n ? `„${n.name}“` : 'Ebene');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

function pageChange(a: Page, b: Page): string | null {
  const added = Object.keys(b.nodes).filter(id => !a.nodes[id]);
  const removed = Object.keys(a.nodes).filter(id => !b.nodes[id]);
  // nur oberste hinzugefügte/gelöschte Ebenen zählen
  const topAdded = added.filter(id => !added.includes(b.nodes[id].parentId ?? ''));
  const topRemoved = removed.filter(id => !removed.includes(a.nodes[id].parentId ?? ''));
  if (topAdded.length) return topAdded.length === 1 ? `${q(b.nodes[topAdded[0]])} eingefügt` : `${topAdded.length} Ebenen eingefügt`;
  if (topRemoved.length) return topRemoved.length === 1 ? `${q(a.nodes[topRemoved[0]])} gelöscht` : `${topRemoved.length} Ebenen gelöscht`;
  const changed = Object.keys(b.nodes).filter(id => a.nodes[id] && a.nodes[id] !== b.nodes[id]);
  const props = new Map<string, string[]>();
  const bps = new Set<string>();
  for (const id of changed) {
    const x = a.nodes[id], y = b.nodes[id];
    const keys = (Object.keys({ ...x, ...y }) as (keyof WNode)[]).filter(k => k !== 'children' && x[k] !== y[k]);
    const keysWithBp = keys.flatMap(k => (k === 'overrides'
      ? Object.keys({ ...x.overrides?.tablet, ...y.overrides?.tablet, ...x.overrides?.mobile, ...y.overrides?.mobile })
        .filter(p => JSON.stringify((x.overrides?.tablet as Record<string, unknown>)?.[p]) !== JSON.stringify((y.overrides?.tablet as Record<string, unknown>)?.[p])
          || JSON.stringify((x.overrides?.mobile as Record<string, unknown>)?.[p]) !== JSON.stringify((y.overrides?.mobile as Record<string, unknown>)?.[p]))
      : [k as string]));
    if (keys.includes('overrides')) for (const [bp, label] of [['tablet', 'Tablet'], ['mobile', 'Mobil']] as const) {
      if (JSON.stringify(x.overrides?.[bp]) !== JSON.stringify(y.overrides?.[bp])) bps.add(label);
    }
    if (keysWithBp.length) props.set(id, keysWithBp);
    else if (x.children !== y.children && x.children.join() !== y.children.join()) props.set(id, ['order']);
  }
  if (!props.size) return null;
  const r = describeNode(props, b);
  return bps.size ? `${r} (${[...bps].join(', ')})` : r;
}

function describeNode(props: Map<string, string[]>, b: Page): string {
  const ids = [...props.keys()];
  // Kopien von Komponenten werden mitgezogen – wichtig ist das Original bzw. die erste Ebene
  const id = ids.find(i => b.nodes[i].isMain) ?? ids[0];
  const keys = props.get(id)!;
  const who = ids.length > 1 && !b.nodes[id].isMain ? plural(ids.length, q(b.nodes[id]), 'Ebenen') : q(b.nodes[id]);
  if (keys.every(k => k === 'x' || k === 'y')) return `${who} verschoben`;
  if (keys.every(k => ['x', 'y', 'w', 'h'].includes(k))) return `Größe von ${who} geändert`;
  if (keys.includes('parentId')) return `${who} verschoben`;
  if (keys[0] === 'order') return `Reihenfolge in ${who} geändert`;
  if (keys.length === 1 && keys[0] === 'text') return `Text ${who} bearbeitet`;
  if (keys.length === 1 && keys[0] === 'name') return `${who} umbenannt`;
  if (keys.includes('visible') && keys.length === 1) return `${who} ${b.nodes[id].visible ? 'eingeblendet' : 'ausgeblendet'}`;
  const names = [...new Set(keys.map(propName))].slice(0, 2).join(', ');
  return `${names} von ${who} geändert`;
}

/** Kurze Beschreibung des Schritts von a nach b */
export function describeChange(a: WDocument, b: WDocument): string {
  const hit = cache.get(b);
  if (hit) return hit;
  let r: string | null = null;
  if (a.name !== b.name) r = 'Dokument umbenannt';
  else if (b.pages.length > a.pages.length) r = `Seite „${b.pages.find(p => !a.pages.some(x => x.id === p.id))?.name ?? ''}“ hinzugefügt`;
  else if (b.pages.length < a.pages.length) r = `Seite „${a.pages.find(p => !b.pages.some(x => x.id === p.id))?.name ?? ''}“ gelöscht`;
  else {
    for (const pb of b.pages) {
      const pa = a.pages.find(p => p.id === pb.id);
      if (!pa || pa === pb) continue;
      if (pa.name !== pb.name) { r = `Seite in „${pb.name}“ umbenannt`; break; }
      if (pa.background !== pb.background) { r = 'Hintergrund der Arbeitsfläche geändert'; break; }
      if (pa.seo !== pb.seo) { r = `Suchmaschinen-Angaben von „${pb.name}“ geändert`; break; }
      r = pageChange(pa, pb);
      if (r) break;
    }
    if (!r && a.library !== b.library) r = 'Bibliothek geändert';
    if (!r && a.site !== b.site) r = 'Website-Einstellungen geändert';
    if (!r && a.pages.map(p => p.id).join() !== b.pages.map(p => p.id).join()) r = 'Seiten neu sortiert';
  }
  r ??= 'Änderung';
  cache.set(b, r);
  return r;
}
