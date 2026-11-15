// Verbindung zu Claude Code: holt Aufträge von der lokalen Brücke (bridge/webster-mcp.mjs) und führt sie aus.
// Nur aktiv, solange der Schalter „Claude“ an ist. Jeder Auftrag = ein Rückgängig-Schritt.
import { create } from 'zustand';
import { useEditor, viewPage } from '../store';
import type { Page, WDocument, WNode } from '../model/types';
import { createNode, makeFill } from '../model/factory';
import { resolveNode } from '../model/resolve';
import { absPos } from '../model/geometry';
import { createShape, deleteNodes, updateNodes } from '../model/commands';
import { placeNew } from '../model/embed';
import { siteRoot, renderPreviewPage } from '../export/html';
import { defaultCodeBlock } from '../model/code';
import { allPages } from '../model/pageRules';
import { defaultSite } from '../model/factory';

export const BRIDGE_URL = 'http://127.0.0.1:5199';
const ENABLED_KEY = 'webster.claude';

interface ClaudeState {
  enabled: boolean;
  connected: boolean;
  /** Letzte Meldung „Claude hat … “ (für die kurze Einblendung) */
  note: { text: string; at: number } | null;
  /** Kurz hervorgehobene Ebenen */
  flash: { ids: string[]; at: number } | null;
  toggle: () => void;
}

const initial = (() => { try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; } })();

export const useClaude = create<ClaudeState>((set, get) => ({
  enabled: initial,
  connected: false,
  note: null,
  flash: null,
  toggle: () => {
    const enabled = !get().enabled;
    set({ enabled, connected: false });
    try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch { /* egal */ }
    if (enabled) loop(); else abort?.abort();
  },
}));

// ---------- Abfrage-Schleife ----------

let running = false;
let abort: AbortController | null = null;

async function loop() {
  if (running) return;
  running = true;
  let failures = 0;
  while (useClaude.getState().enabled) {
    abort = new AbortController();
    try {
      const res = await fetch(`${BRIDGE_URL}/poll`, { signal: abort.signal, cache: 'no-store' });
      failures = 0;
      if (!useClaude.getState().connected) useClaude.setState({ connected: true });
      if (res.status !== 200) continue;
      const job = await res.json() as { id: string; tool: string; args: Record<string, unknown> };
      let reply: { id: string; ok: boolean; result?: unknown; error?: string };
      try {
        reply = { id: job.id, ok: true, result: await run(job.tool, job.args) };
      } catch (e) {
        reply = { id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      await fetch(`${BRIDGE_URL}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reply) });
    } catch {
      if (!useClaude.getState().enabled) break;
      failures++;
      if (useClaude.getState().connected) useClaude.setState({ connected: false });
      // Brücke läuft (noch) nicht: in Ruhe wieder versuchen
      await new Promise(r => setTimeout(r, Math.min(10_000, 1000 * failures)));
    }
  }
  running = false;
}

export function startClaudeBridge() { if (useClaude.getState().enabled) loop(); }

// ---------- Aufträge ausführen ----------

const S = () => useEditor.getState();
type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function pageOfNode(doc: WDocument, id: string): Page {
  const p = allPages(doc).find(pg => pg.nodes[id]);
  if (!p) throw new Error(`Ebene ${id} gibt es nicht.`);
  return p;
}

/** Zur Seite der Ebene wechseln (Änderungen gelten immer auf der angezeigten Seite) */
function goTo(id: string) {
  const p = pageOfNode(S().doc, id);
  if (p.id !== S().pageId) S().setPage(p.id);
}

/** Mehrere Änderungen als ein Rückgängig-Schritt */
function step<T>(fn: () => T): T {
  S().beginGesture();
  try { return fn(); } finally { S().endGesture(); }
}

function announce(text: string, ids: string[] = []) {
  useClaude.setState({ note: { text, at: Date.now() }, flash: ids.length ? { ids, at: Date.now() } : null });
  if (ids.length) S().setSelection(ids.filter(i => viewPage(S()).nodes[i]));
}

function summary(page: Page, n: WNode, bp: ReturnType<typeof S>['breakpoint'], depth: number, budget: { left: number }): unknown {
  budget.left--;
  const r = resolveNode(n, bp);
  const o: Record<string, unknown> = { id: n.id, name: n.name, type: n.type, x: r.x, y: r.y, w: r.w, h: r.h };
  if (!r.visible) o.visible = false;
  if (n.site) o.site = true;
  if (r.text) o.text = r.text.length > 200 ? r.text.slice(0, 200) + '…' : r.text;
  const fill = r.fills?.find(f => f.visible !== false);
  if (fill) o.fill = fill.gradient ? 'Verlauf' : fill.color;
  if (r.layout) o.layout = r.layout.type === 'flex' ? `flex-${r.layout.direction}` : 'grid';
  if (r.textStyle && n.type === 'text') o.font = `${r.textStyle.fontFamily} ${r.textStyle.fontSize}px ${r.textStyle.fontWeight}`;
  if (n.codeBlock) o.codeBlock = true;
  if (n.embed) o.embed = n.embed.kind;
  if (n.customCss) o.customCss = n.customCss;
  if (n.isMain) o.component = 'original';
  if (n.componentId) o.component = 'kopie';
  if (n.children.length) {
    o.children = depth > 12 || budget.left <= 0
      ? `${n.children.length} Ebenen (gekürzt)`
      : n.children.map(c => page.nodes[c]).filter(Boolean).map(c => summary(page, c, bp, depth + 1, budget));
  }
  return o;
}

/** Ziel-Board für neue Ebenen */
function parentFor(args: Args): string | null {
  const id = str(args.parentId);
  if (id) {
    goTo(id);
    const p = viewPage(S()).nodes[id];
    if (p.type !== 'board') throw new Error(`${p.name} ist kein Board – neue Ebenen gehören in ein Board.`);
    return id;
  }
  return null;
}

function applyProps(n: WNode, props: Args) {
  for (const [k, v] of Object.entries(props)) {
    switch (k) {
      case 'id': case 'parentId': case 'children': case 'type': break;
      case 'fill':
        if (typeof v === 'string') { if (n.fills[0]) { n.fills[0] = { ...n.fills[0], color: v, gradient: undefined, opacity: 1, visible: true }; } else n.fills = [makeFill(v)]; }
        break;
      case 'w': if (typeof v === 'number') { n.w = Math.max(1, Math.round(v)); if (n.sizingH === 'auto') n.sizingH = 'fixed'; } break;
      case 'h': if (typeof v === 'number') { n.h = Math.max(1, Math.round(v)); if (n.sizingV === 'auto') n.sizingV = 'fixed'; } break;
      case 'x': case 'y': if (typeof v === 'number') n[k] = Math.round(v); break;
      case 'fontSize': case 'fontWeight': case 'fontFamily': case 'textAlign': case 'lineHeight': case 'letterSpacing':
        if (n.textStyle) n.textStyle = { ...n.textStyle, [k]: v };
        break;
      case 'customCss': n.customCss = typeof v === 'string' && v.trim() ? v : undefined; break;
      default: (n as unknown as Args)[k] = v;
    }
  }
}

async function run(tool: string, args: Args): Promise<unknown> {
  const s = S();
  switch (tool) {
    case 'get_overview': {
      const page = viewPage(s);
      const root = siteRoot(page);
      return {
        dokument: s.doc.name,
        seiten: s.doc.pages.map(p => ({ id: p.id, name: p.name, aktuell: p.id === s.pageId })),
        breakpoint: s.breakpoint,
        hinweisBreakpoint: 'Größen/Positionen gelten für den angezeigten Breakpoint (desktop = Grundwerte).',
        webseitenBoard: root ? { id: root.id, w: resolveNode(root, s.breakpoint).w, layout: root.layout?.type ?? null } : null,
        auswahl: s.selection.map(id => ({ id, name: page.nodes[id]?.name })),
        websiteCode: { css: s.doc.site?.css ?? '', headCode: s.doc.site?.headCode ?? '', bodyCode: s.doc.site?.bodyCode ?? '' },
      };
    }
    case 'get_page': {
      const page = s.doc.pages.find(p => p.id === str(args.pageId)) ?? viewPage(s);
      const budget = { left: 400 };
      return { seite: page.name, id: page.id, ebenen: page.rootIds.map(id => page.nodes[id]).filter(Boolean).map(n => summary(page, n, s.breakpoint, 0, budget)) };
    }
    case 'get_node': {
      const id = str(args.id)!;
      const n = pageOfNode(s.doc, id).nodes[id];
      return n;
    }
    case 'create_node': {
      const type = str(args.type) as 'rect' | 'ellipse' | 'text' | 'board';
      if (!['rect', 'ellipse', 'text', 'board'].includes(type)) throw new Error('type muss rect, ellipse, text oder board sein.');
      return step(() => {
        const parentId = parentFor(args);
        const init: Partial<WNode> = {};
        if (str(args.name)) init.name = str(args.name);
        if (num(args.radius) !== undefined) init.radius = num(args.radius);
        if (str(args.customCss)) init.customCss = str(args.customCss);
        let id: string;
        const x = num(args.x), y = num(args.y);
        const w = num(args.w) ?? (type === 'text' ? 1 : type === 'board' ? 400 : 200);
        const h = num(args.h) ?? (type === 'text' ? 1 : type === 'board' ? 300 : 120);
        if (x !== undefined && y !== undefined && (parentId || siteRoot(viewPage(S())))) {
          const pid = parentId ?? siteRoot(viewPage(S()))!.id;
          const pp = absPos(viewPage(S()), pid);
          id = createShape(type, { x: pp.x + x, y: pp.y + y, w, h }, pid, init);
        } else {
          const node = createNode(type, { ...init, w, h });
          let ok = false;
          const sel = parentId ? [parentId] : S().selection;
          S().mutate(pg => { ok = placeNew(pg, node, sel); });
          if (!ok) throw new Error('Auf dieser Seite gibt es kein Board, in das die Ebene könnte.');
          id = node.id;
        }
        updateNodes([id], n => {
          if (type === 'text') {
            n.text = str(args.text) ?? 'Text';
            if (num(args.w) !== undefined) n.sizingH = 'fixed';
          }
          applyProps(n, Object.fromEntries(['fill', 'fontSize', 'fontWeight', 'fontFamily'].filter(k => args[k] !== undefined).map(k => [k, args[k]])));
        });
        announce(`Claude hat „${viewPage(S()).nodes[id]?.name}“ angelegt`, [id]);
        return { id };
      });
    }
    case 'update_node': {
      const id = str(args.id)!;
      goTo(id);
      const props = (args.props ?? {}) as Args;
      step(() => updateNodes([id], n => applyProps(n, props)));
      announce(`Claude hat „${viewPage(S()).nodes[id]?.name}“ geändert`, [id]);
      return 'ok';
    }
    case 'add_code_block': {
      return step(() => {
        const parentId = parentFor(args);
        const code = { ...defaultCodeBlock(), html: str(args.html) ?? '', css: str(args.css) ?? '', js: str(args.js) ?? '' };
        const w = num(args.w) ?? 480, h = num(args.h) ?? 270;
        const init = { name: str(args.name) ?? 'Eigener Code', fills: [], codeBlock: code };
        const x = num(args.x), y = num(args.y);
        let id: string;
        if (x !== undefined && y !== undefined && (parentId || siteRoot(viewPage(S())))) {
          const pid = parentId ?? siteRoot(viewPage(S()))!.id;
          const pp = absPos(viewPage(S()), pid);
          id = createShape('rect', { x: pp.x + x, y: pp.y + y, w, h }, pid, init);
        } else {
          const node = createNode('rect', { ...init, w, h });
          let ok = false;
          const sel = parentId ? [parentId] : S().selection;
          S().mutate(pg => { ok = placeNew(pg, node, sel); });
          if (!ok) throw new Error('Auf dieser Seite gibt es kein Board für den Code-Block.');
          id = node.id;
        }
        announce(`Claude hat einen Code-Block eingesetzt`, [id]);
        return { id };
      });
    }
    case 'update_code_block': {
      const id = str(args.id)!;
      goTo(id);
      const n = viewPage(S()).nodes[id];
      if (!n.codeBlock) throw new Error(`${n.name} ist kein Code-Block.`);
      const patch = Object.fromEntries(['html', 'css', 'js'].filter(k => typeof args[k] === 'string').map(k => [k, args[k]]));
      step(() => updateNodes([id], x => { x.codeBlock = { ...x.codeBlock!, ...patch }; }));
      announce(`Claude hat den Code von „${n.name}“ geändert`, [id]);
      return 'ok';
    }
    case 'set_site_code': {
      const patch = Object.fromEntries(['css', 'headCode', 'bodyCode'].filter(k => typeof args[k] === 'string').map(k => [k, args[k]]));
      step(() => S().mutate((_, d) => { d.site = { ...defaultSite(), ...d.site, ...patch }; }));
      announce('Claude hat den Code der Website geändert');
      return 'ok';
    }
    case 'delete_nodes': {
      const ids = (Array.isArray(args.ids) ? args.ids : []).filter((x): x is string => typeof x === 'string');
      if (!ids.length) throw new Error('Keine Ebenen angegeben.');
      goTo(ids[0]);
      const names = ids.map(i => viewPage(S()).nodes[i]?.name).filter(Boolean);
      step(() => deleteNodes(ids.filter(i => viewPage(S()).nodes[i])));
      announce(`Claude hat ${names.length === 1 ? `„${names[0]}“` : `${names.length} Ebenen`} gelöscht`);
      return 'ok';
    }
    case 'select_nodes': {
      const ids = (Array.isArray(args.ids) ? args.ids : []).filter((x): x is string => typeof x === 'string');
      if (ids[0]) goTo(ids[0]);
      announce('Claude zeigt dir eine Auswahl', ids);
      return 'ok';
    }
    case 'get_preview_html': {
      const pid = str(args.pageId) ?? s.pageId;
      const html = renderPreviewPage(s.doc, pid, () => ({ href: '#' }));
      // Eingebettete Bilder (data:-Adressen) kürzen, sonst wird es riesig
      return html.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]{200,}/g, m => m.slice(0, 40) + '…[Bild]');
    }
    default:
      throw new Error(`Unbekannter Auftrag: ${tool}`);
  }
}
