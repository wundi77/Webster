// Eigene Animationen: Schlüsselbilder auswerten (ohne Abhängigkeit vom Store).
// Eine Animation ist eine Komponente, deren oberstes Board `animation` trägt. Ebenen darin haben `anim`:
// je Eigenschaft eine Liste von Schlüsselbildern (absolute Werte). Zwischen zwei Schlüsselbildern wird überblendet.
import { create } from 'zustand';
import type { AnimEase, AnimKey, AnimProp, AnimSettings, AnimTracks, Page, WDocument, WNode } from './types';

export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'color'];
export const PROP_NAMES: Record<AnimProp, string> = { x: 'Position X', y: 'Position Y', w: 'Breite', h: 'Höhe', rotation: 'Drehung', opacity: 'Deckkraft', color: 'Farbe' };
export const EASES: { id: AnimEase; name: string }[] = [
  { id: 'smooth', name: 'Weich' }, { id: 'linear', name: 'Gleichmäßig' }, { id: 'out', name: 'Abbremsen' },
  { id: 'in', name: 'Beschleunigen' }, { id: 'back', name: 'Federnd' }, { id: 'bounce', name: 'Springend' },
];
export const easeName = (e: AnimEase | undefined) => EASES.find(x => x.id === (e ?? 'smooth'))?.name ?? 'Weich';

const bounce = (t: number) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
export function easeFn(e: AnimEase | undefined): (t: number) => number {
  switch (e ?? 'smooth') {
    case 'linear': return t => t;
    case 'in': return t => t * t * t;
    case 'out': return t => 1 - Math.pow(1 - t, 3);
    case 'back': return t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    case 'bounce': return bounce;
    default: return t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  }
}

const hex = (c: string): [number, number, number] => {
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const v = parseInt(h.slice(0, 6), 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
function mix(a: number | string, b: number | string, p: number): number | string {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * p;
  const A = hex(String(a)), B = hex(String(b));
  return toHex(A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p, A[2] + (B[2] - A[2]) * p);
}

/** Wert einer Spur zur Zeit t */
export function valueAt(keys: AnimKey[], t: number): number | string {
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      return span <= 0 ? b.v : mix(a.v, b.v, easeFn(a.ease)((t - a.t) / span));
    }
  }
  return last.v;
}

/** Grundwert einer Eigenschaft (ohne Animation) */
export function baseValue(n: WNode, p: AnimProp): number | string | undefined {
  if (p === 'color') { const f = n.fills[0]; return f && !f.gradient ? f.color : undefined; }
  return n[p];
}

const hasTracks = (a: AnimTracks | null | undefined) => !!a && ANIM_PROPS.some(p => a[p]?.length);
export const isAnimated = (n: WNode | undefined) => !!n && hasTracks(n.anim);

const cache = new WeakMap<WNode, { t: number; r: WNode }>();
/** Ebene, wie sie zur Zeit t aussieht (t = Infinity: Endzustand) */
export function withAnim(n: WNode, t: number): WNode {
  if (!hasTracks(n.anim)) return n;
  const c = cache.get(n);
  if (c && c.t === t) return c.r;
  const r: WNode = { ...n };
  for (const p of ANIM_PROPS) {
    const k = n.anim![p];
    if (!k?.length) continue;
    const v = valueAt(k, t);
    if (p === 'color') {
      if (r.fills[0] && !r.fills[0].gradient) r.fills = [{ ...r.fills[0], color: String(v) }, ...r.fills.slice(1)];
    } else (r as unknown as Record<string, number>)[p] = p === 'opacity' ? Math.max(0, Math.min(1, Number(v))) : p === 'rotation' ? Number(v) : Math.round(Number(v) * 100) / 100;
  }
  cache.set(n, { t, r });
  return r;
}

/** Oberstes Board der Animationsseite (oder undefined, wenn die Seite keine Animation ist) */
export function animRootOf(page: Page | undefined): WNode | undefined {
  const r = page ? page.nodes[page.rootIds[0]] : undefined;
  return r?.animation ? r : undefined;
}
export const isAnimPage = (doc: WDocument, pageId: string) => !!animRootOf(doc.componentPages?.find(p => p.id === pageId));

/** Gesamtdauer einer Animation in Sekunden */
export function animDuration(page: Page, settings: AnimSettings | null | undefined): number {
  let d = 0;
  for (const s of settings?.states ?? []) d = Math.max(d, s.t);
  for (const id in page.nodes) {
    const a = page.nodes[id].anim;
    if (a) for (const p of ANIM_PROPS) for (const k of a[p] ?? []) d = Math.max(d, k.t);
  }
  return Math.max(0.1, d);
}

/** Dauer für eine Kopie: die Ebenen darunter (wie animDuration, aber ab einem Board) */
export function subtreeDuration(page: Page, rootId: string): number {
  let d = 0;
  const root = page.nodes[rootId];
  for (const s of root?.animation?.states ?? []) d = Math.max(d, s.t);
  const walk = (id: string) => {
    const n = page.nodes[id];
    if (!n) return;
    for (const p of ANIM_PROPS) for (const k of n.anim?.[p] ?? []) d = Math.max(d, k.t);
    n.children.forEach(walk);
  };
  walk(rootId);
  return Math.max(0.1, d);
}

// ---------- Abspielkopf (nur Ansicht, nicht im Dokument) ----------

export interface AnimClock {
  t: number;
  playing: boolean;
  /** Profi-Zeitleiste statt Zustände */
  pro: boolean;
  /** ausgewähltes Schlüsselbild in der Zeitleiste */
  key: { node: string; prop: AnimProp | null; t: number } | null;
  /** aufgeklappte Ebenen in der Zeitleiste */
  open: Record<string, boolean>;
}
export const useAnimClock = create<AnimClock>(() => ({ t: 0, playing: false, pro: false, key: null, open: {} }));
export const setAnimTime = (t: number) => useAnimClock.setState({ t: Math.max(0, Math.round(t * 1000) / 1000) });

// ---------- Aufnehmen: Änderungen werden zu Schlüsselbildern ----------

const EPS = 0.005;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** Verlauf, der für neue Schlüsselbilder zur Zeit t gilt (der des Zustands davor) */
export function easeAt(settings: AnimSettings | null | undefined, t: number): AnimEase {
  let e: AnimEase = 'smooth';
  for (const s of [...(settings?.states ?? [])].sort((a, b) => a.t - b.t)) if (s.t <= t + EPS) e = s.ease;
  return e;
}

/** Setzt (oder ersetzt) ein Schlüsselbild */
export function putKey(keys: AnimKey[], t: number, v: number | string, ease: AnimEase): AnimKey[] {
  const out = keys.filter(k => !near(k.t, t));
  const old = keys.find(k => near(k.t, t));
  out.push({ t, v, ease: old?.ease ?? ease });
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Nach einer Änderung auf der Animationsseite: geänderte Eigenschaften werden zum Schlüsselbild beim Abspielkopf,
 * der Grundwert bleibt. Ausnahme: Eigenschaften ohne Spur am Anfang (t = 0) – das ist normales Zeichnen.
 * prev = Seite vorher, page = Entwurf (wird geändert).
 */
let recordOff = 0;
/** Änderungen ohne Aufnehmen (Befehle der Zeitleiste selbst) */
export function withoutRecording(fn: () => void) { recordOff++; try { fn(); } finally { recordOff--; } }

// Ziehen rundet auf ganze Pixel – solche Rundungen sind keine Änderung
const same = (p: AnimProp, a: number | string, b: number | string) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < (p === 'opacity' ? 0.005 : p === 'rotation' ? 0.05 : 0.51) : String(a).toUpperCase() === String(b).toUpperCase();

export function recordAnim(prev: Page, page: Page, t: number) {
  if (recordOff) return;
  const root = animRootOf(page);
  if (!root) return;
  const settings = root.animation;
  for (const id in page.nodes) {
    const n = page.nodes[id], o = prev.nodes[id];
    if (!o || n.parentId === null || n === o) continue;
    for (const p of ANIM_PROPS) {
      const before = baseValue(o, p), after = baseValue(n, p);
      if (before === undefined || after === undefined) continue;
      if (after === before) continue;
      const keys = o.anim?.[p] ?? [];
      // Eigenschaft mit Spur: nur aufnehmen, wenn sich der angezeigte Wert wirklich ändert
      // (Ziehen schreibt z. B. x, y, w, h zusammen – unveränderte Werte sollen keine Schlüsselbilder werden)
      if (keys.length && same(p, after, valueAt(keys, t))) { restore(n, p, before); continue; }
      if (!keys.length && t < EPS) continue;
      let next = keys.length ? [...keys] : [{ t: 0, v: before, ease: easeAt(settings, 0) } as AnimKey];
      // Zustände-Ansicht: die Änderung passiert nur im Übergang vom vorigen Zustand hierher
      if (!useAnimClock.getState().pro) {
        const prevState = [...(settings?.states ?? [])].filter(x => x.t < t - EPS).sort((a, b) => b.t - a.t)[0];
        if (prevState && !next.some(k => near(k.t, prevState.t))) next = putKey(next, prevState.t, valueAt(next, prevState.t), prevState.ease);
      }
      next = putKey(next, t, typeof after === 'number' ? Math.round(after * 100) / 100 : after, easeAt(settings, t));
      n.anim = { ...(n.anim ?? {}), [p]: next };
      restore(n, p, before);
    }
  }
}

/** Grundwert zurücksetzen (die Änderung steckt jetzt im Schlüsselbild) */
function restore(n: WNode, p: AnimProp, v: number | string) {
  if (p === 'color') { if (n.fills[0]) n.fills[0].color = String(v); }
  else (n as unknown as Record<string, unknown>)[p] = v;
}

/** Fester Wert einer Eigenschaft (z. B. wenn die Spur entfernt wird) */
export const setBase = restore;

/** Seite mit allen Ebenen zur Zeit t (für die Bearbeitung auf der Animationsseite) */
const viewCache = new WeakMap<Page, { t: number; r: Page }>();
export function animPageAt(page: Page, t: number): Page {
  const c = viewCache.get(page);
  if (c && c.t === t) return c.r;
  const nodes: Record<string, WNode> = {};
  for (const id in page.nodes) nodes[id] = withAnim(page.nodes[id], t);
  const r = { ...page, nodes };
  viewCache.set(page, { t, r });
  return r;
}

/** Zeitpunkte zum Abtasten für die fertige Website (Schlüsselbilder + Zwischenschritte bei Kurven) */
export function sampleTimes(n: WNode, dur: number): number[] {
  const ts = new Set<number>([0, dur]);
  for (const p of ANIM_PROPS) {
    const keys = n.anim?.[p];
    if (!keys?.length) continue;
    keys.forEach((k, i) => {
      ts.add(k.t);
      const nx = keys[i + 1];
      if (nx && (k.ease ?? 'smooth') !== 'linear') {
        const steps = k.ease === 'bounce' || k.ease === 'back' ? 20 : 12;
        for (let j = 1; j < steps; j++) ts.add(k.t + ((nx.t - k.t) * j) / steps);
      }
    });
  }
  return [...ts].filter(t => t >= 0 && t <= dur + 1e-6).map(t => Math.round(t * 10000) / 10000).sort((a, b) => a - b)
    .filter((t, i, a) => i === 0 || t - a[i - 1] > 1e-4);
}

// ---------- Eingebaute Animation = ein geschlossenes Element ----------

/** Kopie einer eigenen Animation auf einer Seite (ihr oberstes Board) */
export const isAnimInstance = (n: WNode | undefined): boolean =>
  !!n && !n.isMain && !!n.componentId && n.componentId === n.mainId && !!n.animation;

/** Oberste eingebaute Animation, in der eine Ebene steckt (oder die Ebene selbst) */
export function animInstanceOf(page: Page, id: string): string | null {
  let found: string | null = null;
  for (let n: WNode | undefined = page.nodes[id]; n; n = n.parentId ? page.nodes[n.parentId] : undefined) if (isAnimInstance(n)) found = n.id;
  return found;
}

/** Ursprüngliche Größe einer Animation (ihr Board im Animations-Editor) */
export function animDesignSize(doc: WDocument, n: WNode): { w: number; h: number } | null {
  const cid = n.componentId;
  if (!cid) return null;
  for (const p of doc.componentPages ?? []) { const m = p.nodes[cid]; if (m?.animation) return { w: m.w, h: m.h }; }
  return null;
}
