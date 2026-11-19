import { SpaceChips } from '../ui/SpaceChips';
import { useLeftArea } from './LeftPanel';
import { AccordionSection, PopupSection, TabsSection, TooltipField } from './InteractiveSection';
import { SPACE_NAMES, SPACE_TOKENS, setSpaceStep, spaceOf } from '../model/spacing';
import { isAnimInstance } from '../model/animCore';
import { PageSeoFields, SiteFields, useDialog } from './SiteSettings';
import { NavSection } from './NavSection';
import { RegionSection } from './RegionSection';
import { ArrangeSection } from './ArrangeSection';
import { FormSection } from './FormSection';
import { EmbedSection, VideoFileButton } from './EmbedSection';
import { CodeBlockSection, CustomCssField, SiteCodeSection } from './CodeSection';
import { VectorSection } from './VectorSection';
import { isShape } from '../model/vectorCore';
import { useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor, viewPage, pageOf } from '../store';
import { allPages, isPageBoard, pageBoard } from '../model/pageRules';
import { TEXT_TAGS, styleTag, textsWithTag } from '../model/headings';
import type { WDocument, AlignItems, BlendMode, Fill, Justify, Layout, Rect, Shadow, Sizing, Stroke, TextStyle, Track, WNode } from '../model/types';
import {
  addLayout, align, distribute, originalImageSize, pickFiles, replaceImage, resetOverrides, updateNodes,
} from '../model/commands';
import { BOARD_PRESETS, BREAKPOINTS, DEFAULT_FILL, makeFill, makeShadow, makeStroke } from '../model/factory';
import { FONTS, WEIGHT_NAMES, ensureFont, fontInfo } from '../model/fonts';
import { cssText, grainUrl, isHeader, nodeCss, slug } from '../model/css';
import { overrideKeys, PROP_NAMES } from '../model/resolve';
import { Icons, TypeIcon } from '../ui/icons';
import { ColorField, IconButton, Menu, NumberField, Section, Seg, MOD, ALT, SHIFT } from '../ui/controls';
import { rgba } from '../model/css';
import { defaultGradient, gradientCss } from '../model/gradient';
import type { PaintPatch } from '../ui/ColorPicker';
import { addVariant, renameComponent, renameVariant, setInstanceVariant, addColor, addGradient, patchFill, applyTextStyle, detachInstances, hasOverrides, instanceCount, resetInstances, showMain, isComponentPage } from '../model/library';
import { instanceRootOf, variantSetOf, variantsOf } from '../model/components';
import { clearGuides, defaultGrid, gridCols, setGrid, useView } from '../model/guides';
import type { ColumnGrid } from '../model/types';
import { HOVER_NAMES, withState } from '../model/hover';
import { openPreview } from '../preview/bridge';
import { hasFxTransform } from '../export/html';
import { MotionSection } from './MotionSection';
import { CarouselSection, CompareSection, LottieSection, OwnAnimSection } from './BlocksSection';
import type { Link, RevealType } from '../model/types';
import { TYPO_KEYS, type ColorAsset } from '../model/types';

type Upd = (fn: (n: WNode) => void, key: string) => void;

/** Ausgewählte Ebenen, so wie sie im aktuellen Breakpoint aussehen */
function useSelected(): WNode[] {
  return useEditor(useShallow(s => {
    const p = viewPage(s);
    const nodes = s.selection.map(id => p.nodes[id]).filter(Boolean);
    return s.interaction === 'normal' ? nodes : nodes.map(n => withState(n, s.interaction));
  }));
}

function useParents(nodes: WNode[]): (WNode | undefined)[] {
  return useEditor(useShallow(s => {
    const p = viewPage(s);
    return nodes.map(n => (n.parentId ? p.nodes[n.parentId] : undefined));
  }));
}

/** Gemessene Größe/Position (relativ zum Board) */
function useMeasured(ids: string[]): (Rect | undefined)[] {
  return useEditor(useShallow(s => ids.map(id => s.geom[id])));
}

function common<T>(nodes: WNode[], get: (n: WNode) => T): T | undefined {
  if (!nodes.length) return undefined;
  const v = get(nodes[0]);
  return nodes.every(n => JSON.stringify(get(n)) === JSON.stringify(v)) ? v : undefined;
}

const commonVal = <T,>(vals: T[]): T | undefined => (vals.length && vals.every(v => v === vals[0]) ? vals[0] : undefined);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function RightPanel() {
  const [tab, setTab] = useState<'design' | 'proto' | 'code'>('design');
  const tabs: [typeof tab, string][] = [['design', 'Gestalten'], ['proto', 'Interaktion'], ['code', 'Code']];
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <SelectionHead />
      <div className="panel-body">
        {tab === 'design' && <DesignTab />}
        {tab === 'proto' && <ProtoTab />}
        {tab === 'code' && <CodeTab />}
      </div>
    </>
  );
}

/** Kopf der rechten Leiste: was gerade bearbeitet wird */
function SelectionHead() {
  const info = useEditor(useShallow(s => {
    const p = viewPage(s);
    const sel = s.selection.map(id => p.nodes[id]).filter(Boolean);
    if (!sel.length) return { type: 'page', name: p.name, sub: 'Seite – nichts ausgewählt', comp: false };
    if (sel.length > 1) return { type: 'multi', name: `${sel.length} Elemente`, sub: 'Änderungen gelten für alle', comp: false };
    const n = sel[0];
    return { type: n.type, name: n.name, sub: TYPE_NAMES[n.type] ?? '', comp: !!n.componentId };
  }));
  return (
    <div className="sel-head">
      {info.type === 'page' ? <Icons.file className="sel-ico" /> : info.type === 'multi' ? <Icons.copy className="sel-ico" /> : <span className="sel-ico"><TypeIcon type={info.type} instance={info.comp} /></span>}
      <div className="sel-text"><b title={info.name}>{info.name}</b><span>{info.sub}</span></div>
    </div>
  );
}
const TYPE_NAMES: Record<string, string> = { board: 'Board', rect: 'Rechteck', ellipse: 'Ellipse', text: 'Text', image: 'Bild', vector: 'Form' };

function DesignTab() {
  const nodes = useSelected();
  const parents = useParents(nodes);
  if (!nodes.length) return <PageSettings />;
  const ids = nodes.map(n => n.id);
  const upd: Upd = (fn, key) => updateNodes(ids, fn, key);
  const types = new Set(nodes.map(n => n.type));
  const only = (t: WNode['type']) => types.size === 1 && types.has(t);
  const layoutParents = parents.filter(p => p?.layout) as WNode[];
  const allInLayoutParent = layoutParents.length === nodes.length;
  return (
    <>
      <StateSwitch nodes={nodes} />
      <BreakpointNotice nodes={nodes} />
      {nodes.length === 1 && <ComponentSection node={nodes[0]} />}
      {nodes.length === 1 && <RegionSection node={nodes[0]} />}
      {nodes.length === 1 && <NavSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].embed && <EmbedSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].codeBlock && <CodeBlockSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].vector && <VectorSection node={nodes[0]} />}
      <AlignBar count={nodes.length} />
      <MeasuresSection nodes={nodes} parents={parents} upd={upd} />
      {allInLayoutParent && <LayoutItemSection nodes={nodes} parents={layoutParents} upd={upd} />}
      {nodes.some(isAnimInstance) ? null : only('board') && nodes.length === 1
        ? <ArrangeSection node={nodes[0]} advanced={<LayoutSection nodes={nodes} upd={upd} />} />
        : (only('board') || only('rect')) && <LayoutSection nodes={nodes} upd={upd} />}
      {only('board') && <BoardSection nodes={nodes} upd={upd} />}
      {only('board') && <GridSection nodes={nodes} />}
      {only('image') && nodes.length === 1 && <ImageSection node={nodes[0]} upd={upd} />}
      <LayerSection nodes={nodes} upd={upd} />
      {only('text') && <TextSection nodes={nodes} upd={upd} />}
      <FillSection nodes={nodes} upd={upd} isText={only('text')} isColor={nodes.every(n => n.type === 'vector' && !isShape(n.vector))}
        noConic={nodes.some(n => n.type === 'vector')} />
      {!types.has('text') && nodes.every(n => n.type !== 'vector' || isShape(n.vector)) && <StrokeSection nodes={nodes} upd={upd} />}
      <ShadowSection nodes={nodes} upd={upd} />
      <BlurSection nodes={nodes} upd={upd} />
    </>
  );
}

function BreakpointNotice({ nodes }: { nodes: WNode[] }) {
  const bp = useEditor(s => s.breakpoint);
  const raw = useEditor(useShallow(s => s.selection.map(id => pageOf(s).nodes[id]).filter(Boolean) as WNode[]));
  if (bp === 'desktop') return null;
  const info = BREAKPOINTS.find(b => b.id === bp)!;
  const keys = [...new Set(raw.flatMap(n => overrideKeys(n, bp)))];
  return (
    <section className="section bp-notice">
      <div className="bp-notice-head">
        {bp === 'tablet' ? <Icons.tablet /> : <Icons.mobile />}
        <span><b>{info.label}</b> – Änderungen gelten nur bis {info.max} px Bildschirmbreite.</span>
      </div>
      {keys.length > 0 && (
        <div className="row">
          <span className="bp-keys grow" title={keys.map(k => PROP_NAMES[k] ?? k).join(', ')}>
            Angepasst: {keys.map(k => PROP_NAMES[k] ?? k).join(', ')}
          </span>
          <IconButton icon={<Icons.reset />} title={`Anpassungen für ${info.label} zurücksetzen`} onClick={() => resetOverrides(nodes.map(n => n.id))} />
        </div>
      )}
    </section>
  );
}

function AlignBar({ count }: { count: number }) {
  const multi = count > 1;
  const t = multi ? 'zueinander' : 'am Board';
  return (
    <section className="section alignbar">
      <div className="row tight">
        <IconButton icon={<Icons.alignLeft />} title={`Links ausrichten (${t})`} onClick={() => align('left')} />
        <IconButton icon={<Icons.alignHCenter />} title={`Horizontal zentrieren (${t})`} onClick={() => align('hcenter')} />
        <IconButton icon={<Icons.alignRight />} title={`Rechts ausrichten (${t})`} onClick={() => align('right')} />
        <IconButton icon={<Icons.alignTop />} title={`Oben ausrichten (${t})`} onClick={() => align('top')} />
        <IconButton icon={<Icons.alignVCenter />} title={`Vertikal zentrieren (${t})`} onClick={() => align('vcenter')} />
        <IconButton icon={<Icons.alignBottom />} title={`Unten ausrichten (${t})`} onClick={() => align('bottom')} />
        <span className="vsep" />
        <IconButton icon={<Icons.distH />} title="Horizontal verteilen (ab 3 Ebenen)" disabled={count < 3} onClick={() => distribute('h')} />
        <IconButton icon={<Icons.distV />} title="Vertikal verteilen (ab 3 Ebenen)" disabled={count < 3} onClick={() => distribute('v')} />
      </div>
    </section>
  );
}

function SizingSeg({ value, onChange, fill, auto, axis }: {
  value: Sizing | undefined; onChange: (v: Sizing) => void; fill: boolean; auto: boolean; axis: 'h' | 'v';
}) {
  const word = axis === 'h' ? 'Breite' : 'Höhe';
  const opts: { value: Sizing; icon: ReactNode; title: string }[] = [
    { value: 'fixed', icon: <Icons.sizeFixed style={axis === 'v' ? { transform: 'rotate(90deg)' } : undefined} />, title: `Feste ${word}` },
  ];
  if (fill) opts.push({ value: 'fill', icon: <Icons.sizeFill style={axis === 'v' ? { transform: 'rotate(90deg)' } : undefined} />, title: `${word} füllen – nimmt den verfügbaren Platz im Layout ein` });
  if (auto) opts.push({ value: 'auto', icon: <Icons.sizeAuto style={axis === 'v' ? { transform: 'rotate(90deg)' } : undefined} />, title: `${word} an Inhalt anpassen` });
  if (opts.length < 2) return null;
  return <Seg value={value} options={opts} onChange={onChange} />;
}

type PosChoice = 'flow' | 'free' | 'fixed' | 'sticky';

function MeasuresSection({ nodes, parents, upd }: { nodes: WNode[]; parents: (WNode | undefined)[]; upd: Upd }) {
  const measured = useMeasured(nodes.map(n => n.id));
  const page = useEditor(pageOf);
  const compPage = useEditor(s => isComponentPage(s.doc, s.pageId));
  const m = (i: number) => measured[i] ?? { x: nodes[i].x, y: nodes[i].y, w: nodes[i].w, h: nodes[i].h };
  const vals = nodes.map((_, i) => m(i));
  const inLayout = nodes.map((_, i) => !!parents[i]?.layout);
  const allInLayout = inLayout.every(Boolean);
  const flow = nodes.map((n, i) => inLayout[i] && !n.absolute);
  const anyFlow = flow.some(Boolean);
  const canFill = flow.every(Boolean);
  const canAuto = nodes.every(n => n.type === 'text' || (n.type === 'board' && !!n.layout));
  const showRadius = nodes.every(n => n.type !== 'text' && n.type !== 'ellipse' && n.type !== 'vector');
  const individual = showRadius && nodes[0].radii !== null;
  const radii = nodes[0].radii;
  const cornerTitles = ['oben links', 'oben rechts', 'unten rechts', 'unten links'];
  const ids = nodes.map(n => n.id);
  // Das Webseiten-Board und oberste Boards haben keine Position auf einer Seite
  const noPos = nodes.some(n => !n.parentId || (!compPage && isPageBoard(page, n.id)));
  const pos = common(nodes, (n): PosChoice => n.pin?.mode === 'fixed' ? 'fixed' : n.pin?.mode === 'sticky' ? 'sticky' : (n.absolute || !parents[nodes.indexOf(n)]?.layout) ? 'free' : 'flow');
  const hasLimits = nodes.some(n => n.minW !== null || n.maxW !== null || n.minH !== null || n.maxH !== null);
  const [limits, setLimits] = useState(false);

  const setSizing = (axis: 'h' | 'v', v: Sizing) => {
    upd(n => {
      const i = nodes.findIndex(x => x.id === n.id);
      if (axis === 'h') { n.sizingH = v; if (v === 'fixed' && i >= 0) n.w = Math.round(m(i).w); if (v === 'fill' && n.maxW === n.w) n.maxW = null; }
      else { n.sizingV = v; if (v === 'fixed' && i >= 0) n.h = Math.round(m(i).h); }
    }, 'sizing-' + axis);
  };
  const setPos = (v: PosChoice) => {
    if (v === 'flow' || v === 'sticky') upd(n => { n.absolute = false; }, 'absolute');
    if (v === 'free' && allInLayout) upd(n => { n.absolute = true; }, 'absolute');
    setShared(ids, n => {
      if (v === 'flow' || v === 'free') { n.pin = null; return; }
      const { x } = absPos(page, n);
      const bw = pageBoard(page)?.w ?? 1440;
      n.pin = { mode: v, h: n.pin?.h ?? (x + n.w / 2 > bw / 2 ? 'right' : 'left'), v: n.pin?.v ?? 'top', bottom: n.pin?.bottom ?? 24 };
    }, 'pin');
  };
  const sizeRow = (axis: 'h' | 'v') => {
    const word = axis === 'h' ? 'Breite' : 'Höhe';
    const val = commonVal(vals.map(v => (axis === 'h' ? v.w : v.h)));
    const mode = common(nodes, n => (axis === 'h' ? n.sizingH : n.sizingV));
    return (
      <div className="row">
        <span className="lbl">{word}</span>
        <NumberField title={`${word} in px`} value={val} min={1}
          onChange={v => upd(n => {
            // Eingebaute Animation: Breite und Höhe ändern sich immer zusammen
            if (isAnimInstance(n) && n.w > 0 && n.h > 0) {
              const r = n.h / n.w;
              if (axis === 'h') { n.w = v; n.h = Math.max(1, Math.round(v * r)); } else { n.h = v; n.w = Math.max(1, Math.round(v / r)); }
              n.sizingH = 'fixed'; n.sizingV = 'fixed';
              return;
            }
            if (axis === 'h') { n.w = v; n.sizingH = 'fixed'; } else { n.h = v; n.sizingV = 'fixed'; }
          }, axis === 'h' ? 'w' : 'h')} />
        {(canFill || canAuto) && !nodes.some(isAnimInstance) && (
          <select className="select size-mode" aria-label={`${word}: Verhalten`} value={mode ?? ''} onChange={e => setSizing(axis, e.target.value as Sizing)}>
            {mode === undefined && <option value="" disabled>Gemischt</option>}
            <option value="fixed">Fest</option>
            {(canFill || mode === 'fill') && <option value="fill" title="Füllt den freien Platz">Füllt aus</option>}
            {(canAuto || mode === 'auto') && <option value="auto">Passt sich an</option>}
          </select>
        )}
      </div>
    );
  };
  const mm = (k: 'minW' | 'maxW' | 'minH' | 'maxH', title: string) => (
    <NumberField title={`${title} (leer = keine Grenze)`} min={0} placeholder="–" suffix="px"
      value={common(nodes, n => n[k]) ?? undefined}
      onChange={v => upd(n => { n[k] = v; }, k)} onClear={() => upd(n => { n[k] = null; }, k)} />
  );

  return (
    <Section title="Position und Größe">
      {!noPos && (
        <div className="row">
          <span className="lbl">Position</span>
          <select className="select grow" aria-label="Position" value={pos ?? ''} onChange={e => setPos(e.target.value as PosChoice)}>
            {pos === undefined && <option value="" disabled>Gemischt</option>}
            {allInLayout && <option value="flow">Im Layout</option>}
            <option value="free">Frei</option>
            <option value="fixed">Bleibt im Fenster stehen</option>
            <option value="sticky" disabled={!allInLayout}>Bleibt oben kleben</option>
          </select>
        </div>
      )}
      {!noPos && pos !== 'flow' && pos !== 'sticky' && (
        <div className="row">
          <span className="lbl">Lage</span>
          <NumberField label="X" title={anyFlow ? 'Position wird vom Layout bestimmt' : 'Abstand vom linken Rand des Boards'} disabled={anyFlow}
            value={commonVal(vals.map(v => v.x))} onChange={v => upd(n => { n.x = v; }, 'x')} />
          <NumberField label="Y" title={anyFlow ? 'Position wird vom Layout bestimmt' : 'Abstand vom oberen Rand des Boards'} disabled={anyFlow}
            value={commonVal(vals.map(v => v.y))} onChange={v => upd(n => { n.y = v; }, 'y')} />
        </div>
      )}
      {pos === 'fixed' && <p className="hint">Bleibt beim Scrollen an dieser Stelle im Fenster. Feineinstellung im Reiter „Interaktion“ unter „Beim Scrollen“.</p>}
      {pos === 'sticky' && <p className="hint">Läuft mit, bis es oben am Fensterrand ankommt, und bleibt dort kleben.</p>}
      {sizeRow('h')}
      {sizeRow('v')}
      {hasLimits || limits ? (
        <>
          <div className="row">
            <span className="lbl">Breite</span>{mm('minW', 'Mindestbreite')}<span className="sep-word">bis</span>{mm('maxW', 'Höchstbreite')}
          </div>
          <div className="row">
            <span className="lbl">Höhe</span>{mm('minH', 'Mindesthöhe')}<span className="sep-word">bis</span>{mm('maxH', 'Höchsthöhe')}
          </div>
          <p className="hint">Grenzen: so klein bzw. so groß wird das Element höchstens – z. B. „Breite bis 1400 px“ bei einem Inhalt, der den Platz füllt.</p>
        </>
      ) : (
        <div className="row"><span className="lbl">Grenzen</span>
          <button type="button" className="btn small" onClick={() => setLimits(true)}><Icons.plus /> Mindest-/Höchstmaße</button></div>
      )}
      <div className="row">
        <span className="lbl">Drehung</span>
        <NumberField title="Drehung" suffix="°" value={common(nodes, n => n.rotation)}
          onChange={v => upd(n => { n.rotation = ((v % 360) + 360) % 360; }, 'rot')} />
        <div className="grow" />
      </div>
      {showRadius && (
        <div className="row">
          <span className="lbl">Ecken</span>
          <NumberField title="Eckenradius in px" min={0}
            value={individual ? undefined : common(nodes, n => n.radius)} placeholder={individual ? 'Einzeln' : undefined}
            onChange={v => upd(n => { n.radius = v; n.radii = null; }, 'radius')} />
          <Seg value={individual ? 'each' : 'all'} onChange={v => upd(n => { n.radii = v === 'each' ? [n.radius, n.radius, n.radius, n.radius] : null; }, 'radii-toggle')} options={[
            { value: 'all', icon: <span>Alle</span>, title: 'Alle Ecken gleich' },
            { value: 'each', icon: <span>Einzeln</span>, title: 'Jede Ecke einzeln' },
          ]} />
        </div>
      )}
      {individual && radii && (
        <div className="row">
          <span className="lbl" />
          <div className="quad">
            {[0, 1, 2, 3].map(i => (
              <label key={i}>
                <NumberField title={`Radius ${cornerTitles[i]}`} min={0} value={common(nodes, n => n.radii?.[i])}
                  onChange={v => upd(n => { if (n.radii) n.radii[i] = v; }, 'radii' + i)} />
                <small>{['o. l.', 'o. r.', 'u. r.', 'u. l.'][i]}</small>
              </label>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

const JUSTIFY: [Justify, string][] = [
  ['start', 'Am Anfang'], ['center', 'Mittig'], ['end', 'Am Ende'],
  ['space-between', 'Abstand dazwischen'], ['space-around', 'Abstand rundherum'], ['space-evenly', 'Gleichmäßig verteilt'],
];

const alignOpts = (row: boolean): { value: AlignItems; icon: ReactNode; title: string }[] => {
  const rot = row ? { transform: 'rotate(90deg)' } : undefined;
  return [
    { value: 'start', icon: <Icons.alignStart style={rot} />, title: row ? 'Oben ausrichten' : 'Links ausrichten' },
    { value: 'center', icon: <Icons.alignCenter style={rot} />, title: 'Mittig ausrichten' },
    { value: 'end', icon: <Icons.alignEnd style={rot} />, title: row ? 'Unten ausrichten' : 'Rechts ausrichten' },
    { value: 'stretch', icon: <Icons.alignStretch style={rot} />, title: 'Strecken' },
  ];
};

const fr = (n: number): Track[] => Array.from({ length: Math.max(1, n) }, () => ({ unit: 'fr' as const, value: 1 }));
const uniform = (t: Track[]) => t.every(x => x.unit === 'fr' && x.value === t[0]?.value);

function LayoutSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const L = nodes.length === 1 ? nodes[0].layout : common(nodes, n => n.layout);
  const any = nodes.some(n => n.layout);
  const [indivPad, setIndivPad] = useState(false);
  const [ownCols, setOwnCols] = useState(false);
  const setL = <K extends keyof Layout>(k: K, v: Layout[K]) => upd(n => {
    if (!n.layout) return;
    n.layout[k] = v;
    // eigener Wert: Verknüpfung mit der Abstands-Stufe lösen
    if (k === 'gap') n.layout.gapRef = null;
    if (k === 'padding') n.layout.padRef = null;
  }, 'layout-' + k);
  const add = (type: 'flex' | 'grid') => nodes.forEach(n => addLayout(n.id, type));

  if (!any) {
    return (
      <Section title="Layout" empty actions={<>
        <IconButton icon={<Icons.flexRow />} title={`Stapel hinzufügen (${SHIFT}A) – Elemente automatisch neben- oder untereinander`} onClick={() => add('flex')} />
        <IconButton icon={<Icons.grid />} title="Raster hinzufügen – Elemente in Spalten und Zeilen" onClick={() => add('grid')} />
      </>} />
    );
  }
  if (!L) return <Section title="Layout"><p className="hint">Die ausgewählten Boards haben unterschiedliche Layouts.</p></Section>;

  const row = L.type === 'flex' && L.direction === 'row';
  const pad = L.padding;
  const padSame = pad.every(v => v === pad[0]);
  const showIndiv = indivPad || !padSame;
  const auto = L.type === 'grid' && !!L.colMin;
  const custom = L.type === 'grid' && !auto && (ownCols || !uniform(L.columns));
  const yes = (v: boolean, set: (b: boolean) => void, t: string) => (
    <Seg value={v ? 'yes' : 'no'} onChange={x => set(x === 'yes')} options={[
      { value: 'yes', icon: <span>Ja</span>, title: t }, { value: 'no', icon: <span>Nein</span>, title: t },
    ]} />
  );
  const words = (opts: [AlignItems, string][]) => opts.map(([value, w]) => ({ value, icon: <span>{w}</span>, title: w }));

  return (
    <Section title="Layout" actions={<IconButton icon={<Icons.minus />} title="Layout entfernen – Elemente frei verschieben" onClick={() => upd(n => { n.layout = null; }, 'layout-del')} />}>
      <div className="row">
        <span className="lbl">Art</span>
        <Seg value={L.type} onChange={v => upd(n => { if (!n.layout) return; n.layout.type = v; if (v === 'grid' && !n.layout.columns.length) n.layout.columns = fr(2); }, 'layout-type')} options={[
          { value: 'flex', icon: <span>Stapel</span>, title: 'Elemente neben- oder untereinander' },
          { value: 'grid', icon: <span>Raster</span>, title: 'Elemente in Spalten und Zeilen' },
        ]} />
      </div>

      {L.type === 'flex' ? (
        <>
          <div className="row">
            <span className="lbl">Richtung</span>
            <Seg value={L.direction} onChange={v => setL('direction', v)} options={[
              { value: 'row', icon: <span>↔ Neben</span>, title: 'Nebeneinander (Reihe)' },
              { value: 'column', icon: <span>↕ Unter</span>, title: 'Untereinander (Spalte)' },
            ]} />
          </div>
          <div className="row">
            <span className="lbl">Verteilung</span>
            <select className="select grow" value={L.justify} aria-label="Verteilung" onChange={e => setL('justify', e.target.value as Justify)}>
              {JUSTIFY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="row">
            <span className="lbl">Ausrichtung</span>
            <Seg value={L.align} onChange={v => setL('align', v)} options={words(row
              ? [['start', 'Oben'], ['center', 'Mitte'], ['end', 'Unten'], ['stretch', 'Strecken']]
              : [['start', 'Links'], ['center', 'Mitte'], ['end', 'Rechts'], ['stretch', 'Strecken']])} />
          </div>
          <div className="row">
            <span className="lbl">Umbrechen</span>
            {yes(L.wrap, b => setL('wrap', b), 'In eine neue Zeile rutschen, wenn der Platz nicht reicht')}
          </div>
          <div className="row">
            <span className="lbl">Abstand</span>
            <NumberField title="Abstand zwischen den Elementen" min={0} suffix="px" value={L.gap} onChange={v => setL('gap', v)} />
            <SpaceChips ids={nodes.map(n => n.id)} kind="gap" active={L.gapRef} />
            {L.wrap
              ? <NumberField label="Zeilen" title="Abstand zwischen den Zeilen (beim Umbrechen)" min={0} suffix="px" value={L.rowGap} onChange={v => setL('rowGap', v)} />
              : <div className="grow" />}
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <span className="lbl">Spaltenbreite</span>
            <Seg value={auto ? 'auto' : custom ? 'own' : 'same'} onChange={v => {
              setOwnCols(v === 'own');
              upd(n => {
                if (!n.layout) return;
                if (v === 'auto') n.layout.colMin = n.layout.colMin || 240;
                else { n.layout.colMin = null; if (v === 'same' && !uniform(n.layout.columns)) n.layout.columns = fr(n.layout.columns.length || 2); }
              }, 'layout-colmode');
            }} options={[
              { value: 'same', icon: <span>Gleich</span>, title: 'Feste Anzahl gleich breiter Spalten' },
              { value: 'auto', icon: <span>Automatisch</span>, title: 'So viele Spalten, wie hineinpassen – passt sich jeder Fensterbreite an' },
              { value: 'own', icon: <span>Eigene</span>, title: 'Jede Spalte einzeln einstellen' },
            ]} />
          </div>
          {auto ? (
            <div className="row">
              <span className="lbl">mindestens</span>
              <NumberField title="Mindestbreite einer Spalte – passen mehr hinein, kommen Spalten dazu" min={40} suffix="px" precision={0} value={L.colMin ?? 240} onChange={v => setL('colMin', v)} />
              <div className="grow" />
            </div>
          ) : custom ? (
            <TrackList title="Spalten" tracks={L.columns} onChange={t => setL('columns', t)} minCount={1} />
          ) : (
            <Counter label="Spalten" value={L.columns.length} min={1} onChange={c => setL('columns', fr(c))} />
          )}
          <Counter label="Zeilen" value={L.rows.length} min={0} zeroText="Automatisch" onChange={c => setL('rows', c ? Array.from({ length: c }, () => ({ unit: 'auto' as const, value: 1 })) : [])} />
          <div className="row">
            <span className="lbl">Abstand</span>
            <NumberField label="↔" title="Abstand zwischen den Spalten" min={0} suffix="px" value={L.gap} onChange={v => setL('gap', v)} />
            <NumberField label="↕" title="Abstand zwischen den Zeilen" min={0} suffix="px" value={L.rowGap} onChange={v => setL('rowGap', v)} />
            <SpaceChips ids={nodes.map(n => n.id)} kind="gap" active={L.gapRef} />
          </div>
          <div className="row">
            <span className="lbl">Mauerwerk</span>
            {yes(!!L.masonry, b => setL('masonry', b), 'Unterschiedlich hohe Kacheln greifen lückenlos ineinander (wie bei Pinterest)')}
          </div>
          {!L.masonry && (
            <>
              <div className="row">
                <span className="lbl">In der Zelle</span>
                <Seg value={L.justifyItems} onChange={v => setL('justifyItems', v)} options={words([['start', 'Links'], ['center', 'Mitte'], ['end', 'Rechts'], ['stretch', 'Breit']])} />
              </div>
              <div className="row">
                <span className="lbl" />
                <Seg value={L.align} onChange={v => setL('align', v)} options={words([['start', 'Oben'], ['center', 'Mitte'], ['end', 'Unten'], ['stretch', 'Hoch']])} />
              </div>
            </>
          )}
          {L.masonry && <p className="hint">Die Kacheln laufen spaltenweise von oben nach unten. Zeilen und Zellen-Platzierung gelten dann nicht.</p>}
        </>
      )}

      <div className="row">
        <span className="lbl">Innenabstand</span>
        <NumberField title="Innenabstand an allen Seiten" min={0} suffix="px" value={showIndiv && !padSame ? undefined : pad[0]} placeholder={padSame ? undefined : 'Gemischt'}
          onChange={v => setL('padding', [v, v, v, v])} />
        <SpaceChips ids={nodes.map(n => n.id)} kind="pad" active={L.padRef} />
        <Seg value={showIndiv ? 'each' : 'all'} onChange={v => { if (v === 'all') { setIndivPad(false); setL('padding', [pad[0], pad[0], pad[0], pad[0]]); } else setIndivPad(true); }} options={[
          { value: 'all', icon: <span>Alle</span>, title: 'An allen Seiten gleich' },
          { value: 'each', icon: <span>Einzeln</span>, title: 'Jede Seite einzeln' },
        ]} />
      </div>
      {showIndiv && (
        <div className="row">
          <span className="lbl" />
          <div className="quad">
            {(['oben', 'rechts', 'unten', 'links'] as const).map((w, i) => (
              <label key={w}>
                <NumberField title={`Innenabstand ${w}`} min={0} value={pad[i]} onChange={v => setL('padding', pad.map((x, j) => (j === i ? v : x)) as Layout['padding'])} />
                <small>{w}</small>
              </label>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/** Anzahl mit − und + (0 = „Automatisch“, wenn zeroText gesetzt) */
function Counter({ label, value, min, onChange, zeroText }: { label: string; value: number; min: number; onChange: (v: number) => void; zeroText?: string }) {
  return (
    <div className="row">
      <span className="lbl">{label}</span>
      <NumberField title={label} min={min} max={24} precision={0} value={value || (zeroText ? undefined : value)} placeholder={zeroText}
        onChange={v => onChange(Math.max(min, Math.min(24, Math.round(v))))} onClear={zeroText ? () => onChange(0) : undefined} />
      <div className="stepper">
        <button type="button" className="ibtn" title={`${label}: eine weniger`} aria-label={`${label}: eine weniger`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <button type="button" className="ibtn" title={`${label}: eine mehr`} aria-label={`${label}: eine mehr`} onClick={() => onChange(Math.min(24, value + 1))}>+</button>
      </div>
    </div>
  );
}

function TrackList({ title, tracks, onChange, emptyHint, noAuto, minCount = 0 }: { title: string; tracks: Track[]; onChange: (t: Track[]) => void; emptyHint?: string; noAuto?: boolean; minCount?: number }) {
  const set = (i: number, t: Partial<Track>) => onChange(tracks.map((x, j) => (j === i ? { ...x, ...t } : x)));
  return (
    <div className="tracks">
      <div className="row">
        <span className="lbl grow">{title}</span>
        <IconButton icon={<Icons.plus />} title={`${title.slice(0, -1)} hinzufügen`} onClick={() => onChange([...tracks, { unit: 'fr', value: 1 }])} />
      </div>
      {!tracks.length && emptyHint && <p className="hint">{emptyHint}</p>}
      {tracks.map((t, i) => (
        <div className="row" key={i}>
          <span className="track-no">{i + 1}</span>
          <NumberField title={`${title} ${i + 1}: Größe`} min={0} step={t.unit === 'fr' ? 0.5 : 1} disabled={t.unit === 'auto'}
            value={t.unit === 'auto' ? undefined : t.value} placeholder={t.unit === 'auto' ? 'auto' : undefined}
            onChange={v => set(i, { value: v })} />
          <select className="select unit" value={t.unit} aria-label="Einheit" onChange={e => set(i, { unit: e.target.value as Track['unit'] })}>
            <option value="fr">Anteil (fr)</option><option value="px">Pixel</option>{!noAuto && <option value="auto">Automatisch</option>}
          </select>
          <IconButton icon={<Icons.minus />} title="Entfernen" disabled={tracks.length <= minCount} onClick={() => tracks.length > minCount && onChange(tracks.filter((_, j) => j !== i))} />
        </div>
      ))}
    </div>
  );
}

function LayoutItemSection({ nodes, parents, upd }: { nodes: WNode[]; parents: WNode[]; upd: Upd }) {
  const abs = common(nodes, n => n.absolute);
  const grid = parents.every(p => p.layout?.type === 'grid' && !p.layout.masonry);
  const row = parents.every(p => p.layout?.type === 'flex' && p.layout.direction === 'row');
  const g = (k: 'col' | 'row' | 'colSpan' | 'rowSpan') => common(nodes, n => n.grid?.[k] ?? (k.endsWith('Span') ? 1 : 0));
  const setG = (k: 'col' | 'row' | 'colSpan' | 'rowSpan', v: number) =>
    upd(n => { n.grid = { col: 0, row: 0, colSpan: 1, rowSpan: 1, ...(n.grid ?? {}), [k]: Math.max(k.endsWith('Span') ? 1 : 0, Math.round(v)) }; }, 'grid-' + k);
  if (abs === true) return null;
  return (
    <Section title="Im Layout">
      <div className="row">
        <span className="lbl">Ausrichtung</span>
        <select className="select grow" value={common(nodes, n => n.alignSelf) ?? 'auto'} aria-label="Eigene Ausrichtung"
          onChange={e => upd(n => { n.alignSelf = e.target.value as WNode['alignSelf']; }, 'alignSelf')}>
          <option value="auto">Wie das Layout</option>
          <option value="start">{row ? 'Oben' : 'Links'}</option><option value="center">Mitte</option>
          <option value="end">{row ? 'Unten' : 'Rechts'}</option><option value="stretch">Ganze {row ? 'Höhe' : 'Breite'}</option>
        </select>
      </div>
      {grid && (
        <>
          <div className="row">
            <span className="lbl">Spalte</span>
            <NumberField title="In welcher Spalte (0 = automatisch)" min={0} precision={0} placeholder="auto" value={g('col') || undefined} onChange={v => setG('col', v)} onClear={() => setG('col', 0)} />
            <span className="sep-word">breit</span>
            <NumberField title="Wie viele Spalten breit" min={1} precision={0} suffix="Sp." value={g('colSpan')} onChange={v => setG('colSpan', v)} />
          </div>
          <div className="row">
            <span className="lbl">Zeile</span>
            <NumberField title="In welcher Zeile (0 = automatisch)" min={0} precision={0} placeholder="auto" value={g('row') || undefined} onChange={v => setG('row', v)} onClear={() => setG('row', 0)} />
            <span className="sep-word">hoch</span>
            <NumberField title="Wie viele Zeilen hoch" min={1} precision={0} suffix="Z." value={g('rowSpan')} onChange={v => setG('rowSpan', v)} />
          </div>
        </>
      )}
      <p className="hint">Frei verschieben oder fixieren: oben bei „Position“.</p>
    </Section>
  );
}

function BoardSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const w = common(nodes, n => n.w), h = common(nodes, n => n.h);
  const match = BOARD_PRESETS.flatMap(g => g.items).find(([, pw, ph]) => pw === w && ph === h);
  const allRoot = nodes.every(n => n.parentId === null);
  const page = useEditor(pageOf);
  const compPage = useEditor(s => isComponentPage(s.doc, s.pageId));
  const site = nodes.length === 1 && !compPage && isPageBoard(page, nodes[0].id) ? nodes[0] : null;
  const desktopW = useEditor(s => (site ? pageOf(s).nodes[site.id]?.w : undefined)) ?? 1440;
  const cw = site?.contentWidth ?? null;
  const setCw = (v: number | null) => site && setShared([site.id], n => { n.contentWidth = v; }, 'contentWidth');
  const align = site?.contentAlign ?? 'center';
  const alignWord = align === 'left' ? 'links' : align === 'right' ? 'rechts' : 'mittig';
  return (
    <>
    <Section title="Board">
      <div className="row">
        <select className="select grow" value={match ? match[0] : ''} aria-label="Größenvorlage"
          onChange={e => {
            const item = BOARD_PRESETS.flatMap(g => g.items).find(i => i[0] === e.target.value);
            if (item) upd(n => { n.w = item[1]; n.h = item[2]; n.sizingH = 'fixed'; n.sizingV = 'fixed'; }, 'preset');
          }}>
          <option value="" disabled>Größenvorlage wählen …</option>
          {BOARD_PRESETS.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map(([name, pw, ph]) => <option key={name} value={name}>{name} – {pw} × {ph}</option>)}
            </optgroup>
          ))}
        </select>
        <IconButton icon={<Icons.swap />} title="Hoch-/Querformat tauschen" onClick={() => upd(n => { const t = n.w; n.w = n.h; n.h = t; }, 'swap')} />
      </div>
      <label className="check">
        <input type="checkbox" checked={common(nodes, n => n.clip) ?? false}
          onChange={e => upd(n => { n.clip = e.target.checked; }, 'clip')} />
        Inhalt am Rand abschneiden
      </label>
      {allRoot && (
        <label className="check" title="Die Breite dieses Boards folgt dem Breakpoint-Umschalter oben (Tablet 768 px, Mobil 390 px).">
          <input type="checkbox" checked={common(nodes, n => n.site) ?? false}
            onChange={e => upd(n => { n.site = e.target.checked; }, 'site')} />
          Webseite – passt sich an Breakpoints an
        </label>
      )}
      {nodes.length === 1 && !site && nodes[0].parentId && <FullscreenRows node={nodes[0]} />}
    </Section>
    {site && <SiteSection site={site} />}
    </>
  );
}

/** Nur am Webseiten-Board: Einstellungen für die ganze Webseite */
function SiteSection({ site }: { site: WNode }) {
  const desktopW = useEditor(s => pageOf(s).nodes[site.id]?.w) ?? 1440;
  const base = useEditor(s => s.doc.site?.baseFont ?? 16);
  const grid = useEditor(s => pageOf(s).nodes[site.id]?.colGrid ?? null);
  const cw = site.contentWidth ?? null;
  const setCw = (v: number | null) => setShared([site.id], n => { n.contentWidth = v; }, 'contentWidth');
  const align = site.contentAlign ?? 'center';
  const alignWord = align === 'left' ? 'links' : align === 'right' ? 'rechts' : 'mittig';
  const setBase = (v: number) => useEditor.getState().mutate((_, d) => { d.site = { ...(d.site ?? { name: d.name, lang: 'de', url: '', favicon: null, selfHostFonts: false }), baseFont: Math.max(10, Math.min(28, Math.round(v))) }; }, { key: 'baseFont' });
  const gridKey = !grid ? 'off' : `${grid.count}`;
  const trans = useEditor(s => s.doc.site?.pageTransition ?? 'none');
  const mstyle = useEditor(s => s.doc.site?.motionStyle ?? 'normal');
  const setSite = (patch: Partial<NonNullable<WDocument['site']>>, key: string) => useEditor.getState().mutate((_, d) => { d.site = { ...(d.site ?? { name: d.name, lang: 'de', url: '', favicon: null, selfHostFonts: false }), ...patch }; }, { key });
  return (
    <Section title="Webseite">
      <div className="row">
        <span className="lbl">Inhaltsbreite</span>
        <NumberField title="Größte Breite des Inhalts in breiten Fenstern" suffix="px" min={320} max={4000} step={10} precision={0}
          value={cw ?? undefined} placeholder="unbegrenzt" disabled={cw === null} onChange={v => setCw(v)} />
        <Seg value={cw === null ? 'off' : 'on'} onChange={v => setCw(v === 'on' ? desktopW : null)} options={[
          { value: 'off', icon: <span>Aus</span>, title: 'Inhalt wächst mit dem Fenster' },
          { value: 'on', icon: <span>An</span>, title: 'In breiten Fenstern bleibt der Inhalt höchstens so breit' },
        ]} />
      </div>
      {cw !== null && (
        <div className="row">
          <span className="lbl">Inhalt steht</span>
          <Seg value={align} onChange={v => setShared([site.id], n => { n.contentAlign = v === 'center' ? undefined : v; }, 'contentAlign')} options={[
            { value: 'left', icon: <span>Links</span>, title: 'Inhalt am linken Fensterrand, rechts freie Fläche' },
            { value: 'center', icon: <span>Mitte</span>, title: 'Inhalt mittig, links und rechts gleich viel freie Fläche' },
            { value: 'right', icon: <span>Rechts</span>, title: 'Inhalt am rechten Fensterrand, links freie Fläche' },
          ]} />
        </div>
      )}
      <Counter label="Grundschrift" value={base} min={10} onChange={setBase} />
      <div className="row">
        <span className="lbl">Hilfsraster</span>
        <select className="select grow" aria-label="Hilfsraster" value={gridKey} onChange={e => {
          const v = e.target.value;
          setGrid([site.id], v === 'off' ? null : { ...(grid ?? defaultGrid()), count: +v, visible: true });
        }}>
          <option value="off">Aus</option>
          {grid && ![12, 6, 4].includes(grid.count) && <option value={String(grid.count)}>{grid.count} Spalten</option>}
          <option value="12">12 Spalten · {grid?.gutter ?? 24} px Abstand</option>
          <option value="6">6 Spalten</option>
          <option value="4">4 Spalten</option>
        </select>
      </div>
      <div className="row">
        <span className="lbl">Seitenwechsel</span>
        <select className="select grow" aria-label="Übergang beim Seitenwechsel" value={trans} onChange={e => setSite({ pageTransition: e.target.value as 'none' }, 'pageTransition')}>
          <option value="none">Direkt</option>
          <option value="fade">Überblenden</option>
          <option value="slide">Schieben</option>
        </select>
      </div>
      <div className="row">
        <span className="lbl">Bewegungen</span>
        <Seg value={mstyle} onChange={v => setSite({ motionStyle: v === 'normal' ? undefined : v }, 'motionStyle')} options={[
          { value: 'calm', icon: <span>Ruhig</span>, title: 'Alle Bewegungen langsamer und sanfter' },
          { value: 'normal', icon: <span>Normal</span>, title: 'Wie eingestellt' },
          { value: 'lively', icon: <span>Lebhaft</span>, title: 'Alle Bewegungen schneller und kräftiger' },
        ]} />
      </div>
      <DesignRows />
      <p className="proto-hint">
        {cw === null
          ? 'Inhaltsbreite aus: In breiteren Fenstern ziehen sich Elemente im Layout mit in die Breite.'
          : `In breiteren Fenstern bleibt der Inhalt höchstens ${cw} px breit und steht ${alignWord}. Hintergründe laufen bis zum Rand.`}
        {' '}Grundschrift: Größe für neue Texte und für Text ohne eigene Größe. Das Hilfsraster ist nur im Editor zu sehen (Feineinstellung unten unter „Spaltenraster“). Seitenwechsel und Bewegungen siehst du in der Vorschau; wer „Bewegung reduzieren“ eingestellt hat, bekommt sie ruhig.
      </p>
    </Section>
  );
}

/** Abstands-Stufen */
function DesignRows() {
  const space = useEditor(useShallow(s => spaceOf(s.doc)));
  return (
    <>
      <div className="row space-steps">
        <span className="lbl" title="Feste Abstands-Stufen S, M, L, XL. Änderst du eine Stufe, ändern sich alle Abstände, die diese Stufe benutzen.">Abstände</span>
        {SPACE_TOKENS.map(t => (
          <NumberField key={t} label={SPACE_NAMES[t]} title={`Stufe ${SPACE_NAMES[t]} in Pixel`} min={0} max={400} step={1} precision={0}
            value={space[t]} onChange={v => setSpaceStep(t, v)} />
        ))}
      </div>
    </>
  );
}

/** Vollbild: Bereich füllt beim Öffnen das ganze Fenster (z. B. Hero) */
function FullscreenRows({ node }: { node: WNode }) {
  const page = useEditor(pageOf);
  const raw = useEditor(s => pageOf(s).nodes[node.id]);
  const fs = raw?.fullscreen ?? null;
  const parent = raw?.parentId ? page.nodes[raw.parentId] : undefined;
  const canStay = !!parent?.layout && parent.layout.type === 'flex' && parent.layout.direction === 'column' && !raw?.absolute;
  // Vorschlag für den Abzug: Höhe einer fixierten Kopfleiste über diesem Bereich
  const header = parent ? parent.children.map(id => page.nodes[id]).find(c => c && c.id !== node.id && c.pin && (isHeader(c) || c.pin.mode === 'sticky')) : undefined;
  const set = (v: WNode['fullscreen']) => setShared([node.id], n => { n.fullscreen = v; }, 'fullscreen');
  return (
    <>
      <label className="check" title="Der Bereich ist beim Öffnen der Seite genau so hoch wie das Browserfenster – auf jedem Bildschirm. Darunter folgt beim Scrollen der restliche Inhalt.">
        <input type="checkbox" checked={!!fs} onChange={e => set(e.target.checked ? { offset: header ? Math.round(header.h) : 0, stay: false } : null)} />
        Füllt beim Öffnen das ganze Fenster (Vollbild)
      </label>
      {fs && (
        <>
          <div className="row">
            <span className="lbl">Abzüglich</span>
            <NumberField title="So viel weniger als die Fensterhöhe, z. B. die Höhe einer fixierten Kopfleiste darüber" suffix="px" min={0} max={600} step={1} precision={0}
              value={fs.offset} onChange={v => set({ ...fs, offset: v })} />
          </div>
          {canStay && (
            <label className="check" title="Der Bereich bleibt stehen, der folgende Inhalt schiebt sich beim Scrollen darüber.">
              <input type="checkbox" checked={fs.stay} onChange={e => set({ ...fs, stay: e.target.checked })} />
              Bleibt stehen – Inhalt schiebt sich darüber
            </label>
          )}
          <p className="proto-hint">
            Im Editor bleibt die gezeichnete Höhe, in der Vorschau und online füllt der Bereich das Fenster.
            {header && fs.offset === 0 && <> Tipp: „{header.name}“ ist fixiert – trage ihre Höhe ({Math.round(header.h)} px) bei „Abzüglich“ ein.</>}
            {fs.stay && <> Die Bereiche darunter brauchen eine Füllfarbe, sonst scheint der stehende Bereich durch.</>}
            {' '}Inhalte bleiben mittig, wenn der Bereich ein Layout mit vertikaler Ausrichtung „Mitte“ hat.
          </p>
        </>
      )}
    </>
  );
}

/** Spaltenraster und Hilfslinien eines Boards (nur Hilfen im Editor) */
function GridSection({ nodes }: { nodes: WNode[] }) {
  const ids = nodes.map(n => n.id);
  const grid = nodes[0].colGrid ?? null;
  const bp = useEditor(s => s.breakpoint);
  const gridsOn = useView(s => s.grids);
  const guideCount = nodes.reduce((a, n) => a + (n.guides?.length ?? 0), 0);
  const set = (patch: Partial<ColumnGrid>, key: string) => {
    if (!grid) return;
    const next = { ...grid, ...patch };
    for (const k of Object.keys(patch) as (keyof ColumnGrid)[]) if (patch[k] === undefined) delete next[k];
    setGrid(ids, next, 'colgrid-' + key);
  };
  const indiv = !!grid?.cols?.length;
  const sepMargin = grid?.marginRight !== undefined;
  return (
    <Section title="Spaltenraster" empty={!grid && !guideCount}
      actions={!grid && <IconButton icon={<Icons.plus />} title="Spaltenraster hinzufügen" onClick={() => setGrid(ids, defaultGrid(), 'colgrid-add')} />}>
      {grid && (
        <>
          <div className="row">
            {indiv
              ? <span className="lbl grow">Unterschiedliche Breiten</span>
              : <NumberField label="Spalten" className="grow" title="Anzahl der Spalten (alle gleich breit)" min={1} max={48} precision={0} value={grid.count} onChange={v => set({ count: v }, 'count')} />}
            <IconButton icon={<Icons.flexRow />} active={indiv}
              title={indiv ? 'Alle Spalten wieder gleich breit' : 'Jede Spalte einzeln einstellen (unterschiedliche Breiten)'}
              onClick={() => indiv ? set({ cols: undefined }, 'cols') : set({ cols: gridCols(grid).map(c => ({ ...c })) }, 'cols')} />
            <IconButton icon={grid.visible ? <Icons.eye /> : <Icons.eyeOff />} title={grid.visible ? 'Ausblenden' : 'Einblenden'} onClick={() => set({ visible: !grid.visible }, 'vis')} />
            <IconButton icon={<Icons.minus />} title="Spaltenraster entfernen" onClick={() => setGrid(ids, null, 'colgrid-del')} />
          </div>
          {indiv && (
            <TrackList title="Spalten" noAuto minCount={1} tracks={grid.cols!}
              onChange={t => set({ cols: t.map(c => ({ unit: c.unit === 'px' ? 'px' : 'fr', value: c.value })), count: t.length }, 'cols')} />
          )}
          <div className="row">
            <NumberField label="Abstand" className="grow" title="Abstand zwischen den Spalten" suffix="px" min={0} precision={0} value={grid.gutter} onChange={v => set({ gutter: v }, 'gutter')} />
            {!sepMargin && <NumberField label="Rand" className="grow" title="Rand links und rechts" suffix="px" min={0} precision={0} value={grid.margin} onChange={v => set({ margin: v }, 'margin')} />}
            <IconButton icon={<Icons.corners />} active={sepMargin}
              title={sepMargin ? 'Rand links und rechts wieder gleich' : 'Rand links und rechts getrennt einstellen'}
              onClick={() => set({ marginRight: sepMargin ? undefined : grid.margin }, 'mr')} />
          </div>
          {sepMargin && (
            <div className="row">
              <NumberField label={<Icons.padL />} className="grow" title="Rand links" suffix="px" min={0} precision={0} value={grid.margin} onChange={v => set({ margin: v }, 'margin')} />
              <NumberField label={<Icons.padR />} className="grow" title="Rand rechts" suffix="px" min={0} precision={0} value={grid.marginRight} onChange={v => set({ marginRight: v }, 'mr')} />
              <div className="ibtn-spacer" />
            </div>
          )}
          <div className="row">
            <ColorField color={grid.color} opacity={grid.opacity} onChange={c => set({ ...(c.color ? { color: c.color } : {}), ...(c.opacity !== undefined ? { opacity: c.opacity } : {}) }, 'color')} />
          </div>
          <p className="hint">
            Nur eine Hilfe im Editor – erscheint nicht auf der Website. Ebenen rasten an den Spaltenkanten ein.
            {bp !== 'desktop' ? ' Änderungen gelten nur für diese Ansicht.' : ' Für Tablet und Mobil kannst du eigene Spalten einstellen.'}
            {!gridsOn && ' Spaltenraster sind gerade ausgeblendet (⇧G).'}
          </p>
        </>
      )}
      {guideCount > 0 && (
        <div className="row">
          <span className="grow muted">{guideCount === 1 ? '1 Hilfslinie' : `${guideCount} Hilfslinien`}</span>
          <button type="button" className="btn ghost small" onClick={() => clearGuides(ids)}>Hilfslinien löschen</button>
        </div>
      )}
      {!grid && !guideCount && <p className="hint">Hilfslinien ziehst du aus dem Lineal am Rand der Arbeitsfläche.</p>}
    </Section>
  );
}

function ImageSection({ node, upd }: { node: WNode; upd: Upd }) {
  return (
    <Section title="Bild">
      <div className="row">
        <select className="select grow" value={node.objectFit ?? 'cover'} aria-label="Bildanpassung"
          onChange={e => upd(n => { n.objectFit = e.target.value as WNode['objectFit']; }, 'fit')}>
          <option value="cover">Füllen (zuschneiden)</option>
          <option value="contain">Einpassen (ganz sichtbar)</option>
          <option value="fill">Strecken</option>
        </select>
      </div>
      <div className="row">
        <button className="btn grow" onClick={async () => { const [f] = await pickFiles('image/*', false); if (f) replaceImage(node.id, f); }}>Bild ersetzen …</button>
        <button className="btn grow" onClick={() => originalImageSize(node.id)}>Originalgröße</button>
      </div>
      {(node.objectFit ?? 'cover') === 'cover' && <FocusPicker node={node} upd={upd} />}
      <div className="row">
        <label className="check grow" title="Beim Klick öffnet sich das Bild groß über der Seite. Liegen mehrere solche Bilder zusammen, kann man durchblättern (Pfeile, Wischen).">
          <input type="checkbox" checked={!!node.zoom} disabled={!!node.link} onChange={e => upd(n => { n.zoom = e.target.checked || undefined; }, 'zoom')} />
          Beim Klick groß zeigen
        </label>
      </div>
      {node.link && <p className="proto-hint keep">Das Bild hat einen Link – deshalb kann es nicht groß gezeigt werden.</p>}
      <div className="lbl-top" title="Kurze Beschreibung, was auf dem Bild zu sehen ist. Hilft blinden Menschen (Vorlesen) und Suchmaschinen.">Bildbeschreibung</div>
      <textarea className="input alt-input" rows={2} aria-label="Bildbeschreibung" disabled={node.alt === ''}
        placeholder={`Was ist zu sehen? (sonst: „${node.name}“)`} value={node.alt ?? ''}
        onChange={e => upd(n => { n.alt = e.target.value || undefined; }, 'alt')} />
      <label className="check" title="Für Bilder, die nur schmücken (Muster, Formen). Vorleseprogramme überspringen sie dann.">
        <input type="checkbox" checked={node.alt === ''} onChange={e => upd(n => { n.alt = e.target.checked ? '' : undefined; }, 'alt')} />
        Nur Schmuck – nichts vorlesen
      </label>
    </Section>
  );
}

/** Fokuspunkt: welcher Teil des Bildes beim Zuschneiden sichtbar bleibt */
function FocusPicker({ node, upd }: { node: WNode; upd: Upd }) {
  const src = useEditor(s => (node.imageRef ? s.doc.library.images.find(i => i.id === node.imageRef)?.src : undefined)) ?? node.src;
  if (!src) return null;
  const f = node.focus ?? { x: 0.5, y: 0.5 };
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    upd(n => { n.focus = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }; }, 'focus');
  };
  return (
    <>
      <div className="lbl-top" title="Klicke auf die wichtigste Stelle im Bild (z. B. ein Gesicht). Wird das Bild auf dem Handy schmaler zugeschnitten, bleibt diese Stelle sichtbar.">Wichtigste Stelle</div>
      <div className="focus-pick" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }} onPointerMove={e => { if (e.buttons) set(e); }}>
        <img src={src} alt="" draggable={false} />
        <span className="focus-dot" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }} />
      </div>
      {node.focus && <div className="row"><button type="button" className="btn small grow" onClick={() => upd(n => { n.focus = null; }, 'focus')}>Wieder Bildmitte</button></div>}
    </>
  );
}

const BLEND_MODES: [BlendMode, string][] = [
  ['normal', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ multiplizieren'], ['overlay', 'Ineinanderkopieren'],
  ['darken', 'Abdunkeln'], ['lighten', 'Aufhellen'], ['color-dodge', 'Farbig abwedeln'], ['color-burn', 'Farbig nachbelichten'],
  ['hard-light', 'Hartes Licht'], ['soft-light', 'Weiches Licht'], ['difference', 'Differenz'], ['exclusion', 'Ausschluss'],
  ['hue', 'Farbton'], ['saturation', 'Sättigung'], ['color', 'Farbe'], ['luminosity', 'Luminanz'],
];

function LayerSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const op = common(nodes, n => n.opacity);
  const visible = common(nodes, n => n.visible);
  return (
    <Section title="Ebene">
      <div className="row">
        <span className="lbl">Sichtbar</span>
        <Seg value={visible === undefined ? undefined : visible ? 'yes' : 'no'} onChange={v => upd(n => { n.visible = v === 'yes'; }, 'vis')} options={[
          { value: 'yes', icon: <span>Ja</span>, title: 'Sichtbar' },
          { value: 'no', icon: <span>Nein</span>, title: 'Ausblenden – geht auch nur für Tablet oder Handy' },
        ]} />
      </div>
      <div className="row">
        <span className="lbl">Deckkraft</span>
        <NumberField className="w72" title="Deckkraft" suffix="%" min={0} max={100} precision={0}
          value={op === undefined ? undefined : Math.round(op * 100)} onChange={v => upd(n => { n.opacity = v / 100; }, 'opacity')} />
        <input type="range" className="grow" min={0} max={100} step={1} aria-label="Deckkraft" value={op === undefined ? 100 : Math.round(op * 100)}
          onChange={e => upd(n => { n.opacity = +e.target.value / 100; }, 'opacity')} />
      </div>
      <div className="row">
        <span className="lbl">Mischmodus</span>
        <select className="select grow" value={common(nodes, n => n.blendMode) ?? ''} aria-label="Mischmodus"
          onChange={e => upd(n => { n.blendMode = e.target.value as BlendMode; }, 'blend')}>
          {common(nodes, n => n.blendMode) === undefined && <option value="" disabled>Gemischt</option>}
          {BLEND_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </Section>
  );
}

function TextSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const ts = <K extends keyof TextStyle>(k: K) => common(nodes, n => n.textStyle![k]);
  const setTs = <K extends keyof TextStyle>(k: K, v: TextStyle[K]) => upd(n => {
    if (!n.textStyle) return;
    n.textStyle[k] = v;
    if ((TYPO_KEYS as string[]).includes(k)) n.textStyleRef = null; // eigene Typografie = vom Textstil lösen
  }, 'ts-' + k);
  const family = ts('fontFamily');
  const info = family ? fontInfo(family) : undefined;
  const weights = info?.weights ?? [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const weight = ts('fontWeight');
  return (
    <Section title="Text">
      <TextStyleRow nodes={nodes} />
      <TextTagRow nodes={nodes} />
      <div className="row">
        <select className="select grow" value={family ?? ''} aria-label="Schriftart"
          onChange={e => {
            const v = e.target.value;
            ensureFont(v);
            const f = fontInfo(v);
            upd(n => {
              if (!n.textStyle) return;
              n.textStyleRef = null;
              n.textStyle.fontFamily = v;
              if (f && !f.weights.includes(n.textStyle.fontWeight)) {
                const cur = n.textStyle.fontWeight;
                n.textStyle.fontWeight = f.weights.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a));
              }
            }, 'font');
          }}>
          {family === undefined && <option value="" disabled>Gemischt</option>}
          {family && !info && <option value={family}>{family}</option>}
          <optgroup label="Google Fonts">{FONTS.filter(f => !f.system).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}</optgroup>
          <optgroup label="Systemschriften">{FONTS.filter(f => f.system).map(f => <option key={f.family} value={f.family}>{f.family}</option>)}</optgroup>
        </select>
      </div>
      <div className="row">
        <select className="select grow" value={weight ?? ''} aria-label="Schriftschnitt"
          onChange={e => setTs('fontWeight', Number(e.target.value))}>
          {weight === undefined && <option value="" disabled>Gemischt</option>}
          {weights.map(w => <option key={w} value={w}>{w} {WEIGHT_NAMES[w]}</option>)}
        </select>
        <NumberField className="w72" title="Schriftgröße" suffix="px" min={1} value={ts('fontSize')} onChange={v => setTs('fontSize', v)} />
      </div>
      <div className="row">
        <NumberField label="ZH" title="Zeilenhöhe (Vielfaches der Schriftgröße)" min={0} step={0.05} value={ts('lineHeight')} onChange={v => setTs('lineHeight', v)} />
        <NumberField label="LW" title="Laufweite / Buchstabenabstand" suffix="px" step={0.1} value={ts('letterSpacing')} onChange={v => setTs('letterSpacing', v)} />
      </div>
      <div className="row">
        <Seg value={ts('textAlign')} onChange={v => setTs('textAlign', v)} options={[
          { value: 'left', icon: <Icons.textLeft />, title: 'Linksbündig' },
          { value: 'center', icon: <Icons.textCenter />, title: 'Zentriert' },
          { value: 'right', icon: <Icons.textRight />, title: 'Rechtsbündig' },
          { value: 'justify', icon: <Icons.textJustify />, title: 'Blocksatz' },
        ]} />
        <div className="grow" />
        <IconButton icon={<Icons.italic />} title="Kursiv" active={ts('italic') === true} onClick={() => setTs('italic', ts('italic') !== true)} />
        <IconButton icon={<Icons.underline />} title="Unterstrichen" active={ts('decoration') === 'underline'}
          onClick={() => setTs('decoration', ts('decoration') === 'underline' ? 'none' : 'underline')} />
        <IconButton icon={<Icons.strike />} title="Durchgestrichen" active={ts('decoration') === 'line-through'}
          onClick={() => setTs('decoration', ts('decoration') === 'line-through' ? 'none' : 'line-through')} />
      </div>
      <div className="row">
        <select className="select grow" value={ts('transform') ?? ''} aria-label="Groß-/Kleinschreibung"
          onChange={e => setTs('transform', e.target.value as TextStyle['transform'])}>
          <option value="none">Normale Schreibung</option>
          <option value="uppercase">GROSSBUCHSTABEN</option>
          <option value="lowercase">kleinbuchstaben</option>
          <option value="capitalize">Wortanfänge Groß</option>
        </select>
      </div>
    </Section>
  );
}

type FillChoice = 'color' | 'gradient' | 'move' | 'video' | 'grain' | 'glass';
const FILL_TILES: { v: FillChoice; label: string; tip: string; rich?: boolean }[] = [
  { v: 'color', label: 'Farbe', tip: 'Eine Farbe' },
  { v: 'gradient', label: 'Verlauf', tip: 'Farbverlauf' },
  { v: 'move', label: 'Bewegter Verlauf', tip: 'Verlauf, der sich langsam bewegt', rich: true },
  { v: 'video', label: 'Video', tip: 'Video läuft stumm und endlos im Hintergrund', rich: true },
  { v: 'grain', label: 'Körnung', tip: 'Feines Rauschen für einen analogen Look', rich: true },
  { v: 'glass', label: 'Glas', tip: 'Macht alles dahinter milchig-unscharf', rich: true },
];
const fillName = (f: Fill) => f.kind === 'video' ? 'Video' : f.kind === 'grain' ? 'Körnung' : f.kind === 'glass' ? 'Glas' : f.move ? 'Bewegter Verlauf' : f.gradient ? 'Verlauf' : 'Farbe';

function FillSection({ nodes, upd, isText, isColor, noConic }: { nodes: WNode[]; upd: Upd; isText: boolean; isColor?: boolean; noConic?: boolean }) {
  const fills = nodes[0].fills;
  const videos = useEditor(s => s.doc.library.videos);
  const [picking, setPicking] = useState(false);
  const mixed = !nodes.every(n => JSON.stringify(n.fills) === JSON.stringify(fills));
  const set = (fn: (f: Fill[]) => void, key: string) => { const next = clone(fills); fn(next); upd(n => { n.fills = next; }, key); };
  // Besondere Hintergründe gibt es für Boards und Flächen (nicht für Texte, Icons, Bilder)
  const rich = !isText && !isColor && nodes.every(n => n.type === 'board' || n.type === 'rect' || n.type === 'ellipse');
  const base = fills.find(f => !f.kind)?.color ?? DEFAULT_FILL[nodes[0].type];
  const add = (v: FillChoice) => {
    set(f => {
      const n = makeFill(v === 'glass' ? '#FFFFFF' : v === 'grain' ? '#808080' : base, v === 'glass' ? 0.25 : v === 'grain' ? 0.35 : 1);
      if (v === 'gradient' || v === 'move') n.gradient = defaultGradient(base);
      if (v === 'move') { n.move = 8; n.gradient!.angle = 120; n.gradient!.stops = [{ id: 'a', color: '#F0997B', opacity: 1, pos: 0 }, { id: 'b', color: '#7F77DD', opacity: 1, pos: 0.5 }, { id: 'c', color: '#5DCAA5', opacity: 1, pos: 1 }]; }
      if (v === 'video') { n.kind = 'video'; n.videoRef = videos[videos.length - 1]?.id ?? null; }
      if (v === 'grain') { n.kind = 'grain'; n.grain = 'fine'; }
      if (v === 'glass') { n.kind = 'glass'; n.blur = 16; }
      // Glas, Körnung oben; Video ganz unten (liegt hinter allem)
      if (v === 'video') f.push(n); else f.unshift(n);
    }, 'fill-add');
    setPicking(false);
  };
  const head = (i: number, f: Fill) => (
    <>
      <IconButton icon={f.visible ? <Icons.eye /> : <Icons.eyeOff />} title={f.visible ? 'Ausblenden' : 'Einblenden'}
        onClick={() => set(x => { x[i].visible = !x[i].visible; }, 'fill-vis')} />
      <IconButton icon={<Icons.minus />} title={`${fillName(f)} entfernen`} onClick={() => set(x => { x.splice(i, 1); }, 'fill-del')} />
    </>
  );
  return (
    <Section title={isText ? 'Textfarbe' : isColor ? 'Farbe' : 'Füllung'} empty={!fills.length && !picking}
      actions={rich
        ? <IconButton icon={picking ? <Icons.close /> : <Icons.plus />} title={picking ? 'Auswahl schließen' : 'Füllung hinzufügen'} active={picking} onClick={() => setPicking(!picking)} />
        : <IconButton icon={<Icons.plus />} title="Füllung hinzufügen" onClick={() => add('color')} />}>
      {mixed && <p className="hint keep">Unterschiedliche Füllungen – Änderungen übernehmen die Füllung der ersten Ebene für alle.</p>}
      {fills.map((f, i) => {
        if (f.kind === 'video') {
          const v = videos.find(x => x.id === f.videoRef);
          return (
            <div className="fill-special" key={f.id}>
              <div className="row">
                <span className="fill-thumb ft-video"><Icons.play /></span>
                <select className="select grow" aria-label="Video" value={f.videoRef ?? ''} onChange={e => set(x => { x[i].videoRef = e.target.value || null; }, 'fill-video')}>
                  {!v && <option value="">Kein Video gewählt</option>}
                  {videos.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {head(i, f)}
              </div>
              <div className="row"><VideoFileButton label={videos.length ? 'Anderes Video hochladen …' : 'Video hochladen …'} onDone={id => set(x => { x[i].videoRef = id; }, 'fill-video')} /></div>
              <p className="proto-hint">Läuft stumm und endlos hinter dem Inhalt. Auf der Arbeitsfläche steht es still. Am besten kurz und klein (unter 10 MB).</p>
            </div>
          );
        }
        if (f.kind === 'grain') return (
          <div className="fill-special" key={f.id}>
            <div className="row">
              <span className="fill-thumb" style={{ backgroundImage: grainUrl({ ...f, opacity: 1 }), backgroundColor: '#999' }} />
              <span className="fill-name">Körnung</span>
              <NumberField className="w72" title="Stärke der Körnung" suffix="%" min={1} max={100} precision={0} value={Math.round(f.opacity * 100)} onChange={v => set(x => { x[i].opacity = v / 100; }, 'fill-grain')} />
              {head(i, f)}
            </div>
            <div className="row">
              <span className="lbl">Körner</span>
              <Seg value={f.grain ?? 'fine'} onChange={v => set(x => { x[i].grain = v; }, 'fill-grain-s')} options={[
                { value: 'fine', icon: <span>Fein</span>, title: 'Feine Körnung' },
                { value: 'coarse', icon: <span>Grob</span>, title: 'Grobe Körnung' },
              ]} />
            </div>
          </div>
        );
        const paint = (
          <PaintColor color={f.color} opacity={f.opacity} colorRef={f.colorRef} gradient={f.gradient} gradientRef={f.gradientRef}
            allowGradient={f.kind !== 'glass'} noConic={noConic} onChange={c => set(x => patchFill(x[i], c), 'fill' + i)} />
        );
        if (f.kind === 'glass') return (
          <div className="fill-special" key={f.id}>
            <div className="row"><span className="fill-name">Glas</span>{paint}{head(i, f)}</div>
            <div className="row">
              <span className="lbl">Milchig</span>
              <NumberField title="Wie unscharf es dahinter wird" suffix="px" min={1} max={80} precision={0} value={f.blur ?? 16} onChange={v => set(x => { x[i].blur = v; }, 'fill-glass')} />
            </div>
            {fills.some(o => o !== f && o.visible && !o.kind && !o.gradient && o.opacity >= 0.95)
              ? <div className="row"><button type="button" className="btn grow" title="Setzt die Deckkraft der anderen Farbfüllungen auf 40 %, damit man durch das Glas sieht"
                  onClick={() => set(x => { x.forEach((o, j) => { if (j !== i && !o.kind && !o.gradient && o.opacity > 0.4) o.opacity = 0.4; }); }, 'fill-glass-see')}>Andere Farbe durchsichtig machen</button></div>
              : <p className="proto-hint">Wirkt über Bildern oder Farben dahinter. Die Farbe färbt das Glas leicht ein.</p>}
          </div>
        );
        if (f.move) return (
          <div className="fill-special" key={f.id}>
            <div className="row">{paint}{head(i, f)}</div>
            <div className="row">
              <span className="lbl">Bewegung</span>
              <NumberField title="Sekunden für eine Bewegung – mehr ist ruhiger" suffix="s" min={1} max={60} step={1} precision={0} value={f.move} onChange={v => set(x => { x[i].move = v; }, 'fill-move')} />
              <IconButton icon={<Icons.minus />} title="Nicht mehr bewegen" onClick={() => set(x => { delete x[i].move; }, 'fill-move-off')} />
            </div>
          </div>
        );
        return <div className="row" key={f.id}>{paint}{head(i, f)}</div>;
      })}
      {picking && (
        <div className="fx-picker">
          <div className="fx-tiles">
            {FILL_TILES.filter(t => !t.rich || rich).map(t => (
              <button key={t.v} type="button" className="fx-tile" title={t.tip} onClick={() => add(t.v)}>
                <span className={`fx-demo fill-demo fd-${t.v}`}><i /></span>{t.label}
              </button>
            ))}
          </div>
          <p className="proto-hint">Mehrere Füllungen liegen übereinander – die oberste steht zuerst. Video liegt immer ganz hinten.</p>
        </div>
      )}
    </Section>
  );
}

function StrokeSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const strokes = nodes[0].strokes;
  const set = (fn: (s: Stroke[]) => void, key: string) => { const next = clone(strokes); fn(next); upd(n => { n.strokes = next; }, key); };
  return (
    <Section title="Kontur" empty={!strokes.length}
      actions={!strokes.length && <IconButton icon={<Icons.plus />} title="Kontur hinzufügen" onClick={() => set(s => { s.push(makeStroke()); }, 'stroke-add')} />}>
      {strokes.map((st, i) => (
        <div key={st.id}>
          <div className="row">
            <PaintColor color={st.color} opacity={st.opacity} colorRef={st.colorRef}
              onChange={c => set(x => Object.assign(x[i], c), 'stroke' + i)} />
            <IconButton icon={st.visible ? <Icons.eye /> : <Icons.eyeOff />} title={st.visible ? 'Ausblenden' : 'Einblenden'}
              onClick={() => set(x => { x[i].visible = !x[i].visible; }, 'stroke-vis')} />
            <IconButton icon={<Icons.minus />} title="Kontur entfernen" onClick={() => set(x => { x.splice(i, 1); }, 'stroke-del')} />
          </div>
          <div className="row">
            <NumberField className="w72" title="Konturstärke" suffix="px" min={0} value={st.width} onChange={v => set(x => { x[i].width = v; }, 'stroke-w')} />
            <select className="select grow" value={st.position} aria-label="Konturposition" onChange={e => set(x => { x[i].position = e.target.value as Stroke['position']; }, 'stroke-pos')}>
              <option value="inside">Innen</option><option value="center">Mittig</option><option value="outside">Außen</option>
            </select>
            <select className="select grow" value={st.style} aria-label="Konturstil" onChange={e => set(x => { x[i].style = e.target.value as Stroke['style']; }, 'stroke-style')}>
              <option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option><option value="dotted">Gepunktet</option>
            </select>
          </div>
        </div>
      ))}
    </Section>
  );
}

function ShadowSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const shadows = nodes[0].shadows;
  const set = (fn: (s: Shadow[]) => void, key: string) => { const next = clone(shadows); fn(next); upd(n => { n.shadows = next; }, key); };
  return (
    <Section title="Schatten" empty={!shadows.length}
      actions={<IconButton icon={<Icons.plus />} title="Schatten hinzufügen" onClick={() => set(s => { s.push(makeShadow()); }, 'sh-add')} />}>
      {shadows.map((sh, i) => (
        <div key={sh.id} className="subgroup">
          <div className="row">
            <select className="select grow" value={sh.kind} aria-label="Schattenart" onChange={e => set(x => { x[i].kind = e.target.value as Shadow['kind']; }, 'sh-kind')}>
              <option value="drop">Schlagschatten</option><option value="inner">Innenschatten</option>
            </select>
            <IconButton icon={sh.visible ? <Icons.eye /> : <Icons.eyeOff />} title={sh.visible ? 'Ausblenden' : 'Einblenden'}
              onClick={() => set(x => { x[i].visible = !x[i].visible; }, 'sh-vis')} />
            <IconButton icon={<Icons.minus />} title="Schatten entfernen" onClick={() => set(x => { x.splice(i, 1); }, 'sh-del')} />
          </div>
          <div className="row">
            <NumberField label="X" title="Versatz X" value={sh.x} onChange={v => set(x => { x[i].x = v; }, 'sh-x' + i)} />
            <NumberField label="Y" title="Versatz Y" value={sh.y} onChange={v => set(x => { x[i].y = v; }, 'sh-y' + i)} />
          </div>
          <div className="row">
            <NumberField label="U" title="Unschärfe" min={0} value={sh.blur} onChange={v => set(x => { x[i].blur = v; }, 'sh-b' + i)} />
            <NumberField label="A" title="Ausdehnung" value={sh.spread} onChange={v => set(x => { x[i].spread = v; }, 'sh-s' + i)} />
          </div>
          <div className="row">
            <PaintColor color={sh.color} opacity={sh.opacity} colorRef={sh.colorRef}
              onChange={c => set(x => Object.assign(x[i], c), 'sh-c' + i)} />
          </div>
        </div>
      ))}
    </Section>
  );
}

function BlurSection({ nodes, upd }: { nodes: WNode[]; upd: Upd }) {
  const blur = common(nodes, n => n.blur);
  const active = nodes.some(n => n.blur > 0);
  return (
    <Section title="Unschärfe" empty={!active}
      actions={!active && <IconButton icon={<Icons.plus />} title="Ebenenunschärfe hinzufügen" onClick={() => upd(n => { n.blur = 4; }, 'blur-add')} />}>
      {active && (
        <div className="row">
          <NumberField label="U" title="Ebenenunschärfe" suffix="px" min={0} value={blur} onChange={v => upd(n => { n.blur = v; }, 'blur')} />
          <IconButton icon={<Icons.minus />} title="Unschärfe entfernen" onClick={() => upd(n => { n.blur = 0; }, 'blur-del')} />
        </div>
      )}
    </Section>
  );
}

function PageSettings() {
  const page = useEditor(viewPage);
  const doc = useEditor(s => s.doc);
  return (
    <>
      <Section title="Arbeitsfläche">
        <div className="row">
          <ColorField color={page.background}
            onChange={c => c.color && useEditor.getState().mutate(p => { p.background = c.color!; }, { key: 'page-bg' })} />
        </div>
      </Section>
      {doc.pages.some(p => p.id === page.id) && (
        <Section title="Suchmaschinen">
          <PageSeoFields pageId={page.id} />
        </Section>
      )}
      <Section title="Website">
        <p className="proto-hint">Name, Sprache und Symbol gelten für alle Seiten.</p>
        <SiteFields />
        <div className="row"><button className="btn grow" onClick={() => useDialog.getState().show('export')}><Icons.download /> Website exportieren …</button></div>
      </Section>
      <SiteCodeSection />
    </>
  );
}

function CodeTab() {
  const nodes = useSelected();
  const parents = useParents(nodes);
  const [copied, setCopied] = useState(false);
  if (!nodes.length) return <p className="empty-hint">Wähle eine Ebene aus, um ihr CSS zu sehen und eigenes CSS zu ergänzen. Code für die ganze Website findest du im Reiter „Gestalten“ (ohne Auswahl) unter „Code der Website“.</p>;
  const code = nodes.map((n, i) => `/* ${n.name} */\n${cssText('.' + slug(n.name), nodeCss(n, parents[i]?.layout ?? null))}`).join('\n\n');
  return (
    <>
    <CustomCssField nodes={nodes} />
    <section className="section">
      <div className="section-head"><span>CSS</span>
        <button className="btn small" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <pre className="code">{code}</pre>
    </section>
    </>
  );
}

// ---------- Bibliothek: Komponenten, Farben, Textstile ----------

function ComponentSection({ node }: { node: WNode }) {
  const page = useEditor(viewPage);
  const doc = useEditor(s => s.doc);
  const root = instanceRootOf(page, node.id);
  if (node.variantSet) {
    const variants = variantsOf(page, node.id);
    const count = instanceCount(doc, node.id);
    return (
      <section className="section comp-section">
        <div className="comp-head"><Icons.component /><span><b>{node.name}</b><br />Komponente mit {variants.length} Varianten · {count} {count === 1 ? 'Kopie' : 'Kopien'}</span></div>
        <label className="variant-field">Name der Komponente
          <input className="textinput" key={node.id + node.name} defaultValue={node.name} spellCheck={false}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== node.name) renameComponent(node.id, v); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
        <div className="variant-list">
          {variants.map(v => (
            <div className="row" key={v.id}>
              <VariantName id={v.id} name={v.variantName ?? v.name} />
              <IconButton icon={<Icons.target />} title="Diese Variante auswählen" onClick={() => useEditor.getState().setSelection([v.id])} />
            </div>
          ))}
        </div>
        {variants[0] && <button type="button" className="btn grow" onClick={() => addVariant(variants[variants.length - 1].id)}><Icons.plus /> Variante hinzufügen</button>}
        <p className="hint">Jede Variante ist ein eigenes Original. An einer Kopie wählst du rechts aus, welche Variante sie zeigt.</p>
      </section>
    );
  }
  if (node.isMain) {
    const count = instanceCount(doc, node.id);
    const set = variantSetOf(page, node.id);
    return (
      <section className="section comp-section">
        <div className="comp-head"><Icons.component /><span>
          {set ? <><b>{set.name}</b><br />Variante · {count} {count === 1 ? 'Kopie' : 'Kopien'}</> : <><b>{node.name}</b><br />Hauptkomponente · {count} {count === 1 ? 'Kopie' : 'Kopien'}</>}
        </span></div>
        {set && (
          <label className="variant-field">Name der Variante
            <VariantName id={node.id} name={node.variantName ?? node.name} />
          </label>
        )}
        <button type="button" className="btn grow" title="Kopiert dieses Original als neue Variante daneben – z. B. für „Sekundär“ oder „Deaktiviert“"
          onClick={() => addVariant(node.id)}><Icons.plus /> Variante hinzufügen</button>
        <p className="hint">Änderungen hier übernehmen alle Kopien – außer dem, was in einer Kopie bewusst geändert wurde.</p>
      </section>
    );
  }
  if (!root) return null;
  const r = page.nodes[root];
  const mainExists = allPages(doc).some(p => p.nodes[r.componentId!]?.isMain);
  const mainName = allPages(doc).map(p => p.nodes[r.componentId!]).find(Boolean)?.name ?? 'Gelöscht';
  const over = hasOverrides(page, root);
  const pm = allPages(doc).find(p => p.nodes[r.componentId!]?.isMain);
  const set = pm ? variantSetOf(pm, r.componentId!) : null;
  const variants = set && pm ? variantsOf(pm, set.id) : [];
  return (
    <section className="section comp-section">
      <div className="comp-head"><Icons.instance /><span><b>{set ? set.name : mainName}</b><br />{root === node.id ? 'Kopie einer Komponente' : `Teil der Kopie „${r.name}“`}</span></div>
      {!mainExists && <p className="hint keep">Das Original wurde gelöscht.</p>}
      {variants.length > 1 && (
        <label className="variant-field">Variante
          <select className="select" value={r.componentId} onChange={e => setInstanceVariant(root, e.target.value)}>
            {variants.map(v => <option key={v.id} value={v.id}>{v.variantName ?? v.name}</option>)}
          </select>
        </label>
      )}
      <div className="row">
        {mainExists && <button className="btn grow" onClick={() => showMain(r.componentId!)}>Original zeigen</button>}
        <IconButton icon={<Icons.reset />} title="Abweichungen zurücksetzen – wieder genau wie das Original" disabled={!over || !mainExists} onClick={() => resetInstances([root])} />
        <IconButton icon={<Icons.unlink />} title={`Von Komponente lösen (${SHIFT}${MOD}K)`} onClick={() => detachInstances([root])} />
      </div>
    </section>
  );
}

function VariantName({ id, name }: { id: string; name: string }) {
  return (
    <input className="textinput grow" key={id + name} defaultValue={name} aria-label="Name der Variante" spellCheck={false}
      onBlur={e => { const v = e.target.value.trim(); if (v && v !== name) renameVariant(id, v); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = name; e.currentTarget.blur(); } }} />
  );
}

/** Farbfeld mit Bibliotheks-Verknüpfung */
function PaintColor({ color, opacity, colorRef, gradient, gradientRef, allowGradient, noConic, onChange }: {
  color: string; opacity: number; colorRef?: string | null; gradient?: Fill['gradient']; gradientRef?: string | null;
  allowGradient?: boolean; noConic?: boolean;
  onChange: (c: PaintPatch) => void;
}) {
  const colors = useEditor(s => s.doc.library.colors);
  const gradients = useEditor(s => s.doc.library.gradients);
  const asset = colorRef ? colors.find(c => c.id === colorRef) : undefined;
  const gAsset = gradient && gradientRef ? gradients.find(g => g.id === gradientRef) : undefined;
  return (
    <>
      {gAsset ? (
        <div className="colorfield linked" title={`Verknüpft mit dem Verlauf „${gAsset.name}“ aus der Bibliothek`}>
          <span className="swatch"><span style={{ background: gradientCss(gAsset.gradient, opacity) }} /></span>
          <span className="linked-name">{gAsset.name}</span>
          <IconButton icon={<Icons.unlink />} title="Verknüpfung lösen (Verlauf frei bearbeiten)" onClick={() => onChange({ gradientRef: null })} />
        </div>
      ) : asset ? (
        <div className="colorfield linked" title={`Verknüpft mit „${asset.name}“ aus der Bibliothek`}>
          <span className="swatch"><span style={{ background: rgba(asset.color, asset.opacity) }} /></span>
          <span className="linked-name">{asset.name}</span>
          <IconButton icon={<Icons.unlink />} title="Verknüpfung lösen (Farbe frei bearbeiten)" onClick={() => onChange({ colorRef: null })} />
        </div>
      ) : (
        <ColorField color={color} opacity={opacity} gradient={gradient} allowGradient={allowGradient} noConic={noConic}
          onChange={c => onChange(c.colorRef !== undefined || c.gradientRef !== undefined ? c : { ...c, colorRef: null, ...(gradient || c.gradient ? { gradientRef: null } : {}) })} />
      )}
      <ColorLibMenu colors={colors} current={asset?.id ?? gAsset?.id} isGradient={!!gradient}
        onPick={(a: ColorAsset) => onChange({ color: a.color, opacity: a.opacity, colorRef: a.id })}
        onSave={() => {
          if (gradient) { const id = addGradient(gradient); onChange({ gradientRef: id }); }
          else { const id = addColor(color, opacity); onChange({ colorRef: id }); }
        }} />
    </>
  );
}

function ColorLibMenu({ colors, current, isGradient, onPick, onSave }: {
  colors: ColorAsset[]; current?: string; isGradient?: boolean; onPick: (a: ColorAsset) => void; onSave: () => void;
}) {
  return (
    <div className="lib-menu">
      <Menu label={<Icons.library />} align="right" title="Farbe aus der Bibliothek">
        {close => (
          <>
            {colors.map(c => (
              <button key={c.id} type="button" className={`menu-item color-item${c.id === current ? ' active' : ''}`} onClick={() => { close(); onPick(c); }}>
                <span className="swatch-dot" style={{ background: rgba(c.color, c.opacity) }} /><span className="grow">{c.name}</span>
                <span className="asset-meta">{c.color.replace('#', '')}</span>
              </button>
            ))}
            {!colors.length && <div className="menu-hint">Noch keine Farben in der Bibliothek.</div>}
            {!current && <><div className="menu-sep" />
              <button type="button" className="menu-item" onClick={() => { close(); onSave(); }}><span>{isGradient ? 'Diesen Verlauf in der Bibliothek speichern' : 'Diese Farbe in der Bibliothek speichern'}</span></button></>}
          </>
        )}
      </Menu>
    </div>
  );
}

/** Art des Textes für Google & Co.: Überschrift 1–4, Absatz, normaler Text */
function TextTagRow({ nodes }: { nodes: WNode[] }) {
  const doc = useEditor(s => s.doc);
  const page = useEditor(pageOf);
  const raw = useEditor(useShallow(s => s.selection.map(id => pageOf(s).nodes[id]).filter(Boolean) as WNode[]));
  const own = common(raw, n => n.textTag ?? null);
  const styleOf = (n: WNode) => styleTag(n.textStyleRef ? doc.library.textStyles.find(t => t.id === n.textStyleRef) : undefined);
  const fromStyle = common(raw, n => styleOf(n) ?? null);
  const effective = common(raw, n => n.textTag ?? styleOf(n) ?? 'div');
  const auto = TEXT_TAGS.find(t => t.value === (fromStyle ?? 'div'))!;
  const h1s = textsWithTag(doc, page, 'h1').length;
  const set = (v: string) => setShared(nodes.map(n => n.id), n => { n.textTag = v ? (v as WNode['textTag']) : null; }, 'textTag');
  return (
    <>
      <div className="row" title="Für Suchmaschinen und Screenreader: Welche Rolle hat dieser Text? Das Aussehen ändert sich dadurch nicht.">
        <span className="lbl">Art</span>
        <select className="select grow" aria-label="Art des Textes" value={own === undefined ? '__mixed' : own ?? ''} onChange={e => set(e.target.value)}>
          {own === undefined && <option value="__mixed" disabled>Gemischt</option>}
          <option value="">Automatisch{fromStyle !== undefined ? ` – ${auto.label}` : ''}</option>
          {TEXT_TAGS.map(t => <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>)}
        </select>
      </div>
      {effective === 'h1' && h1s > 1 && <p className="proto-hint warn">Auf dieser Seite gibt es {h1s} Hauptüberschriften (H1). Google erwartet genau eine – die anderen besser als Überschrift 2 einstellen.</p>}
      {effective !== undefined && effective !== 'h1' && h1s === 0 && /^h[2-4]$/.test(effective) && <p className="proto-hint keep">Diese Seite hat noch keine Hauptüberschrift (H1). Stelle die wichtigste Überschrift auf „Überschrift 1“.</p>}
    </>
  );
}

function TextStyleRow({ nodes }: { nodes: WNode[] }) {
  const styles = useEditor(s => s.doc.library.textStyles);
  const ref = common(nodes, n => n.textStyleRef ?? null);
  const asset = ref ? styles.find(t => t.id === ref) : undefined;
  if (!styles.length) return null;
  return (
    <div className="row">
      <select className={`select grow${asset ? ' linked' : ''}`} aria-label="Textstil" value={ref === undefined ? '__mixed' : asset ? asset.id : ''}
        onChange={e => applyTextStyle(e.target.value || null, nodes.map(n => n.id))}>
        {ref === undefined && <option value="__mixed" disabled>Gemischte Textstile</option>}
        <option value="">Kein Textstil</option>
        {styles.map(t => <option key={t.id} value={t.id}>{t.name} – {t.style.fontSize} px</option>)}
      </select>
      {asset && <IconButton icon={<Icons.unlink />} title="Vom Textstil lösen" onClick={() => applyTextStyle(null, nodes.map(n => n.id))} />}
    </div>
  );
}

// ---------- Zustände (Normal / Hover) ----------

function StateSwitch({ nodes }: { nodes: WNode[] }) {
  const state = useEditor(s => s.interaction);
  const set = useEditor(s => s.setInteraction);
  const raw = useEditor(useShallow(s => s.selection.map(id => pageOf(s).nodes[id]).filter(Boolean) as WNode[]));
  const field = state === 'scrolled' ? 'scrolled' : 'hover';
  const keys = [...new Set(raw.flatMap(n => Object.keys(n[field] ?? {})))];
  return (
    <section className={`section${state !== 'normal' ? ' state-notice' : ''}`}>
      <div className="state-switch">
        <span className="lbl">Zustand</span>
        <Seg value={state} onChange={set} options={[
          { value: 'normal', icon: <span>Normal</span>, title: 'Normales Aussehen' },
          { value: 'hover', icon: <span>Hover</span>, title: 'Aussehen beim Überfahren mit der Maus bearbeiten' },
          { value: 'scrolled', icon: <span>Gescrollt</span>, title: 'Aussehen nach dem Scrollen bearbeiten (z. B. kleinere Kopfzeile)' },
        ]} />
      </div>
      {state === 'hover' && (
        <div className="bp-notice-head" style={{ marginTop: 8 }}>
          <Icons.pointer />
          <span>Änderungen an Farbe, Kontur, Schatten, Deckkraft, Radius und Text gelten nur beim <b>Überfahren mit der Maus</b>. Sichtbar in der Vorschau.</span>
        </div>
      )}
      {state === 'scrolled' && (
        <div className="bp-notice-head" style={{ marginTop: 8 }}>
          <Icons.pointer />
          <span>Änderungen an Größe, Abständen, Farbe, Schrift und Sichtbarkeit gelten erst, <b>wenn die Seite gescrollt wurde</b>. Gilt für alle Bildschirmgrößen. Sichtbar in der Vorschau.</span>
        </div>
      )}
      {state !== 'normal' && keys.length > 0 && (
        <div className="row">
          <span className="bp-keys grow">{state === 'hover' ? 'Hover' : 'Gescrollt'}: {keys.map(k => HOVER_NAMES[k] ?? k).join(', ')}</span>
          <IconButton icon={<Icons.reset />} title={state === 'hover' ? 'Hover-Änderungen entfernen' : 'Änderungen nach dem Scrollen entfernen'}
            onClick={() => updateNodes(nodes.map(n => n.id), n => { n[field] = null; }, `${field}-reset`)} />
        </div>
      )}
    </section>
  );
}

// ---------- Prototyp: Links, Hover, Einblenden ----------

function useRawSelected(): WNode[] {
  return useEditor(useShallow(s => {
    const p = pageOf(s);
    return s.selection.map(id => p.nodes[id]).filter(Boolean);
  }));
}

function ProtoTab() {
  const nodes = useRawSelected();
  if (!nodes.length) {
    return (
      <div className="empty-hint">
        <p style={{ margin: 0 }}>Wähle ein Element aus, um Links, Bewegung und Scroll-Effekte einzustellen.</p>
        <p style={{ margin: '10px 0 0' }}>Fertige Abschnitte, Menüs, Formulare und Bausteine findest du links unter <b>Einfügen</b>.</p>
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => useLeftArea.getState().setArea('insert')}>Einfügen öffnen</button>
      </div>
    );
  }
  const ids = nodes.map(n => n.id);
  return (
    <>
      {nodes.length === 1 && <FormSection node={nodes[0]} />}
      <LinkSection nodes={nodes} ids={ids} />
      {nodes.length === 1 && nodes[0].carousel && <CarouselSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].accordion && <AccordionSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].tabs && <TabsSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].popup && <PopupSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].compare && <CompareSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].lottie && <LottieSection node={nodes[0]} />}
      {nodes.length === 1 && nodes[0].componentId && <OwnAnimSection node={nodes[0]} />}
      <MotionSection nodes={nodes} ids={ids} />
      <ScrollSection nodes={nodes} ids={ids} />
    </>
  );
}

const setShared = (ids: string[], fn: (n: WNode) => void, key: string) =>
  useEditor.getState().mutate(pg => { ids.forEach(id => { const n = pg.nodes[id]; if (n) fn(n); }); }, { key });

function LinkSection({ nodes, ids }: { nodes: WNode[]; ids: string[] }) {
  const doc = useEditor(s => s.doc);
  const page = useEditor(viewPage);
  const link = common(nodes, n => n.link ?? null);
  const type = link === undefined ? 'mixed' : link ? link.type : 'none';
  const set = (l: Link | null) => setShared(ids, n => { n.link = l; }, 'link');
  const targets = Object.values(page.nodes).filter(n => n.type === 'board' && n.parentId !== null && !ids.includes(n.id));
  const anims = Object.values(page.nodes).filter(n => isAnimInstance(n) && !ids.includes(n.id));
  const pops = Object.values(page.nodes).filter(n => n.popup && !ids.includes(n.id));
  return (
    <Section title="Link" empty={type === 'none'}>
      <div className="row">
        <select className="select grow" aria-label="Link-Art" value={type}
          onChange={e => {
            const v = e.target.value;
            if (v === 'none') set(null);
            else if (v === 'page') set({ type: 'page', pageId: (doc.pages.find(p => p.id !== useEditor.getState().pageId) ?? doc.pages[0]).id });
            else if (v === 'anchor') set({ type: 'anchor', nodeId: targets[0]?.id ?? '' });
            else if (v === 'url') set({ type: 'url', url: '', newTab: true });
            else if (v === 'email') set({ type: 'email', email: '' });
            else if (v === 'play') set({ type: 'play', nodeId: anims[0]?.id ?? '' });
            else if (v === 'popup') set({ type: 'popup', nodeId: pops[0]?.id ?? '' });
          }}>
          {type === 'mixed' && <option value="mixed" disabled>Gemischt</option>}
          <option value="none">Kein Link</option>
          <option value="page">Zu einer Seite</option>
          <option value="anchor">Zu einem Abschnitt</option>
          <option value="url">Zu einer Webadresse</option>
          <option value="email">E-Mail schreiben</option>
          <option value="play">Animation starten</option>
          <option value="popup">Pop-up öffnen</option>
        </select>
      </div>
      {link?.type === 'popup' && (
        <>
          <div className="row">
            <select className="select grow" aria-label="Welches Pop-up" value={link.nodeId} onChange={e => set({ type: 'popup', nodeId: e.target.value })}>
              {!pops.length && <option value="">Kein Pop-up auf dieser Seite</option>}
              {pops.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {!pops.length && <p className="proto-hint keep">Füge zuerst links unter „Einfügen“ → „Bewegte Bausteine“ ein Pop-up ein.</p>}
        </>
      )}
      <TooltipField nodes={nodes} ids={ids} />
      {link?.type === 'play' && (
        <>
          <div className="row">
            <select className="select grow" aria-label="Welche Animation" value={link.nodeId} onChange={e => set({ type: 'play', nodeId: e.target.value })}>
              {!anims.length && <option value="">Keine Animation auf dieser Seite</option>}
              {anims.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <p className="proto-hint">Beim Klick spielt die Animation von vorn. Soll sie nur per Knopf starten, stelle in der Animation „Startet: per Knopf“ ein.</p>
        </>
      )}
      {link?.type === 'page' && (
        <div className="row">
          <select className="select grow" aria-label="Zielseite" value={link.pageId} onChange={e => set({ type: 'page', pageId: e.target.value })}>
            {doc.pages.map((p, i) => <option key={p.id} value={p.id}>{p.name}{i === 0 ? ' (Startseite)' : ''}</option>)}
          </select>
        </div>
      )}
      {link?.type === 'anchor' && (
        <>
          <div className="row">
            <select className="select grow" aria-label="Ziel-Abschnitt" value={link.nodeId} onChange={e => set({ type: 'anchor', nodeId: e.target.value })}>
              {!targets.length && <option value="">Keine Abschnitte vorhanden</option>}
              {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <p className="proto-hint">Abschnitte sind Boards innerhalb des Webseiten-Boards. Beim Klick wird sanft dorthin gescrollt.</p>
        </>
      )}
      {link?.type === 'url' && (
        <>
          <div className="row">
            <input className="textinput grow" placeholder="https://beispiel.de" aria-label="Webadresse" defaultValue={link.url} key={ids.join()}
              onBlur={e => set({ ...link, url: e.target.value.trim() })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          </div>
          <label className="check">
            <input type="checkbox" checked={link.newTab} onChange={e => set({ ...link, newTab: e.target.checked })} />
            In neuem Tab öffnen
          </label>
        </>
      )}
      {link?.type === 'email' && (
        <div className="row">
          <input className="textinput grow" placeholder="name@beispiel.de" aria-label="E-Mail-Adresse" defaultValue={link.email} key={ids.join()}
            onBlur={e => set({ type: 'email', email: e.target.value.trim() })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </div>
      )}
    </Section>
  );
}

// ---------- Beim Scrollen: fixieren + Aussehen nach dem Scrollen ----------

type PinChoice = 'none' | 'sticky' | 'fixed';

/** Position einer Ebene relativ zum Webseiten-Board */
function absPos(pg: { nodes: Record<string, WNode> }, n: WNode) {
  let x = 0, y = 0;
  for (let c: WNode | undefined = n; c && c.parentId; c = pg.nodes[c.parentId]) { x += c.x; y += c.y; }
  return { x, y };
}

function ScrollSection({ nodes, ids }: { nodes: WNode[]; ids: string[] }) {
  const state = useEditor(s => s.interaction);
  const page = useEditor(pageOf);
  // Das Webseiten-Board selbst lässt sich nicht fixieren (bei Komponenten ist es die Komponente selbst – die schon)
  const compPage = useEditor(s => isComponentPage(s.doc, s.pageId));
  const isBoard = !compPage && nodes.some(n => isPageBoard(page, n.id));
  const pin = common(nodes, n => n.pin ?? null);
  const choice: PinChoice | undefined = pin === undefined ? undefined : pin ? pin.mode : 'none';
  const keys = [...new Set(nodes.flatMap(n => Object.keys(n.scrolled ?? {})))];
  const at = common(nodes, n => n.scrollAt ?? 80);
  const dur = common(nodes, n => n.scrollDuration ?? 250);
  const one = nodes.length === 1 ? nodes[0] : null;
  const parent = one?.parentId ? page.nodes[one.parentId] : undefined;
  // Komponente selbst: ob sie im Layout steht, entscheidet die Stelle, an der die Kopie liegt
  const inFlow = !!one && ((!!parent?.layout && !one.absolute) || (compPage && !one.parentId));
  const board = pageBoard(page);
  const inst = one ? instanceRootOf(page, one.id) : null;
  const instComp = inst ? page.nodes[inst]?.componentId : undefined;
  // „Schweben“ klappt nicht, wenn ein Eltern-Element gedreht, unscharf oder eingeblendet wird
  const blocker = one && pin?.mode === 'fixed'
    ? (() => { for (let c = parent; c && c.parentId; c = c.parentId ? page.nodes[c.parentId] : undefined) if (c.rotation || c.blur || c.reveal || hasFxTransform(c)) return c; return undefined; })()
    : undefined;

  const setPin = (v: PinChoice) => setShared(ids, n => {
    if (v === 'none') { n.pin = null; return; }
    const { x } = absPos(page, n);
    const bw = board?.w ?? 1440;
    n.pin = { mode: v, h: n.pin?.h ?? (x + n.w / 2 > bw / 2 ? 'right' : 'left'), v: n.pin?.v ?? 'top', bottom: n.pin?.bottom ?? 24 };
  }, 'pin');
  const patchPin = (p: Partial<NonNullable<WNode['pin']>>) => setShared(ids, n => { if (n.pin) n.pin = { ...n.pin, ...p }; }, 'pin');

  if (isBoard) return null;
  return (
    <Section title="Beim Scrollen" empty={choice === 'none' && !keys.length && state !== 'scrolled'}>
      <div className="row">
        <select className="select grow" aria-label="Fixieren" value={choice ?? 'mixed'} onChange={e => setPin(e.target.value as PinChoice)}>
          {choice === undefined && <option value="mixed" disabled>Gemischt</option>}
          <option value="none">Scrollt mit der Seite</option>
          <option value="sticky" disabled={!inFlow && choice !== 'sticky'}>Oben fixieren – nimmt Platz ein</option>
          <option value="fixed">An der Stelle fixieren – schwebt über der Seite</option>
        </select>
      </div>
      {choice === 'none' && <p className="proto-hint">Z. B. für eine Kopfzeile, die oben stehen bleibt, oder einen Störer, der beim Scrollen an seiner Stelle bleibt.</p>}
      {choice === 'sticky' && (
        <p className="proto-hint">
          Bleibt oben am Fensterrand stehen, sobald es dort ankommt. Der Inhalt darunter rückt nicht nach.
          {parent && board && parent.id !== board.id && <> Achtung: Klappt nur innerhalb von „{parent.name}“ – für die ganze Seite die Ebene direkt ins Webseiten-Board legen.</>}
        </p>
      )}
      {!inFlow && one && choice === 'none' && <p className="proto-hint keep">„Oben fixieren – nimmt Platz ein“ geht nur bei Ebenen in einem Layout.</p>}
      {pin?.mode === 'fixed' && (
        <>
          <div className="row">
            <span className="lbl">Abstand von</span>
            <Seg value={pin.h} onChange={h => patchPin({ h })} options={[
              { value: 'left', icon: <span>Links</span>, title: 'Abstand vom linken Fensterrand bleibt gleich' },
              { value: 'right', icon: <span>Rechts</span>, title: 'Abstand vom rechten Fensterrand bleibt gleich' },
            ]} />
            <Seg value={pin.v} onChange={v => patchPin({ v })} options={[
              { value: 'top', icon: <span>Oben</span>, title: 'Abstand vom oberen Fensterrand = Position im Board' },
              { value: 'bottom', icon: <span>Unten</span>, title: 'Am unteren Fensterrand' },
            ]} />
          </div>
          {pin.v === 'bottom' && (
            <div className="row">
              <span className="lbl">Abstand unten</span>
              <NumberField title="Abstand vom unteren Fensterrand" suffix="px" min={0} max={2000} step={1} precision={0} value={pin.bottom}
                onChange={b => patchPin({ bottom: b })} />
            </div>
          )}
          <p className="proto-hint">Bleibt beim Scrollen genau dort im Fenster stehen. Die Seite läuft dahinter durch.</p>
          {blocker && <p className="proto-hint warn">„{blocker.name}“ ist gedreht, unscharf oder wird eingeblendet – dann bleibt diese Ebene nicht stehen. Lege sie besser direkt ins Webseiten-Board.</p>}
        </>
      )}
      {instComp && (
        <div className="row">
          <p className="proto-hint grow">Teil einer Komponente: Was du hier einstellst, gilt nur auf dieser Seite. Für alle Seiten in der Komponente einstellen.</p>
          <button type="button" className="btn small" onClick={() => showMain(instComp)}>Komponente öffnen</button>
        </div>
      )}

      <div className="field-label" style={{ marginTop: 10 }}>Aussehen nach dem Scrollen</div>
      {keys.length > 0
        ? <p className="proto-hint keep">Ändert nach dem Scrollen: {keys.map(k => HOVER_NAMES[k] ?? k).join(', ')}</p>
        : <p className="proto-hint">Z. B. eine kleinere Kopfzeile mit kleinerem Logo. Auch Kinder-Ebenen (Logo, Text) können sich ändern oder ein- und ausblenden.</p>}
      <div className="row">
        <button className={`btn grow${state === 'scrolled' ? ' active' : ''}`}
          onClick={() => useEditor.getState().setInteraction(state === 'scrolled' ? 'normal' : 'scrolled')}>
          {state === 'scrolled' ? 'Bearbeitung beenden' : 'Aussehen nach dem Scrollen bearbeiten'}
        </button>
      </div>
      {(keys.length > 0 || state === 'scrolled') && (
        <>
          <div className="row">
            <span className="lbl">Umschalten ab</span>
            <NumberField title="Nach wie vielen Pixeln Scrollen umgeschaltet wird" suffix="px" min={1} max={2000} step={10} precision={0} value={at}
              onChange={v => setShared(ids, n => { n.scrollAt = v; }, 'scroll-at')} />
          </div>
          <div className="row">
            <span className="lbl">Übergang</span>
            <NumberField title="Dauer des Übergangs" suffix="ms" min={0} max={3000} step={50} precision={0} value={dur}
              onChange={v => setShared(ids, n => { n.scrollDuration = v; }, 'scroll-dur')} />
          </div>
        </>
      )}
    </Section>
  );
}

