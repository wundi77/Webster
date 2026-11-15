// Eigener Farbwähler: Farbfeld + Regler, Pipette, Eingabe als Hex/RGB/HSL,
// Bibliotheks- und zuletzt benutzte Farben und (für Füllungen) Farbverläufe.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPE } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../store';
import { rgba } from '../model/css';
import type { Gradient, GradientType } from '../model/types';
import {
  GRADIENT_LABEL, colorAt, defaultGradient, gradientCss, hexToRgb, hslToRgb, hsvToRgb, parseColor, rgbToHex, rgbToHsl, rgbToHsv,
  sortedStops, stopId, type HSV,
} from '../model/gradient';
import { addGradient } from '../model/library';
import { Icons } from './icons';

export interface PaintValue { color: string; opacity: number; gradient?: Gradient | null }
export interface PaintPatch { color?: string; opacity?: number; gradient?: Gradient | null; colorRef?: string | null; gradientRef?: string | null }

// ---------- Ist ein Farbwähler offen? (Tastenkürzel ruhen dann) ----------
let openCount = 0;
export const isColorPickerOpen = () => openCount > 0;

// ---------- Zuletzt benutzte Farben ----------
const RECENT_KEY = 'webster.recent-colors';
function loadRecentColors(): string[] {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(r) ? r.filter(x => typeof x === 'string').slice(0, 16) : []; } catch { return []; }
}
function rememberColor(hex: string) {
  const list = [hex.toUpperCase(), ...loadRecentColors().filter(c => c !== hex.toUpperCase())].slice(0, 16);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* egal */ }
}

// ---------- Ziehen mit der Maus (ein Rückgängig-Schritt pro Zug) ----------
function useDrag(onMove: (x: number, y: number) => void) {
  const frame = useRef(0);
  return (e: RPE<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const emit = (cx: number, cy: number) => onMove(Math.max(0, Math.min(1, (cx - r.left) / r.width)), Math.max(0, Math.min(1, (cy - r.top) / r.height)));
    useEditor.getState().beginGesture();
    emit(e.clientX, e.clientY);
    let last: [number, number] | null = null;
    const move = (ev: PointerEvent) => {
      last = [ev.clientX, ev.clientY];
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => { frame.current = 0; if (last) emit(...last); });
    };
    const up = () => {
      cancelAnimationFrame(frame.current); frame.current = 0;
      if (last) emit(...last);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useEditor.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

const CHECKER: CSSProperties = { backgroundImage: 'conic-gradient(#cfcfcf 25%, #fff 0 50%, #cfcfcf 0 75%, #fff 0)', backgroundSize: '8px 8px' };

type Mode = 'solid' | GradientType;
const TAB_LABEL: Record<Mode, string> = { solid: 'Farbe', linear: 'Linear', radial: 'Kreis', conic: 'Kegel' };
type Format = 'hex' | 'rgb' | 'hsl';

export function ColorPicker({ anchor, value, onChange, onClose, showAlpha = true, allowGradient = false, gradientOnly = false, noConic = false }: {
  anchor: HTMLElement; value: PaintValue; onChange: (p: PaintPatch) => void; onClose: () => void;
  showAlpha?: boolean; allowGradient?: boolean; gradientOnly?: boolean; noConic?: boolean;
}) {
  const libColors = useEditor(s => s.doc.library.colors);
  const libGradients = useEditor(s => s.doc.library.gradients);
  const g = value.gradient ?? null;
  const mode: Mode = g ? g.type : 'solid';
  const [stopSel, setStopSel] = useState<string | null>(null);
  const stops = g ? sortedStops(g) : [];
  const stop = g ? (g.stops.find(s => s.id === stopSel) ?? stops[0]) : null;

  // Die gerade bearbeitete Farbe: einfarbig = Füllung, Verlauf = gewählter Farbpunkt
  const cur = stop ? { color: stop.color, opacity: stop.opacity } : { color: value.color, opacity: value.opacity };
  const setCur = (p: { color?: string; opacity?: number }) => {
    if (g && stop) onChange({ gradient: { ...g, stops: g.stops.map(s => (s.id === stop.id ? { ...s, ...p } : s)) } });
    else onChange(p);
  };

  // HSV lokal halten, damit der Farbton bei Schwarz/Grau nicht auf Rot springt
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(cur.color)));
  const sent = useRef(cur.color.toUpperCase());
  useEffect(() => {
    if (cur.color.toUpperCase() !== sent.current) { sent.current = cur.color.toUpperCase(); setHsv(rgbToHsv(hexToRgb(cur.color))); }
  }, [cur.color]);
  const sendHsv = (h: HSV) => {
    setHsv(h);
    const hex = rgbToHex(hsvToRgb(h));
    sent.current = hex;
    setCur({ color: hex });
  };

  // ---------- Platzierung links neben dem Farbfeld ----------
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect(), el = box.current;
      if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      const panel = anchor.closest('.panel-body')?.getBoundingClientRect();
      let left = panel && panel.left > window.innerWidth / 2 ? panel.left - w - 8 : panel ? panel.right + 8 : a.left - w - 8;
      left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      const top = Math.max(8, Math.min(window.innerHeight - h - 8, a.top - 40));
      setPos({ left, top });
    };
    place();
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [anchor]);

  // ---------- Schließen: Klick daneben, Esc; Tastenkürzel währenddessen aus ----------
  const close = useRef(onClose);
  close.current = onClose;
  const startColor = useRef(cur.color);
  useEffect(() => {
    openCount++;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || (anchor.parentElement ?? anchor).contains(t)) return;
      close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => { openCount--; window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); };
  }, [anchor]);
  // zuletzt benutzte Farben beim Schließen merken
  const lastColor = useRef(cur.color);
  lastColor.current = cur.color;
  useEffect(() => () => { if (lastColor.current.toUpperCase() !== startColor.current.toUpperCase()) rememberColor(lastColor.current); }, []);
  const [recent] = useState(loadRecentColors);

  // ---------- Modus wechseln ----------
  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'solid') { onChange({ gradient: null, color: cur.color }); return; }
    if (g) onChange({ gradient: { ...g, type: m, angle: m === 'conic' && g.type === 'linear' ? 0 : m === 'linear' && g.type === 'conic' ? 180 : g.angle } });
    else { const ng = defaultGradient(value.color, m); onChange({ gradient: ng }); setStopSel(ng.stops[0].id); }
  };

  const pipette = 'EyeDropper' in window;
  const pickScreen = async () => {
    try {
      const ED = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const r = await new ED().open();
      const p = parseColor(r.sRGBHex);
      if (p) setCur({ color: p.color });
    } catch { /* abgebrochen */ }
  };

  const svDrag = useDrag((x, y) => sendHsv({ h: hsv.h, s: x, v: 1 - y }));
  const hueDrag = useDrag(x => sendHsv({ ...hsv, h: Math.min(359.9, x * 360) }));
  const alphaDrag = useDrag(x => setCur({ opacity: Math.round(x * 100) / 100 }));
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const solidHex = rgbToHex(hsvToRgb({ ...hsv }));

  const modes: Mode[] = gradientOnly ? ['linear', 'radial', 'conic'] : allowGradient ? ['solid', 'linear', 'radial', 'conic'] : [];

  return createPortal(
    <div ref={box} className="cpick" role="dialog" aria-label="Farbe wählen" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      onKeyDown={e => e.stopPropagation()}>
      {modes.length > 0 && (
        <div className="cpick-modes" role="tablist">
          {modes.map(m => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''}
              disabled={m === 'conic' && noConic} title={m === 'conic' && noConic ? 'Kegelförmige Verläufe gibt es nur für Flächen und Text' : m === 'solid' ? 'Einfarbig' : `${GRADIENT_LABEL[m]}er Verlauf`}
              onClick={() => setMode(m)}>{TAB_LABEL[m]}</button>
          ))}
        </div>
      )}

      {g && <GradientEditor g={g} sel={stop?.id ?? null} onSel={setStopSel} onChange={ng => onChange({ gradient: ng })} />}

      <div className="cpick-sv" style={{ background: hueColor }} onPointerDown={svDrag}>
        <div className="cpick-sv-white" /><div className="cpick-sv-black" />
        <span className="cpick-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solidHex }} />
      </div>

      <div className="cpick-sliders">
        {pipette && <button type="button" className="ibtn" title="Farbe vom Bildschirm aufnehmen (Pipette)" aria-label="Pipette" onClick={pickScreen}><Icons.pipette /></button>}
        <div className="cpick-bars">
          <div className="cpick-bar hue" onPointerDown={hueDrag} role="slider" aria-label="Farbton" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}>
            <span className="cpick-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          {showAlpha && (
            <div className="cpick-bar" style={CHECKER} onPointerDown={alphaDrag} role="slider" aria-label="Deckkraft" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cur.opacity * 100)}>
              <div className="cpick-alpha" style={{ background: `linear-gradient(90deg, ${rgba(cur.color, 0)}, ${rgba(cur.color, 1)})` }} />
              <span className="cpick-thumb" style={{ left: `${cur.opacity * 100}%` }} />
            </div>
          )}
        </div>
        <span className="cpick-preview" style={CHECKER}><span style={{ background: rgba(cur.color, cur.opacity) }} /></span>
      </div>

      <ColorInputs color={cur.color} opacity={showAlpha ? cur.opacity : undefined} onChange={setCur} />

      {/* Bibliothek & zuletzt benutzt */}
      {g && libGradients.length > 0 && (
        <div className="cpick-group">
          <div className="cpick-label">Verläufe der Bibliothek</div>
          <div className="cpick-swatches">
            {libGradients.filter(a => !(noConic && a.gradient.type === 'conic')).map(a => (
              <button key={a.id} type="button" className="cpick-sw" title={a.name} aria-label={a.name}
                onClick={() => { onChange({ gradient: structuredClone(a.gradient), gradientRef: a.id }); setStopSel(null); }}>
                <span style={{ background: gradientCss(a.gradient) }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {libColors.length > 0 && (
        <div className="cpick-group">
          <div className="cpick-label">Farben der Bibliothek{!g && <span className="muted"> · Klick verknüpft</span>}</div>
          <div className="cpick-swatches">
            {libColors.map(c => (
              <button key={c.id} type="button" className="cpick-sw" style={CHECKER} title={c.name} aria-label={c.name}
                onClick={() => (g ? setCur({ color: c.color, opacity: c.opacity }) : onChange({ color: c.color, opacity: c.opacity, colorRef: c.id }))}>
                <span style={{ background: rgba(c.color, c.opacity) }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div className="cpick-group">
          <div className="cpick-label">Zuletzt benutzt</div>
          <div className="cpick-swatches">
            {recent.map(c => (
              <button key={c} type="button" className="cpick-sw" title={c} aria-label={c} onClick={() => setCur({ color: c })}>
                <span style={{ background: c }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {g && !gradientOnly && (
        <button type="button" className="btn ghost cpick-save" onClick={() => { const id = addGradient(g); onChange({ gradientRef: id }); }}>
          <Icons.library /> Verlauf in Bibliothek speichern
        </button>
      )}
    </div>,
    document.body,
  );
}

// ---------- Verlaufsleiste mit Farbpunkten ----------

function GradientEditor({ g, sel, onSel, onChange }: { g: Gradient; sel: string | null; onSel: (id: string) => void; onChange: (g: Gradient) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const stops = sortedStops(g);
  const dragStop = (e: RPE<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    onSel(id);
    const r = bar.current!.getBoundingClientRect();
    const startX = e.clientX;
    let moved = false;
    useEditor.getState().beginGesture();
    let base = g;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      const pos = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 1000) / 1000;
      base = { ...base, stops: base.stops.map(s => (s.id === id ? { ...s, pos } : s)) };
      onChange(base);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); useEditor.getState().endGesture(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const addAt = (e: RPE<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pos = Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000;
    const s = { id: stopId(), pos, ...colorAt(g, pos) };
    onChange({ ...g, stops: [...g.stops, s] });
    onSel(s.id);
  };
  const remove = () => {
    if (!sel || g.stops.length <= 2) return;
    const next = g.stops.filter(s => s.id !== sel);
    onChange({ ...g, stops: next });
    onSel(sortedStops({ ...g, stops: next })[0].id);
  };
  const preview: Gradient = { ...g, type: 'linear', angle: 90 };
  return (
    <div className="cpick-grad">
      <div ref={bar} className="cpick-gbar" style={CHECKER} onPointerDown={addAt} title="Klicken: Farbpunkt hinzufügen · Punkte ziehen zum Verschieben">
        <div className="cpick-gbar-fill" style={{ background: gradientCss(preview) }} />
        {stops.map(s => (
          <button key={s.id} type="button" className={`cpick-stop${s.id === sel ? ' on' : ''}`} style={{ left: `${s.pos * 100}%` }}
            aria-label={`Farbpunkt bei ${Math.round(s.pos * 100)} %`} aria-pressed={s.id === sel}
            onPointerDown={e => dragStop(e, s.id)}
            onKeyDown={e => {
              if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01);
                onChange({ ...g, stops: g.stops.map(x => (x.id === s.id ? { ...x, pos: Math.max(0, Math.min(1, Math.round((x.pos + d) * 1000) / 1000)) } : x)) });
              }
            }}>
            <span style={{ background: s.color }} />
          </button>
        ))}
      </div>
      <div className="cpick-grad-row">
        {g.type !== 'radial' && (
          <label className="cpick-angle" title={g.type === 'linear' ? 'Richtung (0° = nach oben, 90° = nach rechts)' : 'Startwinkel'}>
            <Icons.rotate />
            <AngleInput value={g.angle} onChange={a => onChange({ ...g, angle: a })} />
          </label>
        )}
        <button type="button" className="btn ghost small" title="Verlauf umdrehen"
          onClick={() => onChange({ ...g, stops: g.stops.map(s => ({ ...s, pos: Math.round((1 - s.pos) * 1000) / 1000 })) })}>Umkehren</button>
        <span className="grow" />
        <button type="button" className="ibtn" disabled={g.stops.length <= 2} title={g.stops.length <= 2 ? 'Ein Verlauf braucht mindestens zwei Farben' : 'Gewählten Farbpunkt entfernen'}
          aria-label="Farbpunkt entfernen" onClick={remove}><Icons.trash /></button>
      </div>
    </div>
  );
}

function AngleInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = (t: string) => {
    const v = parseFloat(t.replace(',', '.'));
    if (!isNaN(v)) onChange(((Math.round(v) % 360) + 360) % 360);
    setText(null);
  };
  return (
    <input className="textinput small" aria-label="Winkel in Grad" value={text ?? `${Math.round(value)}°`} spellCheck={false}
      onFocus={e => { setText(String(Math.round(value))); requestAnimationFrame(() => e.target.select()); }}
      onChange={e => setText(e.target.value)} onBlur={e => text !== null && commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 15 : 1); onChange((((Math.round(value) + d) % 360) + 360) % 360); setText(null); }
      }} />
  );
}

// ---------- Eingabe als Hex / RGB / HSL ----------

const FORMAT_KEY = 'webster.color-format';

function ColorInputs({ color, opacity, onChange }: { color: string; opacity?: number; onChange: (p: { color?: string; opacity?: number }) => void }) {
  const [fmt, setFmtState] = useState<Format>(() => { try { return (localStorage.getItem(FORMAT_KEY) as Format) || 'hex'; } catch { return 'hex'; } });
  const setFmt = (f: Format) => { setFmtState(f); try { localStorage.setItem(FORMAT_KEY, f); } catch { /* egal */ } };
  const rgb = hexToRgb(color);
  const hsl = rgbToHsl(rgb);
  const vals = fmt === 'rgb' ? [rgb.r, rgb.g, rgb.b] : [hsl.h, hsl.s * 100, hsl.l * 100];
  const labels = fmt === 'rgb' ? ['R', 'G', 'B'] : ['H', 'S', 'L'];
  const max = fmt === 'rgb' ? [255, 255, 255] : [360, 100, 100];
  const setPart = (i: number, v: number) => {
    const next = [...vals]; next[i] = Math.max(0, Math.min(max[i], v));
    const c = fmt === 'rgb' ? { r: next[0], g: next[1], b: next[2] } : hslToRgb(next[0], next[1] / 100, next[2] / 100);
    onChange({ color: rgbToHex(c) });
  };
  return (
    <div className="cpick-inputs">
      <select className="select" value={fmt} aria-label="Farbangabe" onChange={e => setFmt(e.target.value as Format)}>
        <option value="hex">Hex</option><option value="rgb">RGB</option><option value="hsl">HSL</option>
      </select>
      {fmt === 'hex'
        ? <TextNum className="grow" label="Hex" value={color.replace('#', '')} onCommit={t => { const p = parseColor(t); if (p) onChange(p.opacity !== undefined && opacity !== undefined ? p : { color: p.color }); }} />
        : vals.map((v, i) => <TextNum key={labels[i] + fmt} label={labels[i]} value={String(Math.round(v))} onCommit={t => { const n = parseFloat(t.replace(',', '.')); if (!isNaN(n)) setPart(i, n); }} />)}
      {opacity !== undefined && (
        <TextNum label="Deckkraft" suffix="%" value={String(Math.round(opacity * 100))}
          onCommit={t => { const n = parseFloat(t.replace(',', '.')); if (!isNaN(n)) onChange({ opacity: Math.max(0, Math.min(100, n)) / 100 }); }} />
      )}
    </div>
  );
}

function TextNum({ label, value, onCommit, suffix, className }: { label: string; value: string; onCommit: (t: string) => void; suffix?: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className={`cpick-num ${className ?? ''}`} title={label}>
      <input aria-label={label} value={text ?? value} spellCheck={false}
        onFocus={e => { setText(value); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text !== null && text !== value) onCommit(text); setText(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setText(null); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
        }} />
      {suffix && <span className="cpick-suffix">{suffix}</span>}
    </label>
  );
}
