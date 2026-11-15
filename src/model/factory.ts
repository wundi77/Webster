import { sanitizeSvg } from './vectorCore';
import type { Breakpoint, Fill, ImageAsset, Layout, Library, PageSeo, SiteSettings, NodeType, Page, Shadow, Stroke, TextStyle, WDocument, WNode } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const TYPE_NAMES: Record<NodeType, string> = {
  board: 'Board', rect: 'Rechteck', ellipse: 'Ellipse', text: 'Text', image: 'Bild', vector: 'Form',
};

export const DEFAULT_FILL: Record<NodeType, string> = {
  board: '#FFFFFF', rect: '#B1B2B5', ellipse: '#B1B2B5', text: '#000000', image: '#B1B2B5', vector: '#1A1A1A',
};

export const BREAKPOINTS: { id: Breakpoint; label: string; width: number | null; max: number | null; hint: string }[] = [
  { id: 'desktop', label: 'Desktop', width: null, max: null, hint: 'Grundgestaltung – gilt für alle Bildschirme' },
  { id: 'tablet', label: 'Tablet', width: 768, max: 1024, hint: 'Änderungen gelten für Bildschirme bis 1024 px' },
  { id: 'mobile', label: 'Mobil', width: 390, max: 767, hint: 'Änderungen gelten für Bildschirme bis 767 px' },
];

export const makeFill = (color: string, opacity = 1): Fill => ({ id: uid(), color, opacity, visible: true });

export const makeStroke = (): Stroke => ({
  id: uid(), color: '#000000', opacity: 1, width: 1, position: 'inside', style: 'solid', visible: true,
});

export const makeShadow = (): Shadow => ({
  id: uid(), kind: 'drop', x: 0, y: 4, blur: 8, spread: 0, color: '#000000', opacity: 0.2, visible: true,
});

export const defaultTextStyle = (): TextStyle => ({
  fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0,
  textAlign: 'left', italic: false, decoration: 'none', transform: 'none',
});

export const makeLayout = (type: 'flex' | 'grid', direction: 'row' | 'column' = 'row'): Layout => ({
  type, direction, wrap: false, gap: 16, rowGap: 16, padding: [16, 16, 16, 16],
  justify: 'start', align: type === 'grid' ? 'stretch' : 'start', justifyItems: 'stretch',
  columns: [{ unit: 'fr', value: 1 }, { unit: 'fr', value: 1 }],
  rows: [],
});

export function createNode(type: NodeType, init: Partial<WNode> = {}): WNode {
  const node: WNode = {
    id: uid(), type, name: TYPE_NAMES[type], parentId: null, children: [],
    x: 0, y: 0, w: 100, h: 100, sizingH: 'fixed', sizingV: 'fixed',
    minW: null, maxW: null, minH: null, maxH: null,
    rotation: 0, opacity: 1, blendMode: 'normal',
    visible: true, locked: false, radius: 0, radii: null,
    fills: type === 'image' ? [] : [makeFill(DEFAULT_FILL[type])],
    strokes: [], shadows: [], blur: 0, clip: type === 'board',
    layout: null, absolute: false, alignSelf: 'auto', grid: null, site: false,
  };
  if (type === 'text') { node.text = ''; node.textStyle = defaultTextStyle(); node.sizingH = 'auto'; node.sizingV = 'auto'; }
  if (type === 'image') node.objectFit = 'cover';
  return { ...node, ...init };
}

export function createPage(name: string): Page {
  return { id: uid(), name, background: '#E8E9EA', rootIds: [], nodes: {} };
}

export const defaultSite = (): SiteSettings => ({ name: '', lang: 'de', url: '', favicon: null, selfHostFonts: true });
export const defaultSeo = (): PageSeo => ({ title: '', description: '', ogImage: null });

export const emptyLibrary = (): Library => ({ colors: [], gradients: [], textStyles: [], images: [], videos: [] });

export function createDocument(): WDocument {
  const page = createPage('Seite 1');
  const board = createNode('board', { name: 'Desktop', w: 1440, h: 1024, site: true });
  page.nodes[board.id] = board;
  page.rootIds.push(board.id);
  return { version: 1, name: 'Unbenannt', pages: [page], library: emptyLibrary() };
}

/** Bringt ältere Dokumente auf den aktuellen Stand */
export function migrateDocument(doc: WDocument): WDocument {
  const fresh = createNode('rect');
  doc.library ??= emptyLibrary();
  for (const k of ['colors', 'gradients', 'textStyles', 'images', 'videos'] as const) doc.library[k] ??= [];
  doc.site = { ...defaultSite(), ...(doc.site ?? {}) };
  for (const p of doc.pages) p.seo = { ...defaultSeo(), ...(p.seo ?? {}) };
  for (const page of doc.pages) {
    for (const n of Object.values(page.nodes)) {
      for (const k of ['sizingH', 'sizingV', 'minW', 'maxW', 'minH', 'maxH', 'layout', 'absolute', 'alignSelf', 'grid', 'site'] as const) {
        if (n[k] === undefined) (n as unknown as Record<string, unknown>)[k] = fresh[k];
      }
      // Eingebettete Bilder in die Bibliothek verschieben (spart Speicher bei Mehrfachverwendung)
      if (n.type === 'image' && n.src && !n.imageRef) {
        n.imageRef = findOrAddImage(doc.library, n.src, n.name, n.w, n.h);
        delete n.src;
      }
      // Grafiken aus geöffneten Dateien erneut bereinigen (keine Skripte o. Ä. einschleusen)
      if (n.vector?.markup && typeof DOMParser !== 'undefined') {
        const r = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${n.vector.markup}</svg>`);
        n.vector.markup = r?.markup ?? '';
      }
      const ts = n.textStyle as (TextStyle & { growType?: string }) | undefined;
      if (ts && ts.growType) {
        n.sizingH = ts.growType === 'auto-width' ? 'auto' : 'fixed';
        n.sizingV = ts.growType === 'fixed' ? 'fixed' : 'auto';
        delete ts.growType;
      }
    }
    if (page.rootIds.length && !page.rootIds.some(id => page.nodes[id]?.site)) {
      const first = page.nodes[page.rootIds[0]];
      if (first?.type === 'board') first.site = true;
    }
  }
  return doc;
}

export const BOARD_PRESETS: { group: string; items: [string, number, number][] }[] = [
  { group: 'Desktop', items: [['Desktop', 1440, 1024], ['Desktop HD', 1920, 1080], ['Laptop', 1280, 800], ['MacBook Air', 1280, 832]] },
  { group: 'Tablet', items: [['iPad', 768, 1024], ['iPad Pro 11"', 834, 1194], ['iPad Pro 12,9"', 1024, 1366]] },
  { group: 'Smartphone', items: [['iPhone 15/16', 393, 852], ['iPhone Pro Max', 430, 932], ['iPhone SE', 375, 667], ['Android klein', 360, 800], ['Android groß', 412, 915]] },
  { group: 'Social & Sonstiges', items: [['Instagram-Beitrag', 1080, 1080], ['Instagram-Story', 1080, 1920], ['Open-Graph-Bild', 1200, 630], ['Favicon', 32, 32]] },
];

/** Sucht ein gleiches Bild in der Bibliothek oder legt es an; gibt die ID zurück */
export function findOrAddImage(lib: Library, src: string, name: string, w: number, h: number): string {
  const found = lib.images.find(i => i.src.length === src.length && i.src === src);
  if (found) return found.id;
  const asset: ImageAsset = { id: uid(), name, src, w, h };
  lib.images.push(asset);
  return asset.id;
}
