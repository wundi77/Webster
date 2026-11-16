// Überschriften-Hierarchie (H1–H4) für Suchmaschinen: welche HTML-Art ein Text beim Export bekommt
import type { Page, TextStyleAsset, TextTag, WDocument, WNode } from './types';

export const TEXT_TAGS: { value: TextTag; label: string; hint: string }[] = [
  { value: 'h1', label: 'Überschrift 1 (H1)', hint: 'Hauptüberschrift – genau einmal pro Seite' },
  { value: 'h2', label: 'Überschrift 2 (H2)', hint: 'Abschnitts-Überschrift' },
  { value: 'h3', label: 'Überschrift 3 (H3)', hint: 'Unter-Überschrift' },
  { value: 'h4', label: 'Überschrift 4 (H4)', hint: 'Kleine Überschrift' },
  { value: 'p', label: 'Absatz (P)', hint: 'Fließtext' },
  { value: 'div', label: 'Normaler Text', hint: 'Ohne besondere Bedeutung, z. B. Beschriftungen' },
];

/** Art aus dem Textstil: fest eingestellt oder am Namen erkannt („Überschrift 2“, „Headline 1“, „H3“ …) */
export function styleTag(s: TextStyleAsset | undefined): TextTag | undefined {
  if (!s) return undefined;
  if (s.tag) return s.tag;
  const m = s.name.match(/(?:^|[\s(_-])(?:überschrift|headline|heading|h)\s*([1-4])(?![0-9])/i);
  if (m) return ('h' + m[1]) as TextTag;
  if (/(?:^|\s)(?:fließtext|fliesstext|absatz|body|paragraph)(?:$|\s)/i.test(s.name)) return 'p';
  return undefined;
}

/** Art eines Textes beim Export (null = kein Text) */
export function textTagOf(doc: WDocument, n: WNode): TextTag | null {
  if (n.type !== 'text') return null;
  if (n.textTag) return n.textTag;
  const s = n.textStyleRef ? doc.library.textStyles.find(t => t.id === n.textStyleRef) : undefined;
  return styleTag(s) ?? 'div';
}

/** Sichtbare Texte einer Seite mit dieser Art */
export function textsWithTag(doc: WDocument, page: Page, tag: TextTag): WNode[] {
  const hidden = (n: WNode | undefined): boolean => { for (let c = n; c; c = c.parentId ? page.nodes[c.parentId] : undefined) if (!c.visible) return true; return false; };
  return Object.values(page.nodes).filter(n => n.type === 'text' && textTagOf(doc, n) === tag && !hidden(n));
}
