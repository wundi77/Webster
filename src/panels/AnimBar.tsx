// Animations-Editor: Leiste unten, solange eine eigene Animation geöffnet ist.
// Einfache Ansicht = Zustände (Start → … → Ende), Profi-Ansicht = Zeitleiste mit Ebenen und Schlüsselbildern.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, pageOf } from '../store';
import { closeComponent, instanceCount } from '../model/library';
import { animDuration, animRootOf, ANIM_PROPS, baseValue, EASES, easeFn, PROP_NAMES, setAnimTime, useAnimClock } from '../model/animCore';
import { addKeyHere, addState, deleteKey, keysOf, moveKey, removeState, renameState, setAnimSetting, setKeyEase, setTransition, stop, togglePlay } from '../model/anim';
import type { AnimEase, AnimProp, AnimSettings, Page, WNode } from '../model/types';

const fmt = (t: number) => t.toFixed(2).replace('.', ',') + ' s';
const S = () => useEditor.getState();

export function AnimBar() {
  const page = useEditor(s => { const p = pageOf(s); return animRootOf(p) ? p : null; });
  const count = useEditor(s => { const p = pageOf(s); const r = animRootOf(p); return r ? instanceCount(s.doc, r.id) : 0; });
  const pro = useAnimClock(c => c.pro);
  const bp = useEditor(s => s.breakpoint);
  useEffect(() => () => stop(), []);
  // Animationen werden in der Desktop-Ansicht gebaut
  useEffect(() => { if (page && bp !== 'desktop') S().setBreakpoint('desktop'); }, [page, bp]);
  if (!page) return null;
  const root = animRootOf(page)!;
  const a = root.animation!;
  return (
    <div className={`anim-bar${pro ? ' pro' : ''}`} role="region" aria-label="Animation bearbeiten">
      <AnimHead page={page} root={root} a={a} count={count} />
      {pro ? <Timeline page={page} a={a} /> : <States page={page} a={a} />}
    </div>
  );
}

function AnimHead({ page, root, a, count }: { page: Page; root: WNode; a: AnimSettings; count: number }) {
  const t = useAnimClock(c => c.t);
  const playing = useAnimClock(c => c.playing);
  const pro = useAnimClock(c => c.pro);
  const dur = animDuration(page, a);
  return (
    <div className="anim-head">
      <button type="button" className="anim-play" onClick={togglePlay} title={playing ? 'Anhalten' : 'Abspielen'} aria-label={playing ? 'Anhalten' : 'Abspielen'}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
          : <svg width="14" height="14" viewBox="0 0 14 14"><path d="M4 2.5v9l7.5-4.5z" fill="currentColor" /></svg>}
      </button>
      <span className="anim-time">{fmt(Math.min(t, dur))} <i>/ {fmt(dur)}</i></span>
      <b className="anim-name">{root.name}</b>
      <span className="anim-sub">{count === 0 ? 'noch nicht eingebaut' : count === 1 ? 'auf 1 Stelle eingebaut' : `auf ${count} Stellen eingebaut`}</span>
      <div className="anim-seg" role="group" aria-label="Ansicht">
        <button type="button" className={!pro ? 'on' : ''} onClick={() => useAnimClock.setState({ pro: false })}>Zustände</button>
        <button type="button" className={pro ? 'on' : ''} onClick={() => useAnimClock.setState({ pro: true })}>Profi-Zeitleiste</button>
      </div>
      <label className="anim-opt">Startet
        <select value={a.play} onChange={e => setAnimSetting({ play: e.target.value as AnimSettings['play'] })}>
          <option value="view">wenn sichtbar</option>
          <option value="auto">sofort</option>
          <option value="hover">bei Maus darüber</option>
          <option value="click">beim Klicken</option>
        </select>
      </label>
      <label className="anim-opt">Wiederholen
        <select value={a.repeat} onChange={e => setAnimSetting({ repeat: e.target.value as AnimSettings['repeat'] })}>
          <option value="once">einmal</option>
          <option value="loop">endlos</option>
          <option value="alternate">hin und zurück</option>
        </select>
      </label>
      <button type="button" className="btn primary small" onClick={() => { stop(); closeComponent(); }}>Fertig</button>
    </div>
  );
}

// ---------- Einfache Ansicht: Zustände ----------

function States({ page, a }: { page: Page; a: AnimSettings }) {
  const t = useAnimClock(c => c.t);
  const st = [...a.states].sort((x, y) => x.t - y.t);
  const [editing, setEditing] = useState<string | null>(null);
  const active = st.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best), st[0]);
  const onState = st.find(s => Math.abs(s.t - t) < 0.005);
  void page;
  return (
    <div className="anim-states">
      <div className="anim-strip">
        {st.map((s, i) => (
          <div key={s.id} className="anim-step">
            <div className={`anim-card${s === onState ? ' on' : s === active ? ' near' : ''}`} onClick={() => { stop(); setAnimTime(s.t); }}
              role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setAnimTime(s.t); }}>
              {editing === s.id
                ? <input autoFocus defaultValue={s.name} onClick={e => e.stopPropagation()}
                    onBlur={e => { renameState(s.id, e.target.value); setEditing(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
                : <b onDoubleClick={e => { e.stopPropagation(); setEditing(s.id); }} title="Doppelklick: umbenennen">{s.name}</b>}
              <span>{fmt(s.t)}</span>
              {i > 0 && <button type="button" className="anim-x" title="Zustand entfernen" aria-label={`${s.name} entfernen`}
                onClick={e => { e.stopPropagation(); removeState(s.id); }}>×</button>}
            </div>
            {i < st.length - 1 && <Transition id={s.id} dur={st[i + 1].t - s.t} ease={s.ease} />}
          </div>
        ))}
        <button type="button" className="anim-add" onClick={addState} title="Weiteren Zustand anhängen">+ Zustand</button>
      </div>
      <p className="anim-hint">
        {onState
          ? onState === st[0]
            ? <>Das ist der <b>Anfang</b>. Ändere hier, wie alles zu Beginn aussieht.</>
            : <>Verschiebe, vergrößere, drehe oder färbe Ebenen – so sieht es bei <b>{onState.name}</b> aus. Dazwischen bewegt Webster alles von selbst.</>
          : <>Wähle einen Zustand oben, um ihn zu bearbeiten.</>}
      </p>
    </div>
  );
}

function Transition({ id, dur, ease }: { id: string; dur: number; ease: AnimEase }) {
  const [txt, setTxt] = useState<string | null>(null);
  const commit = (v: string) => { const n = parseFloat(v.replace(',', '.')); if (n > 0) setTransition(id, { dur: n }); setTxt(null); };
  return (
    <div className="anim-trans">
      <svg width="60" height="10" viewBox="0 0 60 10" aria-hidden><path d="M0 5h54" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" /><path d="M53 1l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      <div className="anim-chip">
        <input aria-label="Dauer in Sekunden" value={txt ?? dur.toFixed(2).replace('.', ',')} onChange={e => setTxt(e.target.value)}
          onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }} />
        <span>s</span>
        <select aria-label="Bewegung" value={ease} onChange={e => setTransition(id, { ease: e.target.value as AnimEase })}>
          {EASES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
    </div>
  );
}

// ---------- Profi-Ansicht: Zeitleiste ----------

function layerList(page: Page): { n: WNode; depth: number }[] {
  const out: { n: WNode; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    const n = page.nodes[id];
    if (!n) return;
    out.push({ n, depth });
    [...n.children].reverse().forEach(c => walk(c, depth + 1));
  };
  const root = page.nodes[page.rootIds[0]];
  [...(root?.children ?? [])].reverse().forEach(c => walk(c, 0));
  return out;
}

function Timeline({ page, a }: { page: Page; a: AnimSettings }) {
  const t = useAnimClock(c => c.t);
  const open = useAnimClock(c => c.open);
  const sel = useAnimClock(c => c.key);
  const selection = useEditor(s => s.selection);
  const track = useRef<HTMLDivElement>(null);
  const [tw, setTw] = useState(600);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTw(el.clientWidth));
    ro.observe(el);
    setTw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const dur = animDuration(page, a);
  const span = Math.max(2, Math.ceil((dur + 0.5) * 2) / 2);
  const pad = 12;
  const px = (tw - pad * 2) / span;
  const X = (s: number) => pad + s * px;
  const T = (x: number) => Math.max(0, (x - pad) / px);
  const layers = layerList(page);
  const step = px > 90 ? 0.1 : px > 40 ? 0.25 : 0.5;

  const scrub = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.tl-key')) return;
    const el = track.current!;
    const r = el.getBoundingClientRect();
    stop();
    const go = (cx: number) => setAnimTime(Math.round(T(cx - r.left + el.scrollLeft) / 0.01) * 0.01);
    go(e.clientX);
    const move = (ev: PointerEvent) => go(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragKey = (e: React.PointerEvent, node: string, prop: AnimProp | null, kt: number) => {
    e.stopPropagation();
    stop();
    useAnimClock.setState({ key: { node, prop, t: kt } });
    setAnimTime(kt);
    const x0 = e.clientX;
    let cur = kt;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) { if (Math.abs(ev.clientX - x0) < 3) return; started = true; S().beginGesture(); }
      const next = moveKey(node, prop, cur, kt + (ev.clientX - x0) / px);
      if (next !== cur) { cur = next; useAnimClock.setState({ key: { node, prop, t: cur } }); setAnimTime(cur); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (started) S().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ticks: number[] = [];
  for (let s = 0; s <= span + 1e-6; s += step) ticks.push(Math.round(s * 100) / 100);
  const selNode = sel ? page.nodes[sel.node] : undefined;
  const selKey = sel && selNode ? keysOf(selNode, sel.prop).find(k => Math.abs(k.t - sel.t) < 0.005) : undefined;

  return (
    <div className="tl">
      <div className="tl-body">
        <div className="tl-names">
          <div className="tl-ruler-l">Ebenen</div>
          {layers.map(({ n, depth }) => {
            const animated = ANIM_PROPS.filter(p => n.anim?.[p]?.length);
            const isOpen = open[n.id];
            return (
              <div key={n.id}>
                <div className={`tl-name${selection.includes(n.id) ? ' sel' : ''}`} style={{ paddingLeft: 6 + depth * 12 }}
                  onClick={() => S().setSelection([n.id])}>
                  <button type="button" className="tl-tw" aria-label={isOpen ? 'Zuklappen' : 'Aufklappen'} aria-expanded={!!isOpen}
                    onClick={e => { e.stopPropagation(); useAnimClock.setState({ open: { ...open, [n.id]: !isOpen } }); }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}><path d="M2 1l4 3-4 3z" fill="currentColor" /></svg>
                  </button>
                  <span>{n.name}</span>
                  {animated.length > 0 && <em>{animated.length}</em>}
                </div>
                {isOpen && ANIM_PROPS.filter(p => baseValue(n, p) !== undefined).map(p => (
                  <div key={p} className={`tl-name prop${n.anim?.[p]?.length ? ' has' : ''}`} style={{ paddingLeft: 26 + depth * 12 }}>
                    <span>{PROP_NAMES[p]}</span>
                    <button type="button" className="tl-addkey" title={`Schlüsselbild für ${PROP_NAMES[p]} bei ${fmt(t)} setzen`}
                      aria-label={`Schlüsselbild für ${PROP_NAMES[p]} setzen`} onClick={() => addKeyHere(n.id, p)}>
                      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1l4 4-4 4-4-4z" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M5 3.3v3.4M3.3 5h3.4" stroke="currentColor" strokeWidth="1.2" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {!layers.length && <div className="tl-empty">Zeichne zuerst etwas auf die Fläche.</div>}
        </div>
        <div className="tl-track" ref={track} onPointerDown={scrub}>
          <div className="tl-inner" style={{ width: X(span) + pad }}>
            <div className="tl-ruler">
              {ticks.map(s => (
                <span key={s} className={Math.abs(s - Math.round(s)) < 1e-6 ? 'big' : ''} style={{ left: X(s) }}>
                  {Math.abs(s * 2 - Math.round(s * 2)) < 1e-6 ? <i>{String(s).replace('.', ',')}</i> : null}
                </span>
              ))}
              {a.states.map(s => <b key={s.id} className="tl-flag" style={{ left: X(s.t) }} title={`${s.name} · ${fmt(s.t)}`}>{s.name}</b>)}
            </div>
            {layers.map(({ n }) => (
              <div key={n.id}>
                <Row keys={keysOf(n, null).map(k => k.t)} X={X} cls="layer" selected={sel?.node === n.id && sel.prop === null ? sel.t : null}
                  onKey={(e, kt) => dragKey(e, n.id, null, kt)} />
                {open[n.id] && ANIM_PROPS.filter(p => baseValue(n, p) !== undefined).map(p => (
                  <Row key={p} keys={(n.anim?.[p] ?? []).map(k => k.t)} X={X} cls="prop" selected={sel?.node === n.id && sel.prop === p ? sel.t : null}
                    onKey={(e, kt) => dragKey(e, n.id, p, kt)} />
                ))}
              </div>
            ))}
            <div className="tl-head" style={{ left: X(t) }} />
          </div>
        </div>
      </div>
      <div className="tl-foot">
        {sel && selNode && selKey ? (
          <>
            <span>Schlüsselbild <b>{selNode.name}{sel.prop ? ` · ${PROP_NAMES[sel.prop]}` : ''}</b> bei {fmt(sel.t)}</span>
            <label>Bewegung danach
              <select value={selKey.ease ?? 'smooth'} onChange={e => setKeyEase(sel.node, sel.prop, sel.t, e.target.value as AnimEase)}>
                {EASES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <EaseCurve ease={selKey.ease ?? 'smooth'} />
            <button type="button" className="btn small" onClick={() => deleteKey(sel.node, sel.prop, sel.t)}>Löschen</button>
          </>
        ) : (
          <span className="tl-tip">Abspielkopf ziehen, dann Ebenen auf der Fläche verändern – das wird zum Schlüsselbild ◆. Rauten lassen sich verschieben.</span>
        )}
      </div>
    </div>
  );
}

function Row({ keys, X, cls, selected, onKey }: { keys: number[]; X: (t: number) => number; cls: string; selected: number | null; onKey: (e: React.PointerEvent, t: number) => void }) {
  const sorted = [...keys].sort((a, b) => a - b);
  return (
    <div className={`tl-row ${cls}`}>
      {sorted.length > 1 && <i className="tl-span" style={{ left: X(sorted[0]), width: X(sorted[sorted.length - 1]) - X(sorted[0]) }} />}
      {sorted.map(t => (
        <button type="button" key={t} className={`tl-key${selected !== null && Math.abs(selected - t) < 0.005 ? ' on' : ''}`} style={{ left: X(t) }}
          aria-label={`Schlüsselbild bei ${fmt(t)}`} onPointerDown={e => onKey(e, t)} />
      ))}
    </div>
  );
}

function EaseCurve({ ease }: { ease: AnimEase }) {
  const fn = easeFn(ease);
  let d = '';
  for (let i = 0; i <= 24; i++) { const x = i / 24; d += `${i ? 'L' : 'M'}${(x * 40).toFixed(1)} ${(30 - fn(x) * 30).toFixed(1)}`; }
  return (
    <svg className="tl-curve" width="44" height="28" viewBox="-2 -8 44 40" aria-hidden>
      <path d="M0 30H40M0 0V30" stroke="currentColor" opacity=".25" fill="none" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}
