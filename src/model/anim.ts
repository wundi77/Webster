// Eigene Animationen: Befehle (Anlegen, Zustände, Schlüsselbilder, Abspielen)
import { useEditor, pageOf } from '../store';
import { createNode, createPage, makeFill, uid } from './factory';
import { insertInstance, openComponent } from './library';
import { animDuration, animRootOf, ANIM_PROPS, baseValue, easeAt, putKey, setAnimTime, setBase, useAnimClock, valueAt, withoutRecording } from './animCore';
import type { AnimEase, AnimKey, AnimProp, AnimSettings, Page, WNode } from './types';

const S = () => useEditor.getState();
/** Ändern ohne Aufnehmen */
const M = (...a: Parameters<ReturnType<typeof S>['mutate']>) => withoutRecording(() => S().mutate(...a));
const EPS = 0.005;
const r3 = (t: number) => Math.round(t * 1000) / 1000;

/** Animationsseite, die gerade offen ist */
export function currentAnim(): { page: Page; root: WNode } | null {
  const page = pageOf(S());
  const root = animRootOf(page);
  return root ? { page, root } : null;
}

const sortedStates = (a: AnimSettings) => [...a.states].sort((x, y) => x.t - y.t);

/** Ändert die Animation auf der offenen Seite (ohne Aufnehmen) */
function edit(fn: (pg: Page, root: WNode) => void, key?: string) {
  M(pg => {
    const root = animRootOf(pg);
    if (root) fn(pg, root);
  }, { key });
}

/** Alle Schlüsselbilder ab Zeit `from` um `dt` verschieben */
function shiftFrom(pg: Page, from: number, dt: number) {
  for (const id in pg.nodes) {
    const a = pg.nodes[id].anim;
    if (!a) continue;
    for (const p of ANIM_PROPS) for (const k of a[p] ?? []) if (k.t >= from - EPS) k.t = r3(Math.max(0, k.t + dt));
  }
}

// ---------- Anlegen ----------

let count = 0;
export function newAnimation() {
  const s = S();
  const names = new Set((s.doc.componentPages ?? []).map(p => p.name));
  let k = ++count;
  while (names.has(`Animation ${k}`)) k++;
  const name = `Animation ${k}`;
  const page = createPage(name);
  const board = createNode('board', {
    name, isMain: true, x: 0, y: 0, w: 480, h: 320, fills: [makeFill('#FFFFFF')], radius: 16,
    animation: {
      states: [{ id: uid(), name: 'Start', t: 0, ease: 'smooth' }, { id: uid(), name: 'Ende', t: 1, ease: 'smooth' }],
      repeat: 'once', play: 'view',
    },
  });
  // Beispiel: Kreis rollt hinein und wechselt die Farbe
  const ball = createNode('ellipse', {
    name: 'Kreis', parentId: board.id, x: 60, y: 110, w: 100, h: 100, fills: [makeFill('#6A55F5')],
    anim: {
      x: [{ t: 0, v: 60, ease: 'back' }, { t: 1, v: 320 }],
      color: [{ t: 0, v: '#6A55F5', ease: 'smooth' }, { t: 1, v: '#FF7A59' }],
      opacity: [{ t: 0, v: 0.2, ease: 'out' }, { t: 1, v: 1 }],
    },
  });
  board.children = [ball.id];
  page.nodes[board.id] = board;
  page.nodes[ball.id] = ball;
  page.rootIds = [board.id];
  s.mutate((_, d) => { (d.componentPages ??= []).push(page); }, { system: true });
  insertInstance(board.id);
  openAnimation(board.id);
}

export function openAnimation(mainId: string) {
  useAnimClock.setState({ t: 0, playing: false, key: null });
  openComponent(mainId);
  setTimeout(() => setAnimTime(0));
}

// ---------- Einstellungen ----------

export function setAnimSetting(patch: Partial<Pick<AnimSettings, 'repeat' | 'play'>>) {
  edit((_, root) => { Object.assign(root.animation!, patch); });
}

// ---------- Zustände (einfache Ansicht) ----------

export function addState() {
  const c = currentAnim();
  if (!c) return;
  const st = sortedStates(c.root.animation!);
  const last = st[st.length - 1];
  const t = r3((last?.t ?? 0) + 0.6);
  const id = uid();
  edit((_, root) => { root.animation!.states.push({ id, name: `Zustand ${st.length + 1}`, t, ease: last?.ease ?? 'smooth' }); });
  setAnimTime(t);
}

export function removeState(id: string) {
  const c = currentAnim();
  if (!c) return;
  const st = sortedStates(c.root.animation!);
  const i = st.findIndex(s => s.id === id);
  if (i <= 0) return; // Start bleibt
  const me = st[i], prev = st[i - 1];
  const dt = me.t - prev.t;
  // Der Übergang zu diesem Zustand fällt weg: seine Schlüsselbilder gehen, alles danach rückt nach vorne
  edit((pg, root) => {
    for (const nid in pg.nodes) {
      const n = pg.nodes[nid];
      const a = n.anim;
      if (!a) continue;
      for (const p of ANIM_PROPS) {
        const list = a[p];
        if (!list) continue;
        const keep = list.filter(k => k.t <= prev.t + EPS || k.t > me.t + EPS);
        for (const k of keep) if (k.t > me.t + EPS) k.t = r3(k.t - dt);
        if (keep.length < 2) { setBase(n, p, (keep[0] ?? list[0]).v); delete a[p]; } else a[p] = keep;
      }
      if (!ANIM_PROPS.some(q => a[q]?.length)) n.anim = null;
    }
    root.animation!.states = root.animation!.states.filter(s => s.id !== id);
    for (const s of root.animation!.states) if (s.t > me.t + EPS) s.t = r3(s.t - dt);
  });
  setAnimTime(prev.t);
}

export function renameState(id: string, name: string) {
  edit((_, root) => { const s = root.animation!.states.find(x => x.id === id); if (s) s.name = name.trim() || s.name; });
}

/** Übergang von Zustand `id` zum nächsten: Dauer und Verlauf */
export function setTransition(id: string, patch: { dur?: number; ease?: AnimEase }) {
  const c = currentAnim();
  if (!c) return;
  const st = sortedStates(c.root.animation!);
  const i = st.findIndex(s => s.id === id);
  const a = st[i], b = st[i + 1];
  if (!a || !b) return;
  edit((pg, root) => {
    if (patch.ease) {
      root.animation!.states.find(s => s.id === id)!.ease = patch.ease;
      for (const nid in pg.nodes) {
        const tr = pg.nodes[nid].anim;
        if (tr) for (const p of ANIM_PROPS) for (const k of tr[p] ?? []) if (k.t >= a.t - EPS && k.t < b.t - EPS) k.ease = patch.ease;
      }
    }
    if (patch.dur !== undefined) {
      const dur = Math.max(0.05, Math.min(30, r3(patch.dur)));
      const dt = r3(a.t + dur - b.t);
      if (Math.abs(dt) > EPS / 2) {
        // Schlüsselbilder im Übergang strecken, spätere verschieben
        const span = b.t - a.t;
        for (const nid in pg.nodes) {
          const tr = pg.nodes[nid].anim;
          if (!tr) continue;
          for (const p of ANIM_PROPS) for (const k of tr[p] ?? []) {
            if (k.t >= b.t - EPS) k.t = r3(k.t + dt);
            else if (k.t > a.t + EPS && span > 0) k.t = r3(a.t + ((k.t - a.t) / span) * dur);
          }
        }
        for (const s of root.animation!.states) if (s.t >= b.t - EPS) s.t = r3(s.t + dt);
      }
    }
  }, 'anim-trans-' + id);
}

// ---------- Schlüsselbilder (Profi-Zeitleiste) ----------

export function keysOf(n: WNode, p: AnimProp | null): AnimKey[] {
  if (p) return n.anim?.[p] ?? [];
  // Ebenen-Zeile: alle Zeiten zusammen
  const ts: AnimKey[] = [];
  for (const q of ANIM_PROPS) for (const k of n.anim?.[q] ?? []) if (!ts.some(x => Math.abs(x.t - k.t) < EPS)) ts.push(k);
  return ts.sort((a, b) => a.t - b.t);
}

/** Schlüsselbild(er) zeitlich verschieben (p = null: alle Eigenschaften der Ebene zu dieser Zeit) */
export function moveKey(nodeId: string, p: AnimProp | null, from: number, to: number, gesture = true) {
  to = r3(Math.max(0, Math.round(to / 0.05) * 0.05));
  if (Math.abs(to - from) < EPS) return from;
  M(pg => {
    const a = pg.nodes[nodeId]?.anim;
    if (!a) return;
    for (const q of p ? [p] : ANIM_PROPS) {
      const list = a[q];
      if (!list) continue;
      const k = list.find(x => Math.abs(x.t - from) < EPS);
      if (!k) continue;
      // anderes Schlüsselbild am Ziel ersetzen
      a[q] = list.filter(x => x === k || Math.abs(x.t - to) >= EPS);
      k.t = to;
      a[q]!.sort((x, y) => x.t - y.t);
    }
  }, { key: 'anim-move', history: !gesture });
  return to;
}

export function deleteKey(nodeId: string, p: AnimProp | null, t: number) {
  M(pg => {
    const n = pg.nodes[nodeId];
    const a = n?.anim;
    if (!a) return;
    for (const q of p ? [p] : ANIM_PROPS) {
      const list = a[q];
      if (!list) continue;
      const rest = list.filter(x => Math.abs(x.t - t) >= EPS);
      if (rest.length === list.length) continue;
      if (rest.length <= 1) {
        // nur noch ein Wert: das ist dann der feste Wert, keine Animation mehr
        setBase(n, q, rest[0]?.v ?? list[0].v);
        delete a[q];
      } else a[q] = rest;
    }
    if (!ANIM_PROPS.some(q => a[q]?.length)) n.anim = null;
  });
  useAnimClock.setState({ key: null });
}

export function setKeyEase(nodeId: string, p: AnimProp | null, t: number, ease: AnimEase) {
  M(pg => {
    const a = pg.nodes[nodeId]?.anim;
    if (!a) return;
    for (const q of p ? [p] : ANIM_PROPS) for (const k of a[q] ?? []) if (Math.abs(k.t - t) < EPS) k.ease = ease;
  });
}

/** Schlüsselbild beim Abspielkopf für die Eigenschaft setzen (aktueller angezeigter Wert) */
export function addKeyHere(nodeId: string, p: AnimProp) {
  const t = r3(S().animT);
  M(pg => {
    const m = pg.nodes[nodeId];
    const root = animRootOf(pg);
    if (!m || !root || m.parentId === null) return;
    const has = !!m.anim?.[p]?.length;
    const cur = has ? valueAt(m.anim![p]!, t) : baseValue(m, p);
    if (cur === undefined) return;
    const v = typeof cur === 'number' ? Math.round(cur * 100) / 100 : cur;
    const base: AnimKey[] = has ? m.anim![p]! : [{ t: 0, v, ease: easeAt(root.animation, 0) }];
    m.anim = { ...(m.anim ?? {}), [p]: putKey(base, t, v, easeAt(root.animation, t)) };
  });
}

// ---------- Abspielen ----------

let raf = 0;
export function togglePlay() {
  const c = useAnimClock.getState();
  if (c.playing) { stop(); return; }
  const a = currentAnim();
  if (!a) return;
  const dur = animDuration(a.page, a.root.animation);
  const repeat = a.root.animation!.repeat;
  let t0 = performance.now() - (c.t >= dur - EPS ? 0 : c.t) * 1000;
  useAnimClock.setState({ playing: true });
  const tick = (now: number) => {
    if (!useAnimClock.getState().playing) return;
    let t = (now - t0) / 1000;
    if (t >= dur) {
      if (repeat === 'once') { setAnimTime(dur); stop(); return; }
      if (repeat === 'alternate') {
        const cyc = Math.floor(t / dur);
        const local = t - cyc * dur;
        t = cyc % 2 ? dur - local : local;
        if (t / dur > 0 && cyc > 50) t0 = now;
      } else t = t % dur;
    }
    setAnimTime(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
export function stop() { cancelAnimationFrame(raf); useAnimClock.setState({ playing: false }); }
