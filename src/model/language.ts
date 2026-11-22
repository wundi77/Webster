// Zweite Sprache im Editor: einschalten, Sprachumschalter einsetzen, Übersetzungen speichern
import { useEditor } from '../store';
import type { Page, WDocument, WNode } from './types';
import { createNode, defaultTextStyle, makeFill } from './factory';
import { allPages } from './pageRules';
import { placeNew } from './embed';
import { secondLang } from './i18n';

const S = () => useEditor.getState();

export function setSecondLang(code: string | null) {
  S().mutate((_, d) => {
    d.site = { ...(d.site ?? { name: '', lang: 'de', url: '', favicon: null, selfHostFonts: true }), lang2: code };
  }, { key: 'lang2', system: true });
  if (!code) S().setLang(null);
}

/** Übersetzung eines Textes speichern (leer = entfernen) */
export function setTranslation(pageId: string, nodeId: string, lang: string, text: string) {
  S().mutate((_, d) => {
    const n = allPages(d).find(p => p.id === pageId)?.nodes[nodeId];
    if (!n) return;
    const tr = { ...n.tr };
    if (text.trim()) tr[lang] = text; else delete tr[lang];
    n.tr = Object.keys(tr).length ? tr : undefined;
  }, { key: `tr-${nodeId}` });
}

export function setPageTranslation(pageId: string, lang: string, patch: { name?: string; title?: string; description?: string }) {
  S().mutate((_, d) => {
    const p = d.pages.find(x => x.id === pageId);
    if (!p) return;
    p.tr = { ...p.tr, [lang]: { ...p.tr?.[lang], ...patch } };
  }, { key: `trp-${pageId}-${Object.keys(patch).join()}`, system: true });
}

export function setAltTranslation(nodeId: string, lang: string, alt: string) {
  S().mutate(pg => {
    const n = pg.nodes[nodeId];
    if (!n) return;
    const a = { ...n.altTr };
    if (alt.trim()) a[lang] = alt; else delete a[lang];
    n.altTr = Object.keys(a).length ? a : undefined;
  }, { key: `alt-tr-${nodeId}` });
}

/** Gibt es schon einen Sprachumschalter? */
export const hasLangSwitch = (doc: WDocument) => allPages(doc).some(p => Object.values(p.nodes).some(n => n.langSwitch));

/** Menü-Board der Kopfzeile (im Original der Komponente, falls es eine ist) */
function navLinksBoard(doc: WDocument): { page: Page; node: WNode } | null {
  for (const p of [...(doc.componentPages ?? []), ...doc.pages]) {
    const n = Object.values(p.nodes).find(x => x.navLinks && (!x.componentId || x.isMain || x.mainId === undefined));
    if (n) return { page: p, node: n };
  }
  return null;
}

/**
 * Sprachumschalter einsetzen: als letzter Menüpunkt in der Kopfzeile (wie die anderen Menüpunkte gestaltet),
 * ohne Kopfzeile ins ausgewählte Board bzw. auf die Seite. Zeigt das Kürzel der anderen Sprache („EN“).
 */
export function insertLangSwitch(): boolean {
  const s = S();
  const l2 = secondLang(s.doc);
  if (!l2) return false;
  const nav = navLinksBoard(s.doc);
  let made: string | null = null;
  s.mutate((pg, d) => {
    const label = l2.toUpperCase();
    if (nav) {
      const target = [...d.pages, ...(d.componentPages ?? [])].find(p => p.id === nav.page.id);
      const box = target?.nodes[nav.node.id];
      if (!target || !box) return;
      // Gestaltung vom letzten Menüpunkt übernehmen
      const findText = (id: string): WNode | undefined => { const k = target.nodes[id]; if (!k) return; if (k.type === 'text') return k; for (const c of [...k.children].reverse()) { const t = findText(c); if (t) return t; } };
      const like = [...box.children].reverse().map(findText).find(Boolean);
      const t = createNode('text', {
        name: 'Sprachumschalter', text: label, langSwitch: true, sizingH: 'auto', sizingV: 'auto',
        textStyle: { ...(like?.textStyle ?? defaultTextStyle()), fontWeight: 600 }, fills: like?.fills ? JSON.parse(JSON.stringify(like.fills)) : [makeFill('#111111')],
        hover: { opacity: 0.7 }, hoverDuration: 150,
      });
      target.nodes[t.id] = t; t.parentId = box.id; box.children.push(t.id);
      made = target.id === pg.id ? t.id : null;
      return;
    }
    const t = createNode('text', { name: 'Sprachumschalter', text: label, langSwitch: true, sizingH: 'auto', sizingV: 'auto', textStyle: { ...defaultTextStyle(), fontSize: 16, fontWeight: 600 }, fills: [makeFill('#111111')] });
    if (placeNew(pg, t, s.selection)) made = t.id;
  }, { key: 'lang-switch' });
  if (made) s.setSelection([made]);
  return true;
}

