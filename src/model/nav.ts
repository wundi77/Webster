// Kopfleiste mit Menü: auf kleinen Bildschirmen wird das Menü zum ☰-Symbol,
// das ein Menü über den ganzen Bildschirm öffnet.
import type { Breakpoint, NavSettings, Page, WDocument, WNode } from './types';
import { BREAKPOINTS, createNode, createPage, defaultTextStyle, makeFill, makeLayout } from './factory';
import { resolveNode } from './resolve';
import { cloneFromMain } from './components';
import { allPages } from './pageRules';
import { siteRoot } from '../export/html';
import { findLegalPage, mainFont } from './legal';
import { useEditor } from '../store';

export const HEADER_NAME = 'Kopfleiste';
export const LINKS_NAME = 'Menü';
const HEAD_H = 80;
const BPS: Breakpoint[] = ['desktop', 'tablet', 'mobile'];

export const defaultNav = (): NavSettings => ({
  collapse: 'mobile', iconColor: '#111111', overlayBg: '#FFFFFF', overlayText: '#111111',
});

/** Ist das Menü in diesem Breakpoint zugeklappt? */
export const navCollapsed = (nav: NavSettings | null | undefined, bp: Breakpoint) =>
  !!nav && (nav.collapse === 'tablet' ? bp !== 'desktop' : nav.collapse === 'mobile' ? bp === 'mobile' : false);

/** Kopfleiste (Ebene mit nav) zu einem Menü-Board */
export function navOwner(page: Page, linksId: string): WNode | undefined {
  let n = page.nodes[page.nodes[linksId]?.parentId ?? ''];
  while (n) { if (n.nav) return n; n = page.nodes[n.parentId ?? '']; }
  return undefined;
}

const findMain = (doc: WDocument) => {
  for (const p of allPages(doc)) for (const id in p.nodes) if (p.nodes[id].isMain && p.nodes[id].nav) return { page: p, node: p.nodes[id] };
  return null;
};

/** Seiten, die ins Menü gehören (ohne Impressum/Datenschutz – die stehen in der Fußzeile) */
function menuPages(doc: WDocument): Page[] {
  const legal = new Set([findLegalPage(doc, 'impressum')?.id, findLegalPage(doc, 'datenschutz')?.id]);
  return doc.pages.filter(p => siteRoot(p) && !legal.has(p.id));
}

const hasHeader = (pg: Page) => Object.values(pg.nodes).some(n => n.nav);

function linkText(pg: Page, parent: WNode, font: string, label: string, pageId: string, size = 16, weight = 500) {
  const n = createNode('text', {
    name: label, text: label, parentId: parent.id, link: { type: 'page', pageId },
    fills: [makeFill('#222222')],
    textStyle: { ...defaultTextStyle(), fontFamily: font, fontSize: size, fontWeight: weight },
    hover: { opacity: 0.6 }, hoverDuration: 150,
  });
  pg.nodes[n.id] = n;
  parent.children.push(n.id);
  return n;
}

/** Kopfleiste oben in das Webseiten-Board einer Seite setzen */
function placeTop(pg: Page, head: WNode) {
  const r = pg.nodes[siteRoot(pg)!.id];
  head.parentId = r.id;
  if (r.layout) {
    r.children.unshift(head.id);
    head.absolute = false; head.sizingH = 'fill'; head.sizingV = 'auto';
    return;
  }
  // Ohne Layout: Inhalt nach unten schieben, Kopfleiste in voller Breite oben
  for (const c of r.children) {
    const n = pg.nodes[c];
    if (!n) continue;
    n.y += HEAD_H;
    for (const bp of ['tablet', 'mobile'] as const) if (n.overrides?.[bp]?.y !== undefined) (n.overrides[bp] as { y: number }).y += HEAD_H;
  }
  r.children.unshift(head.id);
  head.sizingV = 'fixed'; head.h = HEAD_H; head.sizingH = 'fixed';
  for (const bp of BPS) {
    const rb = resolveNode(r, bp);
    if (bp === 'desktop') { head.x = 0; head.y = 0; head.w = rb.w; }
    else {
      head.overrides ??= {};
      head.overrides[bp] = { ...head.overrides[bp], x: 0, y: 0, w: BREAKPOINTS.find(b => b.id === bp)!.width ?? rb.w };
    }
  }
  r.h += HEAD_H;
  for (const bp of ['tablet', 'mobile'] as const) if (r.overrides?.[bp]?.h !== undefined) r.overrides[bp]!.h = (r.overrides[bp]!.h as number) + HEAD_H;
}

/**
 * Legt die Kopfleiste an (Original auf der ersten Seite, Kopien auf allen anderen)
 * bzw. ergänzt fehlende Seiten im Menü und auf Seiten ohne Kopfleiste.
 * Gibt zurück, wie viele Seiten bzw. Menüpunkte neu dazukamen.
 */
export function insertHeader(): { pages: number; links: number } {
  const s = useEditor.getState();
  const doc = s.doc;
  const pages = menuPages(doc);
  if (!pages.length) return { pages: 0, links: 0 };
  const font = mainFont(doc);
  const existing = findMain(doc);
  const res = { pages: 0, links: 0 };

  s.mutate((_, d) => {
    let pm: Page | undefined, mainId: string | undefined;
    if (existing) {
      pm = allPages(d).find(p => p.id === existing.page.id)!;
      mainId = existing.node.id;
      // Menüpunkte abgleichen: fehlende Seiten ergänzen, gelöschte entfernen
      const main = pm.nodes[mainId];
      const linksId = Object.values(pm.nodes).find(n => n.navLinks && navOwner(pm!, n.id)?.id === mainId)?.id;
      const links = linksId ? pm.nodes[linksId] : undefined;
      if (links && main) {
        const ids = new Set(d.pages.map(p => p.id));
        for (const c of [...links.children]) {
          const n = pm.nodes[c];
          if (n?.link?.type === 'page' && !ids.has(n.link.pageId)) {
            links.children = links.children.filter(x => x !== c);
            delete pm.nodes[c];
          }
        }
        const linked = new Set(links.children.map(c => pm!.nodes[c]?.link).filter(l => l?.type === 'page').map(l => (l as { pageId: string }).pageId));
        for (const p of menuPages(d)) if (!linked.has(p.id)) { linkText(pm, links, font, p.name, p.id); res.links++; }
      }
    } else {
      // Das Original bekommt ein eigenes Komponenten-Board, alle Seiten erhalten verknüpfte Kopien
      const first = createPage(HEADER_NAME);
      const head = createNode('board', {
        name: HEADER_NAME, isMain: true, w: 1440, h: HEAD_H, sizingV: 'auto', clip: false,
        fills: [makeFill('#FFFFFF')],
        layout: { ...makeLayout('flex', 'row'), gap: 24, padding: [20, 120, 20, 120], justify: 'space-between', align: 'center' },
        nav: defaultNav(),
      });
      head.overrides = { mobile: { layout: { ...head.layout!, padding: [16, 20, 16, 20] } } };
      first.nodes[head.id] = head;
      const logo = createNode('text', {
        name: 'Logo', text: d.site?.name || d.name, parentId: head.id, link: { type: 'page', pageId: d.pages[0].id },
        fills: [makeFill('#111111')],
        textStyle: { ...defaultTextStyle(), fontFamily: font, fontSize: 22, fontWeight: 700 },
      });
      first.nodes[logo.id] = logo;
      head.children.push(logo.id);
      const links = createNode('board', {
        name: LINKS_NAME, parentId: head.id, sizingH: 'auto', sizingV: 'auto', fills: [], clip: false, navLinks: true,
        layout: { ...makeLayout('flex', 'row'), gap: 32, padding: [0, 0, 0, 0], align: 'center' },
      });
      first.nodes[links.id] = links;
      head.children.push(links.id);
      for (const p of pages) { linkText(first, links, font, p.name, p.id); res.links++; }
      head.x = 0; head.y = 0; head.sizingH = 'fixed';
      first.rootIds = [head.id];
      (d.componentPages ??= []).push(first);
      pm = first; mainId = head.id;
    }
    // Kopien auf allen Seiten ohne Kopfleiste
    for (const pg of d.pages) {
      if (!siteRoot(pg) || hasHeader(pg)) continue;
      const id = cloneFromMain(pg, pm!, mainId!, null, true);
      const inst = pg.nodes[id];
      placeTop(pg, inst);
      inst.touched = ['sizingH', 'sizingV', 'h', 'absolute', 'w', 'tablet.w', 'mobile.w'];
      res.pages++;
    }
  });
  return res;
}

/** Gibt es schon eine Kopfleiste? */
export const hasNavHeader = (doc: WDocument) => !!findMain(doc) || doc.pages.some(hasHeader);
