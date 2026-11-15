// Komponenten: Ein Original (Hauptkomponente, isMain) und beliebig viele Kopien (Instanzen).
// Jede Ebene einer Kopie kennt ihr Gegenstück im Original (mainId). Ändert sich das Original,
// werden alle Kopien nachgezogen – außer den Eigenschaften, die in der Kopie bewusst geändert wurden (touched).
import { produce } from 'immer';
import type { Page, WDocument, WNode } from './types';
import { uid } from './factory';
import { allPages } from './pageRules';

type Bp = 'tablet' | 'mobile';
const BPS: Bp[] = ['tablet', 'mobile'];

/** Werden nie vom Original übernommen */
const NOSYNC = new Set(['id', 'guides', 'variantSet', 'variantName', 'vkey', 'parentId', 'children', 'mainId', 'componentId', 'isMain', 'touched', 'locked', 'overrides']);
/** Gehören bei der obersten Ebene einer Kopie zur Kopie selbst (Platzierung) */
const ROOT_OWN = new Set(['x', 'y', 'absolute', 'alignSelf', 'grid', 'site']);

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
type Rec = Record<string, unknown>;

export const isInstanceRoot = (n: WNode | undefined) => !!n && !!n.componentId && n.mainId === n.componentId && !n.isMain;

/** Welche Eigenschaften unterscheiden sich (inkl. Breakpoint-Abweichungen als "mobile.w")? */
function diffKeys(a: WNode, b: WNode): string[] {
  const out: string[] = [];
  const A = a as unknown as Rec, B = b as unknown as Rec;
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (NOSYNC.has(k)) continue;
    if (!same(A[k], B[k])) out.push(k);
  }
  for (const bp of BPS) {
    const oa = (a.overrides?.[bp] ?? {}) as Rec, ob = (b.overrides?.[bp] ?? {}) as Rec;
    for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) if (!same(oa[k], ob[k])) out.push(`${bp}.${k}`);
  }
  return out;
}

/** Merkt sich Änderungen, die direkt an Kopien vorgenommen wurden */
function markTouched(prev: WDocument, next: WDocument): WDocument {
  return produce(next, d => {
    const prevAll = allPages(prev), draftAll = allPages(d);
    allPages(next).forEach((pn, i) => {
      const pp = prevAll.find(p => p.id === pn.id);
      if (!pp || pp === pn) return;
      for (const id in pn.nodes) {
        const n = pn.nodes[id], o = pp.nodes[id];
        if (!o || o === n || !n.mainId) continue;
        const keys = diffKeys(o, n);
        if (!keys.length) continue;
        const t = new Set(n.touched ?? []);
        const before = t.size;
        keys.forEach(k => t.add(k));
        if (t.size !== before) draftAll[i].nodes[id].touched = [...t];
      }
    });
  });
}

function subtreeChanged(pa: Page | undefined, pb: Page, id: string): boolean {
  const n = pb.nodes[id];
  if (!n) return false;
  if (!pa || pa.nodes[id] !== n) return true;
  return n.children.some(c => subtreeChanged(pa, pb, c));
}

/** Hauptkomponenten, deren Inhalt sich zwischen a und b geändert hat */
function changedMains(a: WDocument, b: WDocument): string[] {
  const out: string[] = [];
  const aAll = allPages(a);
  for (const pb of allPages(b)) {
    const pa = aAll.find(p => p.id === pb.id);
    if (pa === pb) continue;
    for (const id in pb.nodes) if (pb.nodes[id].isMain && subtreeChanged(pa, pb, id)) out.push(id);
  }
  return out;
}

/** Kopiert einen Teilbaum des Originals als Kopie in die Seite `pg` */
export function cloneFromMain(pg: Page, pm: Page, mId: string, parentId: string | null, root: boolean): string {
  const m = pm.nodes[mId];
  const id = uid();
  const copy = clone(m) as WNode;
  delete copy.isMain;
  delete copy.componentId;
  delete copy.variantName; delete copy.variantSet; delete copy.vkey;
  // Kopie einer Variante heißt wie die Komponente (der Varianten-Rahmen)
  if (root && m.variantName && m.parentId && pm.nodes[m.parentId]?.variantSet) copy.name = pm.nodes[m.parentId].name;
  copy.id = id;
  copy.parentId = parentId;
  copy.mainId = mId;
  copy.touched = [];
  if (root) copy.componentId = mId;
  pg.nodes[id] = copy;
  copy.children = m.children.filter(c => pm.nodes[c]).map(c => cloneFromMain(pg, pm, c, id, false));
  return id;
}

function removeSubtree(pg: Page, id: string) {
  const n = pg.nodes[id];
  if (!n) return;
  n.children.forEach(c => removeSubtree(pg, c));
  delete pg.nodes[id];
}

function syncNode(pg: Page, iId: string, pm: Page, mId: string, isRoot: boolean) {
  const i = pg.nodes[iId], m = pm.nodes[mId];
  if (!i || !m) return;
  const t = new Set(i.touched ?? []);
  const I = i as unknown as Rec, M = m as unknown as Rec;
  for (const k of new Set([...Object.keys(I), ...Object.keys(M)])) {
    if (NOSYNC.has(k) || t.has(k) || (isRoot && ROOT_OWN.has(k)) || (isRoot && k === 'name' && m.variantName)) continue;
    if (M[k] === undefined) { if (k in I) delete I[k]; }
    else if (!same(I[k], M[k])) I[k] = clone(M[k]);
  }
  // Breakpoint-Abweichungen
  for (const bp of BPS) {
    const mo = (m.overrides?.[bp] ?? {}) as Rec;
    const io = (i.overrides?.[bp] ?? {}) as Rec;
    for (const k of new Set([...Object.keys(mo), ...Object.keys(io)])) {
      if (t.has(`${bp}.${k}`) || (isRoot && ROOT_OWN.has(k))) continue;
      if (mo[k] === undefined) {
        if (k in io) delete (i.overrides![bp] as Rec)[k];
      } else if (!same(io[k], mo[k])) {
        i.overrides ??= {};
        i.overrides[bp] ??= {};
        (i.overrides[bp] as Rec)[k] = clone(mo[k]);
      }
    }
    if (i.overrides?.[bp] && !Object.keys(i.overrides[bp]!).length) delete i.overrides[bp];
  }
  // Kinder in der Reihenfolge des Originals
  const byMain = new Map<string, string>();
  for (const c of i.children) { const mid = pg.nodes[c]?.mainId; if (mid) byMain.set(mid, c); }
  const kids: string[] = [];
  for (const mc of m.children) {
    if (!pm.nodes[mc]) continue;
    const ic = byMain.get(mc);
    if (ic) { syncNode(pg, ic, pm, mc, false); kids.push(ic); byMain.delete(mc); }
    else kids.push(cloneFromMain(pg, pm, mc, iId, false));
  }
  for (const ic of byMain.values()) removeSubtree(pg, ic);   // im Original gelöscht
  const extras = i.children.filter(c => pg.nodes[c] && !pg.nodes[c].mainId); // in der Kopie ergänzt
  const next = [...kids, ...extras];
  if (!same(i.children, next)) i.children = next;
}

/** Zieht alle Kopien der Komponente nach (d ist ein Entwurf) */
export function syncComponent(d: WDocument, componentId: string, only?: string[]) {
  const pm = allPages(d).find(p => p.nodes[componentId]?.isMain);
  if (!pm) return;
  for (const pg of allPages(d)) {
    // Kopien, die im eigenen Original liegen, werden nicht abgeglichen (sonst endlose Verschachtelung)
    const roots = Object.keys(pg.nodes).filter(id => pg.nodes[id].componentId === componentId && isInstanceRoot(pg.nodes[id])
      && !insideMain(pg, pg.nodes[id].parentId, componentId));
    for (const id of roots) if (!only || only.includes(id)) syncNode(pg, id, pm, componentId, true);
  }
}

/** Nach jeder Änderung: Abweichungen merken und Kopien aktualisieren */
export function afterMutate(prev: WDocument, next: WDocument, system: boolean): WDocument {
  let doc = system ? next : markTouched(prev, next);
  let base = prev;
  for (let round = 0; round < 5; round++) {
    const changed = changedMains(base, doc);
    if (!changed.length) break;
    const synced = produce(doc, d => { for (const c of changed) syncComponent(d, c); });
    if (synced === doc) break;
    base = doc;
    doc = synced;
  }
  return doc;
}

/** Löst Kopien von ihrer Komponente (Ebenen bleiben, Verknüpfung entfällt) */
export function detachSubtree(pg: Page, id: string) {
  const n = pg.nodes[id];
  if (!n) return;
  delete n.componentId;
  delete n.mainId;
  delete n.touched;
  n.children.forEach(c => detachSubtree(pg, c));
}

/** Alle Kopien einer Komponente (über alle Seiten) */
export function instancesOf(doc: WDocument, componentId: string): { pageId: string; id: string }[] {
  const out: { pageId: string; id: string }[] = [];
  for (const pg of allPages(doc)) {
    for (const id in pg.nodes) if (pg.nodes[id].componentId === componentId && isInstanceRoot(pg.nodes[id])) out.push({ pageId: pg.id, id });
  }
  return out;
}

/** Oberste Ebene der Kopie, zu der `id` gehört */
export function instanceRootOf(pg: Page, id: string): string | null {
  let n: WNode | undefined = pg.nodes[id];
  while (n) {
    if (isInstanceRoot(n)) return n.id;
    if (!n.mainId) return null;
    n = n.parentId ? pg.nodes[n.parentId] : undefined;
  }
  return null;
}

/** Ist `id` Teil (oder Wurzel) der Hauptkomponente `componentId`? */
export function insideMain(pg: Page, id: string | null, componentId: string): boolean {
  let n = id ? pg.nodes[id] : undefined;
  while (n) {
    if (n.id === componentId) return true;
    n = n.parentId ? pg.nodes[n.parentId] : undefined;
  }
  return false;
}

// ---------- Varianten ----------

/** Inhalte, die beim Wechsel der Variante in der Kopie erhalten bleiben (wenn dort geändert) */
const KEEP_ON_SWAP = ['visible', 'text', 'imageRef', 'src', 'link', 'vector', 'embed', 'objectFit', 'alt'];
/** Platzierung/Größe der Kopie selbst bleibt beim Wechsel erhalten (wenn dort geändert) */
const KEEP_ROOT = ['name', 'sizingH', 'sizingV', 'w', 'h', 'visible', 'locked', 'reveal'];

/** Varianten-Rahmen einer Hauptkomponente (oder null) */
export function variantSetOf(pg: Page, mainId: string): WNode | null {
  const m = pg.nodes[mainId];
  const p = m?.parentId ? pg.nodes[m.parentId] : undefined;
  return m?.isMain && p?.variantSet ? p : null;
}
/** Alle Varianten (Hauptkomponenten) eines Rahmens */
export const variantsOf = (pg: Page, setId: string): WNode[] =>
  (pg.nodes[setId]?.children ?? []).map(id => pg.nodes[id]).filter(n => n?.isMain);

/** Seite, auf der eine Hauptkomponente liegt */
export const mainPage = (d: WDocument, id: string) => allPages(d).find(p => p.nodes[id]?.isMain);

/**
 * Kopie auf eine andere Variante umstellen (d ist ein Entwurf).
 * Eigene Texte/Bilder/Links und die Platzierung bleiben, das Aussehen kommt von der neuen Variante.
 * Gibt die ID der neuen obersten Ebene zurück.
 */
export function swapInstance(d: WDocument, pg: Page, rootId: string, newMainId: string): string | null {
  const old = pg.nodes[rootId];
  const pmNew = mainPage(d, newMainId);
  if (!old || !pmNew || old.componentId === newMainId) return null;
  const pmOld = mainPage(d, old.componentId!);
  const keyOf = (pm: Page | undefined, mainId: string | undefined, isRoot: boolean) => {
    if (isRoot) return 'root';
    const mn = mainId && pm ? pm.nodes[mainId] : undefined;
    return mn ? mn.vkey ?? mn.id : null;
  };
  // Inhalte der alten Kopie einsammeln
  const kept = new Map<string, Rec>();
  const collect = (id: string, isRoot: boolean) => {
    const n = pg.nodes[id];
    if (!n) return;
    const key = keyOf(pmOld, n.mainId, isRoot);
    const t = n.touched ?? [];
    const vals: Rec = {};
    for (const k of t) {
      const base = k.includes('.') ? k.split('.')[1] : k;
      if (KEEP_ON_SWAP.includes(base) || (isRoot && KEEP_ROOT.includes(base))) {
        if (k.includes('.')) { const [bp, kk] = k.split('.') as [Bp, string]; vals[k] = clone((n.overrides?.[bp] as Rec | undefined)?.[kk]); }
        else vals[k] = clone((n as unknown as Rec)[k]);
      }
    }
    if (key && Object.keys(vals).length) kept.set(key, vals);
    n.children.forEach(c => collect(c, false));
  };
  collect(rootId, true);

  const newId = cloneFromMain(pg, pmNew, newMainId, old.parentId, true);
  const nn = pg.nodes[newId];
  // Platzierung der alten Kopie übernehmen (inkl. Breakpoints)
  for (const k of ROOT_OWN) (nn as unknown as Rec)[k] = clone((old as unknown as Rec)[k]);
  for (const bp of BPS) {
    const o = old.overrides?.[bp] as Rec | undefined;
    if (!o) continue;
    for (const k of ROOT_OWN) if (k in o) { nn.overrides ??= {}; nn.overrides[bp] ??= {}; (nn.overrides[bp] as Rec)[k] = clone(o[k]); }
  }
  // gemerkte Inhalte auf die passenden Ebenen der neuen Variante legen
  const apply = (id: string, isRoot: boolean) => {
    const n = pg.nodes[id];
    if (!n) return;
    const vals = kept.get(keyOf(pmNew, n.mainId, isRoot) ?? '');
    if (vals) {
      for (const [k, v] of Object.entries(vals)) {
        if (k.includes('.')) {
          const [bp, kk] = k.split('.') as [Bp, string];
          n.overrides ??= {}; n.overrides[bp] ??= {};
          (n.overrides[bp] as Rec)[kk] = v;
        } else (n as unknown as Rec)[k] = v;
      }
      n.touched = [...new Set([...(n.touched ?? []), ...Object.keys(vals)])];
    }
    n.children.forEach(c => apply(c, false));
  };
  apply(newId, true);
  // an die Stelle der alten Kopie setzen
  const arr = old.parentId ? pg.nodes[old.parentId].children : pg.rootIds;
  const i = arr.indexOf(rootId);
  if (i >= 0) arr.splice(i, 1, newId); else arr.push(newId);
  removeSubtree(pg, rootId);
  return newId;
}
