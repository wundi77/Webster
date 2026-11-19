// Seiten-Check: Kontrast, Bildbeschreibungen, große Bilder, leere Links
import type { Fill, Page, WDocument, WNode } from './types';
import { siteRoot } from '../export/html';
import { colorAt } from './gradient';

export interface Finding { kind: 'contrast' | 'alt' | 'big' | 'link'; page: Page; nodeId: string; text: string }

const hex = (h: string): [number, number, number] => { const s = h.replace('#', ''); const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s.slice(0, 6); return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0) as [number, number, number]; };
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a: [number, number, number], b: [number, number, number]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixRgb = (fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] => [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a))) as [number, number, number];

/** Farbe einer Füllung (Verlauf: Mitte) */
function paintOf(f: Fill): { rgb: [number, number, number]; a: number } | null {
  if (!f.visible || f.kind === 'video' || f.kind === 'glass') return null;
  if (f.gradient) { const c = colorAt(f.gradient, 0.5); return { rgb: hex(c.color), a: c.opacity * f.opacity }; }
  return { rgb: hex(f.color), a: f.opacity };
}

/** Hintergrund hinter einer Ebene: Füllungen der Eltern von außen nach innen übereinander */
function backdrop(page: Page, n: WNode): [number, number, number] {
  const chain: WNode[] = [];
  for (let p = n.parentId ? page.nodes[n.parentId] : undefined; p; p = p.parentId ? page.nodes[p.parentId] : undefined) chain.unshift(p);
  let bg: [number, number, number] = [255, 255, 255];
  for (const p of chain) for (const f of p.fills) { const c = paintOf(f); if (c) bg = mixRgb(c.rgb, bg, c.a * p.opacity); }
  return bg;
}

const DEFAULT_NAMES = /^(Bild|Foto|Image|IMG[_ -]?\d*|DSC\S*|Bild \d+|Foto \d+|Screenshot.*|.*\.(jpe?g|png|webp|gif|svg))$/i;
const BIG = 600 * 1024;

export function checkPages(doc: WDocument): Finding[] {
  const out: Finding[] = [];
  const imgBytes = new Map(doc.library.images.map(i => [i.id, i.src.startsWith('data:') ? Math.round(i.src.length * 0.75) : 0]));
  const seenBig = new Set<string>();
  for (const page of doc.pages) {
    const root = siteRoot(page);
    if (!root) continue;
    const inSite = (n: WNode) => { for (let p: WNode | undefined = n; p; p = p.parentId ? page.nodes[p.parentId] : undefined) { if (p.id === root.id) return true; if (!p.visible) return false; } return false; };
    for (const id in page.nodes) {
      const n = page.nodes[id];
      if (!inSite(n)) continue;
      // Kontrast
      if (n.type === 'text' && (n.text ?? '').trim()) {
        const f = n.fills.find(x => x.visible);
        const size = n.textStyle?.fontSize ?? 16, bold = (n.textStyle?.fontWeight ?? 400) >= 700;
        // große Schrift und reine Zeichen (★, +, „) brauchen weniger Kontrast
        const symbol = !/[\p{L}\p{N}]/u.test(n.text ?? '');
        const need = symbol || size >= 24 || (size >= 18.5 && bold) ? 3 : 4.5;
        const c = f && paintOf(f);
        if (c) {
          const bg = backdrop(page, n);
          const fg = mixRgb(c.rgb, bg, c.a * n.opacity);
          const r = contrast(fg, bg);
          if (r < need) out.push({ kind: 'contrast', page, nodeId: id, text: `„${(n.text ?? '').trim().slice(0, 40)}“: Kontrast ${r.toFixed(1).replace('.', ',')} : 1, nötig ${String(need).replace('.', ',')} : 1` });
        }
      }
      // Bilder
      if (n.type === 'image' && (n.imageRef || n.src)) {
        if (n.alt === undefined && DEFAULT_NAMES.test(n.name.trim())) out.push({ kind: 'alt', page, nodeId: id, text: `Bild „${n.name}“ hat keine Beschreibung` });
        const bytes = n.imageRef ? imgBytes.get(n.imageRef) ?? 0 : n.src?.startsWith('data:') ? Math.round(n.src.length * 0.75) : 0;
        const key = n.imageRef ?? id;
        if (bytes > BIG && !seenBig.has(key)) { seenBig.add(key); out.push({ kind: 'big', page, nodeId: id, text: `Bild „${n.name}“ ist ${(bytes / 1048576).toFixed(1).replace('.', ',')} MB groß – lädt auf dem Handy langsam` }); }
      }
      // Links
      const L = n.link;
      if (L) {
        const bad = L.type === 'url' ? !L.url.trim() : L.type === 'email' ? !L.email.trim()
          : L.type === 'page' ? !doc.pages.some(p => p.id === L.pageId)
          : !L.nodeId || !page.nodes[L.nodeId] || (L.type === 'popup' && !page.nodes[L.nodeId].popup);
        if (bad) out.push({ kind: 'link', page, nodeId: id, text: `„${n.name}“: Link ohne Ziel` });
      }
    }
  }
  return out;
}
