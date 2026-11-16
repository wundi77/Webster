// Eigene Kopfzeile und Fußzeile: Eine selbst gebaute Komponente wird zur Kopf- oder Fußzeile erklärt
// und lässt sich auf allen Seiten einsetzen (ersetzt dabei eine vorhandene Kopf- bzw. Fußzeile).
import type { Page, WDocument, WNode } from './types';
import { createNode } from './factory';
import { allPages } from './pageRules';
import { cloneFromMain, isInstanceRoot, removeSubtree } from './components';
import { createComponent } from './library';
import { isFooter, isHeader } from './css';
import { defaultNav, placeTop } from './nav';
import { placeBottom } from './legal';
import { siteRoot } from '../export/html';
import { resolveNode } from './resolve';
import { useEditor } from '../store';

export type Role = 'header' | 'footer';
const S = () => useEditor.getState();

export const ROLE_NAMES: Record<Role, string> = { header: 'Kopfzeile', footer: 'Fußzeile' };

const mainOf = (doc: WDocument, id: string): { page: Page; node: WNode } | null => {
  for (const p of allPages(doc)) if (p.nodes[id]?.isMain) return { page: p, node: p.nodes[id] };
  return null;
};

const isRole = (n: WNode | undefined, role: Role) => (role === 'header' ? isHeader(n) : isFooter(n));

/** Legt fest, ob die Komponente die Kopfzeile, die Fußzeile oder nichts davon ist */
export function setRole(componentId: string, role: Role | null) {
  S().mutate((_, d) => {
    for (const p of allPages(d)) for (const id in p.nodes) {
      const n = p.nodes[id];
      if (id === componentId) {
        n.role = role;
        if (role === 'header') n.nav = { ...defaultNav(), ...n.nav };
        else if (n.nav) n.nav = null;
        if (role !== 'header') for (const c of Object.values(p.nodes)) if (c.navLinks && insideOf(p, c.id, componentId)) c.navLinks = false;
      } else if (role && n.isMain && n.role === role) n.role = null; // nur eine Kopf- bzw. Fußzeile
    }
  }, { key: 'role' });
}

function insideOf(p: Page, id: string, ancestor: string): boolean {
  for (let n = p.nodes[id]; n; n = p.nodes[n.parentId ?? '']) if (n.id === ancestor) return true;
  return false;
}

/** Wie viele Seiten haben die Komponente schon bzw. noch nicht? */
export function regionStatus(doc: WDocument, componentId: string) {
  const pages = doc.pages.filter(p => siteRoot(p));
  const has = pages.filter(p => Object.values(p.nodes).some(n => n.componentId === componentId && isInstanceRoot(n)));
  return { total: pages.length, has: has.length, missing: pages.filter(p => !has.includes(p)) };
}

/**
 * Setzt die Komponente auf allen Seiten ein: als Kopfzeile oben, als Fußzeile unten.
 * Eine andere Kopf- bzw. Fußzeile auf der Seite wird dabei ersetzt (nie zwei übereinander).
 */
export function placeEverywhere(componentId: string): { placed: number; replaced: number } {
  const res = { placed: 0, replaced: 0 };
  const m = mainOf(S().doc, componentId);
  const role = m?.node.role;
  if (!m || !role) return res;
  S().mutate((_, d) => {
    const pm = allPages(d).find(p => p.id === m.page.id)!;
    const main = pm.nodes[componentId];
    for (const pg of d.pages) {
      const root = siteRoot(pg);
      if (!root) continue;
      const r = pg.nodes[root.id];
      const mine = (c: string) => pg.nodes[c]?.componentId === componentId;
      if (Object.values(pg.nodes).some(n => n.componentId === componentId && isInstanceRoot(n))) {
        // Schon da: eine zweite (andere) Kopf- bzw. Fußzeile daneben entfernen
        for (const c of [...r.children]) if (!mine(c) && isRole(pg.nodes[c], role)) { r.children.splice(r.children.indexOf(c), 1); removeSubtree(pg, c); res.replaced++; }
        // Im Layout an den richtigen Platz rücken: Kopfzeile ganz oben, Fußzeile ganz unten
        const own = r.children.find(mine);
        if (own && r.layout && !pg.nodes[own].absolute) {
          r.children.splice(r.children.indexOf(own), 1);
          if (role === 'header') r.children.unshift(own);
          else { const absAt = r.children.findIndex(c => pg.nodes[c]?.absolute); r.children.splice(absAt < 0 ? r.children.length : absAt, 0, own); }
          const n = pg.nodes[own]; n.sizingH = 'fill'; n.sizingV = 'auto';
          n.touched = [...new Set([...(n.touched ?? []), 'sizingH', 'sizingV'])];
        }
        continue;
      }
      const id = cloneFromMain(pg, pm, componentId, null, true);
      const inst = pg.nodes[id];
      const oldId = r.children.find(c => c !== id && !mine(c) && isRole(pg.nodes[c], role));
      if (oldId) {
        const old = pg.nodes[oldId];
        const idx = r.children.indexOf(oldId);
        inst.parentId = r.id;
        inst.absolute = old.absolute; inst.alignSelf = old.alignSelf; inst.grid = old.grid;
        if (r.layout && !old.absolute) { inst.sizingH = 'fill'; inst.sizingV = 'auto'; }
        else {
          // Ohne Layout: an die Stelle der alten, Höhe der neuen; Inhalt darunter rückt um den Unterschied
          inst.sizingH = 'fixed'; inst.sizingV = 'fixed'; inst.h = main.h;
          for (const bp of ['desktop', 'tablet', 'mobile'] as const) {
            const o = resolveNode(old, bp);
            const delta = main.h - o.h;
            if (bp === 'desktop') { inst.x = o.x; inst.y = o.y; inst.w = o.w; }
            else { inst.overrides ??= {}; inst.overrides[bp] = { ...inst.overrides[bp], x: o.x, y: o.y, w: o.w }; }
            if (!delta || bp !== 'desktop') continue;
            if (role === 'header') for (const c of r.children) {
              const n = pg.nodes[c];
              if (n && c !== oldId && n.y >= o.y + o.h - 1) n.y += delta;
            }
            r.h = Math.max(1, r.h + delta);
          }
        }
        removeSubtree(pg, oldId);
        r.children.splice(idx, 1, id);
        res.replaced++;
      } else if (role === 'header') placeTop(pg, inst, main.h);
      else placeBottom(pg, inst, main.h);
      inst.touched = ['sizingH', 'sizingV', 'h', 'absolute', 'w', 'tablet.w', 'mobile.w', 'tablet.x', 'mobile.x', 'tablet.y', 'mobile.y'];
      res.placed++;
    }
  });
  return res;
}

/** Entfernt alle Kopien der Komponente von den Seiten (die Komponente selbst bleibt) */
export function removeEverywhere(componentId: string): number {
  let count = 0;
  S().mutate((_, d) => {
    for (const pg of d.pages) {
      for (const id of Object.keys(pg.nodes)) {
        const n = pg.nodes[id];
        if (!n || n.componentId !== componentId || !isInstanceRoot(n)) continue;
        const arr = n.parentId ? pg.nodes[n.parentId]?.children : pg.rootIds;
        if (arr) arr.splice(arr.indexOf(id), 1);
        removeSubtree(pg, id);
        count++;
      }
    }
  });
  return count;
}

/** Ausgewähltes Board auf einer Seite wird zur Komponente und gleich zur Kopf-/Fußzeile – auf allen Seiten */
export function makeRegion(role: Role) {
  createComponent();
  const s = S();
  const inst = s.doc.pages.find(p => p.id === s.pageId)?.nodes[s.selection[0]];
  const cid = inst?.componentId;
  if (!cid) return null;
  setRole(cid, role);
  return { componentId: cid, ...placeEverywhere(cid) };
}

/** Welches Board der Kopfzeile enthält die Menüpunkte (wird auf kleinen Bildschirmen zum ☰) */
export function setMenuBoard(headerId: string, boardId: string | null) {
  S().mutate(pg => {
    for (const n of Object.values(pg.nodes)) if (n.navLinks && insideOf(pg, n.id, headerId)) n.navLinks = false;
    if (boardId && pg.nodes[boardId]) pg.nodes[boardId].navLinks = true;
  }, { key: 'navLinks' });
}

/** Neuer Menüpunkt: Kopie des letzten Punkts (gleiche Gestaltung), verlinkt auf die nächste noch fehlende Seite */
export function addMenuItem(linksId: string) {
  const s = S();
  const linked = new Set<string>();
  let newId = '';
  s.mutate((pg, d) => {
    const links = pg.nodes[linksId];
    if (!links) return;
    for (const c of links.children) { const l = pg.nodes[c]?.link; if (l?.type === 'page') linked.add(l.pageId); }
    const next = d.pages.find(p => siteRoot(p) && !linked.has(p.id));
    const last = [...links.children].reverse().map(c => pg.nodes[c]).find(n => n?.type === 'text');
    const label = next?.name ?? 'Neuer Menüpunkt';
    const n = createNode('text', {
      ...(last ? { textStyle: last.textStyle, textStyleRef: last.textStyleRef, fills: last.fills, hover: last.hover, hoverDuration: last.hoverDuration, overrides: last.overrides ? JSON.parse(JSON.stringify(last.overrides)) : undefined } : {}),
      name: label, text: label, parentId: linksId,
      link: next ? { type: 'page', pageId: next.id } : null,
      x: links.layout ? 0 : (last ? last.x + last.w + 24 : 0), y: links.layout ? 0 : (last?.y ?? 0),
    });
    pg.nodes[n.id] = n;
    links.children.push(n.id);
    newId = n.id;
  }, { key: 'menu-add' });
  if (newId) S().setSelection([newId]);
}
