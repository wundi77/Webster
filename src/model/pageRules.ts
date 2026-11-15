// Feste Regeln für Seiten: Jede Seite hat genau ein Board (Webseiten-Board bzw. Komponenten-Board).
// Es lässt sich in der Größe ändern, aber nicht verschieben, verdoppeln, löschen oder einschachteln.
// Alles, was außerhalb landet (Zeichnen daneben, Einfügen, Herausziehen …), wandert hinein.
import type { Page, WDocument, WNode } from './types';
import { isFooter } from './css';

/** Alle Seiten inkl. der Komponenten-Seiten (zum Suchen per id) */
export const allPages = (d: WDocument): Page[] =>
  (d.componentPages?.length || d.templatePages?.length ? [...d.pages, ...(d.templatePages ?? []), ...(d.componentPages ?? [])] : d.pages);

/** Das feste Board einer Seite */
export function pageBoard(page: Page): WNode | undefined {
  const roots = page.rootIds.map(id => page.nodes[id]).filter(Boolean);
  return roots.find(n => n.site && n.type === 'board') ?? roots.find(n => n.type === 'board');
}

export const isPageBoard = (page: Page, id: string): boolean => pageBoard(page)?.id === id;

/**
 * Prüft nach einer Änderung (auf dem Entwurf) die Regeln und repariert, was sich reparieren lässt.
 * Gibt false zurück, wenn die Änderung verworfen werden muss (Board gelöscht oder eingeschachtelt).
 */
export function enforcePageRules(prev: WDocument, draft: WDocument): boolean {
  const prevAll = allPages(prev);
  for (const page of allPages(draft)) {
    const before = prevAll.find(p => p.id === page.id);
    const oldBoard = before ? pageBoard(before) : undefined;
    if (oldBoard) {
      const now = page.nodes[oldBoard.id];
      if (!now) return false; // Board gelöscht → nicht erlaubt
      if (now.parentId || !page.rootIds.includes(now.id)) {
        // Einzige erlaubte Ausnahme: Komponente bekommt Varianten – ihr Board liegt dann im Varianten-Rahmen
        const root = page.nodes[page.rootIds[0]];
        if (!(page.rootIds.length === 1 && root?.variantSet && now.parentId === root.id)) return false;
      } else {
        // Position bleibt fest (Größe darf sich ändern)
        if (now.x !== oldBoard.x) now.x = oldBoard.x;
        if (now.y !== oldBoard.y) now.y = oldBoard.y;
        for (const o of Object.values(now.overrides ?? {})) { if (o) { delete o.x; delete o.y; } }
      }
    }
    // Rechteck mit Inhalt oder Layout wird automatisch zum Behälter (Board)
    for (const id in page.nodes) {
      const n = page.nodes[id];
      if (n.type === 'rect' && (n.children.length > 0 || n.layout)) { n.type = 'board'; n.clip ??= false; }
    }
    const kept = oldBoard && page.nodes[oldBoard.id];
    const board = kept && !kept.parentId ? kept : pageBoard(page);
    if (!board) continue;
    if (!board.site && !page.rootIds.some(id => page.nodes[id]?.site) && page.nodes[board.id]) {
      // ältere Seiten ohne Markierung: das erste Board ist das Webseiten-Board (nur für normale Seiten)
      if (draft.pages.includes(page)) board.site = true;
    }
    // Lose Ebenen neben dem Board kommen ins Board
    const strays = page.rootIds.filter(id => id !== board.id);
    if (!strays.length) continue;
    page.rootIds = [board.id];
    for (const id of strays) {
      const n = page.nodes[id];
      if (!n) continue;
      n.parentId = board.id;
      n.x = Math.round(n.x - board.x);
      n.y = Math.round(n.y - board.y);
      // vor einer Fußzeile einordnen, damit sie unten bleibt
      const fi = board.children.findIndex(c => isFooter(page.nodes[c]));
      if (fi >= 0) board.children.splice(fi, 0, id); else board.children.push(id);
    }
  }
  return true;
}
