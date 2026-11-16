// Bereich „Bewegung“: Liste der aktiven Bewegungen (kompakt), neue wählt man aus bewegten Kacheln
import { useState, type ReactNode } from 'react';
import { useEditor, pageOf } from '../store';
import type { LoopFxKind, MouseFxKind, Page, RevealType, ScrollFxKind, WNode } from '../model/types';
import { HOVER_NAMES } from '../model/hover';
import { absRect } from '../model/geometry';
import { NumberField, Section, Seg, IconButton } from '../ui/controls';
import { Icons } from '../ui/icons';

type Cat = 'appear' | 'scroll' | 'mouse' | 'loop';
type Kind = RevealType | ScrollFxKind | MouseFxKind | LoopFxKind | 'hover';

const S = () => useEditor.getState();
const setAll = (ids: string[], fn: (n: WNode) => void, key: string) =>
  S().mutate(pg => { ids.forEach(id => { const n = pg.nodes[id]; if (n) fn(n); }); }, { key });

const hasText = (n: WNode) => n.type === 'text';
const hasNumber = (n: WNode) => n.type === 'text' && /\d/.test(n.text ?? '');
const isGroup = (n: WNode) => n.type === 'board' && n.children.length > 1;
const isLayoutGroup = (n: WNode) => isGroup(n) && !!n.layout;

interface Fx { kind: Kind; cat: Cat; label: string; tip: string; demo: string; ok?: (n: WNode) => boolean }
const FX: Fx[] = [
  { kind: 'fade', cat: 'appear', label: 'Einblenden', tip: 'Wird sanft sichtbar', demo: 'fd-fade' },
  { kind: 'up', cat: 'appear', label: 'Hochrutschen', tip: 'Gleitet von unten herein', demo: 'fd-up' },
  { kind: 'left', cat: 'appear', label: 'Von links', tip: 'Gleitet von links herein', demo: 'fd-left' },
  { kind: 'zoom', cat: 'appear', label: 'Heranzoomen', tip: 'Wächst etwas heran', demo: 'fd-zoom' },
  { kind: 'words', cat: 'appear', label: 'Wort für Wort', tip: 'Die Wörter erscheinen nacheinander', demo: 'fd-words', ok: hasText },
  { kind: 'count', cat: 'appear', label: 'Hochzählen', tip: 'Zahlen zählen von 0 hoch', demo: 'fd-count', ok: hasNumber },
  { kind: 'depth', cat: 'scroll', label: 'Tiefe', tip: 'Bewegt sich langsamer oder schneller als die Seite – wirkt räumlich', demo: 'fd-depth' },
  { kind: 'rotate', cat: 'scroll', label: 'Drehen', tip: 'Dreht sich beim Scrollen', demo: 'fd-rotate' },
  { kind: 'grow', cat: 'scroll', label: 'Wachsen', tip: 'Wird beim Hineinscrollen größer', demo: 'fd-grow' },
  { kind: 'focus', cat: 'scroll', label: 'Deutlicher', tip: 'Wird beim Hineinscrollen klar und deutlich', demo: 'fd-focus' },
  { kind: 'stack', cat: 'scroll', label: 'Stapeln', tip: 'Die Abschnitte darin schieben sich beim Scrollen übereinander', demo: 'fd-stack', ok: isLayoutGroup },
  { kind: 'sideways', cat: 'scroll', label: 'Seitwärts', tip: 'Beim Scrollen nach unten läuft der Inhalt zur Seite', demo: 'fd-side', ok: isLayoutGroup },
  { kind: 'hover', cat: 'mouse', label: 'Hover', tip: 'Eigenes Aussehen, wenn die Maus darüber fährt', demo: 'fd-hover' },
  { kind: 'tilt', cat: 'mouse', label: 'Kippen', tip: 'Kippt leicht in Richtung der Maus', demo: 'fd-tilt' },
  { kind: 'magnet', cat: 'mouse', label: 'Magnet', tip: 'Wird von der Maus sanft angezogen', demo: 'fd-magnet' },
  { kind: 'follow', cat: 'mouse', label: 'Folgt der Maus', tip: 'Bewegt sich mit der Maus mit', demo: 'fd-follow' },
  { kind: 'marquee', cat: 'loop', label: 'Laufband', tip: 'Der Inhalt läuft endlos durch', demo: 'fd-marquee', ok: isLayoutGroup },
  { kind: 'float', cat: 'loop', label: 'Schweben', tip: 'Schwebt sanft auf und ab', demo: 'fd-float' },
  { kind: 'pulse', cat: 'loop', label: 'Pulsieren', tip: 'Wird sanft größer und kleiner', demo: 'fd-pulse' },
];
const fxOf = (k: Kind) => FX.find(f => f.kind === k)!;
const CATS: [Cat, string, string][] = [
  ['appear', 'Erscheinen', 'Beim Erscheinen'],
  ['scroll', 'Scrollen', 'Beim Scrollen'],
  ['mouse', 'Mit der Maus', 'Mit der Maus'],
  ['loop', 'Immer', 'Immer'],
];

/** Welche Art ist in einer Gruppe gerade eingestellt? */
function kindOf(n: WNode, cat: Cat): Kind | null {
  if (cat === 'appear') return n.reveal?.type ?? null;
  if (cat === 'scroll') return n.motion?.scroll?.kind ?? null;
  if (cat === 'loop') return n.motion?.loop?.kind ?? null;
  if (n.motion?.mouse) return n.motion.mouse.kind;
  return n.hover && Object.keys(n.hover).length ? 'hover' : null;
}

/** Layout auf „nebeneinander, ohne Umbruch“ bzw. „untereinander“ stellen (alle Bildschirme) */
function forceDir(n: WNode, dir: 'row' | 'column') {
  const fix = (L: WNode['layout']) => { if (L) { L.direction = dir; L.wrap = false; } };
  if (n.layout && n.layout.type !== 'flex') n.layout.type = 'flex';
  fix(n.layout);
  for (const bp of ['tablet', 'mobile'] as const) {
    const o = n.overrides?.[bp];
    if (o?.layout) { const L = o.layout; if (L.type !== 'flex') L.type = 'flex'; fix(L); }
  }
}

function apply(n: WNode, k: Kind, pg?: Page, widths?: Record<string, number>) {
  const f = fxOf(k);
  const m = { ...(n.motion ?? {}) };
  if (f.cat === 'appear') {
    n.reveal = { type: k as RevealType, duration: n.reveal?.duration ?? (k === 'count' ? 1500 : 700), delay: n.reveal?.delay ?? 0, stagger: k === 'words' || k === 'count' ? undefined : n.reveal?.stagger };
    return;
  }
  if (f.cat === 'scroll') {
    const amount = { depth: 30, rotate: 12, grow: 80, focus: 0, stack: 0, sideways: 0 }[k as ScrollFxKind];
    m.scroll = { kind: k as ScrollFxKind, amount };
    if (k === 'stack') forceDir(n, 'column');
    if (k === 'sideways') forceDir(n, 'row');
  } else if (f.cat === 'mouse') {
    if (k === 'hover') return;
    m.mouse = { kind: k as MouseFxKind, amount: { tilt: 8, magnet: 30, follow: 6 }[k as MouseFxKind] };
  } else {
    const d = { marquee: [20, 0], float: [4, 12], pulse: [2.5, 5] }[k as LoopFxKind];
    m.loop = { kind: k as LoopFxKind, speed: d[0], amount: d[1] };
    if (k === 'marquee') forceDir(n, 'row');
  }
  // Laufband/Seitwärts: Elemente darin behalten ihre jetzige Breite (sonst würden sie zusammengedrückt)
  if ((k === 'marquee' || k === 'sideways') && widths) {
    for (const c of n.children) {
      const w = widths[c];
      const ch = pg?.nodes[c];
      if (!w || !ch || ch.absolute) continue;
      ch.sizingH = 'fixed'; ch.w = Math.round(w);
      for (const bp of ['tablet', 'mobile'] as const) if (ch.overrides?.[bp]?.sizingH) ch.overrides[bp]!.sizingH = 'fixed';
    }
  }
  n.motion = m;
}

function remove(n: WNode, cat: Cat) {
  if (cat === 'appear') { n.reveal = null; return; }
  if (cat === 'mouse' && !n.motion?.mouse) { n.hover = null; return; }
  const m = { ...(n.motion ?? {}) };
  delete m[cat];
  n.motion = Object.keys(m).length ? m : null;
}

// ---------- Abspielen auf der Arbeitsfläche (nur kurz vorführen, nichts wird geändert) ----------

function nodeEl(id: string) { return document.querySelector<HTMLElement>(`.canvas [data-node-id="${id}"]`) ?? document.querySelector<HTMLElement>(`[data-node-id="${id}"]`); }

export function playFx(page: Page, ids: string[], cat: Cat) {
  for (const id of ids) {
    const n = page.nodes[id];
    const el = n && nodeEl(id);
    if (!n || !el) continue;
    const k = kindOf(n, cat);
    const ease = 'cubic-bezier(.2,.7,.2,1)';
    if (cat === 'appear' && n.reveal) {
      const r = n.reveal;
      const from: Keyframe = { opacity: 0, ...(k === 'up' || k === 'words' ? { translate: '0 40px' } : k === 'left' ? { translate: '-40px 0' } : k === 'zoom' ? { scale: '.9' } : {}) };
      const to: Keyframe = { opacity: 1, translate: '0 0', scale: '1' };
      const targets = r.stagger ? n.children.map(nodeEl).filter((x): x is HTMLElement => !!x) : [el];
      targets.forEach((t, i) => t.animate([from, to], { duration: r.duration, delay: r.delay + i * (r.stagger ?? 0), easing: ease, fill: 'backwards' }));
      continue;
    }
    const o = { duration: 1400, easing: 'ease-in-out' };
    const m = n.motion;
    if (cat === 'scroll' && m?.scroll) {
      const a = m.scroll.amount;
      if (k === 'depth') el.animate([{ translate: `0 ${a}px` }, { translate: `0 ${-a}px` }, { translate: '0 0' }], o);
      if (k === 'rotate') el.animate([{ rotate: `${a}deg` }, { rotate: `${-a}deg` }, { rotate: '0deg' }], o);
      if (k === 'grow') el.animate([{ scale: String(a / 100) }, { scale: '1' }], { duration: 1000, easing: ease });
      if (k === 'focus') el.animate([{ opacity: .15, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 1000, easing: ease });
      if (k === 'stack' || k === 'sideways') n.children.map(nodeEl).forEach((c, i) => c?.animate(k === 'stack'
        ? [{ translate: `0 ${40 + i * 20}px`, opacity: .3 }, { translate: '0 0', opacity: 1 }]
        : [{ translate: '0 0' }, { translate: '-80px 0' }, { translate: '0 0' }], { duration: 1200, delay: k === 'stack' ? i * 150 : 0, easing: ease }));
    }
    if (cat === 'mouse' && m?.mouse) {
      const a = m.mouse.amount;
      if (k === 'tilt') el.animate([{ rotate: 'y 0deg' }, { rotate: `y ${a * 1.5}deg` }, { rotate: `x ${a}deg` }, { rotate: `y ${-a * 1.5}deg` }, { rotate: 'y 0deg' }], o);
      else el.animate([{ translate: '0 0' }, { translate: `${a / 2}px ${-a / 3}px` }, { translate: `${-a / 2}px ${a / 4}px` }, { translate: '0 0' }], o);
    }
    if (cat === 'loop' && m?.loop) {
      const L = m.loop;
      if (k === 'marquee') n.children.map(nodeEl).forEach(c => c?.animate([{ translate: '0 0' }, { translate: `${L.reverse ? 120 : -120}px 0` }, { translate: '0 0' }], { duration: 2000, easing: 'ease-in-out' }));
      if (k === 'float') el.animate([{ translate: '0 0' }, { translate: `0 ${-L.amount}px` }, { translate: '0 0' }], { duration: L.speed * 1000, iterations: 2, easing: 'ease-in-out' });
      if (k === 'pulse') el.animate([{ scale: '1' }, { scale: String(1 + L.amount / 100) }, { scale: '1' }], { duration: L.speed * 1000, iterations: 2, easing: 'ease-in-out' });
    }
  }
}

// ---------- Bereich ----------

const sec = (ms: number) => `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;

function summary(n: WNode, cat: Cat): string {
  const k = kindOf(n, cat);
  if (!k) return '';
  const f = fxOf(k);
  if (cat === 'appear' && n.reveal) return [f.label, sec(n.reveal.duration), n.reveal.stagger ? 'nacheinander' : ''].filter(Boolean).join(' · ');
  if (k === 'hover') return `${f.label}: ${Object.keys(n.hover ?? {}).map(x => HOVER_NAMES[x] ?? x).join(', ')}`;
  const m = n.motion;
  if (cat === 'scroll' && m?.scroll) {
    const a = m.scroll.amount;
    if (k === 'depth') return `${f.label} · ${a > 0 ? 'schneller' : a < 0 ? 'langsamer' : 'normal'}`;
    if (k === 'rotate') return `${f.label} · ${a}°`;
    if (k === 'grow') return `${f.label} · ab ${a} %`;
  }
  if (cat === 'loop' && m?.loop) return `${f.label} · ${m.loop.speed.toLocaleString('de-DE')} s`;
  return f.label;
}

export function MotionSection({ nodes, ids }: { nodes: WNode[]; ids: string[] }) {
  const page = useEditor(pageOf);
  const state = useEditor(s => s.interaction);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<Cat | null>(null);
  const first = nodes[0];
  const active = CATS.filter(([c]) => nodes.some(n => kindOf(n, c)));
  const fits = (f: Fx) => nodes.every(n => !f.ok || f.ok(n));

  const choose = (f: Fx) => {
    if (f.kind === 'hover') { S().setInteraction('hover'); setPicking(false); setOpen('mouse'); return; }
    const pgNow = pageOf(S());
    const widths: Record<string, number> = {};
    for (const id of ids) for (const c of pgNow.nodes[id]?.children ?? []) widths[c] = absRect(pgNow, c).w;
    S().mutate(pg => { ids.forEach(id => { const n = pg.nodes[id]; if (n) apply(n, f.kind, pg, widths); }); }, { key: 'motion-add' });
    setPicking(false);
    setOpen(f.cat);
    // gleich einmal vorführen
    requestAnimationFrame(() => playFx(pageOf(S()), ids, f.cat));
  };

  return (
    <Section title="Bewegung" empty={!active.length && !picking}
      actions={<IconButton icon={picking ? <Icons.close /> : <Icons.plus />} title={picking ? 'Auswahl schließen' : 'Bewegung hinzufügen'} active={picking} onClick={() => setPicking(!picking)} />}>
      {active.map(([cat, word]) => {
        const k = kindOf(first, cat);
        const isOpen = open === cat;
        return (
          <div key={cat} className={`fx-row${isOpen ? ' open' : ''}`}>
            <div className="fx-head">
              <button type="button" className="fx-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : cat)}
                title={isOpen ? 'Einstellungen zuklappen' : 'Einstellungen aufklappen'}>
                <span className={`fx-mini ${k ? fxOf(k).demo : ''}`}><i /></span>
                <span className="fx-text"><b>{word}</b><small>{nodes.every(n => kindOf(n, cat) === k) ? summary(first, cat) : 'Gemischt'}</small></span>
              </button>
              {k !== 'hover' && <IconButton icon={<Icons.play />} title="Auf der Arbeitsfläche vorführen" onClick={() => playFx(page, ids, cat)} />}
              <IconButton icon={<Icons.minus />} title="Bewegung entfernen" onClick={() => { setAll(ids, n => remove(n, cat), 'motion-del'); if (cat === 'mouse' && state === 'hover') S().setInteraction('normal'); }} />
            </div>
            {isOpen && <Details cat={cat} nodes={nodes} ids={ids} />}
          </div>
        );
      })}
      {picking && (
        <div className="fx-picker">
          {CATS.map(([cat, , title]) => {
            const list = FX.filter(f => f.cat === cat && fits(f));
            return (
              <div key={cat}>
                <div className="fx-group">{title}</div>
                <div className="fx-tiles">
                  {list.map(f => {
                    const on = nodes.every(n => kindOf(n, cat) === f.kind);
                    return (
                      <button key={f.kind} type="button" className={`fx-tile${on ? ' on' : ''}`} title={f.tip} aria-pressed={on} onClick={() => choose(f)}>
                        <span className={`fx-demo ${f.demo}`}><i /><i /><i /></span>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="proto-hint">Pro Zeile ist eine Bewegung möglich – eine neue ersetzt die alte. Was hier fehlt, passt nicht zum ausgewählten Element.</p>
        </div>
      )}
      {!picking && (
        active.length
          ? <p className="proto-hint">Auf der Arbeitsfläche bleibt alles still – ▶ führt die Bewegung vor, in der Vorschau läuft sie echt. Wer auf dem Gerät „Bewegung reduzieren“ eingestellt hat, sieht eine ruhige Seite.</p>
          : <button type="button" className="fx-add" onClick={() => setPicking(true)}><Icons.plus /> Bewegung hinzufügen</button>
      )}
    </Section>
  );
}

function common<T>(nodes: WNode[], get: (n: WNode) => T): T | undefined {
  const v = get(nodes[0]);
  return nodes.every(n => get(n) === v) ? v : undefined;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="row"><span className="lbl">{label}</span>{children}</div>;
}

function Slider({ value, min, max, step = 1, left, right, onChange, title }: { value: number | undefined; min: number; max: number; step?: number; left: string; right: string; onChange: (v: number) => void; title: string }) {
  return (
    <div className="fx-slider">
      <input type="range" min={min} max={max} step={step} value={value ?? (min + max) / 2} aria-label={title} title={title} onChange={e => onChange(+e.target.value)} />
      <div className="fx-ends"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

function Details({ cat, nodes, ids }: { cat: Cat; nodes: WNode[]; ids: string[] }) {
  const state = useEditor(s => s.interaction);
  const first = nodes[0];
  const k = kindOf(first, cat);
  const set = (fn: (n: WNode) => void, key: string) => setAll(ids, fn, key);

  if (cat === 'appear') {
    const types = FX.filter(f => f.cat === 'appear' && nodes.every(n => !f.ok || f.ok(n)));
    const group = nodes.every(isGroup) && k !== 'words' && k !== 'count';
    const stag = common(nodes, n => n.reveal?.stagger ?? 0);
    return (
      <div className="fx-body">
        <Row label="Art">
          <select className="select grow" aria-label="Art des Erscheinens" value={common(nodes, n => n.reveal?.type) ?? ''}
            onChange={e => set(n => apply(n, e.target.value as RevealType), 'reveal')}>
            {common(nodes, n => n.reveal?.type) === undefined && <option value="" disabled>Gemischt</option>}
            {types.map(f => <option key={f.kind} value={f.kind}>{f.label}</option>)}
          </select>
        </Row>
        <Row label="Dauer">
          <NumberField title="Dauer in Sekunden" suffix="s" min={0.1} max={10} step={0.1} precision={1} value={common(nodes, n => (n.reveal?.duration ?? 0) / 1000)}
            onChange={v => set(n => { if (n.reveal) n.reveal.duration = Math.round(v * 1000); }, 'reveal-d')} />
        </Row>
        <Row label="Warten">
          <NumberField title="Wartezeit, bevor es losgeht, in Sekunden" suffix="s" min={0} max={10} step={0.1} precision={1} value={common(nodes, n => (n.reveal?.delay ?? 0) / 1000)}
            onChange={v => set(n => { if (n.reveal) n.reveal.delay = Math.round(v * 1000); }, 'reveal-dl')} />
        </Row>
        {group && (
          <>
            <Row label="Nacheinander">
              <Seg value={stag === undefined ? undefined : stag ? 'yes' : 'no'} onChange={v => set(n => { if (n.reveal) n.reveal.stagger = v === 'yes' ? 120 : undefined; }, 'reveal-st')} options={[
                { value: 'yes', icon: <span>Ja</span>, title: 'Die Elemente darin erscheinen eins nach dem anderen' },
                { value: 'no', icon: <span>Nein</span>, title: 'Alles erscheint auf einmal' },
              ]} />
            </Row>
            {!!stag && (
              <Row label="Abstand">
                <NumberField title="Zeit zwischen zwei Elementen in Sekunden" suffix="s" min={0.02} max={2} step={0.02} precision={2} value={stag / 1000}
                  onChange={v => set(n => { if (n.reveal) n.reveal.stagger = Math.round(v * 1000); }, 'reveal-st')} />
              </Row>
            )}
          </>
        )}
        {k === 'count' && <p className="proto-hint">Alle Zahlen im Text zählen von 0 hoch, z. B. „1.200 Kunden“ oder „4,8 Sterne“.</p>}
      </div>
    );
  }

  if (cat === 'scroll') {
    const amt = common(nodes, n => n.motion?.scroll?.amount);
    const setAmt = (v: number) => set(n => { if (n.motion?.scroll) n.motion = { ...n.motion, scroll: { ...n.motion.scroll, amount: v } }; }, 'fx-scroll');
    return (
      <div className="fx-body">
        {k === 'depth' && <Slider title="Tempo beim Scrollen" min={-80} max={80} step={5} value={amt} left="langsamer" right="schneller" onChange={setAmt} />}
        {k === 'rotate' && <Row label="Winkel"><NumberField title="Drehung in Grad" suffix="°" min={-180} max={180} precision={0} value={amt} onChange={setAmt} /></Row>}
        {k === 'grow' && <Row label="Startgröße"><NumberField title="Größe beim Hineinscrollen, in Prozent" suffix="%" min={10} max={99} precision={0} value={amt} onChange={setAmt} /></Row>}
        <p className="proto-hint">{{
          depth: 'Langsamer wirkt wie ein Hintergrund in der Ferne, schneller wie etwas nah vor dem Auge.',
          rotate: 'Steht in der Mitte des Fensters gerade und dreht sich davor und danach.',
          grow: 'Wächst beim Hineinscrollen bis zur vollen Größe.',
          focus: 'Ist zuerst blass und unscharf und wird beim Hineinscrollen klar.',
          stack: 'Jeder Abschnitt darin bleibt oben kleben, der nächste schiebt sich darüber. Gib den Abschnitten eine Hintergrundfarbe.',
          sideways: 'Beim Scrollen nach unten läuft der Inhalt nach links durch, danach geht es normal weiter.',
        }[k as ScrollFxKind] ?? ''}</p>
      </div>
    );
  }

  if (cat === 'mouse') {
    if (k === 'hover') {
      const dur = common(nodes, n => n.hoverDuration ?? 200);
      return (
        <div className="fx-body">
          <div className="row">
            <button className={`btn grow${state === 'hover' ? ' active' : ''}`} onClick={() => S().setInteraction(state === 'hover' ? 'normal' : 'hover')}>
              {state === 'hover' ? 'Hover-Bearbeitung beenden' : 'Hover-Aussehen bearbeiten'}
            </button>
          </div>
          <Row label="Übergang">
            <NumberField title="Dauer des Übergangs in Sekunden" suffix="s" min={0} max={3} step={0.05} precision={2} value={dur === undefined ? undefined : dur / 1000}
              onChange={v => set(n => { n.hoverDuration = Math.round(v * 1000); }, 'hover-dur')} />
          </Row>
          <p className="proto-hint">Im Hover-Zustand änderst du z. B. Farbe oder Schatten – so sieht es aus, wenn die Maus darüber fährt.</p>
        </div>
      );
    }
    const amt = common(nodes, n => n.motion?.mouse?.amount);
    const setAmt = (v: number) => set(n => { if (n.motion?.mouse) n.motion = { ...n.motion, mouse: { ...n.motion.mouse, amount: v } }; }, 'fx-mouse');
    const range = { tilt: [2, 20], magnet: [10, 60], follow: [2, 20] }[k as MouseFxKind];
    return (
      <div className="fx-body">
        <Slider title="Stärke" min={range[0]} max={range[1]} value={amt} left="sanft" right="kräftig" onChange={setAmt} />
        <p className="proto-hint">Nur mit Maus zu sehen – auf Handy und Tablet bleibt es ruhig.</p>
      </div>
    );
  }

  // Immer
  const L = first.motion?.loop;
  const setL = (fn: (l: NonNullable<NonNullable<WNode['motion']>['loop']>) => void, key: string) =>
    set(n => { if (n.motion?.loop) { const l = { ...n.motion.loop }; fn(l); n.motion = { ...n.motion, loop: l }; } }, key);
  return (
    <div className="fx-body">
      <Row label={k === 'marquee' ? 'Durchlauf' : 'Dauer'}>
        <NumberField title={k === 'marquee' ? 'Sekunden für einen ganzen Durchlauf – mehr ist langsamer' : 'Sekunden für eine Bewegung'} suffix="s" min={0.5} max={120} step={0.5} precision={1}
          value={common(nodes, n => n.motion?.loop?.speed)} onChange={v => setL(l => { l.speed = v; }, 'fx-loop-s')} />
      </Row>
      {k === 'marquee' && (
        <Row label="Richtung">
          <Seg value={L?.reverse ? 'right' : 'left'} onChange={v => setL(l => { l.reverse = v === 'right' || undefined; }, 'fx-loop-r')} options={[
            { value: 'left', icon: <span>← Links</span>, title: 'Läuft nach links' },
            { value: 'right', icon: <span>Rechts →</span>, title: 'Läuft nach rechts' },
          ]} />
        </Row>
      )}
      {k === 'float' && <Row label="Höhe"><NumberField title="Wie weit es auf und ab schwebt" suffix="px" min={1} max={100} precision={0} value={common(nodes, n => n.motion?.loop?.amount)} onChange={v => setL(l => { l.amount = v; }, 'fx-loop-a')} /></Row>}
      {k === 'pulse' && <Row label="Stärke"><NumberField title="Wie viel größer es wird" suffix="%" min={1} max={50} precision={0} value={common(nodes, n => n.motion?.loop?.amount)} onChange={v => setL(l => { l.amount = v; }, 'fx-loop-a')} /></Row>}
      <p className="proto-hint">{k === 'marquee' ? 'Die Elemente darin laufen endlos hintereinander durch. Fährt die Maus darüber, bleibt das Band stehen.' : 'Läuft ständig, sobald die Seite offen ist.'}</p>
    </div>
  );
}
