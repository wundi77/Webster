// „Anordnung“: verständliche Layout-Einstellungen für ein Board.
// Oben fertige Bausteine, darunter Bildchen (nebeneinander/untereinander/Kacheln/frei),
// Breite der Elemente, Abstand, Verhalten auf Tablet/Handy und eine Mini-Vorschau für alle drei Bildschirme.
// Die bisherigen Profi-Einstellungen stehen unter „Mehr Optionen“.
import { SpaceChips } from '../ui/SpaceChips';
import { useState, type ReactNode } from 'react';
import { useEditor, pageOf } from '../store';
import type { Breakpoint, Layout, Page, Sizing, Track, WNode } from '../model/types';
import { makeLayout } from '../model/factory';
import { applyEdit, resolveNode } from '../model/resolve';
import { updateNodes } from '../model/commands';
import { isFooter } from '../model/css';
import { isPageBoard } from '../model/pageRules';
import { NumberField } from '../ui/controls';

type Arr = 'row' | 'col' | 'grid' | 'free';
const S = () => useEditor.getState();
const BPS: Breakpoint[] = ['desktop', 'tablet', 'mobile'];
const BP_NAMES: Record<Breakpoint, string> = { desktop: 'Computer', tablet: 'Tablet', mobile: 'Handy' };

const arrOf = (L: Layout | null | undefined): Arr => (!L ? 'free' : L.type === 'grid' ? 'grid' : L.direction === 'row' ? 'row' : 'col');
const fr = (n: number): Track[] => Array.from({ length: n }, () => ({ unit: 'fr' as const, value: 1 }));
const colsOf = (L: Layout) => Math.max(1, L.columns.length);

/** Ist das Board auf diesem Bildschirm (gegenüber dem Computer) untereinander gestapelt? */
function stackedAt(raw: WNode, bp: Breakpoint): boolean {
  const D = raw.layout, L = resolveNode(raw, bp).layout;
  if (!D || !L) return false;
  if (D.type === 'flex' && D.direction === 'row') return L.type === 'flex' && L.direction === 'column';
  if (D.type === 'grid') return L.type === 'grid' && !L.colMin && colsOf(L) === 1;
  return false;
}

const flowKids = (pg: Page, n: WNode) => n.children.map(c => pg.nodes[c]).filter(c => c && !c.absolute) as WNode[];

/** Layout anlegen bzw. umstellen (nur Computer); Kinder nach ihrer Lage sortieren, Fußzeile ans Ende */
function setArrangement(pg: Page, n: WNode, a: Arr, cols = 3) {
  if (a === 'free') { n.layout = null; return; }
  const dir = a === 'row' ? 'row' : 'column';
  if (!n.layout) {
    const kids = flowKids(pg, n);
    const sorted = [...kids].sort((p, q) => (dir === 'row' ? p.x - q.x || p.y - q.y : p.y - q.y || p.x - q.x));
    const order = [...sorted.filter(k => !isFooter(k)), ...sorted.filter(k => isFooter(k))].map(k => k.id);
    const abs = n.children.filter(id => !order.includes(id));
    n.children = [...order, ...abs];
    n.layout = makeLayout(a === 'grid' ? 'grid' : 'flex', dir);
  }
  const before = arrOf(n.layout);
  n.layout.type = a === 'grid' ? 'grid' : 'flex';
  if (a !== 'grid') n.layout.direction = dir;
  if (a === 'grid' && !n.layout.columns.length) n.layout.columns = fr(cols);
  // Tablet/Handy: Abweichungen bei der Anordnung passen nicht mehr – die Art folgt dem Computer (Abstände bleiben)
  if (before !== a) for (const bp of ['tablet', 'mobile'] as const) {
    const o = n.overrides?.[bp]?.layout;
    if (o) n.overrides![bp]!.layout = { ...o, type: n.layout.type, direction: n.layout.direction, wrap: n.layout.wrap, columns: n.layout.columns, rows: n.layout.rows };
  }
}

/** Auf Tablet/Handy untereinander stapeln oder wie am Computer lassen */
function setStack(pg: Page, n: WNode, bp: Breakpoint, stack: boolean) {
  const D = n.layout;
  if (!D || bp === 'desktop') return;
  applyEdit(n, bp, e => {
    if (!e.layout) return;
    if (D.type === 'grid') e.layout = { ...e.layout, type: 'grid', columns: stack ? fr(1) : D.columns, rows: D.rows, colMin: stack ? null : D.colMin };
    else e.layout = { ...e.layout, type: 'flex', direction: stack ? 'column' : D.direction, wrap: stack ? false : D.wrap };
  });
  for (const k of flowKids(pg, n)) applyEdit(k, bp, e => { e.sizingH = stack ? 'fill' : k.sizingH; });
}

interface Preset { id: string; label: string; hint: string; icon: ReactNode; apply: (pg: Page, n: WNode, isRoot: boolean) => void }

const kidsFill = (pg: Page, n: WNode) => { for (const k of flowKids(pg, n)) k.sizingH = 'fill'; };

const PRESETS: Preset[] = [
  {
    id: 'cols', label: 'Spalten', hint: 'Nebeneinander, auf dem Handy untereinander',
    icon: <Mini kind="row" n={3} />,
    apply: (pg, n) => {
      setArrangement(pg, n, 'row'); n.layout!.gap = 24; n.layout!.wrap = false; n.layout!.align = 'start'; kidsFill(pg, n);
      setStack(pg, n, 'tablet', false); setStack(pg, n, 'mobile', true);
    },
  },
  {
    id: 'media', label: 'Bild und Text', hint: 'Zwei Hälften nebeneinander, mittig – auf dem Handy untereinander',
    icon: <Mini kind="media" n={2} />,
    apply: (pg, n) => {
      setArrangement(pg, n, 'row'); n.layout!.gap = 48; n.layout!.wrap = false; n.layout!.align = 'center'; kidsFill(pg, n);
      setStack(pg, n, 'tablet', false); setStack(pg, n, 'mobile', true);
    },
  },
  {
    id: 'stack', label: 'Untereinander', hint: 'Abschnitte untereinander, mittig (auf der Seite: Inhalt höchstens 1400 px breit)',
    icon: <Mini kind="col" n={3} />,
    apply: (pg, n, isRoot) => {
      setArrangement(pg, n, 'col'); n.layout!.gap = isRoot ? 0 : 24; n.layout!.align = 'center';
      if (isRoot) { kidsFill(pg, n); n.contentWidth = 1400; n.contentAlign = undefined; }
      setStack(pg, n, 'tablet', false); setStack(pg, n, 'mobile', false);
    },
  },
  {
    id: 'tiles', label: 'Kacheln', hint: '3 Spalten, Tablet 2, Handy 1 – z. B. für Karten',
    icon: <Mini kind="grid" n={6} cols={3} />,
    apply: (pg, n) => {
      setArrangement(pg, n, 'grid'); n.layout!.type = 'grid'; n.layout!.columns = fr(3); n.layout!.rows = []; n.layout!.colMin = null; n.layout!.masonry = false;
      n.layout!.gap = 24; n.layout!.rowGap = 24; kidsFill(pg, n);
      applyEdit(n, 'tablet', e => { if (e.layout) e.layout = { ...e.layout, type: 'grid', columns: fr(2), rows: [], colMin: null }; });
      applyEdit(n, 'mobile', e => { if (e.layout) e.layout = { ...e.layout, type: 'grid', columns: fr(1), rows: [], colMin: null }; });
      for (const k of flowKids(pg, n)) for (const bp of ['tablet', 'mobile'] as const) applyEdit(k, bp, e => { e.sizingH = 'fill'; });
    },
  },
];

const ARRS: { v: Arr; label: string; title: string }[] = [
  { v: 'row', label: 'Nebeneinander', title: 'Elemente in einer Reihe, sie teilen sich die Breite' },
  { v: 'col', label: 'Untereinander', title: 'Elemente untereinander, wie Absätze' },
  { v: 'grid', label: 'Kacheln', title: 'Elemente in Reihen und Spalten' },
  { v: 'free', label: 'Frei', title: 'Elemente frei verschieben – sie passen sich nicht automatisch an' },
];

let advancedOpen = false;

export function ArrangeSection({ node, advanced }: { node: WNode; advanced: ReactNode }) {
  const raw = useEditor(s => pageOf(s).nodes[node.id]);
  const page = useEditor(pageOf);
  const bp = useEditor(s => s.breakpoint);
  const [open, setOpen] = useState(advancedOpen);
  const [msg, setMsg] = useState<string | null>(null);
  if (!raw) return null;
  const isRoot = isPageBoard(page, raw.id);
  const cur = resolveNode(raw, bp);
  const arr = arrOf(cur.layout);
  const desk = arrOf(raw.layout);
  const kids = cur.children.map(c => page.nodes[c]).filter(k => k && !k.absolute).map(k => resolveNode(k, bp));
  const kidW = kids.length && kids.every(k => k.sizingH === kids[0].sizingH) ? kids[0].sizingH : undefined;
  const L = cur.layout;

  const mutate = (fn: (pg: Page, n: WNode) => void, key: string) => S().mutate(pg => { const n = pg.nodes[raw.id]; if (n) fn(pg, n); }, { key });
  const pick = (a: Arr) => {
    setMsg(null);
    // Am Computer wird das Layout angelegt; auf Tablet/Handy nur die Abweichung gespeichert
    if (bp === 'desktop' || !raw.layout) mutate((pg, n) => setArrangement(pg, n, a), 'arrange');
    else updateNodes([raw.id], n => {
      if (a === 'free') { n.layout = null; return; }
      const base = n.layout ?? raw.layout!;
      n.layout = { ...base, type: a === 'grid' ? 'grid' : 'flex', direction: a === 'row' ? 'row' : 'column', columns: a === 'grid' && !base.columns.length ? fr(2) : base.columns };
    }, 'arrange');
  };
  const setKidW = (v: Sizing) => updateNodes(kids.map(k => k.id), n => {
    if (v === 'auto' && !(n.type === 'text' || (n.type === 'board' && n.layout))) v = 'fixed';
    n.sizingH = v;
  }, 'kids-w');
  const setGap = (g: number) => updateNodes([raw.id], n => { if (n.layout) { n.layout.gap = g; n.layout.rowGap = g; n.layout.gapRef = null; } }, 'layout-gap');

  return (
    <section className="section arr">
      <div className="section-head"><span>Anordnung</span></div>

      <div className="arr-lbl">Schnellstart</div>
      <div className="arr-presets">
        {PRESETS.map(p => (
          <button key={p.id} type="button" className="arr-preset" title={p.hint}
            onClick={() => { mutate((pg, n) => p.apply(pg, n, isRoot), 'arrange-preset'); setMsg(`„${p.label}“ eingestellt: ${p.hint}.`); }}>
            {p.icon}<span>{p.label}</span>
          </button>
        ))}
      </div>
      {msg && <p className="hint" aria-live="polite">{msg}</p>}

      <div className="arr-lbl">Inhalt anordnen{bp !== 'desktop' && <> · nur {BP_NAMES[bp]}</>}</div>
      <div className="arr-tiles" role="radiogroup" aria-label="Inhalt anordnen">
        {ARRS.map(a => (
          <button key={a.v} type="button" role="radio" aria-checked={arr === a.v} className={`arr-tile${arr === a.v ? ' on' : ''}`} title={a.title} onClick={() => pick(a.v)}>
            <Mini kind={a.v === 'grid' ? 'grid' : a.v} n={a.v === 'grid' ? 6 : a.v === 'free' ? 2 : 3} cols={3} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <Preview raw={raw} page={page} />

      {L && kids.length > 0 && (
        <>
          <div className="arr-lbl">Breite der Elemente</div>
          <div className="arr-opts">
            {([['fill', 'Teilen sich den Platz'], ['auto', 'So breit wie ihr Inhalt'], ['fixed', 'Feste Breite']] as [Sizing, string][]).map(([v, l]) => (
              <button key={v} type="button" className={`arr-opt${kidW === v ? ' on' : ''}`} onClick={() => setKidW(v)}><i />{l}</button>
            ))}
          </div>
          <div className="row">
            <span className="lbl">Abstand</span>
            <input type="range" className="grow" min={0} max={120} step={4} value={L.gap} aria-label="Abstand zwischen den Elementen" onChange={e => setGap(+e.target.value)} />
            <NumberField title="Abstand zwischen den Elementen" min={0} suffix="px" value={L.gap} onChange={setGap} />
          </div>
          <div className="row">
            <span className="lbl">Stufe</span>
            <SpaceChips ids={[raw.id]} kind="gap" active={L.gapRef} />
          </div>
        </>
      )}

      {raw.layout && !raw.layout.colMin && (desk === 'row' || desk === 'grid') && (
        <>
          {(['tablet', 'mobile'] as Breakpoint[]).map(b => {
            const st = stackedAt(raw, b);
            return (
              <div key={b}>
                <div className="arr-lbl">Auf dem {BP_NAMES[b]}</div>
                <div className="arr-opts two">
                  <button type="button" className={`arr-opt${!st ? ' on' : ''}`} onClick={() => { setMsg(null); mutate((pg, n) => setStack(pg, n, b, false), 'stack-' + b); }}>
                    <i />{desk === 'grid' ? `${colsOf(resolveNode(raw, b).layout!) > 1 && !st ? colsOf(resolveNode(raw, b).layout!) : colsOf(raw.layout!)} Spalten` : 'Nebeneinander'}</button>
                  <button type="button" className={`arr-opt${st ? ' on' : ''}`} onClick={() => { setMsg(null); mutate((pg, n) => setStack(pg, n, b, true), 'stack-' + b); }}><i />Untereinander</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <p className="arr-say">{explain(raw, kids.length, isRoot)}</p>

      <button type="button" className="arr-more" title="Verteilung, Ausrichtung, Innenabstand und Spalten im Detail" aria-expanded={open} onClick={() => { advancedOpen = !open; setOpen(!open); }}>
        {open ? '▾' : '▸'} Mehr Optionen
      </button>
      {open && <div className="arr-adv">{advanced}</div>}
    </section>
  );
}

function explain(raw: WNode, count: number, isRoot: boolean): string {
  const a = arrOf(raw.layout);
  if (a === 'free') return 'Die Elemente stehen genau dort, wo du sie hinziehst. Auf kleineren Bildschirmen passt du sie bei Bedarf einzeln an.';
  if (!count) return 'Noch leer. Ziehe Elemente in das Board – sie ordnen sich dann automatisch an.';
  const t = stackedAt(raw, 'tablet'), m = stackedAt(raw, 'mobile');
  const later = t ? ' Ab Tablet rutschen sie untereinander.' : m ? ' Auf dem Handy rutschen sie untereinander.' : '';
  if (a === 'row') return `Die Elemente stehen nebeneinander.${later}`;
  if (a === 'grid') {
    if (raw.layout?.colMin) return `Kacheln mindestens ${raw.layout.colMin} px breit – es stehen so viele nebeneinander, wie ins Fenster passen.`;
    const c = (bp: Breakpoint) => colsOf(resolveNode(raw, bp).layout!);
    return `Kacheln in ${c('desktop')} Spalten, auf dem Tablet ${c('tablet')}, auf dem Handy ${c('mobile')}.`;
  }
  return isRoot && raw.contentWidth ? `Die Abschnitte stehen untereinander. Der Inhalt wird höchstens ${raw.contentWidth} px breit.` : 'Die Elemente stehen untereinander, wie Absätze.';
}

/** Drei kleine Bildschirme, die zeigen, wie die Elemente stehen */
function Preview({ raw, page }: { raw: WNode; page: Page }) {
  const bp = useEditor(s => s.breakpoint);
  const sizes: Record<Breakpoint, [number, number]> = { desktop: [92, 50], tablet: [54, 62], mobile: [32, 58] };
  return (
    <div className="arr-preview" aria-hidden="true">
      {BPS.map(b => {
        const n = resolveNode(raw, b);
        const L = n.layout;
        const kids = n.children.map(c => page.nodes[c]).filter(k => k && !k.absolute).slice(0, 6).map(k => resolveNode(k, b));
        const [w, h] = sizes[b];
        const scale = w / Math.max(1, n.w);
        let inner: ReactNode;
        if (!L) {
          inner = kids.map(k => <i key={k.id} style={{ position: 'absolute', left: k.x * scale, top: Math.min(h - 6, k.y * scale), width: Math.max(3, k.w * scale), height: Math.max(3, Math.min(h, k.h * scale)) }} />);
        } else if (L.type === 'grid') {
          const pad = L.padding[1] + L.padding[3];
          const cols = L.colMin ? Math.max(1, Math.floor((n.w - pad + L.gap) / (L.colMin + L.gap))) : colsOf(L);
          inner = <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, width: '100%' }}>{kids.map(k => <i key={k.id} style={{ height: 8 }} />)}</div>;
        } else {
          const row = L.direction === 'row';
          inner = (
            <div style={{ display: 'flex', flexDirection: row ? 'row' : 'column', gap: 2, width: '100%', alignItems: row ? 'center' : L.align === 'center' ? 'center' : 'stretch', flexWrap: L.wrap ? 'wrap' : 'nowrap' }}>
              {kids.map(k => {
                const fill = k.sizingH === 'fill';
                const kw = Math.max(4, Math.min(w - 6, k.w * scale));
                return <i key={k.id} style={row ? { flex: fill ? '1 1 0' : `0 0 ${kw}px`, height: 12 } : { height: 6, width: fill || L.align === 'stretch' ? undefined : kw, alignSelf: fill ? 'stretch' : undefined }} />;
              })}
            </div>
          );
        }
        return (
          <div key={b} className={`arr-dev${bp === b ? ' on' : ''}`}>
            <div className="arr-screen" style={{ width: w, height: h, position: 'relative' }}>{inner}</div>
            <span>{BP_NAMES[b]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Kleines Bildchen für eine Anordnung */
function Mini({ kind, n, cols = 3 }: { kind: 'row' | 'col' | 'grid' | 'free' | 'media'; n: number; cols?: number }) {
  const items = Array.from({ length: n }, (_, i) => i);
  if (kind === 'grid') return <span className="arr-mini" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2, width: 30 }}>{items.map(i => <i key={i} style={{ height: 6 }} />)}</span>;
  if (kind === 'free') return <span className="arr-mini" style={{ position: 'relative', width: 30, height: 18 }}><i style={{ position: 'absolute', left: 1, top: 1, width: 11, height: 8 }} /><i style={{ position: 'absolute', left: 15, top: 8, width: 13, height: 9 }} /></span>;
  if (kind === 'media') return <span className="arr-mini" style={{ display: 'flex', gap: 3, width: 30, alignItems: 'center' }}><i style={{ flex: 1, height: 16 }} /><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><i style={{ height: 3 }} /><i style={{ height: 3 }} /><i style={{ height: 3, width: '60%' }} /></span></span>;
  return <span className="arr-mini" style={{ display: 'flex', flexDirection: kind === 'row' ? 'row' : 'column', gap: 2, width: 30, height: 18, alignItems: 'center', justifyContent: 'center' }}>
    {items.map(i => <i key={i} style={kind === 'row' ? { flex: 1, height: 14 } : { width: 26, height: 4 }} />)}
  </span>;
}
