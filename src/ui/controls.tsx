import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { rgba } from '../model/css';
import type { Gradient } from '../model/types';
import { gradientCss, gradientLabel } from '../model/gradient';
import { ColorPicker, type PaintPatch } from './ColorPicker';
import { round } from '../model/geometry';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Erlaubt Eingaben wie "100+20" oder "12,5" */
export function evalExpr(raw: string): number | null {
  const s = raw.replace(/,/g, '.').replace(/px|%|°/g, '').trim();
  if (!s || !/^[-+*/().\d\s]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict";return (${s})`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

interface NumberFieldProps {
  label?: ReactNode;
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number; precision?: number;
  suffix?: string; title?: string; className?: string;
  disabled?: boolean; placeholder?: string;
  /** Leeres Feld erlaubt (z. B. "keine Mindestbreite") */
  onClear?: () => void;
}

/** Zahlenfeld: Tippen, Pfeiltasten (⇧ = ×10), oder am Label ziehen */
export function NumberField({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, precision = 2, suffix, title, className, disabled, placeholder, onClear }: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const cancel = useRef(false);
  const display = value === undefined ? '' : String(round(value, precision)).replace('.', ',');
  const commit = (raw: string) => {
    if (!raw.trim() && onClear) { onClear(); setText(null); return; }
    const v = evalExpr(raw);
    if (v !== null) onChange(clamp(round(v, precision), min, max));
    setText(null);
  };
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    const startX = e.clientX;
    const start = value ?? 0;
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - startX) * (ev.shiftKey ? 10 : 1) * step;
      onChange(clamp(round(start + d, precision), min, max));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('scrubbing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.classList.add('scrubbing');
  };
  return (
    <div className={`numfield ${className ?? ''}${disabled ? ' disabled' : ''}`} title={title}>
      {label !== undefined && <span className="nf-label" onPointerDown={scrub}>{label}</span>}
      <input
        aria-label={title}
        value={text ?? display}
        disabled={disabled}
        placeholder={placeholder ?? (value === undefined ? 'Gemischt' : '')}
        onFocus={e => { setText(display); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setText(e.target.value)}
        onBlur={e => { if (cancel.current) { cancel.current = false; setText(null); return; } if (text !== null) commit(e.target.value); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(e.currentTarget.value); cancel.current = true; e.currentTarget.blur(); }
          else if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = evalExpr(e.currentTarget.value) ?? value ?? 0;
            const v = clamp(round(base + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), precision), min, max);
            onChange(v);
            setText(String(v).replace('.', ','));
          }
        }}
      />
      {suffix && <span className="nf-suffix">{suffix}</span>}
    </div>
  );
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const normHex = (v: string) => {
  let h = v.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return '#' + h.toUpperCase();
};

export function ColorField({ color, opacity, gradient, onChange, allowGradient, gradientOnly, noConic }: {
  color: string; opacity?: number; gradient?: Gradient | null; onChange: (c: PaintPatch) => void;
  /** Verläufe erlauben (nur bei Füllungen) */
  allowGradient?: boolean; gradientOnly?: boolean; noConic?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const sw = useRef<HTMLButtonElement>(null);
  const commit = (v: string) => { if (HEX.test(v.trim())) onChange({ color: normHex(v.trim()) }); setText(null); };
  return (
    <div className="colorfield">
      <button ref={sw} type="button" className={`swatch${open ? ' open' : ''}`} title="Farbe wählen" aria-label="Farbe wählen" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <span style={{ background: gradient ? gradientCss(gradient, opacity ?? 1) : rgba(color, opacity ?? 1) }} />
      </button>
      {open && sw.current && (
        <ColorPicker anchor={sw.current} value={{ color, opacity: opacity ?? 1, gradient }} showAlpha={opacity !== undefined}
          allowGradient={allowGradient} gradientOnly={gradientOnly} noConic={noConic}
          onChange={onChange} onClose={() => setOpen(false)} />
      )}
      {gradient ? (
        <button type="button" className="hex grad-label" onClick={() => setOpen(o => !o)} title="Verlauf bearbeiten">{gradientLabel(gradient)}</button>
      ) : (
      <input className="hex" aria-label="Farbwert (Hex)" value={text ?? color.replace('#', '')} spellCheck={false}
        onFocus={e => { setText(color.replace('#', '')); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setText(e.target.value)}
        onBlur={e => text !== null && commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(null); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); } }} />
      )}
      {opacity !== undefined && (
        <NumberField value={round(opacity * 100, 0)} min={0} max={100} precision={0} suffix="%" className="op" title="Deckkraft"
          onChange={v => onChange({ opacity: v / 100 })} />
      )}
    </div>
  );
}

const SEC_KEY = 'webster.sections';
const readSec = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(SEC_KEY) ?? '{}'); } catch { return {}; } };
const HELP_SEL = '.hint, .proto-hint:not(.warn), .field-hint';

/** Gruppe mit Überschrift: per Klick auf- und zuklappbar (wird gemerkt), „?“ blendet die Erklärungen ein */
export function Section({ title, actions, children, empty, summary, defaultOpen = true, fixed }: {
  title: string; actions?: ReactNode; children?: ReactNode; empty?: boolean;
  /** kurze Zusammenfassung, wenn zugeklappt */ summary?: ReactNode;
  defaultOpen?: boolean; /** nicht zuklappbar */ fixed?: boolean;
}) {
  const [open, setOpenState] = useState(() => fixed ? true : readSec()[title] ?? defaultOpen);
  const [help, setHelp] = useState(false);
  const [hasHelp, setHasHelp] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const h = !!ref.current?.querySelector(HELP_SEL);
    if (h !== hasHelp) setHasHelp(h);
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try { const m = readSec(); m[title] = v; localStorage.setItem(SEC_KEY, JSON.stringify(m)); } catch { /* kein Speicher */ }
  };
  const isOpen = fixed || open;
  return (
    <section ref={ref} className={`section${empty ? ' empty' : ''}${isOpen ? '' : ' closed'}${help ? ' show-help' : ''}`}>
      <div className="section-head">
        {fixed ? <span>{title}</span> : (
          <button type="button" className="section-toggle" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}
            title={isOpen ? 'Zuklappen' : 'Aufklappen'}>
            <svg className="sec-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 3.8 5 6.3l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="sec-title">{title}</span>
            {!isOpen && summary != null && <span className="sec-sum">{summary}</span>}
          </button>
        )}
        <div className="section-actions">
          {isOpen && hasHelp && (
            <button type="button" className={`help-btn${help ? ' on' : ''}`} aria-pressed={help}
              title={help ? 'Erklärungen ausblenden' : 'Erklärungen einblenden'} aria-label={help ? 'Erklärungen ausblenden' : 'Erklärungen einblenden'}
              onClick={() => setHelp(!help)}>?</button>
          )}
          {isOpen && actions}
        </div>
      </div>
      {isOpen && children}
    </section>
  );
}

export function IconButton({ icon, title, onClick, active, disabled, className }: {
  icon: ReactNode; title: string; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <button type="button" className={`ibtn${active ? ' active' : ''} ${className ?? ''}`} title={title} aria-label={title}
      aria-pressed={active} disabled={disabled} onClick={onClick}>{icon}</button>
  );
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T | undefined; options: { value: T; icon: ReactNode; title: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(o => <IconButton key={o.value} icon={o.icon} title={o.title} active={value === o.value} onClick={() => onChange(o.value)} />)}
    </div>
  );
}

/** Aufklapp-Menü (Topbar) */
export function Menu({ label, children, align = 'left', title, btnClass, popClass }: {
  label: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; title?: string; btnClass?: string; popClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className={`menu-btn${open ? ' open' : ''}${btnClass ? ' ' + btnClass : ''}`} title={title} aria-label={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>{label}</button>
      {open && <div className={`menu-pop ${align}${popClass ? ' ' + popClass : ''}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** Überschrift einer Gruppe im Menü */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label">{children}</div>;
}

export function MenuItem({ label, shortcut, onClick, disabled, checked }: { label: string; shortcut?: string; onClick: () => void; disabled?: boolean; checked?: boolean }) {
  return (
    <button type="button" className={`menu-item${checked !== undefined ? ' checkable' : ''}`} disabled={disabled} onClick={onClick}
      role={checked !== undefined ? 'menuitemcheckbox' : undefined} aria-checked={checked}>
      {checked !== undefined && <span className="menu-check" aria-hidden="true">{checked ? '✓' : ''}</span>}
      <span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = IS_MAC ? '⌘' : 'Strg+';
export const ALT = IS_MAC ? '⌥' : 'Alt+';
export const SHIFT = IS_MAC ? '⇧' : 'Umschalt+';
