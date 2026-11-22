import { create } from 'zustand';
import { produce } from 'immer';
import type { Breakpoint, InteractionState, Page, Rect, WDocument } from './model/types';
import { createDocument, migrateDocument, setBaseFontSize } from './model/factory';
import { resolvePage } from './model/resolve';
import { setMeasured } from './model/geometry';
import { saveBackup, type BackupMeta } from './persist';
import { afterMutate } from './model/components';
import { allPages, enforcePageRules } from './model/pageRules';
import { startPreviewBridge } from './preview/bridge';
import { animPageAt, isAnimPage, recordAnim, useAnimClock } from './model/animCore';
import { mainLang, secondLang, translatePage } from './model/i18n';

export type Tool = 'move' | 'board' | 'rect' | 'ellipse' | 'text' | 'image' | 'hand' | 'line' | 'arrow' | 'triangle' | 'polygon' | 'star';
export type Theme = 'dark' | 'light';

interface MutateOpts {
  /** false = nicht im Verlauf (Rückgängig) speichern */
  history?: boolean;
  /** gleiche Schlüssel kurz hintereinander werden zu einem Verlaufsschritt zusammengefasst */
  key?: string;
  /** Systemänderung (z. B. Bibliothek): Kopien von Komponenten gelten dadurch nicht als abweichend */
  system?: boolean;
}

export interface EditorState {
  doc: WDocument;
  /** Abspielkopf der geöffneten Animation (Kopie aus useAnimClock, damit die Ansicht neu zeichnet) */
  animT: number;
  pageId: string;
  selection: string[];
  hoverId: string | null;
  editingTextId: string | null;
  tool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  viewport: { w: number; h: number };
  past: WDocument[];
  future: WDocument[];
  theme: Theme;
  saveError: boolean;
  breakpoint: Breakpoint;
  /** Sprache, in der gerade Texte bearbeitet werden (null = Hauptsprache) */
  lang: string | null;
  setLang: (l: string | null) => void;
  /** Normal oder Hover – bestimmt, wohin Änderungen geschrieben werden */
  interaction: InteractionState;
  setInteraction: (s: InteractionState) => void;
  /** gemessene Geometrie aus der Darstellung (nicht im Verlauf) */
  geom: Record<string, Rect>;
  setBreakpoint: (bp: Breakpoint) => void;
  setGeom: (g: Record<string, Rect>) => void;
  setTool: (t: Tool) => void;
  setSelection: (ids: string[]) => void;
  setHover: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setView: (zoom: number, pan: { x: number; y: number }) => void;
  setViewport: (w: number, h: number) => void;
  setTheme: (t: Theme) => void;
  setPage: (id: string) => void;
  loadDocument: (doc: WDocument) => void;
  /** Ganzes Dokument ersetzen (z. B. Zwischenstand wiederherstellen) – lässt sich rückgängig machen */
  replaceDocument: (doc: WDocument) => void;
  mutate: (recipe: (page: Page, doc: WDocument) => void, opts?: MutateOpts) => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  /** Im Verlauf springen: Index in [...past, doc, ...future] */
  jumpTo: (index: number) => void;
}

const HISTORY_LIMIT = 200;
const THEME_KEY = 'webster.theme';

let lastKey: string | null = null;
let lastTime = 0;
let gestureStart: WDocument | null = null;

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* ignorieren */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function prune(doc: WDocument, pageId: string, sel: string[]): string[] {
  const page = allPages(doc).find(p => p.id === pageId);
  if (!page) return [];
  const next = sel.filter(id => page.nodes[id]);
  return next.length === sel.length ? sel : next;
}

const validPage = (doc: WDocument, id: string) => (allPages(doc).some(p => p.id === id) ? id : doc.pages[0].id);

const initialDoc = createDocument();

export const useEditor = create<EditorState>()((set, get) => ({
  doc: initialDoc,
  pageId: initialDoc.pages[0].id,
  selection: [],
  hoverId: null,
  editingTextId: null,
  tool: 'move',
  zoom: 1,
  pan: { x: 0, y: 0 },
  viewport: { w: 0, h: 0 },
  past: [],
  future: [],
  theme: loadTheme(),
  saveError: false,
  breakpoint: 'desktop',
  lang: null,
  setLang: l => set({ lang: l && secondLang(get().doc) === l ? l : null, editingTextId: null, hoverId: null }),
  animT: 0,
  interaction: 'normal',
  setInteraction: interaction => set({ interaction }),
  geom: {},
  setBreakpoint: breakpoint => set({ breakpoint, hoverId: null, editingTextId: null }),
  setGeom: geom => { setMeasured(geom); set({ geom }); },

  setTool: tool => set({ tool, hoverId: null }),
  setSelection: selection => set({ selection }),
  setHover: hoverId => set({ hoverId }),
  setEditing: editingTextId => set({ editingTextId }),
  setView: (zoom, pan) => set({ zoom, pan }),
  setViewport: (w, h) => set({ viewport: { w, h } }),
  setTheme: theme => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignorieren */ }
    // sofort setzen: Lineale (Canvas) lesen die Farben beim Neuzeichnen direkt aus den CSS-Variablen
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  setPage: pageId => { useAnimClock.setState({ t: 0, playing: false, key: null }); set({ pageId, selection: [], hoverId: null, editingTextId: null }); },
  loadDocument: raw => {
    const doc = produce(raw, d => { migrateDocument(d as WDocument); });
    lastKey = null;
    set({ doc, pageId: doc.pages[0].id, selection: [], past: [], future: [], hoverId: null, editingTextId: null });
  },

  replaceDocument: raw => {
    const s = get();
    const doc = produce(raw, d => { migrateDocument(d as WDocument); });
    lastKey = null;
    const pageId = validPage(doc, s.pageId);
    set({ doc, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.doc], future: [], pageId, selection: [], hoverId: null, editingTextId: null });
  },

  mutate: (recipe, opts = {}) => {
    const s = get();
    let allowed = true;
    const raw = produce(s.doc, draft => {
      const page = allPages(draft).find(p => p.id === s.pageId) ?? draft.pages[0];
      recipe(page, draft);
      // Animationsseite: Änderungen werden zu Schlüsselbildern beim Abspielkopf
      if (isAnimPage(s.doc, s.pageId)) {
        const prev = allPages(s.doc).find(p => p.id === s.pageId);
        if (prev) recordAnim(prev, page, s.animT);
      }
      allowed = enforcePageRules(s.doc, draft);
    });
    if (raw === s.doc || !allowed) return;
    const next = afterMutate(s.doc, raw, !!opts.system);
    let { past, future } = s;
    if ((opts.history ?? true) && !gestureStart) {
      const now = Date.now();
      const coalesce = !!opts.key && opts.key === lastKey && now - lastTime < 1000;
      if (!coalesce) past = [...past.slice(-(HISTORY_LIMIT - 1)), s.doc];
      future = [];
      lastKey = opts.key ?? null;
      lastTime = now;
    }
    const pageId = validPage(next, s.pageId);
    set({ doc: next, past, future, pageId, selection: prune(next, pageId, s.selection) });
  },

  beginGesture: () => { gestureStart = get().doc; lastKey = null; },
  endGesture: () => {
    const s = get();
    const start = gestureStart;
    gestureStart = null;
    if (start && start !== s.doc) set({ past: [...s.past.slice(-(HISTORY_LIMIT - 1)), start], future: [] });
  },

  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    lastKey = null;
    const pageId = validPage(prev, s.pageId);
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], pageId, selection: prune(prev, pageId, s.selection), editingTextId: null });
  },
  jumpTo: index => {
    const s = get();
    const all = [...s.past, s.doc, ...s.future];
    if (index < 0 || index >= all.length || index === s.past.length) return;
    const target = all[index];
    lastKey = null;
    const pageId = validPage(target, s.pageId);
    set({ doc: target, past: all.slice(0, index), future: all.slice(index + 1), pageId, selection: prune(target, pageId, s.selection), editingTextId: null, hoverId: null });
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const next = s.future[0];
    lastKey = null;
    const pageId = validPage(next, s.pageId);
    set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), pageId, selection: prune(next, pageId, s.selection), editingTextId: null });
  },
}));

export const pageOf = (s: EditorState): Page => allPages(s.doc).find(p => p.id === s.pageId) ?? s.doc.pages[0];

/** Seite, wie sie im aktuellen Breakpoint aussieht (nur lesen!) */
export const viewPage = (s: EditorState): Page => {
  const r = resolvePage(pageOf(s), s.breakpoint);
  const p = isAnimPage(s.doc, s.pageId) ? animPageAt(r, s.animT) : r;
  return s.lang ? translatePage(p, s.lang, mainLang(s.doc), true) : p;
};

// Stille Notfallkopie im Browser (IndexedDB) – ersetzt NICHT das Speichern im Projektordner
// null = (noch) nichts sichern, z. B. solange im Startfenster noch kein Projekt gewählt ist
let backupMeta: () => BackupMeta | null = () => null;
export const setBackupMetaProvider = (fn: () => BackupMeta | null) => { backupMeta = fn; };
let saveTimer: number | undefined;
useEditor.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const meta = backupMeta();
    if (!meta) return;
    saveBackup(useEditor.getState().doc, meta)
      .then(() => { if (useEditor.getState().saveError) useEditor.setState({ saveError: false }); })
      .catch(() => useEditor.setState({ saveError: true }));
  }, 600);
});

// Live-Vorschau in einem anderen Tab mit Änderungen versorgen
startPreviewBridge(() => useEditor.getState().doc, fn => useEditor.subscribe((s, p) => { if (s.doc !== p.doc) fn(); }));

// Nur in der Entwicklung: Zugriff für automatische Tests
if (import.meta.env.DEV) {
  (window as unknown as { __webster: typeof useEditor }).__webster = useEditor;
  // Tests: dieselben Modul-Instanzen wie die App
  (window as unknown as Record<string, unknown>).__websterAnim = { clock: useAnimClock, load: () => Promise.all([import('./model/anim'), import('./model/animCore'), import('./model/library'), import('./export/html')]) };
}

// Zweite Sprache entfernt oder geändert → zurück zur Hauptsprache
useEditor.subscribe(s => { if (s.lang && secondLang(s.doc) !== s.lang) useEditor.setState({ lang: null }); });

// Grundschrift für neue Texte aktuell halten
useEditor.subscribe(s => setBaseFontSize(s.doc.site?.baseFont));

// Abspielkopf → Ansicht neu zeichnen
useAnimClock.subscribe((c, p) => { if (c.t !== p.t) useEditor.setState({ animT: c.t }); });
